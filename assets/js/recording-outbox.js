/* Adapter around the existing MediaRecorder, upload payload and target/read-back flow. */
(function (root) {
  'use strict';
  // Cache only the public app shell; queued material stays solely in IndexedDB.
  const scriptUrl = document.currentScript && document.currentScript.src;
  if (scriptUrl && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register(new URL('../../service-worker.js', scriptUrl)).catch(() => {});
  }
  root.createRecordingOutbox = async function (config) {
    const O = root.PipersOutbox, language = config.language === 'es' ? 'es' : 'en', t = O.messages[language];
    // No access key is persisted. The scope binds pending data to the current
    // backend, pupil and personal-link capability; another link cannot enumerate it.
    const scope = await O.scopeKey(['audio', config.endpoint, config.pupilId, config.accessKey]);
    const store = await new O.Store(scope).open();
    const post = async (payload, timeout = 45000) => {
      const abort = new AbortController(), timer = setTimeout(() => abort.abort(), timeout);
      try {
        const response = await fetch(config.endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload), signal: abort.signal });
        if (!response.ok) throw Error('Unconfirmed response');
        return await response.json();
      } finally { clearTimeout(timer); }
    };
    const credentials = () => ({ pupilId: config.pupilId, accessKey: config.accessKey });
    const fileUrl = value => value && (value.fileUrl || value.driveFileLink);
    let render = () => Promise.resolve();
    const queue = new O.Queue(store, {
      send: async item => {
        const d = item.data;
        return post(Object.assign(credentials(), { audioBase64: await config.toBase64(d.blob), mimeType: d.mimeType,
          startIso: d.startIso, endIso: d.endIso, durationSeconds: d.durationSeconds, sessionId: item.id }));
      },
      confirm: (item, result) => Boolean(result && result.ok === true && fileUrl(result) && (!result.sessionId || result.sessionId === item.id)),
      reconcile: async item => {
        // Retain the proven read-back path. An absent recent-list match is NOT
        // proof of absence, even if the request succeeded.
        try {
          const path = await config.readPath();
          const found = (path.sessions || []).find(x => String(x.sessionId || '').trim() === item.id && x.driveFileLink);
          if (found) return Object.assign({}, found, { saved: true, fileUrl: found.driveFileLink });
        } catch (_) { /* try the exact-session endpoint, never a blind upload */ }
        const state = await post(Object.assign(credentials(), { action: 'getRecordingState', sessionId: item.id }), 15000);
        if (!state || state.ok !== true || state.protocol !== 'pipers-path-recording-recovery-v1' || state.sessionId !== item.id) return { state: 'unknown' };
        return state;
      },
      finalize: async (item, ack) => config.tagTarget(fileUrl(ack), item.data.targetId)
    }, (item, state) => { config.status(t[state] || t.pending); render().catch(() => {}); });
    render = O.panel(queue, config.parent, language);
    queue.start();
    return {
      queue,
      async protect(blob, context) {
        const item = await queue.add('audio', { blob, mimeType: blob.type || context.mimeType,
          startIso: new Date(context.startedAt).toISOString(), endIso: new Date(context.stoppedAt).toISOString(),
          durationSeconds: Math.max(0, Math.floor((context.stoppedAt - context.startedAt) / 1000)), targetId: context.targetId || '', pupilId: config.pupilId }, context.sessionId);
        await render();
        queue.drain().catch(() => {});
        return item;
      }
    };
  };
})(window);
