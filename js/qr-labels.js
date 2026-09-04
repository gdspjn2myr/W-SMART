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
