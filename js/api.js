// ============================================================================
// API WRAPPER — komunikasi ke Cloudflare Worker (yang meneruskan ke GAS)
// Dikirim sebagai text/plain (bukan application/json) supaya tidak memicu
// CORS preflight (OPTIONS) yang tidak perlu — Worker tetap bisa parse JSON-nya.
// ============================================================================

async function callApi(action, payload) {
  const cfg = window.WSMART_CONFIG;
  if (!cfg.WORKER_URL || cfg.WORKER_URL.indexOf('PASTE_CLOUDFLARE_WORKER_URL') !== -1) {
    throw new Error('WORKER_URL belum di-set di js/config.js');
  }

  const body = JSON.stringify({ action: action, payload: payload || {} });

  const res = await fetch(cfg.WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: body
  });

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
  getRiwayat: (payload) => callApi('getRiwayat', payload),
  getMasterBarang: () => callApi('getMasterBarang'),
  saveMasterBarang: (payload) => callApi('saveMasterBarang', payload),
  toggleMasterBarangStatus: (payload) => callApi('toggleMasterBarangStatus', payload),
  getSupplier: () => callApi('getSupplier')
};
