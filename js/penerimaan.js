// ============================================================================
// PENERIMAAN BARANG PAGE — Input Manual & Scan SPB
// Field & mapping kolom sheet PENERIMAAN (A-M) — lihat README.md untuk detail.
// ============================================================================

let penerimaanInitialized = false;
let masterDataLoaded = false;
let masterBarangCache = []; // dipakai bareng halaman Pemakaian untuk autofill nama/satuan by kode
let selectedImage = null; // { imageBase64, mimeType } — hanya di memori, tidak pernah disimpan
let pnLastSavedItems = []; // item terakhir yang berhasil disimpan (buat opsi "Cetak Label QR Dulu" di popup)
let pemesanDirectoryCache = []; // { nama, nik, email } user AKTIF terdaftar — dipakai buat autocomplete & auto-match Pemesan tipe USER (lihat updatePemesanMatchState)

function initPenerimaanPage() {
  loadMasterData(); // dipanggil tiap kali halaman ini dibuka — no-op kalau sudah pernah & belum di-invalidate
  Auth.prefillUserField('fUser'); // identitas selalu dari akun yang login (lihat js/auth.js)

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
  // Delegated karena baris item dibuat dinamis (addItemRow) — kalau Kode Barang
  // cocok dengan Master Data, Nama & Satuan otomatis terisi (tapi tetap
  // editable, bukan disabled) supaya user tinggal koreksi kalau perlu.
  document.getElementById('itemsContainer').addEventListener('input', (e) => {
    if (e.target.classList.contains('i-kode')) {
      handleItemKodeInput(e.target);
    }
  });

  document.getElementById('scanFileInput').addEventListener('change', handleFileSelected);
  document.getElementById('btnScanProcess').addEventListener('click', processScan);

  document.getElementById('formPenerimaan').addEventListener('submit', handleSubmit);

  // S.Loc selalu huruf besar semua begitu diketik (bukan cuma pas submit) —
  // biar kelihatan langsung & konsisten sama yang bakal disimpan/dicocokkan.
  wireUppercaseInput('fSLoc');

  // Pemesan: field TERPISAH dari Penerima (fUser) di atas — Penerima tetap
  // identitas akun yang login (dipakai buat Riwayat Transaksi/audit, jangan
  // diutak-atik), sedangkan Pemesan ini nyatet SUMBER pemesanan barang
  // ini (OBS/Fast Moving = replenishment rutin per kategori barang, USER =
  // ada orang yang minta langsung -> namanya WAJIB diisi di situ, karena itu
  // beda orang dari yang nerima barangnya).
  document.getElementById('fPemesanTipe').addEventListener('change', updatePemesanNamaVisibility);
  // Nama & NIK Pemesan saling melengkapi buat nyari user yang SUDAH terdaftar
  // akunnya (lihat updatePemesanMatchState) — ketik salah satu, yang lain ikut
  // ke-isi otomatis kalau ketemu. Kalau nggak ketemu, dianggap belum punya
  // akun & Email Pemesan wajib diisi manual (buat kirim notif barang datang).
  document.getElementById('fPemesanNama').addEventListener('input', updatePemesanMatchState);
  document.getElementById('fPemesanNik').addEventListener('input', updatePemesanMatchState);

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

function updatePemesanNamaVisibility() {
  const isUser = document.getElementById('fPemesanTipe').value === 'USER';
  document.getElementById('fPemesanNamaWrap').hidden = !isUser;
  document.getElementById('fPemesanNikWrap').hidden = !isUser;
  if (!isUser) {
    document.getElementById('fPemesanNama').value = '';
    document.getElementById('fPemesanNik').value = '';
    document.getElementById('fPemesanEmail').value = '';
    document.getElementById('fPemesanEmail').readOnly = false;
  }
  updatePemesanMatchState();
}

// Dicocokkan ke pemesanDirectoryCache (user AKTIF terdaftar, lihat
// loadMasterData) — NIK diprioritaskan (lebih spesifik/jarang typo daripada
// nama), baru nama kalau NIK kosong. Exact match saja (bukan partial) —
// datalist yang bantu user milih dari saran yang benar.
function findPemesanMatch(namaVal, nikVal) {
  const nik = String(nikVal || '').trim();
  const nama = String(namaVal || '').trim().toLowerCase();
  if (nik) {
    const byNik = pemesanDirectoryCache.find((u) => String(u.nik || '').trim() === nik);
    if (byNik) return byNik;
  }
  if (nama) {
    const byNama = pemesanDirectoryCache.find((u) => String(u.nama || '').trim().toLowerCase() === nama);
    if (byNama) return byNama;
  }
  return null;
}

// Dipanggil tiap kali Nama/NIK Pemesan diketik (atau Pemesan Tipe diganti) —
// nentuin apakah orang yang diketik itu SUDAH punya akun terdaftar (kalau
// iya, Nama/NIK/Email-nya di-auto-lengkapi dari situ & Email dikunci readonly
// biar konsisten sama data akunnya) atau BELUM (kalau iya, Email Pemesan jadi
// wajib diisi manual — itu-itu satunya cara sistem tahu ke mana kirim notif
// "barang sudah datang" buat orang yang belum punya akun W-SMART).
function updatePemesanMatchState() {
  const emailWrap = document.getElementById('fPemesanEmailWrap');
  const emailInput = document.getElementById('fPemesanEmail');
  const emailLabel = document.getElementById('fPemesanEmailLabel');
  const statusHint = document.getElementById('fPemesanStatusHint');
  const isUser = document.getElementById('fPemesanTipe').value === 'USER';

  if (!isUser) {
    emailWrap.hidden = true;
    statusHint.hidden = true;
    return;
  }

  const namaVal = document.getElementById('fPemesanNama').value.trim();
  const nikVal = document.getElementById('fPemesanNik').value.trim();

  if (!namaVal && !nikVal) {
    // Belum mulai ngetik apa-apa — jangan langsung nampilin Email dulu supaya
    // form nggak kelihatan penuh dari awal.
    emailWrap.hidden = true;
    statusHint.hidden = true;
    return;
  }

  emailWrap.hidden = false;
  const match = findPemesanMatch(namaVal, nikVal);

  if (match) {
    // Ketemu akun terdaftar — sinkronkan Nama/NIK ke data akunnya (jaga2 kalau
    // yang dipilih dari datalist NIK tapi Nama-nya belum sempat ikut ke-isi,
    // atau sebaliknya).
    if (match.nama) document.getElementById('fPemesanNama').value = match.nama;
    if (match.nik) document.getElementById('fPemesanNik').value = match.nik;

    if (match.email) {
      emailInput.value = match.email;
      emailInput.readOnly = true;
      emailInput.required = false;
      emailLabel.textContent = 'Email Pemesan';
      statusHint.hidden = false;
      statusHint.textContent = '✓ Akun terdaftar ditemukan — notif otomatis dikirim ke ' + match.email + '.';
    } else {
      // Akunnya ada tapi Email-nya belum sempat dilengkapi di Kelola User.
      emailInput.readOnly = false;
      emailInput.required = true;
      emailLabel.textContent = 'Email Pemesan *';
      statusHint.hidden = false;
      statusHint.textContent = '✓ Akun terdaftar ditemukan, tapi belum ada Email tersimpan di akunnya — isi manual di atas biar tetap bisa dikirimi notif.';
    }
  } else {
    emailInput.readOnly = false;
    emailInput.required = true;
    emailLabel.textContent = 'Email Pemesan *';
    statusHint.hidden = false;
    statusHint.textContent = 'Belum ketemu di daftar akun terdaftar — berarti belum punya akun W-SMART, isi Email di atas biar tetap bisa dikirimi notif otomatis pas barangnya datang.';
  }
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
    const [barangRes, supplierRes, pemesanRes] = await Promise.all([Api.getMasterBarang(), Api.getSupplier(), Api.getPemesanDirectory()]);
    masterBarangCache = (barangRes.data || []).filter((b) => b.status !== 'Nonaktif');

    const listBarang = document.getElementById('listMasterBarang');
    listBarang.innerHTML = masterBarangCache
      .map((b) => `<option value="${escapeHtml(b.kodeBarang)}">${escapeHtml(b.namaBarang)}</option>`)
      .join('');

    const listSupplier = document.getElementById('listSupplier');
    listSupplier.innerHTML = (supplierRes.data || [])
      .map((s) => `<option value="${escapeHtml(s.namaSupplier)}"></option>`)
      .join('');

    // Dipakai buat autocomplete & auto-match Nama/NIK Pemesan (khusus Pemesan
    // tipe USER) — lihat findPemesanMatch/updatePemesanMatchState.
    pemesanDirectoryCache = pemesanRes.data || [];
    document.getElementById('listPemesanNama').innerHTML = pemesanDirectoryCache
      .map((u) => `<option value="${escapeHtml(u.nama)}"></option>`)
      .join('');
    document.getElementById('listPemesanNik').innerHTML = pemesanDirectoryCache
      .filter((u) => u.nik)
      .map((u) => `<option value="${escapeHtml(u.nik)}">${escapeHtml(u.nama)}</option>`)
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

// Autofill Nama Barang & Satuan dari Master Data begitu Kode Barang di baris
// item cocok — nilainya tetap boleh diubah manual sesudahnya (mis. barang
// belum terdaftar, atau satuan beda dari biasanya untuk pengiriman ini).
function handleItemKodeInput(kodeInput) {
  const kode = kodeInput.value.trim();
  if (!kode) return;
  const match = masterBarangCache.find((b) => b.kodeBarang === kode);
  if (!match) return;

  const row = kodeInput.closest('.item-row');
  if (!row) return;
  row.querySelector('.i-nama').value = match.namaBarang || '';
  row.querySelector('.i-satuan').value = match.satuan || '';
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
  // fKeterangan SENGAJA tidak diisi otomatis dari hasil scan — selalu manual.
  // fUser BUKAN dari hasil scan/OCR — selalu dari akun yang login (lihat
  // Auth.prefillUserField di initPenerimaanPage), field-nya sudah readonly.

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

  // S.Loc WAJIB — ini yang menentukan pool Plant+S.Loc yang nanti divalidasi
  // ketat pas Barang Keluar (lihat js/pemakaian.js & resolveOnHandPlantSloc_
  // di Code.gs). Selalu disimpan huruf besar semua.
  const slocVal = document.getElementById('fSLoc').value.trim().toUpperCase();
  if (!slocVal) {
    showToast('S.Loc wajib diisi.', 'error');
    document.getElementById('fSLoc').focus();
    return;
  }

  // User (penerima) SENGAJA opsional — boleh dikosongkan & diisi belakangan
  // (mis. langsung di spreadsheet, kolom D sheet PENERIMAAN), nggak boleh
  // ngeblok proses input barang cuma gara-gara belum sempat catat nama.
  const userVal = document.getElementById('fUser').value.trim();

  // Pemesan WAJIB dipilih (salah satu dari OBS/FAST MOVING/USER, gak boleh
  // dikosongkan) — dan khusus "USER" masih ada syarat TAMBAHAN: nama
  // pemesannya juga wajib diisi (itu inti fiturnya: catat siapa yang ORDER
  // barang ini, beda dari fUser di atas yang nyatet siapa yang NERIMA/
  // nginput transaksinya).
  const pemesanTipe = document.getElementById('fPemesanTipe').value;
  if (!pemesanTipe) {
    showToast('Pemesan wajib dipilih (OBS/FAST MOVING/USER).', 'error');
    document.getElementById('fPemesanTipe').focus();
    return;
  }
  const pemesanNama = document.getElementById('fPemesanNama').value.trim();
  if (pemesanTipe === 'USER' && !pemesanNama) {
    showToast('Nama Pemesan wajib diisi kalau Pemesan-nya USER.', 'error');
    document.getElementById('fPemesanNama').focus();
    return;
  }
  const pemesanNik = document.getElementById('fPemesanNik').value.trim();
  // Email Pemesan WAJIB khusus tipe USER — itu alamat yang dipakai kirim
  // notif otomatis "barang pesanan sudah datang" (lihat
  // sendPemesanNotificationEmail_ di Code.gs). Kalau Pemesan-nya user yang
  // SUDAH terdaftar akunnya, field ini otomatis kesisi & terkunci dari
  // updatePemesanMatchState — kalau belum terdaftar, wajib diisi manual.
  const pemesanEmail = document.getElementById('fPemesanEmail').value.trim();
  if (pemesanTipe === 'USER' && !pemesanEmail) {
    showToast('Email Pemesan wajib diisi kalau Pemesan-nya USER (buat kirim notif barang datang).', 'error');
    document.getElementById('fPemesanEmail').focus();
    return;
  }
  if (pemesanTipe === 'USER' && !isValidEmail(pemesanEmail)) {
    showToast('Format Email Pemesan tidak valid.', 'error');
    document.getElementById('fPemesanEmail').focus();
    return;
  }

  const payload = {
    tanggal: document.getElementById('fTanggal').value, // tanggal dokumen/PO — Kedatangan diisi server = hari ini
    noPO: document.getElementById('fNoPO').value.trim(),
    vendor: document.getElementById('fVendor').value.trim(),
    user: userVal,
    pemesanTipe,
    pemesanNama: pemesanTipe === 'USER' ? pemesanNama : '',
    pemesanNik: pemesanTipe === 'USER' ? pemesanNik : '',
    pemesanEmail: pemesanTipe === 'USER' ? pemesanEmail : '',
    plant: document.getElementById('fPlant').value.trim(),
    sloc: slocVal,
    keterangan: document.getElementById('fKeterangan').value.trim(),
    items
  };

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Menyimpan...';

  try {
    const res = await Api.savePenerimaan(payload);
    const emailNote = (pemesanTipe === 'USER' && pemesanEmail) ? (res.emailSent ? ' + email notif terkirim.' : ' (email notif gagal terkirim, cek koneksi/kuota Gmail).') : '';
    showToast('Tersimpan (' + res.jumlahItem + ' item).' + emailNote, 'success');
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
  updatePemesanNamaVisibility(); // form.reset() balikin <select> ke default, tapi hidden-nya harus disamain manual
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
