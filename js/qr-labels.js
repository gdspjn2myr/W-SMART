// ============================================================================
// QR LABELS — generate & cetak label QR untuk Barang (Kode Barang) dan
// Bin/Lokasi. QR yang dihasilkan berisi TEKS POLOS (bukan JSON) — cuma Kode
// Barang apa adanya, atau Kode Bin apa adanya — supaya persis cocok dengan
// yang dibaca fitur scan yang sudah ada (Put Away & Barang Keluar, lihat
// qr-scan.js): hasil scan langsung dipakai sebagai kode/lokasi tanpa parsing
// tambahan. QR digambar pakai qrcode-lib.js (vendored, lihat file itu).
// ============================================================================

let qrLabelsInitialized = false;
let qrMode = 'barang'; // 'barang' | 'bin'
let qrBarangItems = [];
let qrBarangSelected = new Set();
let qrBarangSearchText = '';
let qrLabelsPendingItems = null; // dipakai buat "cetak QR langsung" dari halaman lain (lihat goToQrLabelsForItems)

function initQrLabelsPage() {
  if (!qrLabelsInitialized) {
    qrLabelsInitialized = true;

    document.getElementById('btnQrModeBarang').addEventListener('click', () => setQrMode('barang'));
    document.getElementById('btnQrModeBin').addEventListener('click', () => setQrMode('bin'));

    document.getElementById('qrBarangSearch').addEventListener('input', (e) => {
      qrBarangSearchText = e.target.value.trim().toLowerCase();
      renderQrBarangList();
    });
    document.getElementById('btnQrBarangSelectAll').addEventListener('click', toggleQrBarangSelectAll);
    document.getElementById('btnGenerateQrBarang').addEventListener('click', generateQrBarangLabels);
    document.getElementById('btnGenerateQrBin').addEventListener('click', generateQrBinLabels);
    document.getElementById('btnPrintQrLabels').addEventListener('click', () => window.print());
  }

  if (qrLabelsPendingItems && qrLabelsPendingItems.length) {
    const items = qrLabelsPendingItems;
    qrLabelsPendingItems = null;
    setQrMode('barang');
    renderQrLabels(items.map((it) => ({ code: it.kode, title: it.kode, sub: it.namaBarang || '' })));
  }

  loadQrBarangItems();
}

/**
 * Dipanggil dari halaman lain (Barang Masuk, Put Away) buat langsung cetak QR
 * item tertentu tanpa harus pilih manual dari daftar Master Data — berguna
 * juga untuk barang yang belum terdaftar di Master Data (belumAdaMaster),
 * karena di sini nggak bergantung pada daftar Api.getMasterBarang().
 * items = [{ kode, namaBarang }]
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
  const wrap = document.getElementById('qrBarangList');
  try {
    const res = await Api.getMasterBarang();
    qrBarangItems = (res.data || []).filter((it) => it.status !== 'Nonaktif');
    renderQrBarangList();
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state">Gagal memuat data barang: ${escapeHtml(err.message)}</div>`;
  }
}

function renderQrBarangList() {
  const wrap = document.getElementById('qrBarangList');
  let items = qrBarangItems;
  if (qrBarangSearchText) {
    items = items.filter((it) =>
      (it.kodeBarang || '').toLowerCase().includes(qrBarangSearchText) ||
      (it.namaBarang || '').toLowerCase().includes(qrBarangSearchText)
    );
  }
  if (!items.length) {
    wrap.innerHTML = qrBarangItems.length
      ? '<div class="empty-state">Tidak ada barang yang cocok dengan pencarian.</div>'
      : '<div class="empty-state">Belum ada data master barang aktif.</div>';
    return;
  }
  wrap.innerHTML = items.map((it) => `
      <label class="pw-item qr-pick-item">
        <input type="checkbox" class="qr-pick-checkbox" data-kode="${escapeHtml(it.kodeBarang)}" ${qrBarangSelected.has(it.kodeBarang) ? 'checked' : ''}>
        <div class="pw-item-main">
          <div class="pw-item-title">${escapeHtml(it.kodeBarang)} — ${escapeHtml(it.namaBarang || '-')}</div>
          <div class="pw-item-sub">${escapeHtml(it.satuan || '-')}</div>
        </div>
      </label>
    `).join('');
  wrap.querySelectorAll('.qr-pick-checkbox').forEach((cb) => {
    cb.addEventListener('change', () => {
      if (cb.checked) qrBarangSelected.add(cb.dataset.kode);
      else qrBarangSelected.delete(cb.dataset.kode);
    });
  });
}

function toggleQrBarangSelectAll() {
  const allSelected = qrBarangItems.length > 0 && qrBarangItems.every((it) => qrBarangSelected.has(it.kodeBarang));
  if (allSelected) {
    qrBarangSelected.clear();
  } else {
    qrBarangItems.forEach((it) => qrBarangSelected.add(it.kodeBarang));
  }
  renderQrBarangList();
}

async function generateQrBarangLabels() {
  const items = qrBarangItems.filter((it) => qrBarangSelected.has(it.kodeBarang));
  if (!items.length) {
    showToast('Pilih minimal 1 barang dulu.', 'error');
    return;
  }
  const labels = items.map((it) => ({
    code: it.kodeBarang,
    title: it.kodeBarang,
    sub: it.namaBarang || ''
  }));
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
  const labels = codes.map((code) => ({ code, title: code, sub: '' }));
  await renderQrLabels(labels);
}

async function renderQrLabels(labels) {
  const grid = document.getElementById('qrLabelGrid');
  const card = document.getElementById('qrLabelResultCard');
  grid.innerHTML = labels.map((lbl, i) => `
      <div class="qr-label">
        <canvas class="qr-label-canvas" data-idx="${i}"></canvas>
        <div class="qr-label-code">${escapeHtml(lbl.code)}</div>
        ${lbl.sub ? `<div class="qr-label-sub">${escapeHtml(lbl.sub)}</div>` : ''}
      </div>
    `).join('');
  card.hidden = false;
  document.getElementById('qrLabelCount').textContent = labels.length;

  const canvases = grid.querySelectorAll('.qr-label-canvas');
  for (let i = 0; i < labels.length; i++) {
    try {
      await QRCode.toCanvas(canvases[i], labels[i].code, { width: 160, margin: 1, errorCorrectionLevel: 'M' });
    } catch (err) {
      // Kode terlalu panjang/aneh untuk di-encode — jarang terjadi untuk kode barang/bin biasa.
      showToast(`Gagal buat QR untuk "${labels[i].code}": ${err.message}`, 'error');
    }
  }
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
