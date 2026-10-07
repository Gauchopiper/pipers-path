const CACHE = 'pipers-path-v4-outbox';
const ASSETS = [
  './', './index.html', './manifest.json', './icon-192.png', './icon-512.png',
  './assets/js/local-outbox.js', './assets/js/recording-outbox.js', './assets/js/text-outbox.js',
  './emgt-tsop/index.html', './spbasa/index.html', './ciypb/index.html', './test/index.html'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('pipers-path-') && k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url), base = new URL('./', self.location.href);
  // Never cache backend responses, credentials in URLs, or private operational data.
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return;
  const pathname = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
  const staticUrl = new URL(pathname, base).href;
  if (!ASSETS.some(asset => new URL(asset, base).href === staticUrl)) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(staticUrl)));
});
