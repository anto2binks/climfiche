// Service worker : met l'application en cache pour un usage hors ligne.
// Changer VERSION à chaque publication : c'est ce qui déclenche la mise à jour sur les téléphones.
// Il ne touche qu'au cache des fichiers, jamais aux données (profil, clients, numérotation).
const VERSION = 'frigofiche-v6';
const FICHIERS = [
  './', 'index.html', 'css/style.css', 'js/app.js', 'js/cerfa.js', 'js/profil.js', 'js/stockage.js', 'js/signature.js',
  'js/bon.js', 'js/bon-pdf.js', 'js/bon-ui.js',
  'vendor/pdf-lib.min.js', 'cerfa-15497-04.pdf', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((cles) => Promise.all(cles.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Réseau d'abord (mises à jour), cache en secours (hors ligne).
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // « no-cache » : le navigateur revérifie toujours auprès du serveur (pas de copie
  // périmée de 10 minutes), la mise à jour est donc visible dès la réouverture.
  e.respondWith(
    fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then((r) => {
        if (r.ok) { const copie = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copie)); }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});
