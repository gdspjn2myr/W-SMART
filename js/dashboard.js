// ============================================================================
// DASHBOARD PAGE
// ============================================================================

let dashboardLoadedOnce = false;
let dashFullBalances = null; // cache Stock Balance LENGKAP (semua SKU + belum terdaftar), dipakai buat isi popup kartu2 statistik Dashboard — di-reset tiap loadDashboard() supaya nggak nampilin data basi
let dashReceivingDetail = null; // cache itemized Penerimaan (Api.getReceivingDetail), dipakai popup 4 kartu bawah (Diterima Hari Ini/Bulan Ini, Transaksi Bulan Ini, SKU Bulan Ini) — sama-sama di-reset tiap loadDashboard()
let dashPemakaianDetail = null; // pasangan dashReceivingDetail, tapi buat Pemakaian (Api.getPemakaianDetail) — dipakai popup kartu Dikeluarkan Hari Ini/Bulan Ini, sama-sama di-reset tiap loadDashboard()

async function loadDashboard() {
  dashFullBalances = null;
  dashReceivingDetail = null;
  dashPemakaianDetail = null;
  try {
    const res = await Api.getDashboard();
    renderStockStats(res);
    renderReorderAlert(res.reorderAlert || []);
    renderBelumTerdaftar(res.belumTerdaftarCount || 0);
    renderStats(res);
    renderChart(mergeMasukKeluarChart_(res.chart7Hari || [], res.chart7HariKeluar || []));
    renderTopPemakaian(res.topPemakaianBulanIni || []);
    renderKategoriChart(res.kategoriDist || { A: 0, B: 0, C: 0 });
    renderRiwayat(res.riwayatTerbaru || []);
    dashboardLoadedOnce = true;
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Gabungin chart7Hari (Penerimaan/Masuk) & chart7HariKeluar (Pemakaian/Keluar)
// dari server jadi 1 array {tanggal, qtyMasuk, qtyKeluar} buat digambar
// bareng-bareng sebagai grouped bar chart (lihat renderChart) — keluhan user:
// "kenapa cuman ada data diterima, gaada barang keluar" di Dashboard. Kedua
// array dari server SELALU rentang 7 hari yang SAMA (lihat hitungReceivingStats_
// & hitungPemakaianStats_ di Code.gs, dua-duanya generate dari `new Date()`
// yang sama persis), jadi aman di-map by tanggal tanpa perlu isi tanggal yang
// hilang di salah satu sisi.
function mergeMasukKeluarChart_(masuk, keluar) {
  const keluarMap = {};
  (keluar || []).forEach((d) => { keluarMap[d.tanggal] = d.qty; });
  return (masuk || []).map((d) => ({ tanggal: d.tanggal, qtyMasuk: d.qty, qtyKeluar: keluarMap[d.tanggal] || 0 }));
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
  wrap.innerHTML = list.map((it) => {
    const meta = itemMetaLine(it);
    return `
      <div class="ra-item">
        <div class="ra-item-main">
          <div class="ra-item-title">${escapeHtml(it.kode)} — ${escapeHtml(it.namaBarang)}</div>
          <div class="ra-item-sub">Stock ${it.onHand} · ROP ${it.rop} · MAX ${it.max} · Order Qty <strong>${it.orderQty}</strong></div>
          ${meta ? `<div class="item-meta-line">${meta}</div>` : ''}
        </div>
        <span class="ra-badge ${RA_STATUS_CLASS[it.status] || ''}">${escapeHtml(STATUS_LABEL[it.status] || it.status)}</span>
      </div>
    `;
  }).join('');
}

// Kartu "Belum Terdaftar di Master Data" — jumlah barang yang PUNYA stock
// (belumTerdaftarCount, dari hitungStockHealth_ di Code.gs) tapi belum
// terdaftar resmi (baik barang baru yang belum pernah didaftarkan SAMA
// SEKALI, maupun kasus kode multi-Plant yang transaksinya nyasar ke Plant
// yang belum ada baris Master Data-nya). Beda dari kartu2 statistik lain
// (Normal/Near ROP/dst) yang cuma hitung barang TERDAFTAR — kartu ini justru
// nyorot barang yang TERLEWAT dari Master Data, biar ketauan & bisa
// dilengkapi (kasih ROP/Min/Max) alih-alih diam-diam nyangkut di stock tanpa
// pengawasan. Klik kartu ini pakai mekanisme umum data-dash-filter yang sama
// dengan kartu Stock Saat Ini/Total SKU dst (lihat DASH_CARD_FILTERS &
// openDashStatModal di bawah) — bukan modal terpisah kayak Reorder Alert.
function renderBelumTerdaftar(count) {
  document.getElementById('belumTerdaftarCount').textContent = count + ' Item';
  const hint = document.getElementById('belumTerdaftarHint');
  hint.textContent = count
    ? `${count} barang punya stock tapi belum terdaftar di Master Data — ketuk buat lihat & daftarkan`
    : 'Semua barang sudah terdaftar di Master Data.';
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
  'belum-terdaftar': {
    mode: 'stock',
    title: 'Belum Terdaftar di Master Data',
    hint: 'Barang yang PUNYA stock (dari Barang Masuk/Koreksi) tapi belum terdaftar resmi di Master Data — termasuk barang baru yang belum pernah didaftarkan, dan kode yang sudah terdaftar di Plant lain tapi ada transaksi ke Plant yang belum ada baris Master Data-nya. Belum punya ROP/Min/Max sampai didaftarkan.',
    filter: (b) => b.belumAdaMaster && b.onHand > 0,
    sort: (a, b) => b.onHand - a.onHand
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
  },
  'keluar-hari-ini': {
    mode: 'pemakaian',
    dataKey: 'hariIni',
    title: 'Dikeluarkan Hari Ini',
    hint: 'Semua baris Barang Keluar (Pemakaian) hari ini, diurutkan dari qty terbanyak.',
    emptyText: 'Belum ada barang yang dikeluarkan hari ini.'
  },
  'keluar-bulan-ini': {
    mode: 'pemakaian',
    dataKey: 'bulanIni',
    title: 'Dikeluarkan Bulan Ini',
    hint: 'Total qty dikeluarkan bulan berjalan, dijumlahkan per Kode Barang (bisa dari beberapa kali Pemakaian) — diurutkan dari qty terbanyak.',
    emptyText: 'Belum ada barang yang dikeluarkan bulan ini.'
  }
};

async function openDashStatModal(filterKey) {
  const cfg = DASH_CARD_FILTERS[filterKey];
  if (!cfg) return;

  document.getElementById('dashListModalTitle').textContent = cfg.title;
  document.getElementById('dashListModalHint').textContent = cfg.hint;
  document.getElementById('dashListModalBody').innerHTML = '<div class="empty-state">Memuat...</div>';
  document.getElementById('dashListModalPlantFilter').hidden = true;
  document.getElementById('dashListModalPlantFilter').innerHTML = '';
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

    if (cfg.mode === 'pemakaian') {
      if (!dashPemakaianDetail) {
        dashPemakaianDetail = await Api.getPemakaianDetail();
      }
      const items = dashPemakaianDetail[cfg.dataKey] || [];
      renderDashPemakaianModalBody(items, cfg.emptyText);
      return;
    }

    if (!dashFullBalances) {
      const res = await Api.getStockBalance({});
      dashFullBalances = res.data || [];
    }
    const items = dashFullBalances.filter(cfg.filter).sort(cfg.sort);

    if (cfg.mode === 'stock-by-plant') {
      // "Total SKU Terdaftar" — 1 Kode Barang bisa muncul di lebih dari 1 Plant
      // (baris Master Data terpisah per Plant, lihat kodePlantCount di
      // hitungBalances_/Code.gs). Dulu semua Plant ditumpuk jadi 1 list panjang
      // (harus discroll jauh buat pindah Plant) — sekarang Plant jadi FILTER
      // (chip di atas list) supaya bisa langsung loncat ke Plant yang dimau.
      dashTotalPlantItems = items;
      dashTotalPlantSelected = '';
      renderDashPlantFilterChips();
      renderDashPlantFilteredList();
    } else {
      renderDashListModalBody(items);
    }
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
  const ropMaxText = (!it.belumAdaMaster && (it.minStock || it.rop || it.max)) ? ` · Min ${it.minStock || 0} · ROP ${it.rop} · MAX ${it.max}` : '';
  const meta = itemMetaLine(it);
  // Tombol "Daftarkan" CUMA buat barang belumAdaMaster — pintasan biar nggak
  // perlu pindah manual ke Master Data & ngetik ulang kode/nama/satuan/Plant
  // (lihat gotoRegisterMasterData di bawah & handler-nya di app.js).
  const daftarkanBtn = it.belumAdaMaster ? `
        <button type="button" class="btn-goto-master" data-goto-master
          data-kode="${escapeHtml(it.kode)}" data-nama="${escapeHtml(it.namaBarang || '')}"
          data-satuan="${escapeHtml(it.satuan || '')}" data-plant="${escapeHtml(it.plant || '')}"
          data-kategori="${escapeHtml(it.kategori || 'B')}">Daftarkan →</button>` : '';
  return `
      <div class="ra-item">
        <div class="ra-item-main">
          <div class="ra-item-title">${escapeHtml(it.kode)} — ${escapeHtml(it.namaBarang || '-')}</div>
          <div class="ra-item-sub">Stock ${it.onHand} ${escapeHtml(it.satuan || '')}${ropMaxText}</div>
          ${meta ? `<div class="item-meta-line">${meta}</div>` : ''}
        </div>
        <div class="ra-item-side">
          <span class="ra-badge ${badgeClass}">${escapeHtml(badgeLabel)}</span>
          ${daftarkanBtn}
        </div>
      </div>
    `;
}

// Pindah dari popup Dashboard ke halaman Master Data & langsung buka form
// Tambah Item yang sudah keisi (kode dikunci nggak ke-lock, tetap mode TAMBAH
// — lihat opts.forceAddMode di openMdModal, Code.gs). setTimeout kecil di sini
// cuma buat kasih waktu Router pindah halaman/render dulu sebelum modal-nya
// ditumpuk (openMdModal sendiri nggak butuh nunggu loadMdList() kelar, cuma
// butuh DOM Master Data-nya udah ke-render/kelihatan).
function gotoRegisterMasterData(data) {
  closeDashListModal();
  window.location.hash = '#/master-data';
  setTimeout(() => {
    openMdModal({
      kodeBarang: data.kode,
      namaBarang: data.nama || '',
      satuan: data.satuan || '',
      kategori: data.kategori || 'B',
      lokasiDefault: '',
      jenis: '',
      area: '',
      plant: data.plant || '',
      avgUsage: 0,
      leadTime: 0,
      minStock: 0,
      max: 0
    }, { forceAddMode: true, title: 'Daftarkan Item' });
  }, 60);
}

// ---------------------------------------------------------------------------
// Filter Plant (chip) di popup "Total SKU Terdaftar" — state-nya di-reset tiap
// popup ini dibuka (lihat openDashStatModal), datanya sudah ada di memori
// (dashTotalPlantItems, dari dashFullBalances yang sudah di-fetch), jadi
// ganti-ganti Plant TIDAK perlu fetch ulang ke server, cuma re-render.
// ---------------------------------------------------------------------------
let dashTotalPlantItems = [];
let dashTotalPlantSelected = ''; // '' = Semua Plant
const DASH_PLANT_NONE = '__none__'; // sentinel buat item yang Plant-nya belum diisi

function renderDashPlantFilterChips() {
  const wrap = document.getElementById('dashListModalPlantFilter');
  const plants = Array.from(new Set(dashTotalPlantItems.map((it) => it.plant || DASH_PLANT_NONE)))
    .sort((a, b) => {
      if (a === DASH_PLANT_NONE) return 1;
      if (b === DASH_PLANT_NONE) return -1;
      return a.localeCompare(b);
    });

  // Kalau semua item cuma dari 1 Plant (atau nggak ada Plant sama sekali),
  // filter-nya nggak berguna — sembunyikan biar popup nggak keliatan aneh.
  if (plants.length <= 1) { wrap.hidden = true; wrap.innerHTML = ''; return; }

  const chips = [{ value: '', label: 'Semua Plant' }]
    .concat(plants.map((p) => ({ value: p, label: p === DASH_PLANT_NONE ? 'Belum Ditentukan' : 'Plant ' + p })));

  wrap.hidden = false;
  wrap.innerHTML = chips.map((c) => `
      <button type="button" class="dm-plant-chip${dashTotalPlantSelected === c.value ? ' active' : ''}" data-plant="${escapeHtml(c.value)}">${escapeHtml(c.label)}</button>
    `).join('');
}

function renderDashPlantFilteredList() {
  const items = dashTotalPlantSelected
    ? dashTotalPlantItems.filter((it) => (it.plant || DASH_PLANT_NONE) === dashTotalPlantSelected)
    : dashTotalPlantItems;

  const body = document.getElementById('dashListModalBody');
  if (!items.length) {
    body.innerHTML = '<div class="empty-state">Tidak ada barang terdaftar di Plant ini.</div>';
    return;
  }
  body.innerHTML = items.map((it) => dashStockItemHtml(it)).join('');
}

function selectDashPlantFilter(value) {
  dashTotalPlantSelected = value;
  renderDashPlantFilterChips();
  renderDashPlantFilteredList();
}

// Popup "Diterima Hari Ini" / "Diterima Bulan Ini" / "SKU Bulan Ini" — dari
// Api.getReceivingDetail (itemized per Kode Barang, lihat handleGetReceivingDetail
// di Code.gs). Beda bentuk data dari Stock Balance (tidak ada status/ROP/MAX),
// jadi butuh renderer sendiri, bukan dashStockItemHtml.
function renderDashReceivingModalBody(items, emptyText) {
  const body = document.getElementById('dashListModalBody');
  if (!items.length) {
    body.innerHTML = `<div class="empty-state">${escapeHtml(emptyText || 'Tidak ada data.')}</div>`;
    return;
  }
  body.innerHTML = items.map((it) => {
    const poVendorText = (it.noPO || it.vendor)
      ? ` · PO ${escapeHtml(it.noPO || '-')}${it.vendor ? ' · ' + escapeHtml(it.vendor) : ''}`
      : '';
    const meta = itemMetaLine(it);
    return `
      <div class="ra-item">
        <div class="ra-item-main">
          <div class="ra-item-title">${escapeHtml(it.kode)} — ${escapeHtml(it.namaBarang || '-')}</div>
          <div class="ra-item-sub">Qty ${it.qty} ${escapeHtml(it.satuan || '')}${poVendorText}</div>
          ${meta ? `<div class="item-meta-line">${meta}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// Popup "Dikeluarkan Hari Ini" / "Dikeluarkan Bulan Ini" — pasangan
// renderDashReceivingModalBody di atas, tapi dari Api.getPemakaianDetail
// (lihat handleGetPemakaianDetail di Code.gs). Bedanya cuma di baris kedua:
// Penerimaan nunjukin PO/Vendor, Pemakaian nunjukin Teknisi/Keterangan.
function renderDashPemakaianModalBody(items, emptyText) {
  const body = document.getElementById('dashListModalBody');
  if (!items.length) {
    body.innerHTML = `<div class="empty-state">${escapeHtml(emptyText || 'Tidak ada data.')}</div>`;
    return;
  }
  body.innerHTML = items.map((it) => {
    const teknisiKetText = (it.teknisi || it.keterangan)
      ? ` · ${escapeHtml(it.teknisi || '-')}${it.keterangan ? ' · ' + escapeHtml(it.keterangan) : ''}`
      : '';
    const meta = itemMetaLine(it);
    return `
      <div class="ra-item">
        <div class="ra-item-main">
          <div class="ra-item-title">${escapeHtml(it.kode)} — ${escapeHtml(it.namaBarang || '-')}</div>
          <div class="ra-item-sub">Qty ${it.qty} ${escapeHtml(it.satuan || '')}${teknisiKetText}</div>
          ${meta ? `<div class="item-meta-line">${meta}</div>` : ''}
        </div>
        ${it.sumberLabel ? `<span class="ra-badge badge-manual">${escapeHtml(it.sumberLabel)}</span>` : ''}
      </div>
    `;
  }).join('');
}

function renderDashTransaksiModalBody(items, emptyText) {
  const body = document.getElementById('dashListModalBody');
  if (!items.length) {
    body.innerHTML = `<div class="empty-state">${escapeHtml(emptyText || 'Tidak ada data.')}</div>`;
    return;
  }
  body.innerHTML = items.map((it) => `
      <div class="ra-item">
        <div class="ra-item-main">
          <div class="ra-item-title">${escapeHtml(it.vendor || '(tanpa vendor)')} — ${it.jumlahItem} item</div>
          <div class="ra-item-sub">${escapeHtml(it.kedatangan)} · PO ${escapeHtml(it.noPO || '-')} · Qty ${it.totalQty}</div>
        </div>
        <span class="ra-badge badge-manual">${escapeHtml(it.user || '-')}</span>
      </div>
    `).join('');
}

function closeDashListModal() {
  document.getElementById('dashListModalBackdrop').hidden = true;
  document.getElementById('dashListModal').hidden = true;
}

function renderTopPemakaian(list) {
  const wrap = document.getElementById('topPemakaianList');
  if (!list.length) {
    wrap.innerHTML = '<div class="empty-state">Belum ada data pemakaian bulan ini.</div>';
    return;
  }
  const max = Math.max(1, ...list.map((it) => it.qty));
  wrap.innerHTML = list.map((it) => {
    const meta = itemMetaLine(it);
    return `
      <div class="tp-item">
        <div class="tp-item-label">
          <span>${escapeHtml(it.kode)} — ${escapeHtml(it.namaBarang || '-')}</span>
          <strong>${it.qty}${it.satuan ? ' ' + escapeHtml(it.satuan) : ''}</strong>
        </div>
        ${meta ? `<div class="item-meta-line">${meta}</div>` : ''}
        <div class="tp-bar-track"><div class="tp-bar-fill" style="width:${Math.max(4, (it.qty / max) * 100)}%"></div></div>
      </div>
    `;
  }).join('');
}

function renderStats(res) {
  animateStatValue('statHariIni', res.totalHariIni || 0);
  animateStatValue('statKeluarHariIni', res.totalKeluarHariIni || 0);
  animateStatValue('statBulanIni', res.totalBulanIni || 0);
  animateStatValue('statKeluarBulanIni', res.totalKeluarBulanIni || 0);
  animateStatValue('statTransaksi', res.transaksiBulanIni || 0);
  animateStatValue('statSku', res.skuBulanIni || 0);
}

function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function animateStatValue(id, target) {
  const el = document.getElementById(id);
  if (!target || prefersReducedMotion()) {
    el.textContent = target;
    return;
  }
  const duration = 550;
  const t0 = performance.now();
  function step(now) {
    const p = Math.min(1, (now - t0) / duration);
    const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
    el.textContent = Math.round(target * eased);
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = target;
  }
  requestAnimationFrame(step);
}

function renderRiwayat(items) {
  const wrap = document.getElementById('riwayatList');
  if (!items.length) {
    wrap.innerHTML = '<div class="empty-state">Belum ada data penerimaan.</div>';
    return;
  }
  wrap.innerHTML = items.map((it) => `
      <div class="riwayat-item">
        <div class="riwayat-item-main">
          <div class="riwayat-item-title">${escapeHtml(it.vendor || '(tanpa vendor)')} — ${it.jumlahItem} item</div>
          <div class="riwayat-item-sub">${escapeHtml(it.kedatangan)} · PO ${escapeHtml(it.noPO || '-')} · Qty ${it.totalQty}</div>
        </div>
        <span class="riwayat-item-badge badge-manual">${escapeHtml(it.user || '-')}</span>
      </div>
    `).join('');
}

let chartAnimToken = 0;

function renderChart(data) {
  const canvas = document.getElementById('chartMingguan');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  // PENTING: canvas ini anak langsung dari .card yang punya padding (lihat index.html).
  // parentElement.clientWidth itu lebar .card TERMASUK padding kiri-kanannya — kalau
  // dipakai langsung, canvas jadi digambar lebih lebar dari ruang yang sebenarnya
  // tersedia di dalam padding, jadi bar paling kanan keliatan "bablas" nyembul lewat
  // tepi kanan card. Makanya padding parent-nya harus dikurangi dulu di sini.
  const parentEl = canvas.parentElement;
  const parentPadding = parentEl ? (parseFloat(getComputedStyle(parentEl).paddingLeft) || 0) +
    (parseFloat(getComputedStyle(parentEl).paddingRight) || 0) : 0;
  const cssWidth = (parentEl && (parentEl.clientWidth - parentPadding)) || canvas.clientWidth || 320;
  const cssHeight = 160;
  // Kunci UKURAN TAMPILAN canvas ke ukuran CSS yang dimaksud — tanpa ini, di HP dengan
  // devicePixelRatio tinggi (2x/3x) canvasnya malah tampil 2-3x lebih besar dari seharusnya,
  // bikin layout dashboard jadi aneh (area kosong raksasa di bawah/kanan chart).
  canvas.style.width = cssWidth + 'px';
  canvas.style.height = cssHeight + 'px';
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  ctx.scale(dpr, dpr);

  const myToken = ++chartAnimToken; // batalkan animasi frame lama kalau renderChart dipanggil lagi

  if (!data.length) {
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    return;
  }

  // data sekarang {tanggal, qtyMasuk, qtyKeluar} per hari (lihat
  // mergeMasukKeluarChart_) — digambar sebagai 2 bar berdampingan per hari
  // (grouped bar chart) biar Masuk & Keluar langsung kebandingin tiap hari,
  // bukan cuma 1 bar Penerimaan doang kayak sebelumnya.
  function draw(progress) {
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    const max = Math.max(1, ...data.map((d) => Math.max(d.qtyMasuk, d.qtyKeluar)));
    const padBottom = 22;
    const padTop = 14;
    const chartH = cssHeight - padBottom - padTop;
    const barGap = 10;
    const groupWidth = (cssWidth - barGap * (data.length + 1)) / data.length;
    const innerGap = 4;
    const barWidth = (groupWidth - innerGap) / 2;

    data.forEach((d, i) => {
      const groupX = barGap + i * (groupWidth + barGap);

      const fullHMasuk = (d.qtyMasuk / max) * chartH;
      const barHMasuk = fullHMasuk * progress;
      const xMasuk = groupX;
      const yMasuk = padTop + (chartH - barHMasuk);
      ctx.fillStyle = '#0f2a5c';
      roundRectPath(ctx, xMasuk, yMasuk, barWidth, Math.max(barHMasuk, d.qtyMasuk > 0 ? 2 : 0), 3);
      ctx.fill();

      const fullHKeluar = (d.qtyKeluar / max) * chartH;
      const barHKeluar = fullHKeluar * progress;
      const xKeluar = groupX + barWidth + innerGap;
      const yKeluar = padTop + (chartH - barHKeluar);
      ctx.fillStyle = '#d64545';
      roundRectPath(ctx, xKeluar, yKeluar, barWidth, Math.max(barHKeluar, d.qtyKeluar > 0 ? 2 : 0), 3);
      ctx.fill();

      ctx.fillStyle = '#6b7488';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      const label = (d.tanggal || '').slice(5); // MM-DD
      ctx.fillText(label, groupX + groupWidth / 2, cssHeight - 6);

      if (progress > 0.85) {
        ctx.globalAlpha = (progress - 0.85) / 0.15;
        ctx.font = 'bold 9px -apple-system, sans-serif';
        if (d.qtyMasuk > 0) {
          ctx.fillStyle = '#0f2a5c';
          ctx.fillText(String(d.qtyMasuk), xMasuk + barWidth / 2, yMasuk - 4);
        }
        if (d.qtyKeluar > 0) {
          ctx.fillStyle = '#d64545';
          ctx.fillText(String(d.qtyKeluar), xKeluar + barWidth / 2, yKeluar - 4);
        }
        ctx.globalAlpha = 1;
      }
    });
  }

  if (prefersReducedMotion()) {
    draw(1);
    return;
  }

  const duration = 500;
  const t0 = performance.now();
  function frame(now) {
    if (myToken !== chartAnimToken) return; // ada renderChart baru, hentikan animasi lama
    const p = Math.min(1, (now - t0) / duration);
    const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
    draw(eased);
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

const KATEGORI_SEGMENTS = [
  { key: 'A', label: 'A — Critical', color: '#d64545' },
  { key: 'B', label: 'B — Medium', color: '#ffb703' },
  { key: 'C', label: 'C — Fast Moving', color: '#2e9e5b' }
];

function renderKategoriChart(dist) {
  const canvas = document.getElementById('chartKategori');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const size = 140;
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, size, size);

  const total = (dist.A || 0) + (dist.B || 0) + (dist.C || 0);
  const legend = document.getElementById('kategoriLegend');
  const cx = size / 2, cy = size / 2, r = (size - 18) / 2;

  if (!total) {
    ctx.strokeStyle = '#e3e7f0';
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    legend.innerHTML = '<div class="empty-state">Belum ada item aktif di Master Data.</div>';
    return;
  }

  let startAngle = -Math.PI / 2;
  ctx.lineWidth = 18;
  KATEGORI_SEGMENTS.forEach((seg) => {
    const value = dist[seg.key] || 0;
    if (!value) return;
    const angle = (value / total) * Math.PI * 2;
    ctx.strokeStyle = seg.color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, startAngle + angle);
    ctx.stroke();
    startAngle += angle;
  });

  legend.innerHTML = KATEGORI_SEGMENTS.map((seg) => {
    const value = dist[seg.key] || 0;
    return `
      <div class="kt-legend-item">
        <span class="kt-dot" style="background:${seg.color}"></span>
        <span>${seg.label}</span>
        <strong>${value} (${Math.round((value / total) * 100)}%)</strong>
      </div>
    `;
  }).join('');
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// META LINE (Plant · S.Loc · Kategori · Jenis) — dipakai di SEMUA list yang
// nampilin Kode+Nama Barang (Dashboard, Stock Balance, Put Away, Riwayat
// Transaksi, Stock Opname, Alert Order, hint pencarian Penerimaan/Pemakaian/
// QR Label) biar user selalu tau Plant/S.Loc/Kategori/Jenis barang itu tanpa
// buka Master Data terpisah (keluhan user: "plantnya belum muncul ini").
// File ini (dashboard.js) di-load PALING AWAL dari semua halaman lain (lihat
// urutan <script> di index.html), jadi fungsi ini aman dipakai global oleh
// file manapun setelahnya.
// ---------------------------------------------------------------------------
const KATEGORI_META_LABEL = { A: 'Kategori A', B: 'Kategori B', C: 'Kategori C' };

function itemMetaLine(it) {
  if (!it) return '';
  const parts = [];
  if (it.plant) parts.push('Plant ' + escapeHtml(it.plant));

  if (Array.isArray(it.slocBreakdown) && it.slocBreakdown.length) {
    // Rincian per S.Loc (dari hitungBalances_ — 1 kode+plant bisa nyebar di
    // lebih dari 1 S.Loc), mis. "S.Loc: GDJT 30, GDSP 20".
    const slocText = it.slocBreakdown
      .map((s) => escapeHtml(s.sloc) + ' ' + s.onHand)
      .join(', ');
    parts.push('S.Loc: ' + slocText);
  } else if (it.sloc) {
    // Baris transaksi tunggal (Riwayat, Put Away, Opname, dst) — 1 S.Loc saja.
    parts.push('S.Loc ' + escapeHtml(it.sloc));
  }

  // `itemKategori`/`itemJenis` dipakai (bukan `kategori`/`jenis` polos) di
  // endpoint yang sudah punya field `jenis` lain (jenis TRANSAKSI:
  // Penerimaan/Pemakaian/dst) — lihat handleGetRiwayatTerpadu di Code.gs.
  // Cek keduanya biar helper ini aman dipakai di semua endpoint tanpa perlu
  // hafal mana yang pakai konvensi mana.
  const kategoriVal = it.itemKategori || it.kategori;
  if (kategoriVal) parts.push(escapeHtml(KATEGORI_META_LABEL[String(kategoriVal).toUpperCase()] || ('Kategori ' + kategoriVal)));
  const jenisText = it.itemJenis || it.jenis;
  if (jenisText) parts.push('Jenis ' + escapeHtml(jenisText));

  return parts.join(' · ');
}
