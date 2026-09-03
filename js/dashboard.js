// ============================================================================
// DASHBOARD PAGE
// ============================================================================

let dashboardLoadedOnce = false;
let dashFullBalances = null; // cache Stock Balance LENGKAP (semua SKU + belum terdaftar), dipakai buat isi popup kartu2 statistik Dashboard — di-reset tiap loadDashboard() supaya nggak nampilin data basi
let dashReceivingDetail = null; // cache itemized Penerimaan (Api.getReceivingDetail), dipakai popup 4 kartu bawah (Diterima Hari Ini/Bulan Ini, Transaksi Bulan Ini, SKU Bulan Ini) — sama-sama di-reset tiap loadDashboard()

async function loadDashboard() {
  dashFullBalances = null;
  dashReceivingDetail = null;
  try {
    const res = await Api.getDashboard();
    renderStockStats(res);
    renderReorderAlert(res.reorderAlert || []);
    renderStats(res);
    renderChart(res.chart7Hari || []);
    renderTopPemakaian(res.topPemakaianBulanIni || []);
    renderKategoriChart(res.kategoriDist || { A: 0, B: 0, C: 0 });
    renderRiwayat(res.riwayatTerbaru || []);
    dashboardLoadedOnce = true;
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Stock Balance / Reorder Alert — dihitung realtime di server dari Penerimaan -
// Pemakaian dibandingkan ROP/MAX di Master Data (lihat hitungStockHealth_ di Code.gs).
function renderStockStats(res) {
  // Stock Saat Ini = total pcs SEMUA barang (termasuk yang belum terdaftar
  // di Master Data) — lihat totalStockSaatIni di hitungStockHealth_ (Code.gs).
  animateStatValue('statStockSaatIni', res.totalStockSaatIni || 0);

  const total = res.totalSku || 0;
  animateStatValue('statTotalSku', total);
  animateStatValue('statStokNormal', res.stokNormal || 0);
  animateStatValue('statStokNearRop', res.stokNearRop || 0);
  animateStatValue('statStokNeedReorder', res.stokNeedReorder || 0);
  animateStatValue('statStokOut', res.stokOut || 0);

  const pct = (n) => total ? Math.round((n / total) * 100) + '%' : '0%';
  document.getElementById('statStokNormalPct').textContent = pct(res.stokNormal || 0);
  document.getElementById('statStokNearRopPct').textContent = pct(res.stokNearRop || 0);
  document.getElementById('statStokNeedReorderPct').textContent = pct(res.stokNeedReorder || 0);
  document.getElementById('statStokOutPct').textContent = pct(res.stokOut || 0);
}

const RA_STATUS_CLASS = { 'Stock Out': 'ra-badge-out', 'Need Reorder': 'ra-badge-reorder', 'Near ROP': 'ra-badge-near' };

// Label TAMPILAN status barang — dipakai bareng di semua halaman yang nampilin
// status (Dashboard, Alert Order, Stock Balance, Stock Opname, Koreksi Stock).
// Value INTERNAL dari backend (dipakai buat urgencyRank/perbandingan logic di
// Code.gs & di semua *_STATUS_CLASS map) TETAP 'Stock Out' — cuma teks yang
// dilihat user yang diganti jadi lebih jelas. "Stock Out" = qty di sistem
// sudah 0 (bukan cuma di bawah ROP, tapi beneran habis/kosong) — makanya
// user-facing-nya "Out of Stock".
const STATUS_LABEL = {
  'Stock Out': 'Out of Stock',
  'Need Reorder': 'Need Reorder',
  'Near ROP': 'Near ROP',
  'Normal': 'Normal',
  'Over Max': 'Over Max',
  'Belum Terdaftar': 'Belum Terdaftar'
};

// Kartu di Dashboard cuma nunjukin RINGKASAN (jumlah + hint) — daftar lengkapnya
// sengaja dipindah ke popup/modal (buka pas kartu diklik, lihat openReorderAlertModal
// di app.js) biar Dashboard nggak kepanjangan discroll cuma gara-gara banyak
// barang yang perlu diorder.
function renderReorderAlert(list) {
  document.getElementById('reorderAlertCount').textContent = list.length + ' Item';
  const hint = document.getElementById('reorderAlertHint');
  hint.textContent = list.length
    ? `${list.length} barang butuh diorder — ketuk buat lihat daftarnya`
    : 'Semua stock dalam kondisi normal.';

  const wrap = document.getElementById('reorderAlertList');
  if (!list.length) {
    wrap.innerHTML = '<div class="empty-state">Belum ada item yang perlu di-reorder.</div>';
    return;
  }
  wrap.innerHTML = list.map((it) => `
      <div class="ra-item">
        <div class="ra-item-main">
          <div class="ra-item-title">${escapeHtml(it.kode)} — ${escapeHtml(it.namaBarang)}</div>
          <div class="ra-item-sub">Stock ${it.onHand} · ROP ${it.rop} · MAX ${it.max} · Order Qty <strong>${it.orderQty}</strong></div>
        </div>
        <span class="ra-badge ${RA_STATUS_CLASS[it.status] || ''}">${escapeHtml(STATUS_LABEL[it.status] || it.status)}</span>
      </div>
    `).join('');
}

function openReorderAlertModal() {
  document.getElementById('reorderAlertModalBackdrop').hidden = false;
  document.getElementById('reorderAlertModal').hidden = false;
}
function closeReorderAlertModal() {
  document.getElementById('reorderAlertModalBackdrop').hidden = true;
  document.getElementById('reorderAlertModal').hidden = true;
}

// ---------------------------------------------------------------------------
// POPUP KARTU STATISTIK (Stock Saat Ini, Total SKU, Normal, Near ROP, Need
// Reorder, Out of Stock) — semua kartu di Dashboard bisa diklik, isi popup-nya
// menyesuaikan kartu mana yang diklik (lihat data-dash-filter di index.html
// & handler-nya di app.js). Sumber datanya Stock Balance LENGKAP (Api.getStockBalance,
// endpoint yang sama dengan halaman Stock Balance — sudah punya status &
// belumAdaMaster per item, jadi nggak perlu endpoint baru), di-fetch SEKALI
// & di-cache di dashFullBalances (di-reset tiap loadDashboard() dipanggil ulang).
// ---------------------------------------------------------------------------
const DASH_CARD_FILTERS = {
  semua: {
    mode: 'stock',
    title: 'Stock Saat Ini (Semua SKU)',
    hint: 'Semua barang di gudang dengan stock > 0, TERMASUK yang belum terdaftar di Master Data — diurutkan dari stock terbanyak. Ini penjumlahan SEMUA barang, bukan stock 1 item tertentu.',
    filter: (b) => b.onHand > 0,
    sort: (a, b) => b.onHand - a.onHand
  },
  total: {
    mode: 'stock-by-plant',
    title: 'Total SKU Terdaftar',
    hint: 'Semua barang yang sudah terdaftar & berstatus Aktif di Master Data, dikelompokkan per Plant — kode yang sama bisa muncul di lebih dari 1 Plant (baris Master Data yang beda-beda).',
    filter: (b) => !b.belumAdaMaster,
    sort: (a, b) => (a.namaBarang || '').localeCompare(b.namaBarang || '')
  },
  normal: {
    mode: 'stock',
    title: 'Status Normal',
    hint: 'Barang terdaftar dengan stock di atas ROP & masih dalam batas MAX.',
    filter: (b) => !b.belumAdaMaster && b.status === 'Normal',
    sort: (a, b) => (a.namaBarang || '').localeCompare(b.namaBarang || '')
  },
  'near-rop': {
    mode: 'stock',
    title: 'Near ROP',
    hint: 'Barang terdaftar yang stock-nya sudah dekat titik reorder (maksimal 20% di atas ROP) — belum wajib order, tapi perlu mulai dipantau.',
    filter: (b) => !b.belumAdaMaster && b.status === 'Near ROP',
    sort: (a, b) => a.onHand - b.onHand
  },
  'need-reorder': {
    mode: 'stock',
    title: 'Need Reorder',
    hint: 'Barang terdaftar yang stock-nya sudah di titik ROP atau di bawahnya, tapi belum benar-benar 0.',
    filter: (b) => !b.belumAdaMaster && b.status === 'Need Reorder',
    sort: (a, b) => a.onHand - b.onHand
  },
  'stock-out': {
    mode: 'stock',
    title: 'Out of Stock',
    hint: 'Barang terdaftar yang stock-nya sudah 0 — paling butuh perhatian & prioritas order.',
    filter: (b) => !b.belumAdaMaster && b.status === 'Stock Out',
    sort: (a, b) => (a.namaBarang || '').localeCompare(b.namaBarang || '')
  },
  'terima-hari-ini': {
    mode: 'receiving',
    view: 'itemized',
    dataKey: 'hariIni',
    title: 'Diterima Hari Ini',
    hint: 'Semua baris Barang Masuk (Penerimaan) yang tanggal kedatangannya hari ini, diurutkan dari qty terbanyak.',
    emptyText: 'Belum ada barang yang diterima hari ini.'
  },
  'terima-bulan-ini': {
    mode: 'receiving',
    view: 'itemized',
    dataKey: 'bulanIni',
    title: 'Diterima Bulan Ini',
    hint: 'Total qty diterima bulan berjalan, dijumlahkan per Kode Barang (bisa dari beberapa kali Penerimaan) — diurutkan dari qty terbanyak.',
    emptyText: 'Belum ada barang yang diterima bulan ini.'
  },
  'transaksi-bulan-ini': {
    mode: 'receiving',
    view: 'transaksi',
    dataKey: 'transaksiBulanIni',
    title: 'Transaksi Bulan Ini',
    hint: 'Semua transaksi Barang Masuk bulan berjalan (dikelompokkan per Tanggal + No.PO + Vendor), terbaru duluan.',
    emptyText: 'Belum ada transaksi Barang Masuk bulan ini.'
  },
  'sku-bulan-ini': {
    mode: 'receiving',
    view: 'itemized',
    dataKey: 'skuBulanIni',
    title: 'SKU Bulan Ini',
    hint: 'Jenis barang (SKU) berbeda yang diterima bulan berjalan, diurutkan alfabetis.',
    emptyText: 'Belum ada barang yang diterima bulan ini.'
  }
};

async function openDashStatModal(filterKey) {
  const cfg = DASH_CARD_FILTERS[filterKey];
  if (!cfg) return;

  document.getElementById('dashListModalTitle').textContent = cfg.title;
  document.getElementById('dashListModalHint').textContent = cfg.hint;
  document.getElementById('dashListModalBody').innerHTML = '<div class="empty-state">Memuat...</div>';
  document.getElementById('dashListModalBackdrop').hidden = false;
  document.getElementById('dashListModal').hidden = false;

  try {
    if (cfg.mode === 'receiving') {
      if (!dashReceivingDetail) {
        dashReceivingDetail = await Api.getReceivingDetail();
      }
      const items = dashReceivingDetail[cfg.dataKey] || [];
      if (cfg.view === 'transaksi') renderDashTransaksiModalBody(items, cfg.emptyText);
      else renderDashReceivingModalBody(items, cfg.emptyText);
      return;
    }

    if (!dashFullBalances) {
      const res = await Api.getStockBalance({});
      dashFullBalances = res.data || [];
    }
    const items = dashFullBalances.filter(cfg.filter).sort(cfg.sort);

    if (cfg.mode === 'stock-by-plant') renderDashPlantGroupedModalBody(items);
    else renderDashListModalBody(items);
  } catch (err) {
    document.getElementById('dashListModalBody').innerHTML =
      `<div class="empty-state">Gagal memuat: ${escapeHtml(err.message)}</div>`;
  }
}

function renderDashListModalBody(items) {
  const body = document.getElementById('dashListModalBody');
  if (!items.length) {
    body.innerHTML = '<div class="empty-state">Tidak ada barang di kategori ini.</div>';
    return;
  }
  body.innerHTML = items.map((it) => dashStockItemHtml(it)).join('');
}

function dashStockItemHtml(it) {
  const badgeClass = it.belumAdaMaster ? 'ra-badge-unregistered' : (RA_STATUS_CLASS[it.status] || '');
  const badgeLabel = it.belumAdaMaster ? 'Belum Terdaftar' : (STATUS_LABEL[it.status] || it.status);
  const ropMaxText = (!it.belumAdaMaster && (it.rop || it.max)) ? ` · ROP ${it.rop} · MAX ${it.max}` : '';
  return `
      <div class="ra-item">
        <div class="ra-item-main">
          <div class="ra-item-title">${escapeHtml(it.kode)} — ${escapeHtml(it.namaBarang || '-')}</div>
          <div class="ra-item-sub">Stock ${it.onHand} ${escapeHtml(it.satuan || '')}${ropMaxText}</div>
        </div>
        <span class="ra-badge ${badgeClass}">${escapeHtml(badgeLabel)}</span>
      </div>
    `;
}

// "Total SKU Terdaftar" DIKELOMPOKKAN per Plant — 1 Kode Barang bisa muncul di
// lebih dari 1 grup Plant kalau memang punya baris Master Data terpisah per
// Plant (lihat catatan kodePlantCount di hitungBalances_, Code.gs). Item yang
// Plant-nya belum diisi (kosong) dikumpulkan di grup "Belum Ditentukan".
function renderDashPlantGroupedModalBody(items) {
  const body = document.getElementById('dashListModalBody');
  if (!items.length) {
    body.innerHTML = '<div class="empty-state">Belum ada barang terdaftar di Master Data.</div>';
    return;
  }
  const groups = {};
  const order = [];
  items.forEach((it) => {
    const plant = it.plant || '';
    const key = plant || '
