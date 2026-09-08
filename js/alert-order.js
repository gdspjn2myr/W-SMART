// ============================================================================
// ALERT ORDER — daftar barang yang perlu diorder (Stock Out / Need Reorder /
// Near ROP). Tombol "+ Buat PR" (tunggal, di header) buka modal builder yang
// bikin 1 DOKUMEN PR berisi BEBERAPA barang sekaligus (format "Form Pengadaan
// Spare Part" perusahaan) — beda dari mekanisme lama (1 PR per klik tombol
// per-item) yang sudah dihapus dari halaman ini. Begitu barang datang lewat
// Barang Masuk, PR yang masih "Menunggu" otomatis ditutup di server (lihat
// closeMatchingPR_ di Code.gs) dan Lead Time asli (Tanggal PR -> Tanggal
// Kedatangan) terekam. No PO yang menutup PR itu ikut dicatat di baris PR
// yang sama (kolom "No PO Terkait" di sheet PurchaseRequest).
//
// Avg Usage Otomatis & Lead Time Otomatis dihitung REALTIME di server dari
// histori Pemakaian & PurchaseRequest yang sudah "Selesai" (lihat
// hitungMetrikOtomatisSemua_ di Code.gs) — tidak disimpan permanen di kolom
// sheet mana pun, jadi tidak mengganggu Min/ROP/MAX manual yang ada di
// Master Data. Tombol CSV/Excel/PDF di header (di luar modal Buat PR) adalah
// fitur LAMA yang TETAP ADA — itu export daftar Alert Order APA ADANYA
// (semua kolom analisis), beda dari Download Excel/PDF di dalam modal Buat PR
// yang formatnya HARUS SAMA PERSIS dengan "FORM PENGADAAN SPARE PART..." yang
// dipakai buat diajukan ke perusahaan (lihat generatePRExcel_/printPRDocument).
// ============================================================================

let aoInitialized = false;
let aoData = [];

const AO_STATUS_CLASS = { 'Stock Out': 'ra-badge-out', 'Need Reorder': 'ra-badge-reorder', 'Near ROP': 'ra-badge-near' };

// Satu definisi kolom dipakai bareng buat CSV, Excel, & tabel cetak PDF —
// supaya urutan/isi kolom di ketiga format selalu konsisten, nggak perlu
// diulang 3x manual.
const AO_EXPORT_COLUMNS = [
  { header: 'Kode Barang', get: (it) => it.kode },
  { header: 'Nama Barang', get: (it) => it.namaBarang },
  { header: 'Satuan', get: (it) => it.satuan },
  { header: 'Kategori', get: (it) => it.kategori },
  { header: 'Jenis', get: (it) => it.jenis || '' },
  { header: 'Plant', get: (it) => it.plant || '' },
  { header: 'S.Loc', get: (it) => (it.slocBreakdown || []).map((s) => s.sloc + ' ' + s.onHand).join(', ') },
  { header: 'Status', get: (it) => STATUS_LABEL[it.status] || it.status },
  { header: 'Stock Saat Ini', get: (it) => it.onHand, numeric: true },
  { header: 'Min Stock', get: (it) => it.minStock, numeric: true },
  { header: 'ROP', get: (it) => it.rop, numeric: true },
  { header: 'MAX', get: (it) => it.max, numeric: true },
  { header: 'Order Qty', get: (it) => it.orderQty, numeric: true },
  { header: 'PR Terbuka Sejak', get: (it) => it.prTerbuka ? it.prTerbuka.tanggalPR : '' },
  { header: 'Avg Usage Otomatis', get: (it) => it.cukupData ? it.avgUsageOtomatis : '', numeric: true },
  { header: 'Lead Time Otomatis (hari)', get: (it) => it.cukupData ? it.leadTimeOtomatis : '', numeric: true },
  { header: 'Jumlah Sampel Lead Time', get: (it) => it.jumlahSampelLeadTime, numeric: true },
  { header: 'ROP Otomatis', get: (it) => it.cukupData ? it.ropOtomatis : '', numeric: true },
  { header: 'Min Otomatis', get: (it) => it.cukupData ? it.minOtomatis : '', numeric: true },
  { header: 'Max Otomatis', get: (it) => it.cukupData ? it.maxOtomatis : '', numeric: true }
];

function initAlertOrderPage() {
  if (!aoInitialized) {
    aoInitialized = true;
    wireRefreshButton('btnRefreshAlertOrder', loadAlertOrder);
    document.getElementById('btnDownloadAlertOrderCsv').addEventListener('click', downloadAlertOrderCsv);
    document.getElementById('btnDownloadAlertOrderExcel').addEventListener('click', downloadAlertOrderExcel);
    document.getElementById('btnDownloadAlertOrderPdf').addEventListener('click', printAlertOrderPdf);
    wireBuatPRModal();
  }
  loadAlertOrder();
}

async function loadAlertOrder() {
  const wrap = document.getElementById('aoList');
  try {
    const res = await Api.getAlertOrder();
    aoData = res.data || [];
    renderAlertOrderList();
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state">Gagal memuat: ${escapeHtml(err.message)}</div>`;
  }
}

function renderAlertOrderList() {
  const wrap = document.getElementById('aoList');
  document.getElementById('aoCount').textContent = aoData.length + ' Item';
  if (!aoData.length) {
    wrap.innerHTML = '<div class="empty-state">Semua stock dalam kondisi normal. Belum ada yang perlu diorder.</div>';
    return;
  }
  wrap.innerHTML = aoData.map((it) => `
      <div class="ao-item" data-kode="${escapeHtml(it.kode)}">
        <div class="ao-item-top">
          <div>
            <div class="ao-item-title">
              <span class="ra-badge ${AO_STATUS_CLASS[it.status] || ''}">${escapeHtml(STATUS_LABEL[it.status] || it.status)}</span>
              ${escapeHtml(it.kode)} — ${escapeHtml(it.namaBarang || '-')}
            </div>
            <div class="ao-item-sub">Stock ${it.onHand} · Min ${it.minStock} · ROP ${it.rop} · MAX ${it.max} · Order Qty <strong>${it.orderQty}</strong></div>
            ${itemMetaLine(it) ? `<div class="item-meta-line">${itemMetaLine(it)}</div>` : ''}
          </div>
          <div class="ao-item-side">
            ${it.prTerbuka
              ? `<div class="ao-pr-open"><strong>PR sudah dibuat</strong><span>${escapeHtml(it.prTerbuka.tanggalPR)}</span><span>Menunggu barang datang</span></div>`
              : ''}
          </div>
        </div>
        ${it.cukupData ? `
          <div class="ao-metrics">
            <div><span>Avg Usage Otomatis</span><strong>${it.avgUsageOtomatis} ${escapeHtml(it.satuan || '')}/hari</strong></div>
            <div><span>Lead Time Otomatis (${it.jumlahSampelLeadTime} sampel)</span><strong>${it.leadTimeOtomatis} hari</strong></div>
            <div><span>ROP Otomatis</span><strong>${it.ropOtomatis}</strong></div>
            <div><span>Saran Min / Max Otomatis</span><strong>${it.minOtomatis} / ${it.maxOtomatis}</strong></div>
          </div>
        ` : `
          <div class="ao-metrics-insufficient">Data histori Pemakaian &amp; PR "Selesai" belum cukup untuk menghitung Avg Usage/Lead Time Otomatis buat item ini.</div>
        `}
      </div>
    `).join('');
}

function aoTimestamp() {
  return new Date().toISOString().slice(0, 10);
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------
function downloadAlertOrderCsv() {
  if (!aoData.length) {
    showToast('Tidak ada data untuk didownload.', 'error');
    return;
  }
  const csvEscape = (v) => {
    const s = String(v === null || v === undefined ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const header = AO_EXPORT_COLUMNS.map((c) => c.header);
  const rows = aoData.map((it) => AO_EXPORT_COLUMNS.map((c) => c.get(it)));
  const csv = [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n');
  // BOM (﻿) supaya Excel baca UTF-8 dengan benar (karakter · dsb tidak rusak).
  triggerDownload(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }), 'alert-order-' + aoTimestamp() + '.csv');
}

// ---------------------------------------------------------------------------
// EXCEL — pakai format "SpreadsheetML" (Excel XML Spreadsheet 2003), bukan
// library eksternal. Ini format XML resmi yang dikenali native oleh Excel
// (beda dengan trik "HTML disimpan .xls" yang suka kena warning format tidak
// cocok) — cukup 1 file teks, tanpa perlu library zip/xlsx ratusan KB, cocok
// buat app PWA ringan ini yang semua library-nya sengaja di-vendor lokal.
// ---------------------------------------------------------------------------
function xmlEscape(v) {
  const s = String(v === null || v === undefined ? '' : v);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function downloadAlertOrderExcel() {
  if (!aoData.length) {
    showToast('Tidak ada data untuk didownload.', 'error');
    return;
  }
  const headerCells = AO_EXPORT_COLUMNS.map((c) =>
    `<Cell ss:StyleID="Header"><Data ss:Type="String">${xmlEscape(c.header)}</Data></Cell>`
  ).join('');
  const dataRows = aoData.map((it) => {
    const cells = AO_EXPORT_COLUMNS.map((c) => {
      const val = c.get(it);
      if (c.numeric && val !== '' && val !== null && val !== undefined && !isNaN(val)) {
        return `<Cell><Data ss:Type="Number">${val}</Data></Cell>`;
      }
      return `<Cell><Data ss:Type="String">${xmlEscape(val)}</Data></Cell>`;
    }).join('');
    return `<Row>${cells}</Row>`;
  }).join('');

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Header">
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#0F2A5C" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Alert Order">
  <Table>
   <Row>${headerCells}</Row>
   ${dataRows}
  </Table>
 </Worksheet>
</Workbook>`;

  triggerDownload(new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' }), 'alert-order-' + aoTimestamp() + '.xls');
}

// ---------------------------------------------------------------------------
// PDF — pakai print dialog browser ("Cetak / Simpan PDF"), sama seperti pola
// yang sudah dipakai di halaman Cetak Label QR. Nggak perlu library PDF
// tambahan: kartu #aoPrintCard (normal hidden) diisi & ditampilkan khusus
// pas @media print (lihat css/style.css), kartu daftar interaktif disembunyikan.
// ---------------------------------------------------------------------------
function printAlertOrderPdf() {
  if (!aoData.length) {
    showToast('Tidak ada data untuk dicetak.', 'error');
    return;
  }
  document.getElementById('aoPrintMeta').textContent =
    aoData.length + ' item · dicetak ' + new Date().toLocaleString('id-ID');
  document.getElementById('aoPrintTbody').innerHTML = aoData.map((it) => `
    <tr>
      <td>${escapeHtml(it.kode)}</td>
      <td>${escapeHtml(it.namaBarang || '-')}</td>
      <td>${escapeHtml(STATUS_LABEL[it.status] || it.status)}</td>
      <td>${it.onHand}</td>
      <td>${it.minStock}</td>
      <td>${it.rop}</td>
      <td>${it.max}</td>
      <td>${it.orderQty}</td>
      <td>${it.prTerbuka ? escapeHtml(it.prTerbuka.tanggalPR) : '-'}</td>
      <td>${it.cukupData ? it.avgUsageOtomatis : '-'}</td>
      <td>${it.cukupData ? it.leadTimeOtomatis : '-'}</td>
      <td>${it.cukupData ? it.ropOtomatis : '-'}</td>
      <td>${it.cukupData ? (it.minOtomatis + ' / ' + it.maxOtomatis) : '-'}</td>
    </tr>
  `).join('');
  window.print();
}

// ============================================================================
// MODAL "BUAT PR" — bikin 1 dokumen PR berisi beberapa barang sekaligus.
// ============================================================================

// Kode dokumen resmi perusahaan di pojok kanan atas form (lihat contoh Excel
// yang dikirim user) — tetap/konstan, bukan sesuatu yang berubah per PR.
const PR_DOC_CODE = 'MAY/PRC/PRO/SBU/MBR/IMDGSP/19/004-03-00';

// ---------------------------------------------------------------------------
// KOP TANDA TANGAN DOKUMEN PR — BEDA per kelompok Plant (permintaan user:
// Plant 1111 satu susunan, Plant 1112 & 1113 susunan lain — Planner & DH
// Teknik orangnya beda, DH Produksi dihapus di 1112/1113). Karena itu 1
// dokumen PR yang item-nya nyebar di lebih dari 1 kelompok TIDAK BISA
// digabung jadi 1 halaman/lembar — harus dipecah per kelompok (lihat
// prGroupItemsByPlantGroup, dipakai bareng oleh printPRDocument &
// downloadPRExcel supaya PDF & Excel selalu konsisten satu sama lain).
//
// Plant yang belum terdaftar di sini (kode Plant baru di masa depan) fallback
// ke susunan Plant 1111 (lihat prSignatureGroupFor) — bukan berarti itu tanda
// tangan yang benar buat Plant itu, cuma jaga2 supaya tidak error. Tambahkan
// mapping-nya begitu Plant baru itu punya susunan tanda tangan resmi sendiri.
const PR_PLANT_GROUP_OF = { '1111': 'grp1111', '1112': 'grp1112_1113', '1113': 'grp1112_1113' };
const PR_SIGNATURE_GROUPS = {
  grp1111: {
    label: '1111',
    dibuatOleh: { nama: 'M Iqbal', jabatan: 'GDSP' },
    mengetahui: [
      { nama: 'Rizal N', jabatan: 'Planner' },
      { nama: 'Agus H', jabatan: 'DH Warehouse' },
      { nama: 'Sarjono', jabatan: 'DH Teknik Wafer' },
      { nama: 'Oka Kurnia Adhy', jabatan: 'DH Produksi Wafer' }
    ],
    disetujui: { nama: 'Endar Purnomo', jabatan: 'Factory Manager' }
  },
  grp1112_1113: {
    label: '1112 & 1113',
    dibuatOleh: { nama: 'M Iqbal', jabatan: 'GDSP' },
    mengetahui: [
      { nama: 'Imam P', jabatan: 'Planner' },
      { nama: 'Agus H', jabatan: 'DH Warehouse' },
      { nama: 'Totok', jabatan: 'DH Teknik' }
    ],
    disetujui: { nama: 'Endar Purnomo', jabatan: 'Factory Manager' }
  }
};

function prSignatureGroupFor(plant) {
  const key = PR_PLANT_GROUP_OF[plant];
  if (!key) {
    console.warn('Plant "' + plant + '" belum terdaftar di PR_PLANT_GROUP_OF — dipakaikan tanda tangan default Plant 1111. Tambahkan mapping-nya di js/alert-order.js kalau Plant ini sudah punya susunan tanda tangan resmi sendiri.');
  }
  return PR_SIGNATURE_GROUPS[key || 'grp1111'];
}

// Pecah items PR (bisa nyebar berbagai Plant) jadi kelompok2 SESUAI urutan
// kemunculan pertama tiap kelompok di tabel — bukan diurutkan ulang semena2 —
// supaya urutan halaman cetak/lembar Excel tetap mengikuti urutan baris asli
// di tabel Buat PR, cuma dikelompokkan.
function prGroupItemsByPlantGroup(items) {
  const order = [];
  const map = {};
  items.forEach((it) => {
    const key = PR_PLANT_GROUP_OF[it.plant] || 'grp1111';
    if (!map[key]) { map[key] = []; order.push(key); }
    map[key].push(it);
  });
  return order.map((key) => ({ groupKey: key, signature: PR_SIGNATURE_GROUPS[key], items: map[key] }));
}

// Judul tiap halaman/lembar — kalau dokumennya CUMA 1 kelompok Plant (kasus
// paling umum: filter Plant spesifik, atau kebetulan semua item 1 kelompok),
// judulnya PERSIS sama seperti yang diketik user (termasuk kalau dia sudah
// nulis sendiri label Plant-nya di situ). Suffix "— Plant ..." CUMA
// ditambahkan begitu dokumen beneran kepecah jadi >1 halaman, biar user yang
// buka tiap halaman/lembar langsung tahu itu punya Plant mana.
function prJudulForGroup(baseJudul, group, totalGroups) {
  if (totalGroups <= 1) return baseJudul;
  return baseJudul + ' — Plant ' + group.label;
}

const PR_BULAN_ID = ['JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI', 'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'];
function prFormatTanggalIndo(d) {
  return d.getDate() + ' ' + PR_BULAN_ID[d.getMonth()] + ' ' + d.getFullYear();
}
function prFormatTanggalSlash(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return dd + '/' + mm + '/' + d.getFullYear();
}
// prSaved.tanggalPR dari server formatnya 'yyyy-MM-dd HH:mm' — ambil bagian
// tanggalnya saja & balik ke format DD/MM/YYYY buat header "Stock Per ...".
function prTanggalPRToSlash(s) {
  const datePart = (s || '').split(' ')[0];
  const parts = datePart.split('-');
  if (parts.length !== 3) return '';
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

// Filter "Status" (urgensi Alert Order) — beda dari kolom tabel "Status"
// (OBS/FSV, lihat prJenisLabel) yang datanya dari kolom Jenis di Master Data.
const PR_URGENSI_OPTIONS = [
  { value: 'stock-out', label: 'Out of Stock' },
  { value: 'need-reorder', label: 'Need Reorder' },
  { value: 'near-rop', label: 'Near ROP' },
  { value: 'lain-lain', label: 'Lain-lain' }
];
function prUrgensiKeyFor(status) {
  if (status === 'Stock Out') return 'stock-out';
  if (status === 'Need Reorder') return 'need-reorder';
  if (status === 'Near ROP') return 'near-rop';
  return 'lain-lain';
}
function prJenisLabel(jenis) {
  if (jenis === 'Fast Moving') return 'FSV';
  if (jenis === 'OBS') return 'OBS';
  return jenis || '';
}
function prRowKey(kode, plant) { return kode + '|' + (plant || ''); }

let prPlantSelected = '';
let prUrgencySelected = PR_URGENSI_OPTIONS.map((o) => o.value); // default: semua status aktif
let prSearchText = '';
let prRows = []; // draft baris PR yang lagi diedit — {source, kode, namaBarang, area, minStock, maxStock, satuan, statusBarang, stockPer, orderQty, plant, diluarFilter}
let prSaved = null; // hasil Api.createPRBatch, dipakai buat Download Excel/PDF
let prStockBalanceCache = null; // cache Api.getStockBalance({}), dipakai buat search "+ Tambah Item Manual"

function prRowFromItem(it, source) {
  return {
    source: source,
    kode: it.kode,
    namaBarang: it.namaBarang || '',
    area: it.area || '',
    minStock: it.minStock || 0,
    maxStock: it.max || 0,
    satuan: it.satuan || '',
    statusBarang: prJenisLabel(it.jenis),
    stockPer: it.onHand || 0,
    orderQty: it.orderQty || 0,
    plant: it.plant || '',
    diluarFilter: source === 'manual'
  };
}

function prMatchesFilter(it) {
  if (it.prTerbuka) return false; // sudah ada PR menunggu -> jangan ditawarkan lagi di tabel Buat PR
  if (prPlantSelected && (it.plant || '') !== prPlantSelected) return false;
  if (!prUrgencySelected.includes(prUrgensiKeyFor(it.status))) return false;
  if (prSearchText) {
    const hay = ((it.kode || '') + ' ' + (it.namaBarang || '')).toLowerCase();
    if (!hay.includes(prSearchText)) return false;
  }
  return true;
}

// Sinkronkan prRows dengan filter yang lagi aktif: baris 'auto' yang sudah
// tidak cocok filter dibuang, item baru yang cocok ditambahkan — TANPA
// menyentuh baris yang sudah ada (biar edit manual user tidak hilang cuma
// gara-gara filter di-toggle) & TANPA menyentuh baris 'manual' sama sekali
// (itu sengaja independen dari filter, lihat prAddManualItem).
function recomputePRAutoRows() {
  const matched = aoData.filter(prMatchesFilter);
  const matchedKeys = new Set(matched.map((it) => prRowKey(it.kode, it.plant)));

  prRows = prRows.filter((r) => r.source !== 'auto' || matchedKeys.has(prRowKey(r.kode, r.plant)));

  const existingKeys = new Set(prRows.map((r) => prRowKey(r.kode, r.plant)));
  matched.forEach((it) => {
    const key = prRowKey(it.kode, it.plant);
    if (existingKeys.has(key)) return;
    prRows.push(prRowFromItem(it, 'auto'));
  });

  renderPRTable();
}

function renderPRPlantChips() {
  const plants = Array.from(new Set(aoData.map((it) => it.plant || DASH_PLANT_NONE)))
    .sort((a, b) => {
      if (a === DASH_PLANT_NONE) return 1;
      if (b === DASH_PLANT_NONE) return -1;
      return a.localeCompare(b);
    });
  if (plants.length <= 1) {
    document.getElementById('buatPRPlantFilter').hidden = true;
    document.getElementById('buatPRPlantFilter').innerHTML = '';
    return;
  }
  const options = [{ value: '', label: 'Semua Plant' }]
    .concat(plants.map((p) => ({ value: p, label: p === DASH_PLANT_NONE ? 'Belum Ditentukan' : 'Plant ' + p })));
  renderChipFilterInto('buatPRPlantFilter', options, prPlantSelected, 'plant', 'Plant');
}

function renderPRUrgencyChips() {
  const wrap = document.getElementById('buatPRStatusFilter');
  wrap.hidden = false;
  const labelHtml = '<span class="dm-filter-label">Status</span>';
  wrap.innerHTML = labelHtml + PR_URGENSI_OPTIONS.map((o) => `
      <button type="button" class="dm-plant-chip${prUrgencySelected.includes(o.value) ? ' active' : ''}" data-urgensi="${o.value}">${escapeHtml(o.label)}</button>
    `).join('');
}

function prUpdateJudulDefault() {
  const plantLabel = prPlantSelected ? ' (' + prPlantSelected + ')' : '';
  document.getElementById('buatPRJudul').value =
    'FORM PENGADAAN SPARE PART FAST MOVING & CRITICAL JAYANTI 2' + plantLabel +
    ' per TANGGAL ' + prFormatTanggalIndo(new Date());
}

function renderPRTable() {
  const tbody = document.getElementById('buatPRTbody');
  document.getElementById('buatPRSummary').textContent = prRows.length + ' item';
  if (!prRows.length) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty-state">Tidak ada barang yang cocok dengan filter. Gunakan "+ Tambah Item Manual" untuk menambah barang lain.</td></tr>';
    return;
  }
  tbody.innerHTML = prRows.map((r, idx) => `
      <tr class="${r.diluarFilter ? 'pr-row-diluar-filter' : ''}" data-idx="${idx}">
        <td>${idx + 1}</td>
        <td><input type="text" data-field="kode" value="${escapeHtml(r.kode)}"></td>
        <td class="pr-col-nama">
          <input type="text" data-field="namaBarang" value="${escapeHtml(r.namaBarang)}">
          ${r.diluarFilter ? '<div class="pr-badge-diluar-filter">Di luar filter</div>' : ''}
        </td>
        <td class="pr-col-unit"><input type="text" data-field="area" value="${escapeHtml(r.area)}"></td>
        <td><input type="number" data-field="minStock" value="${r.minStock}"></td>
        <td><input type="number" data-field="maxStock" value="${r.maxStock}"></td>
        <td><input type="text" data-field="satuan" value="${escapeHtml(r.satuan)}"></td>
        <td><input type="text" data-field="statusBarang" value="${escapeHtml(r.statusBarang)}"></td>
        <td><input type="number" data-field="stockPer" value="${r.stockPer}"></td>
        <td><input type="number" data-field="orderQty" value="${r.orderQty}"></td>
        <td><button type="button" class="pr-row-remove-btn" data-remove="${idx}" title="Hapus baris">×</button></td>
      </tr>
    `).join('');
}

function renderPRAddManualResults(search) {
  const wrap = document.getElementById('buatPRAddManualResults');
  if (!prStockBalanceCache) return;
  if (!search) { wrap.innerHTML = ''; wrap._prMatches = []; return; }
  const matches = prStockBalanceCache.filter((it) =>
    !it.belumAdaMaster &&
    ((it.kode || '').toLowerCase().includes(search) || (it.namaBarang || '').toLowerCase().includes(search))
  ).slice(0, 20);
  wrap._prMatches = matches;
  if (!matches.length) {
    wrap.innerHTML = '<div class="empty-state">Tidak ketemu.</div>';
    return;
  }
  wrap.innerHTML = matches.map((it, i) => `
      <div class="pr-add-manual-result-item" data-manual-idx="${i}">
        <span>${escapeHtml(it.kode)} — ${escapeHtml(it.namaBarang || '-')}${it.plant ? ' · Plant ' + escapeHtml(it.plant) : ''}</span>
        <span>+ Tambah</span>
      </div>
    `).join('');
}

function prAddManualItem(it) {
  const key = prRowKey(it.kode, it.plant);
  if (prRows.some((r) => prRowKey(r.kode, r.plant) === key)) {
    showToast('Barang ini sudah ada di tabel.', 'info');
    return;
  }
  prRows.push(prRowFromItem(it, 'manual'));
  renderPRTable();
  showToast(it.kode + ' ditambahkan (di luar filter).', 'success');
}

function prLockAfterSave() {
  document.getElementById('buatPRFilterSection').style.display = 'none';
  document.getElementById('btnBuatPRAddManual').style.display = 'none';
  document.getElementById('buatPRAddManualPanel').hidden = true;
  document.getElementById('buatPRJudul').disabled = true;
  document.querySelectorAll('#buatPRTbody input').forEach((el) => { el.disabled = true; });
  document.querySelectorAll('#buatPRTbody .pr-row-remove-btn').forEach((el) => { el.style.display = 'none'; });
}

function openBuatPRModal() {
  prPlantSelected = '';
  prUrgencySelected = PR_URGENSI_OPTIONS.map((o) => o.value);
  prSearchText = '';
  prRows = [];
  prSaved = null;

  document.getElementById('buatPRSearchItem').value = '';
  document.getElementById('buatPRAddManualPanel').hidden = true;
  document.getElementById('buatPRAddManualSearch').value = '';
  document.getElementById('buatPRAddManualResults').innerHTML = '';
  document.getElementById('buatPRSavedPanel').hidden = true;
  document.getElementById('buatPRFilterSection').style.display = '';
  document.getElementById('btnBuatPRAddManual').style.display = '';
  document.getElementById('buatPRJudul').disabled = false;

  const btnSimpan = document.getElementById('btnSimpanPR');
  btnSimpan.disabled = false;
  btnSimpan.textContent = 'Simpan PR';

  document.getElementById('buatPRStockPerHeader').textContent = 'Stock Per ' + prFormatTanggalSlash(new Date());
  prUpdateJudulDefault();
  renderPRPlantChips();
  renderPRUrgencyChips();
  recomputePRAutoRows();

  document.getElementById('buatPRModalBackdrop').hidden = false;
  document.getElementById('buatPRModal').hidden = false;
}
function closeBuatPRModal() {
  document.getElementById('buatPRModalBackdrop').hidden = true;
  document.getElementById('buatPRModal').hidden = true;
}

async function handleSimpanPR() {
  if (!prRows.length) {
    showToast('Belum ada item untuk disimpan.', 'error');
    return;
  }
  const btn = document.getElementById('btnSimpanPR');
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';
  try {
    const payload = {
      user: '',
      items: prRows.map((r) => ({
        kode: r.kode, namaBarang: r.namaBarang, satuan: r.satuan,
        qtyDisarankan: r.orderQty, plant: r.plant, area: r.area,
        minStock: r.minStock, maxStock: r.maxStock, statusBarang: r.statusBarang,
        stockPer: r.stockPer, diluarFilter: r.diluarFilter
      }))
    };
    const res = await Api.createPRBatch(payload);
    res.judul = document.getElementById('buatPRJudul').value;
    prSaved = res;

    if (res.dilewati && res.dilewati.length) {
      showToast(res.dilewati.length + ' item dilewati (sudah ada PR menunggu): ' + res.dilewati.map((d) => d.kode).join(', '), 'error');
    }
    if (!res.items.length) {
      btn.disabled = false;
      btn.textContent = 'Simpan PR';
      return;
    }

    showToast('PR berhasil disimpan (' + res.items.length + ' item).', 'success');
    document.getElementById('buatPRSavedInfo').textContent =
      'Dokumen ' + res.noDokumen + ' tersimpan — Tanggal PR ' + res.tanggalPR + '.';
    document.getElementById('buatPRSavedPanel').hidden = false;
    btn.textContent = 'Tersimpan';
    prLockAfterSave();
    await loadAlertOrder(); // refresh daftar Alert Order biar item yg baru dapat PR ilang dari situ
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Simpan PR';
  }
}

// ---------------------------------------------------------------------------
// Download dokumen PR (Excel & PDF) — HANYA aktif setelah Simpan berhasil
// (pakai prSaved, bukan prRows, biar yang didownload PERSIS sama dengan yang
// sudah tercatat di server). Formatnya mengikuti contoh Excel yang dikirim
// user ("FORM PENGADAAN SPARE PART FAST MOVING & CRITICAL...").
// ---------------------------------------------------------------------------
// Nama sheet Excel per kelompok Plant — dijaga pendek (limit Excel 31 char)
// & bebas dari karakter yang dilarang di nama sheet (\ / ? * [ ] :).
const PR_EXCEL_SHEET_NAME = { grp1111: 'PR 1111', grp1112_1113: 'PR 1112-1113' };

// 4 baris "Dibuat oleh / Mengetahui / Disetujui" — Mengetahui dipecah 2
// nama per sel (pola yang sama seperti template Excel resmi asal user),
// dibangun GENERIK dari sig.mengetahui (bukan di-hardcode 4 orang) supaya
// otomatis menyesuaikan kalau suatu kelompok cuma py 3 orang (atau nanti
// nambah lagi) tanpa perlu tulis ulang XML-nya.
function prExcelSignatureRowsXml(sig) {
  const pairs = [];
  for (let i = 0; i < sig.mengetahui.length; i += 2) pairs.push(sig.mengetahui.slice(i, i + 2));
  const namaCell = (pair) => (pair || []).map((p) => '( ' + p.nama + ' )').join('        ');
  const roleCell = (pair) => (pair || []).map((p) => p.jabatan).join('        ');
  return `
   <Row>
    <Cell ss:Index="2" ss:StyleID="SignLabel"><Data ss:Type="String">Dibuat oleh:</Data></Cell>
    <Cell ss:Index="4" ss:StyleID="SignLabel"><Data ss:Type="String">Mengetahui:</Data></Cell>
    <Cell ss:Index="9" ss:StyleID="SignLabel"><Data ss:Type="String">Disetujui:</Data></Cell>
   </Row>
   <Row ss:Height="40"></Row>
   <Row ss:Height="40"></Row>
   <Row>
    <Cell ss:Index="2" ss:StyleID="SignName"><Data ss:Type="String">( ${xmlEscape(sig.dibuatOleh.nama)} )</Data></Cell>
    <Cell ss:Index="3" ss:StyleID="SignName"><Data ss:Type="String">${xmlEscape(namaCell(pairs[0]))}</Data></Cell>
    <Cell ss:Index="4" ss:MergeAcross="3" ss:StyleID="SignName"><Data ss:Type="String">${xmlEscape(namaCell(pairs[1]))}</Data></Cell>
    <Cell ss:Index="9" ss:StyleID="SignName"><Data ss:Type="String">( ${xmlEscape(sig.disetujui.nama)} )</Data></Cell>
   </Row>
   <Row>
    <Cell ss:Index="2" ss:StyleID="SignRole"><Data ss:Type="String">${xmlEscape(sig.dibuatOleh.jabatan)}</Data></Cell>
    <Cell ss:Index="3" ss:StyleID="SignRole"><Data ss:Type="String">${xmlEscape(roleCell(pairs[0]))}</Data></Cell>
    <Cell ss:Index="4" ss:MergeAcross="3" ss:StyleID="SignRole"><Data ss:Type="String">${xmlEscape(roleCell(pairs[1]))}</Data></Cell>
    <Cell ss:Index="9" ss:StyleID="SignRole"><Data ss:Type="String">${xmlEscape(sig.disetujui.jabatan)}</Data></Cell>
   </Row>`;
}

// 1 lembar (<Worksheet>) lengkap buat 1 kelompok Plant.
function prExcelWorksheetXml(group, judul, docCode, stockPerLabel) {
  const dataRows = group.items.map((it, i) => `
   <Row>
    <Cell ss:StyleID="Data"><Data ss:Type="Number">${i + 1}</Data></Cell>
    <Cell ss:StyleID="DataLeft"><Data ss:Type="String">${xmlEscape(it.kode)}</Data></Cell>
    <Cell ss:StyleID="DataLeft"><Data ss:Type="String">${xmlEscape(it.namaBarang)}</Data></Cell>
    <Cell ss:StyleID="DataLeft"><Data ss:Type="String">${xmlEscape(it.area)}</Data></Cell>
    <Cell ss:StyleID="Data"><Data ss:Type="Number">${Number(it.minStock) || 0}</Data></Cell>
    <Cell ss:StyleID="Data"><Data ss:Type="Number">${Number(it.maxStock) || 0}</Data></Cell>
    <Cell ss:StyleID="Data"><Data ss:Type="String">${xmlEscape(it.satuan)}</Data></Cell>
    <Cell ss:StyleID="Data"><Data ss:Type="String">${xmlEscape(it.statusBarang)}</Data></Cell>
    <Cell ss:StyleID="Data"><Data ss:Type="Number">${Number(it.stockPer) || 0}</Data></Cell>
    <Cell ss:StyleID="Data"><Data ss:Type="String"></Data></Cell>
    <Cell ss:StyleID="Data"><Data ss:Type="String"></Data></Cell>
    <Cell ss:StyleID="Data"><Data ss:Type="Number">${Number(it.qtyDisarankan) || 0}</Data></Cell>
   </Row>`).join('');

  return `
 <Worksheet ss:Name="${xmlEscape(PR_EXCEL_SHEET_NAME[group.groupKey] || 'PR')}">
  <Table>
   <Column ss:Width="28"/>
   <Column ss:Width="90"/>
   <Column ss:Width="220"/>
   <Column ss:Width="120"/>
   <Column ss:Width="40"/>
   <Column ss:Width="40"/>
   <Column ss:Width="55"/>
   <Column ss:Width="60"/>
   <Column ss:Width="90"/>
   <Column ss:Width="30"/>
   <Column ss:Width="30"/>
   <Column ss:Width="60"/>
   <Row ss:Height="60">
    <Cell ss:MergeAcross="1" ss:MergeDown="4"><Data ss:Type="String"></Data></Cell>
    <Cell ss:Index="3" ss:MergeAcross="9" ss:StyleID="DocCode"><Data ss:Type="String">${docCode}</Data></Cell>
   </Row>
   <Row ss:Height="60">
    <Cell ss:Index="3" ss:MergeAcross="9" ss:MergeDown="3" ss:StyleID="Title"><Data ss:Type="String">${xmlEscape(judul)}</Data></Cell>
   </Row>
   <Row></Row>
   <Row></Row>
   <Row></Row>
   <Row ss:Height="26">
    <Cell ss:MergeDown="1" ss:StyleID="Header"><Data ss:Type="String">NO</Data></Cell>
    <Cell ss:MergeDown="1" ss:StyleID="Header"><Data ss:Type="String">Kode Barang</Data></Cell>
    <Cell ss:MergeDown="1" ss:StyleID="Header"><Data ss:Type="String">Nama Barang</Data></Cell>
    <Cell ss:MergeDown="1" ss:StyleID="Header"><Data ss:Type="String">Unit Mesin</Data></Cell>
    <Cell ss:MergeAcross="1" ss:StyleID="Header"><Data ss:Type="String">Buffer Stock</Data></Cell>
    <Cell ss:MergeDown="1" ss:StyleID="Header"><Data ss:Type="String">Satuan</Data></Cell>
    <Cell ss:MergeDown="1" ss:StyleID="Header"><Data ss:Type="String">Status</Data></Cell>
    <Cell ss:MergeDown="1" ss:StyleID="Header"><Data ss:Type="String">${stockPerLabel}</Data></Cell>
    <Cell ss:MergeAcross="1" ss:StyleID="Header"><Data ss:Type="String">Proses</Data></Cell>
    <Cell ss:MergeDown="1" ss:StyleID="Header"><Data ss:Type="String">Order</Data></Cell>
   </Row>
   <Row ss:Height="20">
    <Cell ss:Index="5" ss:StyleID="Header"><Data ss:Type="String">MIN</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">MAX</Data></Cell>
    <Cell ss:Index="10" ss:StyleID="Header"><Data ss:Type="String">PO</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">PR</Data></Cell>
   </Row>
   ${dataRows}
   <Row></Row>
   <Row></Row>
   ${prExcelSignatureRowsXml(group.signature)}
  </Table>
 </Worksheet>`;
}

function downloadPRExcel() {
  if (!prSaved || !prSaved.items || !prSaved.items.length) {
    showToast('Belum ada PR tersimpan untuk didownload.', 'error');
    return;
  }
  const groups = prGroupItemsByPlantGroup(prSaved.items);
  const docCode = xmlEscape(PR_DOC_CODE);
  const stockPerLabel = xmlEscape('Stock Per ' + prTanggalPRToSlash(prSaved.tanggalPR));

  const borderXml = `
    <Borders>
     <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
     <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
     <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
     <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
    </Borders>`;

  // Tiap kelompok Plant jadi SATU sheet/tab sendiri dalam 1 file .xls yang
  // sama (bukan file terpisah) — biar tetap 1 download tapi tanda tangannya
  // benar per kelompok (lihat PR_SIGNATURE_GROUPS/prGroupItemsByPlantGroup).
  const worksheetsXml = groups.map((group) =>
    prExcelWorksheetXml(group, prJudulForGroup(prSaved.judul || '', group.signature, groups.length), docCode, stockPerLabel)
  ).join('');

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="DocCode"><Font ss:Bold="1" ss:Size="14"/><Alignment ss:Horizontal="Right" ss:Vertical="Center"/></Style>
  <Style ss:ID="Title"><Font ss:Bold="1" ss:Size="14"/><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/></Style>
  <Style ss:ID="Header">
   <Font ss:Bold="1" ss:Size="10"/>
   <Interior ss:Color="#FFFF00" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>${borderXml}
  </Style>
  <Style ss:ID="Data">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>${borderXml}
  </Style>
  <Style ss:ID="DataLeft">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>${borderXml}
  </Style>
  <Style ss:ID="SignName"><Font ss:Bold="1"/><Alignment ss:Horizontal="Center"/></Style>
  <Style ss:ID="SignLabel"><Alignment ss:Horizontal="Left"/></Style>
  <Style ss:ID="SignRole"><Alignment ss:Horizontal="Center"/></Style>
 </Styles>${worksheetsXml}
</Workbook>`;

  triggerDownload(new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' }), prSaved.noDokumen + '.xls');
}

// Markup 1 "halaman" dokumen PR (kop + tabel + tanda tangan) buat 1 kelompok
// Plant — dipakai bareng oleh printPRDocument (isi #prPrintPages) & bisa jadi
// lebih dari 1 kali kalau item-nya nyebar >1 kelompok (lihat
// prGroupItemsByPlantGroup/PR_SIGNATURE_GROUPS di atas).
function prPrintPageHtml(group, judul, stockPerLabel) {
  const sig = group.signature;
  const rowsHtml = group.items.map((it, i) => `
      <tr>
        <td>${i + 1}</td>
        <td class="pr-print-left">${escapeHtml(it.kode)}</td>
        <td class="pr-print-left">${escapeHtml(it.namaBarang)}</td>
        <td class="pr-print-left">${escapeHtml(it.area)}</td>
        <td>${Number(it.minStock) || 0}</td>
        <td>${Number(it.maxStock) || 0}</td>
        <td>${escapeHtml(it.satuan)}</td>
        <td>${escapeHtml(it.statusBarang)}</td>
        <td>${Number(it.stockPer) || 0}</td>
        <td></td>
        <td></td>
        <td>${Number(it.qtyDisarankan) || 0}</td>
      </tr>
    `).join('');

  const mengetahuiHtml = sig.mengetahui.map((p) => `
          <div class="pr-print-sign-item">
            <div class="pr-print-sign-space"></div>
            <strong>( ${escapeHtml(p.nama)} )</strong>
            <span>${escapeHtml(p.jabatan)}</span>
          </div>
        `).join('');

  return `
    <div class="pr-print-page">
      <div class="pr-print-header">
        <img src="icons/logo-pt-mars.png" alt="Logo PT Mars Indonesia" class="pr-print-logo">
        <div class="pr-print-doc-code">${escapeHtml(PR_DOC_CODE)}</div>
      </div>
      <div class="pr-print-title">${escapeHtml(judul)}</div>
      <table class="pr-print-table">
        <thead>
          <tr>
            <th rowspan="2">NO</th>
            <th rowspan="2">Kode Barang</th>
            <th rowspan="2">Nama Barang</th>
            <th rowspan="2">Unit Mesin</th>
            <th colspan="2">Buffer Stock</th>
            <th rowspan="2">Satuan</th>
            <th rowspan="2">Status</th>
            <th rowspan="2">${escapeHtml(stockPerLabel)}</th>
            <th colspan="2">Proses</th>
            <th rowspan="2">Order</th>
          </tr>
          <tr>
            <th>MIN</th><th>MAX</th><th>PO</th><th>PR</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="pr-print-signature">
        <div class="pr-print-sign-col">
          <span>Dibuat oleh:</span>
          <div class="pr-print-sign-space"></div>
          <strong>( ${escapeHtml(sig.dibuatOleh.nama)} )</strong>
          <span>${escapeHtml(sig.dibuatOleh.jabatan)}</span>
        </div>
        <div class="pr-print-sign-col pr-print-sign-col-wide">
          <span>Mengetahui:</span>
          <div class="pr-print-sign-row">${mengetahuiHtml}</div>
        </div>
        <div class="pr-print-sign-col">
          <span>Disetujui:</span>
          <div class="pr-print-sign-space"></div>
          <strong>( ${escapeHtml(sig.disetujui.nama)} )</strong>
          <span>${escapeHtml(sig.disetujui.jabatan)}</span>
        </div>
      </div>
    </div>
  `;
}

function printPRDocument() {
  if (!prSaved || !prSaved.items || !prSaved.items.length) {
    showToast('Belum ada PR tersimpan untuk dicetak.', 'error');
    return;
  }
  const groups = prGroupItemsByPlantGroup(prSaved.items);
  const stockPerLabel = 'Stock Per ' + prTanggalPRToSlash(prSaved.tanggalPR);
  document.getElementById('prPrintPages').innerHTML = groups.map((group) =>
    prPrintPageHtml(group, prJudulForGroup(prSaved.judul || '', group.signature, groups.length), stockPerLabel)
  ).join('');

  // CATATAN soal orientasi: sempat dicoba kunci paksa ke A4 Landscape lewat
  // CSS "@page { size: A4 landscape }" di sini, TAPI itu malah bikin hasil
  // PDF berantakan di sebagian device user (konten ke-render lebar buat
  // Landscape tapi kertas fisiknya somehow tetap Portrait — printer/driver-nya
  // yang nggak nurut CSS ini, bukan Chrome/CSS-nya, tapi tetap harus dihindari
  // dari sisi app). Makanya SENGAJA DIBALIKIN ke apa adanya (ikut Layout yang
  // dipilih user sendiri di dialog print/Save as PDF) — user tinggal pilih
  // "Landscape" manual di situ sebelum Save, karena tabelnya emang lebar.
  document.body.classList.add('printing-pr');
  const cleanup = () => document.body.classList.remove('printing-pr');
  window.addEventListener('afterprint', cleanup, { once: true });

  // Logo baru di-insert ke DOM barusan (innerHTML di atas) — gambarnya masih
  // proses load ASYNC di background. Kalau window.print() langsung dipanggil
  // tanpa nunggu, browser bisa keburu render/cetak SEBELUM gambarnya selesai
  // dimuat, hasilnya logo kosong/hilang di PDF (keluhan user: "logo tidak
  // ada" — padahal sudah diupload). Makanya print BARU dipanggil setelah
  // SEMUA <img> di halaman cetak ini selesai load (atau gagal load — tetap
  // lanjut print daripada macet nunggu selamanya kalau gambarnya somehow
  // 404/gagal).
  const imgs = Array.from(document.querySelectorAll('#prPrintPages img'));
  const pending = imgs.filter((img) => !img.complete);
  const doPrint = () => {
    window.print();
    setTimeout(cleanup, 5000); // jaga2 kalau browser lama nggak fire 'afterprint'
  };
  if (!pending.length) {
    doPrint();
  } else {
    let remaining = pending.length;
    const onOneDone = () => { remaining -= 1; if (remaining <= 0) doPrint(); };
    pending.forEach((img) => {
      img.addEventListener('load', onOneDone, { once: true });
      img.addEventListener('error', onOneDone, { once: true });
    });
  }
}

function wireBuatPRModal() {
  document.getElementById('btnBuatPR').addEventListener('click', openBuatPRModal);
  document.getElementById('btnCloseBuatPRModal').addEventListener('click', closeBuatPRModal);
  document.getElementById('buatPRModalBackdrop').addEventListener('click', closeBuatPRModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('buatPRModal').hidden) closeBuatPRModal();
  });

  document.getElementById('buatPRPlantFilter').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-plant]');
    if (!btn) return;
    prPlantSelected = btn.dataset.plant;
    renderPRPlantChips();
    prUpdateJudulDefault();
    recomputePRAutoRows();
  });
  document.getElementById('buatPRStatusFilter').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-urgensi]');
    if (!btn) return;
    const v = btn.dataset.urgensi;
    const idx = prUrgencySelected.indexOf(v);
    if (idx === -1) prUrgencySelected.push(v); else prUrgencySelected.splice(idx, 1);
    renderPRUrgencyChips();
    recomputePRAutoRows();
  });
  document.getElementById('buatPRSearchItem').addEventListener('input', (e) => {
    prSearchText = e.target.value.trim().toLowerCase();
    recomputePRAutoRows();
  });

  document.getElementById('buatPRTbody').addEventListener('input', (e) => {
    const input = e.target.closest('input[data-field]');
    if (!input) return;
    const tr = input.closest('tr');
    const idx = Number(tr.dataset.idx);
    const row = prRows[idx];
    if (!row) return;
    const field = input.dataset.field;
    if (field === 'minStock' || field === 'maxStock' || field === 'stockPer' || field === 'orderQty') {
      row[field] = Number(input.value) || 0;
    } else {
      row[field] = input.value;
    }
  });
  document.getElementById('buatPRTbody').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    const idx = Number(btn.dataset.remove);
    prRows.splice(idx, 1);
    renderPRTable();
  });

  document.getElementById('btnBuatPRAddManual').addEventListener('click', async () => {
    const panel = document.getElementById('buatPRAddManualPanel');
    panel.hidden = !panel.hidden;
    if (panel.hidden || prStockBalanceCache) return;
    const results = document.getElementById('buatPRAddManualResults');
    results.innerHTML = '<div class="empty-state">Memuat data barang...</div>';
    try {
      const res = await Api.getStockBalance({});
      prStockBalanceCache = res.data || [];
      results.innerHTML = '';
    } catch (err) {
      results.innerHTML = `<div class="empty-state">Gagal memuat: ${escapeHtml(err.message)}</div>`;
    }
  });
  document.getElementById('buatPRAddManualSearch').addEventListener('input', (e) => {
    renderPRAddManualResults(e.target.value.trim().toLowerCase());
  });
  document.getElementById('buatPRAddManualResults').addEventListener('click', (e) => {
    const item = e.target.closest('[data-manual-idx]');
    if (!item) return;
    const wrap = document.getElementById('buatPRAddManualResults');
    const it = (wrap._prMatches || [])[Number(item.dataset.manualIdx)];
    if (!it) return;
    prAddManualItem(it);
  });

  document.getElementById('btnSimpanPR').addEventListener('click', handleSimpanPR);
  document.getElementById('btnDownloadPRExcel').addEventListener('click', downloadPRExcel);
  document.getElementById('btnDownloadPRPdf').addEventListener('click', printPRDocument);
}
