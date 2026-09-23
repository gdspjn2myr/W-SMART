// ============================================================================
// QR LABELS — generate & cetak label QR untuk Barang (Kode Barang) dan
// Bin/Lokasi. QR digambar pakai qrcode-lib.js (vendored, lihat file itu).
//
// ISI QR — BEDA antara Barang & Bin (per keputusan user, lihat riwayat chat:
// awalnya QR Barang cuma Kode polos, user minta diubah jadi "manampilkan
// semuanya"):
// - Barang: QR sekarang encode SEMUA detail label (kode, nama, No PO, Vendor,
//   Sumber, Plant, S.Loc, Qty, Satuan, Tanggal, User) pakai format ringkas
//   "WSB1|..." — lihat encodeBarangQrPayload/parseQrPayload di js/qr-payload.js
//   buat format persisnya & alasan desainnya (termasuk kenapa BUKAN JSON).
//   Field yang kosong tetap disertakan (posisinya kosong) supaya urutan field
//   lain tidak geser.
// - Bin/Lokasi: TETAP TEKS POLOS apa adanya (TIDAK diubah) — bin tidak punya
//   "riwayat/detail transaksi" yang perlu nempel, cuma butuh dikenali sebagai
//   1 kode lokasi. Lihat generateQrBinLabels di bawah.
// Konsumen scan yang SUDAH ADA (Put Away, Barang Keluar, Stock Opname, Pindah
// Bin) TIDAK PERLU DIUBAH SAMA SEKALI walau format QR Barang berubah — parsing
// dipusatkan di openQrScanner (qr-scan.js), yang selalu mengekstrak Kode
// Barang polos dari label WSB1 sebelum diteruskan ke pemanggil manapun.
//
// DETAIL TAMBAHAN DI LABEL (No PO, Vendor, Sumber/Pemesan, Plant, S.Loc, Qty,
// Tanggal, Diterima oleh) — permintaan user supaya label barang selengkap
// mungkin, bukan cuma Kode+Nama. Field2 ini dicetak DI SAMPING QR-nya (buat
// dibaca manusia langsung dari label fisik) DAN ikut di-encode ke DALAM QR-nya
// (buat dibaca scanner/app lain). Sumbernya beda2:
// - Cetak langsung setelah submit Penerimaan Barang -> otomatis lengkap dari
//   transaksi yang baru disimpan (lihat penerimaan.js, openPutawayPrompt).
// - Mode Manual (cari barang dari Master Data) -> field2 ini nggak nempel ke
//   Master Data (No PO/Vendor/dst itu per-transaksi, bukan properti barang),
//   jadi disediakan sebagai isian OPSIONAL "Detail Tambahan" yang berlaku
//   sama buat semua barang yang dipilih di 1x generate itu (lihat
//   generateQrBarangLabels & field qrManual* di index.html).
// Field yang kosong TIDAK ditampilkan di label (biar nggak penuh baris "-").
// ============================================================================

let qrLabelsInitialized = false;
let qrMode = 'barang'; // 'barang' | 'bin'
let qrBarangItems = [];
let qrBarangSelected = new Set();
let qrBarangSearchText = '';
let qrLabelsPendingItems = null; // dipakai buat "cetak QR langsung" dari halaman lain (lihat goToQrLabelsForItems)

// Daftar "Belum Ter-mapping" (sama sumbernya dengan card di halaman Put Away,
// Api.getStockBalance filter 'perlu-putaway') — ditampilkan di sini juga
// (collapsible, lazy-load) supaya Mode Manual bisa langsung pilih dari
// barang yang PERLU di-put away tanpa harus ketik cari satu-satu. Kasus
// nyata yang dilaporkan Bos: kadang barang belum bisa di-put away (bin belum
// ada/nunggu keputusan dll), tapi labelnya tetap perlu dicetak duluan —
// termasuk barang yang belumAdaMaster (belum terdaftar di Master Data),
// makanya TIDAK bisa cuma mengandalkan qrBarangItems (hasil getMasterBarang)
// buat lookup info barangnya — lihat getQrItemInfo di bawah.
let qrBelumMapping = [];
let qrBelumMappingLoaded = false;

const QR_BARANG_SUGGEST_LIMIT = 8; // maksimal saran yang ditampilkan sekaligus biar gak balik jadi daftar panjang

function initQrLabelsPage() {
  if (!qrLabelsInitialized) {
    qrLabelsInitialized = true;

    document.getElementById('btnQrModeBarang').addEventListener('click', () => setQrMode('barang'));
    document.getElementById('btnQrModeBin').addEventListener('click', () => setQrMode('bin'));

    const searchInput = document.getElementById('qrBarangSearch');
    searchInput.addEventListener('input', (e) => {
      qrBarangSearchText = e.target.value.trim().toLowerCase();
      renderQrBarangSuggest();
    });
    searchInput.addEventListener('focus', renderQrBarangSuggest);
    // Klik di luar search/suggest -> tutup dropdown saran (biar gak nutupin
    // tombol/isian lain pas orang lanjut ke field berikutnya).
    document.addEventListener('click', (e) => {
      const wrap = document.getElementById('qrBarangSearch').closest('.qr-pick-search-wrap');
      if (wrap && !wrap.contains(e.target)) {
        document.getElementById('qrBarangSuggest').hidden = true;
      }
    });

    document.getElementById('qrBarangSelected').addEventListener('click', (e) => {
      const removeBtn = e.target.closest('[data-remove-kode]');
      if (!removeBtn) return;
      qrBarangSelected.delete(removeBtn.dataset.removeKode);
      renderQrBarangSelected();
      renderQrBarangSuggest(); // barang yg baru dilepas bisa muncul lagi di saran kalau masih cocok pencarian
      if (qrBelumMappingLoaded) renderQrBelumMappingList(); // begitu juga di daftar Belum Ter-mapping kalau sedang kebuka
    });

    document.getElementById('btnToggleQrBelumMapping').addEventListener('click', toggleQrBelumMappingSection);

    document.getElementById('btnGenerateQrBarang').addEventListener('click', generateQrBarangLabels);
    document.getElementById('btnGenerateQrBin').addEventListener('click', generateQrBinLabels);
    document.getElementById('btnPrintQrLabels').addEventListener('click', printQrLabels);

    // "Detail Tambahan (opsional)" khusus mode Manual — Sumber/Pemesan cuma
    // butuh Nama kalau tipenya USER (sama polanya kayak fPemesanTipe di
    // Penerimaan, lihat js/penerimaan.js updatePemesanNamaVisibility).
    const sumberTipeEl = document.getElementById('qrManualSumberTipe');
    if (sumberTipeEl) {
      sumberTipeEl.addEventListener('change', () => {
        document.getElementById('qrManualSumberNamaWrap').hidden = sumberTipeEl.value !== 'USER';
      });
    }
    wireUppercaseInput('qrManualSLoc');
  }

  if (qrLabelsPendingItems && qrLabelsPendingItems.length) {
    const items = qrLabelsPendingItems;
    qrLabelsPendingItems = null;
    setQrMode('barang');
    renderQrLabels(items.map((it) => buildBarangLabel(it)));
  }

  loadQrBarangItems();
}

// Label QR selalu "cetak Kode Barang polos" (lihat komentar header) — fungsi
// ini yang nyusun bagian TEKS-nya (bukan QR-nya) dari 1 item, apa pun bentuk
// asal datanya (dari Penerimaan yang baru disimpan, dari daftar Put Away
// belum-ter-mapping, atau dari Master Data pas mode Manual) — field yang
// nggak ada di sumbernya otomatis nggak ditampilkan (lihat renderQrLabels).
function buildBarangLabel(it) {
  return {
    code: it.kode || it.kodeBarang || '',
    namaBarang: it.namaBarang || '',
    noPO: it.noPO || '',
    vendor: it.vendor || '',
    sumber: it.sumber || '',
    plant: it.plant || '',
    sloc: it.sloc || '',
    qty: it.qty || '',
    satuan: it.satuan || '',
    tanggal: it.tanggal || null,
    user: it.user || ''
  };
}

// 'yyyy-mm-dd' (dari <input type="date">) ATAU objek Date -> 'DD/MM/YYYY'
// buat dicetak di label. Kalau formatnya nggak dikenal, tampilin apa adanya
// (lebih baik daripada label kosong/nge-error).
function qrFormatTanggal(v) {
  if (!v) return '';
  let d = v;
  if (typeof v === 'string') {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[3] + '/' + m[2] + '/' + m[1];
    d = new Date(v);
  }
  if (d instanceof Date && !isNaN(d.getTime())) {
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  }
  return String(v);
}

/**
 * Dipanggil dari halaman lain (Barang Masuk, Put Away) buat langsung cetak QR
 * item tertentu tanpa harus pilih manual dari daftar Master Data — berguna
 * juga untuk barang yang belum terdaftar di Master Data (belumAdaMaster),
 * karena di sini nggak bergantung pada daftar Api.getMasterBarang().
 * items = [{ kode, namaBarang, ...detail opsional (noPO/vendor/sumber/plant/
 *   sloc/qty/satuan/tanggal/user) }] — lihat buildBarangLabel. Field yang
 * nggak dikasih otomatis nggak ditampilkan di label (bukan wajib semua ada).
 */
function goToQrLabelsForItems(items) {
  qrLabelsPendingItems = items;
  location.hash = '#/qr-labels';
}

function setQrMode(mode) {
  qrMode = mode;
  document.getElementById('btnQrModeBarang').classList.toggle('active', mode === 'barang');
  document.getElementById('btnQrModeBin').classList.toggle('active', mode === 'bin');
  document.getElementById('qrPanelBarang').hidden = mode !== 'barang';
  document.getElementById('qrPanelBin').hidden = mode !== 'bin';
}

async function loadQrBarangItems() {
  try {
    const res = await Api.getMasterBarang();
    qrBarangItems = (res.data || []).filter((it) => it.status !== 'Nonaktif');
    renderQrBarangSuggest();
    renderQrBarangSelected();
  } catch (err) {
    document.getElementById('qrBarangSuggest').innerHTML = `<div class="qr-pick-suggest-empty">Gagal memuat data barang: ${escapeHtml(err.message)}</div>`;
  }
}

// Dropdown "saran" — SENGAJA tidak nampilin semua barang sekaligus (dulu
// bikin halaman kepanjangan & bikin bingung mau pilih yang mana), cuma
// muncul begitu user mulai ngetik, dibatasi QR_BARANG_SUGGEST_LIMIT hasil.
// Barang yang sudah dipilih (lihat qrBarangSelected) disembunyikan dari
// saran supaya gak keklik dobel — sudah pindah ke daftar "dipilih" di bawah.
function renderQrBarangSuggest() {
  const box = document.getElementById('qrBarangSuggest');
  if (!qrBarangSearchText) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }

  const matches = qrBarangItems.filter((it) =>
    !qrBarangSelected.has(it.kodeBarang) &&
    ((it.kodeBarang || '').toLowerCase().includes(qrBarangSearchText) ||
     (it.namaBarang || '').toLowerCase().includes(qrBarangSearchText))
  );

  if (!matches.length) {
    box.hidden = false;
    box.innerHTML = '<div class="qr-pick-suggest-empty">Tidak ada barang aktif yang cocok.</div>';
    return;
  }

  const shown = matches.slice(0, QR_BARANG_SUGGEST_LIMIT);
  const rows = shown.map((it) => {
    const meta = itemMetaLine({ plant: it.plant, kategori: it.kategori, itemJenis: it.jenis });
    return `
      <button type="button" class="qr-pick-suggest-item" data-add-kode="${escapeHtml(it.kodeBarang)}">
        <span class="qr-pick-suggest-kode">${escapeHtml(it.kodeBarang)}</span>
        <span class="qr-pick-suggest-nama">${escapeHtml(it.namaBarang || '-')}${meta ? ` <span class="item-meta-line">· ${meta}</span>` : ''}</span>
        <span class="qr-pick-suggest-satuan">${escapeHtml(it.satuan || '-')}</span>
      </button>
    `;
  }).join('');

  const moreNote = matches.length > shown.length
    ? `<div class="qr-pick-suggest-more">+${matches.length - shown.length} hasil lain — perjelas pencarian buat lihat.</div>`
    : '';
  // "Tambah semua hasil ini" nambahin SELURUH matches (bukan cuma yang
  // ditampilkan) — cara cepat kalau memang mau ambil satu grup barang
  // sekaligus (mis. cari "fuse" terus tambahin semuanya).
  const addAllBtn = matches.length > 1
    ? `<button type="button" class="qr-pick-suggest-addall" id="btnQrAddAllMatches">+ Tambah semua ${matches.length} hasil pencarian ini</button>`
    : '';

  box.hidden = false;
  box.innerHTML = rows + moreNote + addAllBtn;

  box.querySelectorAll('[data-add-kode]').forEach((btn) => {
    btn.addEventListener('click', () => addQrBarangToSelection([btn.dataset.addKode]));
  });
  const addAllEl = document.getElementById('btnQrAddAllMatches');
  if (addAllEl) {
    addAllEl.addEventListener('click', () => addQrBarangToSelection(matches.map((it) => it.kodeBarang)));
  }
}

function addQrBarangToSelection(kodeList) {
  kodeList.forEach((kode) => qrBarangSelected.add(kode));
  document.getElementById('qrBarangSearch').value = '';
  qrBarangSearchText = '';
  document.getElementById('qrBarangSuggest').hidden = true;
  renderQrBarangSelected();
  if (qrBelumMappingLoaded) renderQrBelumMappingList(); // barang yg baru ditambah hilang dari daftar Belum Ter-mapping (kalau lagi kebuka)
}

// Cari info tampilan (nama/satuan/plant/kategori/jenis) 1 kode barang — dari
// Master Data (qrBarangItems, sumber normal buat search) DULU, fallback ke
// qrBelumMapping (dipakai kalau kode dipilih dari daftar "Belum Ter-mapping"
// & KEBETULAN belumAdaMaster — belum terdaftar resmi di Master Data sama
// sekali, jadi TIDAK ada di qrBarangItems). SELALU balikin object (nggak
// pernah undefined) supaya pemanggil (renderQrBarangSelected,
// generateQrBarangLabels) nggak perlu cek null-nya sendiri2.
function getQrItemInfo(kode) {
  const fromMaster = qrBarangItems.find((x) => x.kodeBarang === kode);
  if (fromMaster) {
    return { kodeBarang: fromMaster.kodeBarang, namaBarang: fromMaster.namaBarang, satuan: fromMaster.satuan, plant: fromMaster.plant, kategori: fromMaster.kategori, jenis: fromMaster.jenis };
  }
  const fromBelum = qrBelumMapping.find((x) => x.kode === kode);
  if (fromBelum) {
    return { kodeBarang: fromBelum.kode, namaBarang: fromBelum.namaBarang, satuan: fromBelum.satuan, plant: fromBelum.plant, kategori: fromBelum.kategori, jenis: fromBelum.jenis };
  }
  return { kodeBarang: kode, namaBarang: '', satuan: '', plant: '', kategori: '', jenis: '' };
}

// Daftar "Barang Dipilih" — chip yang bisa dihapus satu-satu (× di tiap
// chip). Ini yang dipakai generateQrBarangLabels(), bukan hasil pencarian.
function renderQrBarangSelected() {
  const wrap = document.getElementById('qrBarangSelected');
  if (!qrBarangSelected.size) {
    wrap.innerHTML = '<div class="qr-pick-selected-empty">Belum ada barang dipilih — cari &amp; klik dari saran di atas.</div>';
    return;
  }
  const chips = [...qrBarangSelected].map((kode) => {
    const it = getQrItemInfo(kode);
    const meta = itemMetaLine({ plant: it.plant, kategori: it.kategori, itemJenis: it.jenis });
    return `
      <span class="qr-pick-chip">
        <span class="qr-pick-chip-text">${escapeHtml(kode)}${it.namaBarang ? ' — ' + escapeHtml(it.namaBarang) : ''}${meta ? ` <span class="item-meta-line">· ${meta}</span>` : ''}</span>
        <button type="button" class="qr-pick-chip-remove" data-remove-kode="${escapeHtml(kode)}" aria-label="Hapus dari pilihan">×</button>
      </span>`;
  }).join('');
  wrap.innerHTML = `<div class="qr-pick-selected-count">${qrBarangSelected.size} barang dipilih</div><div class="qr-pick-chip-list">${chips}</div>`;
}

// ---------------------------------------------------------------------------
// Daftar "Belum Ter-mapping" (collapsible, lazy-load — cuma dipanggil begitu
// section-nya dibuka, biar buka halaman QR Labels biasa nggak nambah 1x
// panggilan API yang belum tentu kepake).
// ---------------------------------------------------------------------------
async function toggleQrBelumMappingSection() {
  const section = document.getElementById('qrBelumMappingSection');
  const btn = document.getElementById('btnToggleQrBelumMapping');
  const willShow = section.hidden;
  section.hidden = !willShow;
  if (btn) btn.textContent = willShow ? '− Sembunyikan daftar Belum Ter-mapping' : '+ Pilih dari daftar Belum Ter-mapping (Perlu Put Away)';
  if (willShow && !qrBelumMappingLoaded) await loadQrBelumMapping();
}

async function loadQrBelumMapping() {
  const wrap = document.getElementById('qrBelumMappingList');
  try {
    const res = await Api.getStockBalance({ filter: 'perlu-putaway' });
    qrBelumMapping = res.data || [];
    qrBelumMappingLoaded = true;
    renderQrBelumMappingList();
  } catch (err) {
    wrap.innerHTML = `<div class="qr-pick-suggest-empty">Gagal memuat: ${escapeHtml(err.message)}</div>`;
  }
}

function renderQrBelumMappingList() {
  const wrap = document.getElementById('qrBelumMappingList');
  if (!qrBelumMapping.length) {
    wrap.innerHTML = '<div class="qr-pick-suggest-empty">Tidak ada barang yang belum ter-mapping saat ini.</div>';
    return;
  }
  const items = qrBelumMapping.filter((it) => !qrBarangSelected.has(it.kode));
  if (!items.length) {
    wrap.innerHTML = '<div class="qr-pick-suggest-empty">Semua barang belum-ter-mapping sudah dipilih — cek daftar "Barang Dipilih" di bawah.</div>';
    return;
  }
  const rows = items.map((it) => {
    const meta = itemMetaLine(it);
    return `
      <button type="button" class="qr-pick-suggest-item" data-add-belum-kode="${escapeHtml(it.kode)}">
        <span class="qr-pick-suggest-kode">${escapeHtml(it.kode)}</span>
        <span class="qr-pick-suggest-nama">${escapeHtml(it.namaBarang || '-')}${it.belumAdaMaster ? ' · <span class="badge-belum-master">⚠ Belum terdaftar</span>' : ''}${meta ? ` <span class="item-meta-line">· ${meta}</span>` : ''}</span>
        <span class="qr-pick-suggest-satuan">Sisa ${it.belumTerMapping} ${escapeHtml(it.satuan || '-')}</span>
      </button>
    `;
  }).join('');
  const addAllBtn = items.length > 1
    ? `<button type="button" class="qr-pick-suggest-addall" id="btnQrAddAllBelumMapping">+ Tambah semua ${items.length} item belum-ter-mapping</button>`
    : '';
  wrap.innerHTML = rows + addAllBtn;
  wrap.querySelectorAll('[data-add-belum-kode]').forEach((btn) => {
    btn.addEventListener('click', () => addQrBarangToSelection([btn.dataset.addBelumKode]));
  });
  const addAllEl = document.getElementById('btnQrAddAllBelumMapping');
  if (addAllEl) addAllEl.addEventListener('click', () => addQrBarangToSelection(items.map((it) => it.kode)));
}

// Baca "Detail Tambahan (opsional)" di mode Manual. DULU field ini dipaksa
// SAMA buat semua barang yang dipilih di 1x generate — bug yang dilaporkan
// Bos: pilih beberapa Kode Barang yang beda (dari PO/Vendor/User yang beda
// juga), labelnya keliatan seragam semua padahal barangnya beda transaksi.
// SEKARANG field yang di sini DIKOSONGIN otomatis diisi dari Penerimaan
// TERAKHIR milik masing2 barang SENDIRI-SENDIRI (lihat generateQrBarangLabels
// & handleGetLatestPenerimaanBatch di Code.gs) — field ini cuma jadi OVERRIDE
// manual kalau memang diisi (dipaksa sama ke semua barang, buat kasus mis.
// relabel di bawah 1 dokumen yang sama).
function readQrManualDetail() {
  const noPO = (document.getElementById('qrManualNoPO') || {}).value || '';
  const vendor = (document.getElementById('qrManualVendor') || {}).value || '';
  const plant = (document.getElementById('qrManualPlant') || {}).value || '';
  const sloc = (document.getElementById('qrManualSLoc') || {}).value || '';
  const tanggal = (document.getElementById('qrManualTanggal') || {}).value || '';
  const sumberTipe = (document.getElementById('qrManualSumberTipe') || {}).value || '';
  const sumberNama = (document.getElementById('qrManualSumberNama') || {}).value || '';

  let sumber = '';
  if (sumberTipe === 'USER') sumber = sumberNama.trim() ? 'User: ' + sumberNama.trim() : 'User';
  else if (sumberTipe === 'OBS') sumber = 'OBS';
  else if (sumberTipe === 'FAST MOVING') sumber = 'Fast Moving';

  return { noPO: noPO.trim(), vendor: vendor.trim(), plant: plant.trim(), sloc: sloc.trim(), tanggal: tanggal.trim(), sumber };
}

async function generateQrBarangLabels() {
  // Dibangun dari qrBarangSelected langsung (BUKAN filter qrBarangItems) —
  // kalau cuma filter qrBarangItems (hasil getMasterBarang), barang yang
  // dipilih dari daftar "Belum Ter-mapping" tapi belumAdaMaster (belum
  // terdaftar di Master Data sama sekali) bakal HILANG diam2 dari sini
  // (kepilih di layar tapi labelnya nggak ikut kecetak) — lihat getQrItemInfo.
  const items = [...qrBarangSelected].map(getQrItemInfo);
  if (!items.length) {
    showToast('Pilih minimal 1 barang dulu.', 'error');
    return;
  }
  const manualDetail = readQrManualDetail();

  // Ambil Penerimaan TERAKHIR punya MASING2 barang sekaligus (1x panggil buat
  // semua kode yang dipilih, bukan satu-satu per kode — lihat
  // handleGetLatestPenerimaanBatch di Code.gs). Ini yang benerin bug "No
  // PO/User dst keliatan seragam" — tiap barang sekarang kepakein histori
  // Penerimaan-nya SENDIRI, bukan numpang 1 isian manual yang sama.
  let latestByKode = {};
  const btn = document.getElementById('btnGenerateQrBarang');
  const originalBtnText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Memuat...'; }
  try {
    const res = await Api.getLatestPenerimaanBatch({ kodes: items.map((it) => it.kodeBarang) });
    latestByKode = res.data || {};
  } catch (err) {
    // Gagal ambil histori BUKAN alasan gagalin cetak label sama sekali — tetap
    // lanjut (field yang kosong ya kosong/pakai fallback lain), cuma dikasih
    // tau biar Bos ngerti kenapa sebagian field label mungkin kosong.
    showToast('Gagal ambil histori Penerimaan per barang (' + err.message + ') — label tetap dibuat, sebagian field mungkin kosong.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = originalBtnText; }
  }

  const labels = items.map((it) => {
    const auto = latestByKode[it.kodeBarang] || {};
    // Prioritas tiap field: isian manual "Detail Tambahan" (override, kalau
    // diisi) -> Penerimaan TERAKHIR punya barang ITU SENDIRI -> kosong.
    // Plant beda dikit: fallback terakhirnya Plant dari Master Data (it.plant)
    // kalau barangnya belum pernah ada Penerimaan sama sekali & tidak diisi
    // manual — SAMA seperti perilaku lama, cuma sekarang disisipin auto.plant
    // di antaranya.
    return buildBarangLabel({
      kode: it.kodeBarang,
      namaBarang: it.namaBarang,
      satuan: it.satuan,
      noPO: manualDetail.noPO || auto.noPO || '',
      vendor: manualDetail.vendor || auto.vendor || '',
      sumber: manualDetail.sumber || auto.sumber || '',
      sloc: manualDetail.sloc || auto.sloc || '',
      tanggal: manualDetail.tanggal || auto.tanggal || '',
      user: auto.user || '', // "Detail Tambahan" nggak ada isian User manual — selalu dari histori
      plant: manualDetail.plant || auto.plant || it.plant || ''
    });
  });
  await renderQrLabels(labels);
}

async function generateQrBinLabels() {
  const raw = document.getElementById('qrBinCodes').value;
  const codes = [...new Set(
    raw.split('\n').map((s) => s.trim()).filter(Boolean)
  )];
  if (!codes.length) {
    showToast('Isi minimal 1 kode bin dulu (satu per baris).', 'error');
    return;
  }
  const labels = codes.map((code) => ({ code, isBin: true }));
  await renderQrLabels(labels);
}

// Urutan & label singkat tiap baris detail — dipakai konsisten di semua
// sumber (Penerimaan otomatis maupun Manual).
const QR_DETAIL_FIELD_DEFS = [
  ['noPO', 'No PO'],
  ['vendor', 'Vendor'],
  ['sumber', 'Sumber'],
  ['plant', 'Plant'],
  ['sloc', 'S.Loc'],
  ['qty', 'Qty'],
  ['user', 'Diterima']
];

function qrLabelDetailRowsHtml(lbl) {
  const rows = QR_DETAIL_FIELD_DEFS
    .filter(([key]) => lbl[key])
    .map(([key, label]) => {
      let value = lbl[key];
      if (key === 'qty') value = value + (lbl.satuan ? ' ' + lbl.satuan : '');
      return `<div class="qr-label-detail-row"><span class="qr-label-detail-label">${escapeHtml(label)}</span><span class="qr-label-detail-value">${escapeHtml(value)}</span></div>`;
    });
  if (lbl.tanggal) {
    rows.push(`<div class="qr-label-detail-row"><span class="qr-label-detail-label">Tgl Terima</span><span class="qr-label-detail-value">${escapeHtml(qrFormatTanggal(lbl.tanggal))}</span></div>`);
  }
  return rows.join('');
}

async function renderQrLabels(labels) {
  const grid = document.getElementById('qrLabelGrid');
  const card = document.getElementById('qrLabelResultCard');
  const anyDetailed = labels.some((lbl) => !lbl.isBin && (lbl.noPO || lbl.vendor || lbl.sumber || lbl.plant || lbl.sloc || lbl.qty || lbl.tanggal || lbl.user));
  grid.classList.toggle('qr-label-grid-detailed', anyDetailed);

  grid.innerHTML = labels.map((lbl, i) => {
    const detailHtml = lbl.isBin ? '' : qrLabelDetailRowsHtml(lbl);
    const isDetailed = !lbl.isBin && !!detailHtml;
    return `
      <div class="qr-label${isDetailed ? ' qr-label-detailed' : ''}">
        <canvas class="qr-label-canvas" data-idx="${i}"></canvas>
        <div class="qr-label-main">
          <div class="qr-label-code">${escapeHtml(lbl.code)}</div>
          ${lbl.namaBarang ? `<div class="qr-label-sub">${escapeHtml(lbl.namaBarang)}</div>` : ''}
          ${detailHtml ? `<div class="qr-label-detail">${detailHtml}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
  card.hidden = false;
  document.getElementById('qrLabelCount').textContent = labels.length;

  const canvases = grid.querySelectorAll('.qr-label-canvas');
  for (let i = 0; i < labels.length; i++) {
    try {
      // Isi QR: Barang -> payload "kaya data" (WSB1|..., lihat qr-payload.js);
      // Bin -> tetap teks polos apa adanya (lbl.isBin, TIDAK PERNAH diubah).
      const qrContent = labels[i].isBin ? labels[i].code : encodeBarangQrPayload(labels[i]);
      // errorCorrectionLevel 'M' (15% toleransi rusak/kotor) — SEMPAT dicoba
      // dinaikkan ke 'Q' (25%), tapi dibalikin lagi: user laporan QR-nya jadi
      // "kurang gede/susah discan" pas label lengkap dicetak beneran. ECC
      // lebih tinggi = QR JADI TAMBAH PADAT (lebih banyak modul buat data
      // redundan) — di kondisi gudang, itu justru LEBIH BURUK buat scan
      // reliability daripada bantu, karena label fisiknya kecil (modul jadi
      // makin rapat/susah kebaca kamera HP dari jarak wajar) — bukan masalah
      // ketahanan-rusak. 'M' + ukuran cetak yang diperbesar (lihat CSS
      // .qr-label-detailed .qr-label-canvas) lebih pas buat kasus ini.
      const qrModuleWidth = 240; // resolusi render internal (BUKAN ukuran cetak, itu diatur CSS) — dinaikkan dari 160 biar tepian modul tetap tajam pas discale/dicetak gede, nggak buram.
      await QRCode.toCanvas(canvases[i], qrContent, { width: qrModuleWidth, margin: 1, errorCorrectionLevel: 'M' });

      // Kanvas hasil qrcode-lib DIGANTI jadi <img> (data URL) di sini, BUKAN
      // dibiarkan sebagai <canvas> hidup — user laporan QR "kadang muncul
      // kadang enggak" pas Cetak/Simpan PDF (khususnya dari Chrome Android).
      // Ini pola umum: rendering <canvas> ke output print/PDF itu nggak
      // konsisten di semua browser/versi (kadang butuh repaint tepat pas
      // snapshot print diambil, kadang di-skip) — <img> jauh lebih andal
      // karena isinya sudah jadi bitmap statis biasa, sama kayak gambar
      // manapun, jadi selalu ikut ke-print. Class CSS-nya (qr-label-canvas)
      // SENGAJA dipertahankan di elemen img biar aturan ukuran yang sama
      // (width:100%; height:auto; max-width) tetap berlaku tanpa nulis CSS
      // baru — dan karena ini elemen BARU (bukan canvas bawaan qrcode-lib),
      // nggak ada inline style bawaan yang perlu dibuang lagi (beda dari
      // sebelumnya, lihat riwayat: dulu ada langkah removeAttribute('style')
      // di sini buat itu — sekarang nggak perlu sama sekali).
      const dataUrl = canvases[i].toDataURL('image/png');
      const img = document.createElement('img');
      img.className = 'qr-label-canvas';
      img.src = dataUrl;
      img.alt = 'QR ' + labels[i].code;
      canvases[i].replaceWith(img);
    } catch (err) {
      // Kode terlalu panjang/aneh untuk di-encode — jarang terjadi untuk kode barang/bin biasa.
      showToast(`Gagal buat QR untuk "${labels[i].code}": ${err.message}`, 'error');
    }
  }
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Cetak/Simpan PDF label QR — pola SAMA dengan printPRDocument di
// js/alert-order.js (body.printing-qr ditambahin SEBELUM window.print(),
// dicopot lagi lewat event 'afterprint' + fallback setTimeout buat browser/
// device yang nggak fire 'afterprint' dengan andal, mis. sebagian Chrome
// Android). class ini yang dipakai @media print (css/style.css) buat mastiin
// CUMA #page-qr-labels yang kecetak — SEBELUMNYA nggak ada penanda body kayak
// gini, aturan print cuma ngecek "halaman mana yang lagi aktif" secara
// statis (#page-qr-labels & #page-alert-order sama2 dikecualikan dari hide),
// yang bikin sisa konten halaman Alert Order (kalau pernah dibuka sebelumnya
// di sesi yang sama) ikut kebawa cetak di bawah label QR (dilaporkan user).
function printQrLabels() {
  document.body.classList.add('printing-qr');
  const cleanup = () => document.body.classList.remove('printing-qr');
  window.addEventListener('afterprint', cleanup, { once: true });
  window.print();
  setTimeout(cleanup, 5000);
}
