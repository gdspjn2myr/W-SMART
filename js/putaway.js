// ============================================================================
// PUT AWAY — barang yang sudah diterima (Penerimaan) tapi belum di-scan masuk
// ke bin manapun ("belum ter-mapping") dicatat masuk ke lokasi/bin tertentu.
// Lokasi diisi lewat scan QR (prioritas) atau ketik manual (fallback) — sesuai
// infografis no.6 "Transaksi dengan QR". Satu bin boleh berisi lebih dari satu
// SKU (dikonfirmasi user), jadi daftar item TIDAK difilter per lokasi — semua
// yang masih belum ter-mapping selalu tampil, terlepas mau ditaruh ke bin mana.
// ============================================================================

let pwInitialized = false;
let pwBelumMapping = [];
// Plant yang sudah "terkunci" buat kode yang lagi dipilih di form — dipakai
// pas kode itu multi-Plant (ada >1 baris di pwBelumMapping dg kode yang sama,
// beda Plant) supaya handlePwSubmit tahu persis baris MANA yang dimaksud,
// BUKAN asal ambil baris pertama yang kebetulan ketemu (itu bug lama yang
// bikin Put Away bisa "nyedot" belum-ter-mapping dari Plant yang salah).
let pwSelectedPlant = '';

// ID anti-dobel-simpan (lihat js/api.js dekat generateClientRequestId) —
// diganti lagi cuma setelah submit sukses (resetPwItemFields).
let pwRequestId = generateClientRequestId();

// ============================================================================
// MULTI-SELECT — permintaan Bos: bisa pilih BANYAK item "belum ter-mapping"
// sekaligus (checkbox per baris, bukan cuma klik 1 baris ke form single-item
// di atas), terus pilih mau "Cetak Label" (multi-SKU sekaligus, lihat
// generateQrBarangLabels/handleGetLatestPenerimaanBatch di js/qr-labels.js)
// ATAU "Masukkan ke Bin" (batch, lihat handleSavePutawayBatch di Code.gs).
// Key seleksi = kode + '|' + plant (BUKAN kode saja) — kode yang sama bisa
// punya >1 baris beda Plant di pwBelumMapping, harus bisa dibedakan.
// ============================================================================
let pwSelected = new Set();
let pwBulkRequestId = generateClientRequestId();

function pwItemKey(it) {
  return it.kode + '|' + (it.plant || '');
}

function togglePwSelection(key, checked) {
  if (checked) pwSelected.add(key); else pwSelected.delete(key);
  updatePwBulkBar();
}

function updatePwBulkBar() {
  const bar = document.getElementById('pwBulkBar');
  const selectAll = document.getElementById('pwSelectAll');
  if (!bar) return;
  const n = pwSelected.size;
  bar.hidden = n === 0;
  const countEl = document.getElementById('pwBulkCount');
  if (countEl) countEl.textContent = n + ' item dipilih';
  if (selectAll) {
    selectAll.checked = pwBelumMapping.length > 0 && n === pwBelumMapping.length;
    selectAll.indeterminate = n > 0 && n < pwBelumMapping.length;
  }
}

function toggleAllPwSelection(checked) {
  pwSelected = checked ? new Set(pwBelumMapping.map(pwItemKey)) : new Set();
  renderPwBelumMappingList();
}

function getPwSelectedItems() {
  return pwBelumMapping.filter((it) => pwSelected.has(pwItemKey(it)));
}

// Cetak Label sekaligus buat semua item yang dicentang — pakai jalur yang
// sama dengan QR Labels Mode Manual (Api.getLatestPenerimaanBatch, tiap
// barang ambil No PO/Vendor/Sumber/User riwayat Penerimaan TERAKHIRnya
// sendiri-sendiri, bukan disamain).
async function handlePwBulkPrint() {
  const items = getPwSelectedItems();
  if (!items.length) return;
  const btn = document.getElementById('btnPwBulkPrint');
  const originalText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Memuat...'; }
  let latestByKode = {};
  try {
    const res = await Api.getLatestPenerimaanBatch({ kodes: items.map((it) => it.kode) });
    latestByKode = res.data || {};
  } catch (err) {
    showToast('Gagal ambil histori Penerimaan (' + err.message + ') — label tetap dibuat, sebagian field mungkin kosong.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = originalText; }
  }
  const labelItems = items.map((it) => {
    const auto = latestByKode[it.kode] || {};
    return {
      kode: it.kode,
      namaBarang: it.namaBarang,
      satuan: it.satuan,
      noPO: auto.noPO || '',
      vendor: auto.vendor || '',
      sumber: auto.sumber || '',
      sloc: auto.sloc || '',
      tanggal: auto.tanggal || '',
      user: auto.user || '',
      plant: auto.plant || it.plant || ''
    };
  });
  goToQrLabelsForItems(labelItems);
}

// ---------------------------------------------------------------------------
// Modal "Masukkan ke Bin" (batch) — tiap item yang dicentang boleh punya
// Lokasi/S.Loc SENDIRI-SENDIRI (dikonfirmasi Bos), Qty otomatis dipenuhkan ke
// sisa belum-ter-mapping (juga dikonfirmasi — bukan diisi manual satu-satu),
// Nama User 1x buat semua item. Lihat handleSavePutawayBatch di Code.gs.
// ---------------------------------------------------------------------------
function openPwBulkModal() {
  const items = getPwSelectedItems();
  if (!items.length) return;
  document.getElementById('pwBulkModalUser').value = document.getElementById('pwUser').value || '';
  renderPwBulkModalList(items);
  document.getElementById('pwBulkModalBackdrop').hidden = false;
  document.getElementById('pwBulkModal').hidden = false;
}

function closePwBulkModal() {
  document.getElementById('pwBulkModalBackdrop').hidden = true;
  document.getElementById('pwBulkModal').hidden = true;
}

function renderPwBulkModalList(items) {
  const wrap = document.getElementById('pwBulkModalList');
  wrap.innerHTML = items.map((it, idx) => `
    <div class="pw-bulk-item" data-idx="${idx}">
      <div class="pw-bulk-item-title">${escapeHtml(it.kode)} — ${escapeHtml(it.namaBarang || '-')}</div>
      <div class="pw-bulk-item-sub">Qty put away: <strong>${it.belumTerMapping} ${escapeHtml(it.satuan || '')}</strong>${it.plant ? ' · Plant ' + escapeHtml(it.plant) : ''} (otomatis semua sisa)</div>
      <div class="form-row-pair">
        <div class="form-row">
          <label>Lokasi/Bin *</label>
          <input type="text" class="pw-bulk-lokasi" placeholder="Contoh: SP-R01-03" required>
        </div>
        <div class="form-row">
          <label>S.Loc *</label>
          <input type="text" class="pw-bulk-sloc input-uppercase" placeholder="Contoh: GDJT" required>
        </div>
      </div>
    </div>
  `).join('');
  // wireUppercaseInput (js/app.js) cuma nerima ID elemen (document.getElementById),
  // sedangkan baris2 di sini di-generate dinamis dari template — pasang listener
  // uppercase langsung di elemennya sendiri di sini (perilaku sama, cuma beda cara pasangnya).
  wrap.querySelectorAll('.pw-bulk-sloc').forEach((el) => {
    el.addEventListener('input', () => {
      const start = el.selectionStart, end = el.selectionEnd;
      el.value = el.value.toUpperCase();
      if (start !== null && end !== null) el.setSelectionRange(start, end);
    });
  });
}

// Isi Lokasi/S.Loc baris pertama ke SEMUA baris di bawahnya — cuma buat
// mempercepat kasus yang paling sering (barang-barang yang dipilih bareng
// memang ditaruh di bin yang sama); tiap baris tetap BOLEH diedit ulang
// sendiri-sendiri sebelum Simpan kalau memang beda.
function samakanPwBulkLokasi() {
  const rows = document.querySelectorAll('#pwBulkModalList .pw-bulk-item');
  if (rows.length < 2) return;
  const firstLokasi = rows[0].querySelector('.pw-bulk-lokasi').value.trim();
  const firstSloc = rows[0].querySelector('.pw-bulk-sloc').value.trim();
  rows.forEach((row, i) => {
    if (i === 0) return;
    row.querySelector('.pw-bulk-lokasi').value = firstLokasi;
    row.querySelector('.pw-bulk-sloc').value = firstSloc;
  });
}

async function handlePwBulkSubmit() {
  const items = getPwSelectedItems();
  const user = document.getElementById('pwBulkModalUser').value.trim();
  if (!user) {
    showToast('Nama User wajib diisi.', 'error');
    return;
  }
  const rows = [...document.querySelectorAll('#pwBulkModalList .pw-bulk-item')];
  const payloadItems = [];
  for (let i = 0; i < rows.length; i++) {
    const lokasi = rows[i].querySelector('.pw-bulk-lokasi').value.trim();
    const sloc = rows[i].querySelector('.pw-bulk-sloc').value.trim().toUpperCase();
    const it = items[i];
    if (!lokasi || !sloc) {
      showToast('Lokasi & S.Loc wajib diisi untuk semua item (' + it.kode + ' belum lengkap).', 'error');
      return;
    }
    payloadItems.push({ kode: it.kode, namaBarang: it.namaBarang, satuan: it.satuan, lokasi, sloc, plant: it.plant || '' });
  }

  const btn = document.getElementById('btnPwBulkSubmit');
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';
  try {
    const res = await Api.savePutawayBatch({ items: payloadItems, user, clientRequestId: pwBulkRequestId });
    showToast((res.count || payloadItems.length) + ' item berhasil di-put away.', 'success');
    pwBulkRequestId = generateClientRequestId();
    pwSelected = new Set();
    closePwBulkModal();
    await loadBelumTerMapping();
    dashboardLoadedOnce = false;
  } catch (err) {
    showToast('Gagal menyimpan: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Simpan Semua';
  }
}

function wirePwBulkModal() {
  document.getElementById('pwSelectAll').addEventListener('change', (e) => toggleAllPwSelection(e.target.checked));
  document.getElementById('btnPwBulkPrint').addEventListener('click', handlePwBulkPrint);
  document.getElementById('btnPwBulkPutaway').addEventListener('click', openPwBulkModal);
  document.getElementById('btnClosePwBulkModal').addEventListener('click', closePwBulkModal);
  document.getElementById('pwBulkModalBackdrop').addEventListener('click', closePwBulkModal);
  document.getElementById('btnPwBulkSamakan').addEventListener('click', samakanPwBulkLokasi);
  document.getElementById('btnPwBulkSubmit').addEventListener('click', handlePwBulkSubmit);
}

function initPutawayPage() {
  Auth.prefillUserField('pwUser'); // identitas selalu dari akun yang login (lihat js/auth.js)

  if (!pwInitialized) {
    pwInitialized = true;

    document.getElementById('btnScanPwLokasi').addEventListener('click', () => {
      openQrScanner(
        (value) => {
          document.getElementById('pwLokasi').value = value;
          showToast('Lokasi terbaca: ' + value, 'success');
        },
        (err) => showToast(err, 'error')
      );
    });

    document.getElementById('pwKode').addEventListener('input', handlePwKodeInput);
    document.getElementById('formPutaway').addEventListener('submit', handlePwSubmit);
    wireUppercaseInput('pwSLoc'); // S.Loc dicatat huruf besar semua, sama seperti Penerimaan/Pemakaian
    wirePwBulkModal();
  }
  loadBelumTerMapping();
}

async function loadBelumTerMapping() {
  const wrap = document.getElementById('pwBelumMappingList');
  try {
    const res = await Api.getStockBalance({ filter: 'perlu-putaway' });
    pwBelumMapping = res.data || [];
    // Buang seleksi lama yang barangnya sudah nggak ada lagi di daftar
    // (mis. sudah keburu di-put away dari sesi/tab lain).
    const validKeys = new Set(pwBelumMapping.map(pwItemKey));
    pwSelected = new Set([...pwSelected].filter((k) => validKeys.has(k)));
    renderPwBelumMappingList();
    updatePwDatalist();
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state">Gagal memuat: ${escapeHtml(err.message)}</div>`;
  }
}

function renderPwBelumMappingList() {
  const wrap = document.getElementById('pwBelumMappingList');
  document.getElementById('pwBelumMappingCount').textContent = pwBelumMapping.length + ' Item';
  if (!pwBelumMapping.length) {
    wrap.innerHTML = '<div class="empty-state">Semua barang yang diterima sudah di-put away ke bin.</div>';
    updatePwBulkBar();
    return;
  }
  wrap.innerHTML = pwBelumMapping.map((it) => {
    const meta = itemMetaLine(it);
    const key = pwItemKey(it);
    const checked = pwSelected.has(key);
    return `
      <div class="pw-item" data-action="pick" data-kode="${escapeHtml(it.kode)}" data-plant="${escapeHtml(it.plant || '')}">
        <label class="pw-item-check" data-action="select">
          <input type="checkbox" class="pw-select-checkbox" data-key="${escapeHtml(key)}" ${checked ? 'checked' : ''} aria-label="Pilih ${escapeHtml(it.kode)}">
        </label>
        <div class="pw-item-main">
          <div class="pw-item-title">${escapeHtml(it.kode)} — ${escapeHtml(it.namaBarang || '-')}</div>
          <div class="pw-item-sub">${escapeHtml(it.satuan || '-')}${it.belumAdaMaster ? ' · <span class="badge-belum-master">⚠ Belum terdaftar di Master Data</span>' : ''}</div>
          ${meta ? `<div class="item-meta-line">${meta}</div>` : ''}
        </div>
        <div class="pw-item-side">
          <button type="button" class="pw-print-btn" data-action="print" data-kode="${escapeHtml(it.kode)}" title="Cetak Label QR" aria-label="Cetak Label QR untuk ${escapeHtml(it.kode)}">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3.5" y="3.5" width="6" height="6" rx="1"/><rect x="14.5" y="3.5" width="6" height="6" rx="1"/><rect x="3.5" y="14.5" width="6" height="6" rx="1"/></svg>
          </button>
          <div class="pw-item-qty">${it.belumTerMapping}<span>${escapeHtml(it.satuan || '')}</span></div>
        </div>
      </div>
    `;
  }).join('');
  wrap.querySelectorAll('[data-action="pick"]').forEach((el) => {
    el.addEventListener('click', () => pickPwItem(el.dataset.kode, el.dataset.plant));
  });
  wrap.querySelectorAll('.pw-print-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = findPwItem(btn.dataset.kode);
      if (item) goToQrLabelsForItems([{ kode: item.kode, namaBarang: item.namaBarang, plant: item.plant || '', satuan: item.satuan || '' }]);
    });
  });
  wrap.querySelectorAll('.pw-item-check').forEach((el) => {
    el.addEventListener('click', (e) => e.stopPropagation()); // jangan ikut trigger "pick" baris
  });
  wrap.querySelectorAll('.pw-select-checkbox').forEach((cb) => {
    cb.addEventListener('click', (e) => e.stopPropagation());
    cb.addEventListener('change', (e) => togglePwSelection(e.target.dataset.key, e.target.checked));
  });
  updatePwBulkBar();
}

function updatePwDatalist() {
  const listEl = document.getElementById('listBelumMapping');
  if (!listEl) return;
  listEl.innerHTML = pwBelumMapping
    .map((it) => `<option value="${escapeHtml(it.kode)}">${escapeHtml(it.namaBarang || '')}</option>`)
    .join('');
}

// Semua baris pwBelumMapping yang kode-nya cocok (bisa lebih dari 1 kalau
// kode itu multi-Plant — lihat komentar pwSelectedPlant di atas).
function findPwItemMatches(kode) {
  const norm = kode.trim().toLowerCase();
  return pwBelumMapping.filter((it) => String(it.kode).toLowerCase() === norm);
}

// Cari SATU baris spesifik: kalau plant dikasih, cocokkan persis; kalau tidak
// & cuma ada 1 match, itu yang dipakai; kalau ambigu (>1 match, plant kosong),
// return undefined — pemanggil (handlePwSubmit) yang WAJIB minta plant dulu.
function findPwItem(kode, plant) {
  const matches = findPwItemMatches(kode);
  if (matches.length <= 1) return matches[0];
  if (plant) return matches.find((it) => String(it.plant || '') === plant);
  return undefined;
}

function pickPwItem(kode, plant) {
  const matches = findPwItemMatches(kode);
  const hint = document.getElementById('pwNamaHint');
  const qtyInput = document.getElementById('pwQty');

  if (!matches.length) {
    hint.hidden = true;
    pwSelectedPlant = '';
    return;
  }

  let item = matches.length === 1 ? matches[0] : (plant ? matches.find((it) => String(it.plant || '') === plant) : undefined);

  if (!item && matches.length > 1) {
    // Multi-Plant & belum jelas Plant mana yang dimaksud — minta user pilih
    // dulu lewat dropdown kecil di area hint, JANGAN asal ambil salah satu.
    pwSelectedPlant = '';
    qtyInput.value = '';
    qtyInput.max = '';
    const options = matches.map((m) => `<option value="${escapeHtml(m.plant || '')}">Plant ${escapeHtml(m.plant || '-')} (sisa ${m.belumTerMapping} ${escapeHtml(m.satuan || '')})</option>`).join('');
    hint.innerHTML = `${escapeHtml(matches[0].namaBarang)} — kode ini ada di beberapa Plant, pilih dulu: ` +
      `<select id="pwPlantPicker" class="inline-plant-picker"><option value="" disabled selected>Pilih Plant</option>${options}</select>`;
    hint.hidden = false;
    const picker = document.getElementById('pwPlantPicker');
    if (picker) picker.addEventListener('change', (e) => pickPwItem(kode, e.target.value));
    return;
  }

  if (!item) {
    hint.hidden = true;
    pwSelectedPlant = '';
    return;
  }

  pwSelectedPlant = item.plant || '';
  document.getElementById('pwKode').value = item.kode;
  hint.textContent = `${item.namaBarang}${item.plant ? ' · Plant ' + item.plant : ''} — sisa belum ter-mapping: ${item.belumTerMapping} ${item.satuan || ''}`;
  hint.hidden = false;
  document.getElementById('pwSatuan').value = item.satuan || '';
  qtyInput.max = item.belumTerMapping;
  qtyInput.focus();
}

function handlePwKodeInput(e) {
  const matches = findPwItemMatches(e.target.value);
  if (!matches.length) {
    document.getElementById('pwNamaHint').hidden = true;
    pwSelectedPlant = '';
    return;
  }
  pickPwItem(e.target.value);
}

async function handlePwSubmit(e) {
  e.preventDefault();

  const kode = document.getElementById('pwKode').value.trim();
  const qty = Number(document.getElementById('pwQty').value) || 0;
  const lokasi = document.getElementById('pwLokasi').value.trim();
  const sloc = document.getElementById('pwSLoc').value.trim().toUpperCase();
  const user = document.getElementById('pwUser').value.trim();
  const matches = findPwItemMatches(kode);
  const item = findPwItem(kode, pwSelectedPlant);

  if (!matches.length) {
    showToast('Pilih item dari daftar "Belum Ter-mapping" (atau ketik kode yang sesuai).', 'error');
    return;
  }
  if (!item) {
    showToast('Kode ini ada di beberapa Plant — pilih dulu Plant yang sesuai lewat dropdown di bawah Kode Barang.', 'error');
    return;
  }
  if (!lokasi) {
    showToast('Lokasi/Bin wajib diisi (scan QR atau ketik manual).', 'error');
    return;
  }
  if (!sloc) {
    showToast('S.Loc wajib diisi.', 'error');
    return;
  }
  if (qty <= 0) {
    showToast('Qty harus lebih dari 0.', 'error');
    return;
  }
  if (!user) {
    showToast('Nama User wajib diisi.', 'error');
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Menyimpan...';

  try {
    await Api.savePutaway({
      kode: item.kode,
      namaBarang: item.namaBarang,
      satuan: item.satuan,
      qty,
      lokasi,
      sloc,
      user,
      plant: item.plant || '',
      clientRequestId: pwRequestId
    });
    showToast('Put away tersimpan.', 'success');
    resetPwItemFields();
    await loadBelumTerMapping(); // refresh sisa belum-ter-mapping
    dashboardLoadedOnce = false; // Stock Balance & Dashboard ikut ter-refresh
  } catch (err) {
    showToast('Gagal menyimpan: ' + err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Simpan Put Away';
  }
}

function resetPwItemFields() {
  pwRequestId = generateClientRequestId(); // transaksi baru -> ID baru
  document.getElementById('pwKode').value = '';
  document.getElementById('pwQty').value = '';
  document.getElementById('pwSatuan').value = '';
  document.getElementById('pwNamaHint').hidden = true;
  pwSelectedPlant = '';
  // Lokasi, S.Loc & User SENGAJA tidak direset — biasanya scan sekali lokasi
  // (S.Loc-nya biasanya juga sama), lalu taruh beberapa item berbeda ke bin
  // yang sama secara berurutan.
}
