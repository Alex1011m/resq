const CACHE_NAME = 'resq-offline-v2';
const ASSETS = [
    './',
    './index.html',
    './css/styles.css',
    './manifest.json',
    './js/app.js',
    './js/location.js',
    './js/storage.js',
    './js/sync.js',
    './js/image-utils.js',
    './js/firebase-config.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.map(key => {
                    if (key !== CACHE_NAME) return caches.delete(key);
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => cachedResponse || fetch(event.request))
    );
});
