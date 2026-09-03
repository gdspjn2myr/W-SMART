// ============================================================================
// KONFIGURASI FRONTEND W-SMART
// Isi WORKER_URL setelah kamu deploy Cloudflare Worker (lihat worker/worker.js
// dan README.md). Token rahasia TIDAK ada di sini — disimpan sebagai secret
// di Cloudflare Worker saja, supaya tidak terlihat publik di GitHub Pages.
// ============================================================================

window.WSMART_CONFIG = {
  WORKER_URL: 'PASTE_CLOUDFLARE_WORKER_URL_DI_SINI', // contoh: https://wsmart-api.namamu.workers.dev
  APP_NAME: 'W-SMART'
};
