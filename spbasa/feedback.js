/* Optional Beta TTT entry point. Record, Path and Group remain independent. */
(() => {
  'use strict';
  const config = window.PIPERS_FEEDBACK;
  if (!config || !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(config.url)) return;

  const params = new URLSearchParams(location.search);
  const pupilId = params.get('p');
  const accessKey = params.get('key');
  if (!pupilId || !accessKey) return;

  const spanish = (params.get('lang') || document.documentElement.lang || navigator.language)
    .toLowerCase().startsWith('es');
  const link = document.createElement('a');
  link.textContent = spanish ? 'Enviar comentarios' : 'Send feedback';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.cssText = 'display:block;text-align:center;padding:12px;font-size:14px;';

  function updateLink() {
    const active = document.querySelector('.navButton.active');
    const page = active
      ? ({ recordView: 'record', pathView: 'path', groupView: 'group' }[active.dataset.view] || 'other')
      : 'other';
    // The fragment is processed in the browser and is not sent in the HTTP request.
    const fragment = new URLSearchParams({ p: pupilId, key: accessKey, page });
    link.href = config.url + '?feedback=1#' + fragment.toString();
  }

  updateLink();
  link.addEventListener('click', updateLink);
  const main = document.querySelector('main');
  if (main) main.appendChild(link);
})();
