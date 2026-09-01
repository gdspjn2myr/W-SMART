// ============================================================================
// API WRAPPER — komunikasi ke Cloudflare Worker (yang meneruskan ke GAS)
// Dikirim sebagai text/plain (bukan application/json) supaya tidak memicu
// CORS preflight (OPTIONS) yang tidak perlu — Worker tetap bisa parse JSON-nya.
// ============================================================================

// Batas waktu tunggu respons server. Tanpa ini, kalau Worker/Apps Script lambat
// atau nggak pernah jawab (mis. salah konfigurasi, GAS macet, dsb), fetch() bisa
// nggantung TANPA BATAS — di UI kelihatannya "loading terus" tanpa pesan error
// apa pun, padahal sebenarnya nggak pernah ada respons sama sekali. Dengan
// timeout ini, minimal muncul pesan error yang jelas setelah beberapa saat.
// scanSPB dikasih waktu lebih lama karena proses baca gambar (OCR) di server
// memang bisa makan waktu lebih dari aksi lain yang cuma baca/tulis sheet.
const API_TIMEOUT_MS = 30000;
const API_TIMEOUT_MS_LONG = { scanSPB: 60000 };

async function callApi(action, payload) {
  const cfg = window.WSMART_CONFIG;
  if (!cfg.WORKER_URL || cfg.WORKER_URL.indexOf('PASTE_CLOUDFLARE_WORKER_URL') !== -1) {
    throw new Error('WORKER_URL belum di-set di js/config.js');
  }

  const body = JSON.stringify({ action: action, payload: payload || {} });
  const timeoutMs = API_TIMEOUT_MS_LONG[action] || API_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(cfg.WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body,
      signal: controller.signal
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Server tidak merespons dalam ' + Math.round(timeoutMs / 1000) + ' detik (timeout). Coba lagi, atau cek koneksi/Worker URL-nya.');
    }
    throw new Error('Gagal menghubungi server: ' + err.message);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error('HTTP ' + res.status + ' saat memanggil server.');
  }

  const json = await res.json();
  if (!json.ok) {
    throw new Error(json.error || 'Terjadi kesalahan pada server.');
  }
  return json;
}

const Api = {
  savePenerimaan: (payload) => callApi('savePenerimaan', payload),
  scanSPB: (payload) => callApi('scanSPB', payload),
  getDashboard: () => callApi('getDashboard'),
  getStockBalance: (payload) => callApi('getStockBalance', payload),
  getRiwayat: (payload) => callApi('getRiwayat', payload),
  getRiwayatTerpadu: (payload) => callApi('getRiwayatTerpadu', payload),
  getMasterBarang: () => callApi('getMasterBarang'),
  saveMasterBarang: (payload) => callApi('saveMasterBarang', payload),
  toggleMasterBarangStatus: (payload) => callApi('toggleMasterBarangStatus', payload),
  savePemakaian: (payload) => callApi('savePemakaian', payload),
  savePutaway: (payload) => callApi('savePutaway', payload),
  getSupplier: () => callApi('getSupplier')
};
