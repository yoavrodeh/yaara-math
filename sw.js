// Network first, so a new version shows up as soon as the tablet is online;
// falls back to the cached copy when offline.
const CACHE = 'yaara-math';
const ASSETS = ['./', './index.html', './style.css', './app.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') {
    return;
  }
  const fromNetwork = fetch(e.request).then(res => {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(e.request, copy));
    return res;
  });
  const timeout = new Promise((_, reject) => setTimeout(reject, 4000));
  e.respondWith(
    Promise.race([fromNetwork, timeout]).catch(() =>
      caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fromNetwork))
  );
});
