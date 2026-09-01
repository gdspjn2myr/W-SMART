// ============================================================================
// SERVICE WORKER — cache app shell agar W-SMART bisa dibuka offline (PWA)
// Naikkan APP_VERSION setiap kali file di bawah diubah supaya cache ter-update
// DAN supaya user dapat notif "Versi baru tersedia" di aplikasi.
// ============================================================================

const APP_VERSION = '2.6.2';
const CACHE_NAME = 'wsmart-shell-v' + APP_VERSION;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/config.js',
  './js/feedback.js',
  './js/api.js',
  './js/router.js',
  './js/qr-scan.js',
  './js/dashboard.js',
  './js/penerimaan.js',
  './js/putaway.js',
  './js/pemakaian.js',
  './js/stock-balance.js',
  './js/master-data.js',
  './js/qrcode-lib.js',
  './js/qr-labels.js',
  './js/riwayat.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  // Sengaja TIDAK skipWaiting() di sini. Kalau ini update (bukan install pertama
  // kali), worker baru harus nunggu ('waiting') sampai user pilih "Update Sekarang"
  // di app.js — supaya user tahu ada versi baru & bisa pilih kapan reload, bukan
  // tiba-tiba ganti versi sendiri di tengah dia lagi input data.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Jembatan komunikasi dengan app.js: app.js minta versi (buat ditampilkan di
// sidebar / banner update), atau perintahkan worker baru langsung aktif begitu
// user klik "Update Sekarang".
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data) return;
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (data.type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ version: APP_VERSION });
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Jangan cache request ke backend Apps Script — selalu ambil data terbaru.
  if (req.method !== 'GET' || req.url.indexOf('script.google.com') !== -1) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
