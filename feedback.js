/* Optional feedback entry point; no changes to recording, Path or Group handlers. */
(() => {
  'use strict';
  const config = window.PIPERS_FEEDBACK;
  if (!config || !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(config.url)) return;
  const params = new URLSearchParams(location.search);
  if (!params.get('p') || !params.get('key')) return;
  const es = (params.get('lang') || document.documentElement.lang || navigator.language).toLowerCase().startsWith('es');
  const link = document.createElement('a');
  link.textContent = es ? 'Enviar comentarios' : 'Send feedback';
  link.target = '_blank'; link.rel = 'noopener noreferrer';
  link.style.cssText = 'display:block;text-align:center;padding:12px;font-size:14px;';
  function updateLink() {
    const active = document.querySelector('.navButton.active');
    const page = active ? ({recordView:'record',pathView:'path',groupView:'group'}[active.dataset.view] || 'other') : 'other';
    const fragment = new URLSearchParams({p:params.get('p'),key:params.get('key'),page});
    link.href = config.url + '?feedback=1#' + fragment.toString();
  }
  updateLink(); link.addEventListener('click', updateLink);
  const main = document.querySelector('main'); if (main) main.appendChild(link);
})();
