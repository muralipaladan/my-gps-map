// Network-first for the app's own files (updates show at once), cache fallback when offline.
// CDN libraries are cached after first load. Map tiles and API calls are never cached.
const V = 'sodestus-v2', OWN = ['./', 'index.html', 'script.js', 'style.css', 'manifest.json', 'icon-192.png', 'icon-512.png'];
const CDN = ['unpkg.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => Promise.all(OWN.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const own = u.origin === location.origin, cdn = CDN.includes(u.hostname);
  if (!own && !cdn) return;
  e.respondWith(own
    ? fetch(e.request).then(r => { caches.open(V).then(c => c.put(e.request, r.clone())); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true }))
    : caches.match(e.request).then(m => m || fetch(e.request).then(r => { caches.open(V).then(c => c.put(e.request, r.clone())); return r; })));
});
