/* Relative to SW URL so project Pages (…/repo/) and localhost both work */
const SCOPE = self.registration.scope;
const CACHE = 'scopegate-__CACHE_VERSION__';

function asset(path) {
  return new URL(path.replace(/^\//, ''), SCOPE).href;
}

const ASSETS = [
  '',
  'index.html',
  'manifest.json',
  'source/app/style.css',
  'source/app/app.js',
  'source/app/scan.js',
  'source/app/state.js',
  'source/shared/permissions.js',
  'source/shared/file-bridge.js',
  'source/assets/images/icon.svg',
].map(asset);

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(
        ASSETS.map((u) =>
          c.add(u).catch(() => {
            /* optional asset */
          }),
        ),
      ),
    ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((cached) => cached || fetch(e.request)));
});
