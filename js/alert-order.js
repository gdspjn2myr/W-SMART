// ============================================================================
// ALERT ORDER — daftar barang yang perlu diorder (Stock Out / Need Reorder /
// Near ROP), tiap item bisa "Buat PR" untuk mencatat kapan proses order
// dimulai. Begitu barang itu datang lewat Barang Masuk, PR yang masih
// "Menunggu" otomatis ditutup di server (lihat closeMatchingPR_ di Code.gs)
// dan Lead Time asli (Tanggal PR -> Tanggal Kedatangan) terekam. No PO yang
// menutup PR itu ikut dicatat di baris PR yang sama (kolom "No PO Terkait" di
// sheet PurchaseRequest) — jadi begitu PR selesai, satu baris itu langsung
// nunjukin No PO aslinya. Sengaja TIDAK menampilkan "Nomor PR" ke user di
// halaman ini (cuma tanggal & status) karena di dunia nyata SPB/PO cuma kenal
// SATU nomor dokumen (No PO) — biar nggak ada dua nomor yang harus
// dicocokkan manual.
//
// Avg Usage Otomatis & Lead Time Otomatis dihitung REALTIME di server dari
// histori Pemakaian & PurchaseRequest yang sudah "Selesai" (lihat
// hitungMetrikOtomatisSemua_ di Code.gs) — tidak disimpan permanen di kolom
// sheet mana pun, jadi tidak mengganggu Min/ROP/MAX manual yang ada di
// Master Data. Tombol CSV/Excel/PDF di sini yang jadi cara menyimpan
// snapshot angka-angka otomatis ini (mis. buat diajukan ke perusahaan).
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
  { header: 'Status', get: (it) => it.status },
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
    document.getElementById('btnRefreshAlertOrder').addEventListener('click', loadAlertOrder);
    document.getElementById('btnDownloadAlertOrderCsv').addEventListener('click', downloadAlertOrderCsv);
    document.getElementById('btnDownloadAlertOrderExcel').addEventListener('click', downloadAlertOrderExcel);
    document.getElementById('btnDownloadAlertOrderPdf').addEventListener('click', printAlertOrderPdf);
    document.getElementById('aoList').addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-buat-pr');
      if (btn) handleCreatePRClick(btn);
    });
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
              <span class="ra-badge ${AO_STATUS_CLASS[it.status] || ''}">${escapeHtml(it.status)}</span>
              ${escapeHtml(it.kode)} — ${escapeHtml(it.namaBarang || '-')}
            </div>
            <div class="ao-item-sub">Stock ${it.onHand} · Min ${it.minStock} · ROP ${it.rop} · MAX ${it.max} · Order Qty <strong>${it.orderQty}</strong></div>
          </div>
          <div class="ao-item-side">
            ${it.prTerbuka
              ? `<div class="ao-pr-open"><strong>PR sudah dibuat</strong><span>${escapeHtml(it.prTerbuka.tanggalPR)}</span><span>Menunggu barang datang</span></div>`
              : `<button type="button" class="btn btn-small btn-buat-pr" data-kode="${escapeHtml(it.kode)}" data-nama="${escapeHtml(it.namaBarang || '')}" data-satuan="${escapeHtml(it.satuan || '')}" data-qty="${it.orderQty}">Buat PR</button>`
            }
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

async function handleCreatePRClick(btn) {
  btn.disabled = true;
  const kode = btn.dataset.kode;
  try {
    const res = await Api.createPR({
      kode: kode,
      namaBarang: btn.dataset.nama,
      satuan: btn.dataset.satuan,
      qtyDisarankan: Number(btn.dataset.qty) || 0,
      user: ''
    });
    if (res.sudahAda) {
      showToast('PR untuk ' + kode + ' sudah ada sebelumnya (' + res.tanggalPR + ').', 'info');
    } else {
      showToast('PR untuk ' + kode + ' berhasil dibuat.', 'success');
    }
    await loadAlertOrder();
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false;
  }
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
      <td>${escapeHtml(it.status)}</td>
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
