// ============================================================================
// PENERIMAAN BARANG PAGE — Input Manual & Scan SPB
// Field & mapping kolom sheet PENERIMAAN (A-M) — lihat README.md untuk detail.
// ============================================================================

let penerimaanInitialized = false;
let masterDataLoaded = false;
let masterBarangCache = []; // dipakai bareng halaman Pemakaian untuk autofill nama/satuan by kode
let selectedImage = null; // { imageBase64, mimeType } — hanya di memori, tidak pernah disimpan
let pnLastSavedItems = []; // item terakhir yang berhasil disimpan (buat opsi "Cetak Label QR Dulu" di popup)

function initPenerimaanPage() {
  loadMasterData(); // dipanggil tiap kali halaman ini dibuka — no-op kalau sudah pernah & belum di-invalidate

  if (penerimaanInitialized) return;
  penerimaanInitialized = true;

  document.getElementById('btnModeManual').addEventListener('click', () => setMode('manual'));
  document.getElementById('btnModeScan').addEventListener('click', () => setMode('scan'));
  document.getElementById('btnFallbackManual').addEventListener('click', () => setMode('manual'));

  document.getElementById('btnAddItem').addEventListener('click', () => addItemRow());
  document.getElementById('itemsContainer').addEventListener('click', (e) => {
    if (e.target.classList.contains('item-remove')) {
      const row = e.target.closest('.item-row');
      if (!row) return;
      row.classList.add('removing');
      row.addEventListener('transitionend', () => row.remove(), { once: true });
      // Fallback jaga-jaga kalau transitionend tidak terpanggil (mis. reduced-motion).
      setTimeout(() => { if (row.isConnected) row.remove(); }, 320);
    }
  });

  document.getElementById('scanFileInput').addEventListener('change', handleFileSelected);
  document.getElementById('btnScanProcess').addEventListener('click', processScan);

  document.getElementById('formPenerimaan').addEventListener('submit', handleSubmit);

  document.getElementById('btnPnPutawayLater').addEventListener('click', () => closePutawayPrompt('later'));
  document.getElementById('btnPnPutawayNow').addEventListener('click', () => closePutawayPrompt('putaway'));
  document.getElementById('btnPnPrintQr').addEventListener('click', () => closePutawayPrompt('print'));
  document.getElementById('pnPutawayModalBackdrop').addEventListener('click', () => closePutawayPrompt('later'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('pnPutawayModal').hidden) closePutawayPrompt('later');
  });

  setKedatanganDisplay();
  addItemRow();
}

// ---------------------------------------------------------------------------
// POPUP "LANJUT PUT AWAY?" — muncul tiap kali Barang Masuk berhasil disimpan.
// "Nanti" -> tetap di halaman Barang Masuk (form sudah direset, siap input
// berikutnya). "Ya, Put Away Sekarang" -> pindah ke halaman Put Away supaya
// barang yang baru masuk langsung di-scan/taruh ke bin.
// ---------------------------------------------------------------------------
function openPutawayPrompt(jumlahItem, items) {
  pnLastSavedItems = items || [];
  document.getElementById('pnPutawayModalText').textContent =
    `${jumlahItem} item barang sudah tercatat. Lanjut Put Away sekarang untuk taruh ke bin/lokasi?`;
  document.getElementById('pnPutawayModalBackdrop').hidden = false;
  document.getElementById('pnPutawayModal').hidden = false;
}

function closePutawayPrompt(action) {
  document.getElementById('pnPutawayModalBackdrop').hidden = true;
  document.getElementById('pnPutawayModal').hidden = true;
  if (action === 'putaway') {
    location.hash = '#/putaway';
  } else if (action === 'print') {
    const itemsWithKode = pnLastSavedItems.filter((it) => it.kode);
    if (!itemsWithKode.length) {
      showToast('Item tadi tidak ada Kode Barang-nya, jadi belum bisa dibuatkan QR.', 'error');
      return;
    }
    goToQrLabelsForItems(itemsWithKode);
  }
  // action === 'later' -> tetap di halaman Barang Masuk, form sudah direset saat submit.
}

function setMode(mode) {
  const isManual = mode === 'manual';
  document.getElementById('btnModeManual').classList.toggle('active', isManual);
  document.getElementById('btnModeScan').classList.toggle('active', !isManual);
  document.getElementById('scanPanel').hidden = isManual;
}

async function loadMasterData() {
  if (masterDataLoaded) return;
  try {
    const [barangRes, supplierRes] = await Promise.all([Api.getMasterBarang(), Api.getSupplier()]);
    masterBarangCache = (barangRes.data || []).filter((b) => b.status !== 'Nonaktif');

    const listBarang = document.getElementById('listMasterBarang');
    listBarang.innerHTML = masterBarangCache
      .map((b) => `<option value="${escapeHtml(b.kodeBarang)}">${escapeHtml(b.namaBarang)}</option>`)
      .join('');

    const listSupplier = document.getElementById('listSupplier');
    listSupplier.innerHTML = (supplierRes.data || [])
      .map((s) => `<option value="${escapeHtml(s.namaSupplier)}"></option>`)
      .join('');

    masterDataLoaded = true;
  } catch (err) {
    // Master data opsional untuk fondasi ini — gagal load tidak menghalangi input manual.
    console.warn('Gagal memuat master data:', err.message);
  }
}

function addItemRow(prefill) {
  const tpl = document.getElementById('itemRowTemplate');
  const node = tpl.content.cloneNode(true);
  if (prefill) {
    node.querySelector('.i-kode').value = prefill.kode || '';
    node.querySelector('.i-nama').value = prefill.namaBarang || '';
    node.querySelector('.i-qty').value = prefill.qty || '';
    node.querySelector('.i-satuan').value = prefill.satuan || '';
  }
  document.getElementById('itemsContainer').appendChild(node);
}

function clearItemRows() {
  document.getElementById('itemsContainer').innerHTML = '';
}

// ---------------------------------------------------------------------------
// SCAN SPB
// ---------------------------------------------------------------------------

function handleFileSelected(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result; // "data:image/jpeg;base64,...."
    const base64 = dataUrl.split(',')[1];
    selectedImage = { imageBase64: base64, mimeType: file.type || 'image/jpeg' };

    const img = document.getElementById('scanPreviewImg');
    img.src = dataUrl;
    img.hidden = false;
    document.getElementById('scanDropText').hidden = true;
    document.getElementById('btnScanProcess').disabled = false;
    hideScanStatus();
    hideRawText();
  };
  reader.readAsDataURL(file);
}

async function processScan() {
  if (!selectedImage) return;
  const btn = document.getElementById('btnScanProcess');
  btn.disabled = true;
  btn.textContent = 'Membaca SPB...';
  showScanStatus('Sedang membaca data dari foto SPB, mohon tunggu...', 'info');

  try {
    const res = await Api.scanSPB(selectedImage);
    // Foto hanya ada di memori browser (selectedImage) & di server sementara — sudah dihapus otomatis di backend.
    fillFormFromParsed(res.parsed);
    showRawText(res.rawText);

    const gotSomething = res.parsed && (res.parsed.noPO || res.parsed.vendor || (res.parsed.items && res.parsed.items.length));
    if (gotSomething) {
      showScanStatus('Data berhasil dibaca. Silakan periksa & lengkapi field yang masih kosong sebelum menyimpan.', 'success');
    } else {
      showScanStatus('Foto terbaca tapi belum berhasil mengenali data-nya (lihat "teks mentah hasil OCR" di bawah). Silakan lengkapi manual, dan kirim teks mentahnya kalau mau saya perbaiki pola bacanya.', 'error');
    }
    document.getElementById('formPenerimaan').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    showScanStatus('Gagal membaca SPB: ' + err.message + ' — silakan lengkapi manual di bawah.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Baca Data SPB';
  }
}

function fillFormFromParsed(parsed) {
  if (!parsed) return;
  if (parsed.tanggal) {
    const d = new Date(parsed.tanggal);
    if (!isNaN(d.getTime())) document.getElementById('fTanggal').valueAsDate = d;
  }
  document.getElementById('fNoPO').value = parsed.noPO || '';
  document.getElementById('fVendor').value = parsed.vendor || '';
  document.getElementById('fPlant').value = parsed.plant || '';
  document.getElementById('fSLoc').value = parsed.sloc || '';
  // fUser & fKeterangan SENGAJA tidak diisi otomatis — selalu manual.

  clearItemRows();
  if (parsed.items && parsed.items.length) {
    parsed.items.forEach((it) => addItemRow(it));
  } else {
    addItemRow();
  }
}

function showScanStatus(msg, type) {
  const el = document.getElementById('scanStatus');
  el.textContent = msg;
  el.className = 'scan-status' + (type === 'error' ? ' error' : type === 'success' ? ' success' : '');
  el.hidden = false;
}
function hideScanStatus() {
  document.getElementById('scanStatus').hidden = true;
}

function showRawText(rawText) {
  const wrap = document.getElementById('rawTextWrap');
  if (!rawText) { wrap.hidden = true; return; }
  document.getElementById('rawTextContent').textContent = rawText;
  wrap.hidden = false;
}
function hideRawText() {
  document.getElementById('rawTextWrap').hidden = true;
  document.getElementById('rawTextContent').textContent = '';
}

function setKedatanganDisplay() {
  document.getElementById('fKedatanganDisplay').valueAsDate = new Date();
}

// ---------------------------------------------------------------------------
// SUBMIT
// ---------------------------------------------------------------------------

async function handleSubmit(e) {
  e.preventDefault();

  const items = Array.from(document.querySelectorAll('#itemsContainer .item-row')).map((row) => ({
    kode: row.querySelector('.i-kode').value.trim(),
    namaBarang: row.querySelector('.i-nama').value.trim(),
    qty: Number(row.querySelector('.i-qty').value) || 0,
    satuan: row.querySelector('.i-satuan').value.trim()
  })).filter((it) => it.namaBarang);

  if (!items.length) {
    showToast('Isi minimal 1 barang dengan nama & qty.', 'error');
    return;
  }

  const userVal = document.getElementById('fUser').value.trim();
  if (!userVal) {
    showToast('Nama User (penerima) wajib diisi.', 'error');
    document.getElementById('fUser').focus();
    return;
  }

  const payload = {
    tanggal: document.getElementById('fTanggal').value, // tanggal dokumen/PO — Kedatangan diisi server = hari ini
    noPO: document.getElementById('fNoPO').value.trim(),
    vendor: document.getElementById('fVendor').value.trim(),
    user: userVal,
    plant: document.getElementById('fPlant').value.trim(),
    sloc: document.getElementById('fSLoc').value.trim(),
    keterangan: document.getElementById('fKeterangan').value.trim(),
    items
  };

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Menyimpan...';

  try {
    const res = await Api.savePenerimaan(payload);
    showToast('Tersimpan (' + res.jumlahItem + ' item).', 'success');
    resetForm();
    dashboardLoadedOnce = false; // supaya dashboard refresh saat dibuka lagi
    openPutawayPrompt(res.jumlahItem, items);
  } catch (err) {
    showToast('Gagal menyimpan: ' + err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Simpan Penerimaan';
  }
}

function resetForm() {
  document.getElementById('formPenerimaan').reset();
  setKedatanganDisplay();
  clearItemRows();
  addItemRow();
  selectedImage = null;
  document.getElementById('scanPreviewImg').hidden = true;
  document.getElementById('scanDropText').hidden = false;
  document.getElementById('btnScanProcess').disabled = true;
  hideScanStatus();
  hideRawText();
  setMode('manual');
}
