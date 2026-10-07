/* Text transport is supplied by the authenticated existing UI. No credentials,
 * tickets, names, emails, or destinations are persisted in queued payloads. */
(function (root) {
  'use strict';
  root.createTextOutbox = async function (config) {
    if (config.idempotent !== true) throw Error('Idempotent backend required');
    if (!config.context || !config.context.scope || !config.context.role) throw Error('Authenticated outbox context required');
    const O = root.PipersOutbox, t = O.messages[config.language === 'es' ? 'es' : 'en'];
    const scope = await O.scopeKey(['text', config.context.scope, config.context.role]);
    const store = await new O.Store(scope).open();
    let render = () => Promise.resolve();
    const queue = new O.Queue(store, {
      idempotentText: true,
      send: item => config.send(Object.assign({}, item.data, { requestId: item.id })),
      confirm: (item, ack) => Boolean(ack && ack.ok === true && ack.reference === 'F-' + item.id)
    }, (item, state) => { config.status(t[state] || t.pending); render().catch(() => {}); });
    render = O.panel(queue, config.parent, config.language);
    queue.start();
    return {
      queue,
      async submit(fields) {
        // Whitelist only the existing feedback fields; auth is injected in send.
        const data = {};
        for (const key of ['category','description','explanation','page','browser']) {
          if (typeof fields[key] === 'string') data[key] = fields[key];
        }
        const item = await queue.add('text', data);
        await render(); queue.drain().catch(() => {}); return item.id;
      }
    };
  };
})(window);
