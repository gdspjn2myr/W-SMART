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

// Action yang TIDAK butuh sessionToken (belum tentu ada sesi saat dipanggil —
// login justru tujuannya BIKIN sesi baru). Semua action lain otomatis disisipi
// payload.sessionToken di bawah, supaya tiap halaman/fungsi tidak perlu ingat
// nambahin sendiri-sendiri.
const API_ACTIONS_NO_SESSION = { login: true };

async function callApi(action, payload) {
  const cfg = window.WSMART_CONFIG;
  if (!cfg.WORKER_URL || cfg.WORKER_URL.indexOf('PASTE_CLOUDFLARE_WORKER_URL') !== -1) {
    throw new Error('WORKER_URL belum di-set di js/config.js');
  }

  const finalPayload = Object.assign({}, payload || {});
  if (!API_ACTIONS_NO_SESSION[action] && typeof Auth !== 'undefined') {
    finalPayload.sessionToken = Auth.getToken();
  }

  const body = JSON.stringify({ action: action, payload: finalPayload });
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
    // Server bilang sesi login sudah tidak valid lagi (habis masa berlaku di
    // CacheService GAS, atau logout dari tab/perangkat lain) — paksa balik ke
    // layar login lewat auth.js, bukan cuma nampilin toast error yang
    // membingungkan tiap kali user coba aksi apa pun.
    if (json.sessionExpired && typeof window.handleSessionExpired === 'function') {
      window.handleSessionExpired();
    }
    throw new Error(json.error || 'Terjadi kesalahan pada server.');
  }
  return json;
}

const Api = {
  login: (payload) => callApi('login', payload),
  logout: (payload) => callApi('logout', payload),
  getUsers: () => callApi('getUsers'),
  saveUser: (payload) => callApi('saveUser', payload),
  toggleUserStatus: (payload) => callApi('toggleUserStatus', payload),
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
  getSupplier: () => callApi('getSupplier'),
  getOpnameItemDetail: (payload) => callApi('getOpnameItemDetail', payload),
  getOpnameBinDetail: (payload) => callApi('getOpnameBinDetail', payload),
  saveStockOpname: (payload) => callApi('saveStockOpname', payload),
  saveKoreksiStock: (payload) => callApi('saveKoreksiStock', payload),
  getAlertOrder: () => callApi('getAlertOrder'),
  createPR: (payload) => callApi('createPR', payload),
  getReceivingDetail: () => callApi('getReceivingDetail'),
  getStockMutasi: (payload) => callApi('getStockMutasi', payload),
  getItemMutasiRiwayat: (payload) => callApi('getItemMutasiRiwayat', payload)
};
