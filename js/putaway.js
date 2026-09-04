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
  }
  loadBelumTerMapping();
}

async function loadBelumTerMapping() {
  const wrap = document.getElementById('pwBelumMappingList');
  try {
    const res = await Api.getStockBalance({ filter: 'perlu-putaway' });
    pwBelumMapping = res.data || [];
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
    return;
  }
  wrap.innerHTML = pwBelumMapping.map((it) => {
    const meta = itemMetaLine(it);
    return `
      <div class="pw-item" data-action="pick" data-kode="${escapeHtml(it.kode)}" data-plant="${escapeHtml(it.plant || '')}">
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
      if (item) goToQrLabelsForItems([{ kode: item.kode, namaBarang: item.namaBarang }]);
    });
  });
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
      plant: item.plant || ''
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
  document.getElementById('pwKode').value = '';
  document.getElementById('pwQty').value = '';
  document.getElementById('pwSatuan').value = '';
  document.getElementById('pwNamaHint').hidden = true;
  pwSelectedPlant = '';
  // Lokasi, S.Loc & User SENGAJA tidak direset — biasanya scan sekali lokasi
  // (S.Loc-nya biasanya juga sama), lalu taruh beberapa item berbeda ke bin
  // yang sama secara berurutan.
}
