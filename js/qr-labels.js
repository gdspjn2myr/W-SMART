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
    });

    document.getElementById('btnGenerateQrBarang').addEventListener('click', generateQrBarangLabels);
    document.getElementById('btnGenerateQrBin').addEventListener('click', generateQrBinLabels);
    document.getElementById('btnPrintQrLabels').addEventListener('click', () => window.print());

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
    const it = qrBarangItems.find((x) => x.kodeBarang === kode);
    const nama = it ? it.namaBarang : '';
    const meta = it ? itemMetaLine({ plant: it.plant, kategori: it.kategori, itemJenis: it.jenis }) : '';
    return `
      <span class="qr-pick-chip">
        <span class="qr-pick-chip-text">${escapeHtml(kode)}${nama ? ' — ' + escapeHtml(nama) : ''}${meta ? ` <span class="item-meta-line">· ${meta}</span>` : ''}</span>
        <button type="button" class="qr-pick-chip-remove" data-remove-kode="${escapeHtml(kode)}" aria-label="Hapus dari pilihan">×</button>
      </span>`;
  }).join('');
  wrap.innerHTML = `<div class="qr-pick-selected-count">${qrBarangSelected.size} barang dipilih</div><div class="qr-pick-chip-list">${chips}</div>`;
}

// Baca "Detail Tambahan (opsional)" di mode Manual — berlaku SAMA buat semua
// barang yang dipilih di 1x generate ini (No PO/Vendor/dst emang biasanya 1
// dokumen/1 sumber yang sama buat sekumpulan barang yang lagi dicetak
// labelnya bareng). Field yang dikosongin -> tidak ditampilkan di label.
function readQrManualDetail() {
  const noPO = (document.getElementById('qrManualNoPO') || {}).value || '';
  const vendor = (document.getElementById('qrManualVendor') || {}).value || '';
  const sloc = (document.getElementById('qrManualSLoc') || {}).value || '';
  const tanggal = (document.getElementById('qrManualTanggal') || {}).value || '';
  const sumberTipe = (document.getElementById('qrManualSumberTipe') || {}).value || '';
  const sumberNama = (document.getElementById('qrManualSumberNama') || {}).value || '';

  let sumber = '';
  if (sumberTipe === 'USER') sumber = sumberNama.trim() ? 'User: ' + sumberNama.trim() : 'User';
  else if (sumberTipe === 'OBS') sumber = 'OBS';
  else if (sumberTipe === 'FAST MOVING') sumber = 'Fast Moving';

  return { noPO: noPO.trim(), vendor: vendor.trim(), sloc: sloc.trim(), tanggal: tanggal.trim(), sumber };
}

async function generateQrBarangLabels() {
  const items = qrBarangItems.filter((it) => qrBarangSelected.has(it.kodeBarang));
  if (!items.length) {
    showToast('Pilih minimal 1 barang dulu.', 'error');
    return;
  }
  const manualDetail = readQrManualDetail();
  const labels = items.map((it) => buildBarangLabel(Object.assign({
    kode: it.kodeBarang,
    namaBarang: it.namaBarang,
    plant: it.plant,
    satuan: it.satuan
  }, manualDetail)));
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
      // errorCorrectionLevel dinaikkan ke 'Q' (25% toleransi rusak/kotor,
      // dari sebelumnya 'M' 15%) KHUSUS sekarang karena payload Barang jauh
      // lebih panjang dari sebelumnya (dulu cuma Kode ~10 digit, sekarang
      // bisa >80 karakter) -> makin banyak modul QR -> makin gampang gagal
      // scan di kondisi gudang (label kecil, print biasa, jarak/sudut kurang
      // ideal). Level lebih tinggi = QR jadi TAMBAH padat lagi (trade-off),
      // tapi lebih tahan noise/kerusakan cetak yang justru makin krusial pas
      // datanya makin panjang begini. Kode Bin (selalu pendek & polos) tidak
      // butuh ini, tapi dipakaikan level yang sama biar konsisten 1 setting.
      await QRCode.toCanvas(canvases[i], qrContent, { width: 160, margin: 1, errorCorrectionLevel: 'Q' });
      // qrcode-lib SELALU nulis inline style width/height (piksel tetap, mis.
      // "160px") langsung ke canvas-nya sendiri begitu selesai gambar — itu
      // NIMPA aturan CSS kita (.qr-label-canvas: width:100%; height:auto),
      // soalnya inline style menang dari stylesheet manapun. Di label
      // "lengkap" (QR-nya diperkecil ke 76px lewat max-width, lihat
      // css/style.css .qr-label-detailed .qr-label-canvas), ini bikin
      // LEBAR-nya kepotong CSS jadi 76px tapi TINGGI-nya tetap kepaku 160px
      // dari inline style-nya library — hasilnya QR kelihatan gepeng/
      // distorsi, bukan persegi. Dihapus di sini biar width:100%/height:auto
      // dari CSS kita yang berlaku sepenuhnya (rasio-nya tetap 1:1 karena
      // atribut canvas.width/height, BUKAN style-nya, yang dipakai buat
      // ngitung intrinsic ratio).
      canvases[i].removeAttribute('style');
    } catch (err) {
      // Kode terlalu panjang/aneh untuk di-encode — jarang terjadi untuk kode barang/bin biasa.
      showToast(`Gagal buat QR untuk "${labels[i].code}": ${err.message}`, 'error');
    }
  }
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
