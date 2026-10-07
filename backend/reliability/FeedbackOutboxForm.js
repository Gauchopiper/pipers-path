/* Included inline by the installer in the existing feedback page. */
(() => {
  'use strict';
  const form = document.getElementById('feedback'), send = document.getElementById('send'), status = document.getElementById('status');
  let context, outbox, busy = false;
  const language = (document.documentElement.lang || navigator.language).startsWith('es') ? 'es' : 'en';
  const text = PipersOutbox.messages[language];
  function rpc(name, input) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Confirmation timed out')), 45000);
      google.script.run.withSuccessHandler(result => { clearTimeout(timer); resolve(result); })
        .withFailureHandler(error => { clearTimeout(timer); reject(error); })[name](input);
    });
  }
  function browserFamily() {
    const ua = navigator.userAgent || '';
    return /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Other';
  }
  async function boot() {
    if (busy || outbox || !context) return;
    busy = true;
    try {
      const verified = await rpc('getFeedbackOutboxContext', context);
      outbox = await createTextOutbox({ context: verified, idempotent: true, language, parent: document.body,
        status: message => { status.textContent = message; },
        send: fields => rpc('PIPERS_FEEDBACK_SUBMIT_METHOD', Object.assign({}, fields, {pupilId:context.pupilId,accessKey:context.accessKey,ticket:context.ticket})) });
      send.disabled = false;
    } catch (_) {
      status.textContent = 'Connect and reopen feedback from your pupil link or teacher dashboard. Pending text remains on this device.';
    } finally { busy = false; }
  }
  google.script.url.getLocation(location => {
    const p = new URLSearchParams(location.hash || '');
    context = { ticket: p.get('ticket') || '', pupilId: p.get('p') || '', accessKey: p.get('key') || '', page: p.get('page') || 'other' };
    boot();
  });
  addEventListener('online', boot);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !outbox || send.disabled) return;
    send.disabled = true;
    const fields = { category: document.getElementById('category').value,
      description: document.getElementById('description').value, explanation: document.getElementById('explanation').value,
      page: context.page, browser: browserFamily() };
    try {
      await outbox.submit(fields);
      // Only clear text after the durable transaction commits, even when offline.
      document.getElementById('description').value = '';
      document.getElementById('explanation').value = '';
    } catch (_) {
      status.textContent = text.unavailable;
      const button = document.createElement('button'); button.type = 'button'; button.textContent = text.download;
      button.onclick = () => PipersOutbox.download({id:crypto.randomUUID(),kind:'text',data:fields});
      document.body.append(button);
    } finally { send.disabled = false; }
  });
})();
