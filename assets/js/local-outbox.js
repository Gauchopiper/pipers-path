/* Piper's Path local operational queue; no cross-app identities or destinations. */
(function (root) {
  'use strict';
  const VERSION = 1;
  const MAX_ATTEMPTS = 5;
  const BASE_DELAY = 3000;
  const messages = {
    en: { saving: 'Saving…', saved: 'Saved ✓', pending: 'Saved on this device — waiting to upload',
      attention: 'Saved on this device — upload needs attention / Retry',
      unavailable: 'Device storage is unavailable. Keep this page open and download a copy.',
      retry: 'Retry', download: 'Download a copy', heading: 'Pending saves' },
    es: { saving: 'Guardando…', saved: 'Guardado ✓', pending: 'Guardado en este dispositivo — pendiente de enviar',
      attention: 'Guardado en este dispositivo — revisa el envío / Reintentar',
      unavailable: 'No se puede guardar en este dispositivo. Mantén la página abierta y descarga una copia.',
      retry: 'Reintentar', download: 'Descargar una copia', heading: 'Envíos pendientes' }
  };
  async function scopeKey(parts) {
    if (!Array.isArray(parts) || parts.some(p => typeof p !== 'string' || !p)) throw Error('Missing queue scope');
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(parts)));
    return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
  }
  class Store {
    constructor(scope) { this.scope = scope; this.name = 'pipers-path-outbox-v1-' + scope; }
    async open() {
      if (this.db) return this;
      this.db = await new Promise((resolve, reject) => {
        const r = indexedDB.open(this.name, VERSION);
        r.onupgradeneeded = () => r.result.createObjectStore('items', { keyPath: 'id' });
        r.onerror = () => reject(r.error);
        r.onblocked = () => reject(Error('Close another old app tab to update storage'));
        r.onsuccess = () => resolve(r.result);
      });
      this.db.onversionchange = () => { this.db.close(); this.db = null; };
      // A real write verifies availability, including private-mode/quota failures.
      await this.put({ id: '__probe', scope: this.scope, kind: 'probe' });
      await this.remove('__probe');
      return this;
    }
    tx(mode, task) {
      return new Promise((resolve, reject) => {
        let tx;
        try { tx = this.db.transaction('items', mode, { durability: 'strict' }); }
        catch (_) { tx = this.db.transaction('items', mode); }
        let result;
        tx.oncomplete = () => resolve(result);
        tx.onerror = tx.onabort = () => reject(tx.error || Error('Device storage write failed'));
        try { task(tx.objectStore('items'), value => { result = value; }); }
        catch (e) { tx.abort(); reject(e); }
      });
    }
    put(item) {
      if (item.scope !== this.scope) return Promise.reject(Error('Queue scope mismatch'));
      return this.tx('readwrite', s => s.put(item));
    }
    remove(id) { return this.tx('readwrite', s => s.delete(id)); }
    get(id) { return this.tx('readonly', (s, done) => { s.get(id).onsuccess = e => done(e.target.result); }); }
    list() { return this.tx('readonly', (s, done) => { s.getAll().onsuccess = e => done(e.target.result.filter(x => x.kind !== 'probe' && x.scope === this.scope)); }); }
    // Atomic IndexedDB claim serialises tabs. A lease may expire while a server write
    // is running; audio reconciliation + server deduplication remain mandatory.
    claim(id, manual) {
      return this.tx('readwrite', (s, done) => {
        s.get(id).onsuccess = e => {
          const x = e.target.result, now = Date.now();
          if (!x || x.scope !== this.scope || x.state === 'draft' || (x.leaseUntil || 0) > now ||
              (!manual && ((x.nextAttempt || 0) > now || x.attempts >= MAX_ATTEMPTS))) return done(null);
          const token = crypto.randomUUID();
          x.lease = token; x.leaseUntil = now + 120000;
          x.attempts = manual ? 1 : (x.attempts || 0) + 1;
          s.put(x); done(x);
        };
      });
    }
    finish(item, remove, keepLease = false) {
      return this.tx('readwrite', (s, done) => {
        s.get(item.id).onsuccess = e => {
          const current = e.target.result;
          if (!current || current.lease !== item.lease) return done(false);
          if (remove) s.delete(item.id);
          else s.put(keepLease ? item : Object.assign({}, item, { lease: '', leaseUntil: 0 }));
          done(true);
        };
      });
    }
  }
  class Queue {
    constructor(store, adapter, notify) {
      this.store = store; this.adapter = adapter; this.notify = notify || (() => {});
      this.running = false; this.again = false; this.timer = null;
    }
    async add(kind, data, id) {
      const item = { id: id || crypto.randomUUID(), scope: this.store.scope, kind, data,
        createdAt: new Date().toISOString(), state: 'pending', attempts: 0, attempted: false, nextAttempt: 0 };
      // Never overwrite an existing operation with edited text or different audio.
      await this.store.tx('readwrite', s => s.add(item));
      this.notify(item, 'pending');
      return item;
    }
    async pending(item, attention) {
      item.state = attention ? 'attention' : 'pending';
      item.nextAttempt = Date.now() + Math.min(60000, BASE_DELAY * 2 ** Math.max(0, item.attempts - 1));
      await this.store.finish(item, false);
      this.notify(item, item.state);
    }
    async process(item) {
      const a = this.adapter;
      this.notify(item, 'saving');
      try {
        let ack = item.ack;
        if (item.kind === 'audio') {
          if (!ack && item.attempted) {
            const found = await a.reconcile(item);
            if (found && found.saved) ack = found;
            else if (!found || found.state !== 'absent' || found.retrySafe !== true) {
              return await this.pending(item, true);
            }
          }
          if (!ack) {
            // Persist BEFORE starting I/O. Refresh at any later point requires read-back.
            item.attempted = true; item.state = 'sending';
            if (!(await this.store.finish(item, false, true))) return;
            let response;
            try { response = await a.send(item); } catch (_) { /* outcome is ambiguous */ }
            if (a.confirm(item, response)) ack = response;
            else {
              const found = await a.reconcile(item);
              if (found && found.saved) ack = found;
              else return await this.pending(item, true);
            }
          }
          // Keep target context if its separate, existing write is not confirmed.
          item.ack = ack;
          if (a.finalize && !(await a.finalize(item, ack))) return await this.pending(item, true);
        } else {
          if (a.idempotentText !== true) return await this.pending(item, true);
          const response = await a.send(item);
          if (!a.confirm(item, response)) return await this.pending(item, false);
        }
        if (await this.store.finish(item, true)) this.notify(item, 'saved');
      } catch (_) {
        try { await this.pending(item, item.kind === 'audio' || item.attempts >= MAX_ATTEMPTS); }
        catch (_) { this.notify(item, 'unavailable'); }
      }
    }
    async drain(manual = false) {
      if (this.running) { this.again = true; return; }
      if (navigator.onLine === false) { this.notify(null, 'pending'); return; }
      this.running = true; clearTimeout(this.timer);
      try {
        const items = (await this.store.list()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        for (const x of items) {
          if (navigator.onLine === false) break;
          const item = await this.store.claim(x.id, manual);
          if (item) await this.process(item);
        }
      } finally {
        this.running = false;
        const items = await this.store.list();
        const due = items.filter(x => x.state !== 'draft' && x.attempts < MAX_ATTEMPTS);
        if (this.again) { this.again = false; this.timer = setTimeout(() => this.drain().catch(() => {}), 0); }
        else if (due.length) {
          const next = Math.min(...due.map(x => Math.max(x.nextAttempt || 0, x.leaseUntil || 0)));
          this.timer = setTimeout(() => this.drain().catch(() => {}), Math.max(1000, next - Date.now()));
        }
      }
    }
    start() {
      this.online = () => this.drain().catch(() => {});
      addEventListener('online', this.online);
      this.online();
    }
    stop() { clearTimeout(this.timer); removeEventListener('online', this.online); }
  }
  function download(item) {
    const blob = item.kind === 'audio' ? item.data.blob : new Blob([JSON.stringify(item.data, null, 2)], { type: 'text/plain' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url;
    a.download = item.kind === 'audio' ? 'recording-' + item.id + (/mp4/.test(blob.type) ? '.m4a' : /ogg/.test(blob.type) ? '.ogg' : '.webm') : 'comment-' + item.id + '.txt';
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function panel(queue, parent, language) {
    const t = messages[language === 'es' ? 'es' : 'en'];
    const box = document.createElement('section'); box.setAttribute('aria-label', t.heading);
    const list = document.createElement('div'), retry = document.createElement('button');
    retry.type = 'button'; retry.textContent = t.retry; retry.style.minHeight = '44px';
    retry.onclick = async () => { retry.disabled = true; try { await queue.drain(true); } finally { retry.disabled = false; await render(); } };
    box.append(list, retry); parent.append(box);
    let serial = 0;
    async function render() {
      const token = ++serial, items = await queue.store.list();
      if (token !== serial) return;
      box.hidden = !items.length; list.replaceChildren();
      for (const item of items) {
        const row = document.createElement('p'), button = document.createElement('button');
        row.textContent = new Date(item.createdAt).toLocaleString() + ' — ' + t[item.state === 'attention' ? 'attention' : 'pending'] + ' ';
        button.type = 'button'; button.textContent = t.download; button.onclick = () => download(item); row.append(button); list.append(row);
      }
    }
    render().catch(() => {}); return render;
  }
  root.PipersOutbox = { Store, Queue, scopeKey, messages, panel, download, VERSION };
})(typeof window !== 'undefined' ? window : globalThis);
