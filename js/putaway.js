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

function initPutawayPage() {
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
  wrap.innerHTML = pwBelumMapping.map((it) => `
      <div class="pw-item" data-action="pick" data-kode="${escapeHtml(it.kode)}">
        <div class="pw-item-main">
          <div class="pw-item-title">${escapeHtml(it.kode)} — ${escapeHtml(it.namaBarang || '-')}</div>
          <div class="pw-item-sub">${escapeHtml(it.satuan || '-')}</div>
        </div>
        <div class="pw-item-qty">${it.belumTerMapping}<span>${escapeHtml(it.satuan || '')}</span></div>
      </div>
    `).join('');
  wrap.querySelectorAll('[data-action="pick"]').forEach((el) => {
    el.addEventListener('click', () => pickPwItem(el.dataset.kode));
  });
}

function updatePwDatalist() {
  const listEl = document.getElementById('listBelumMapping');
  if (!listEl) return;
  listEl.innerHTML = pwBelumMapping
    .map((it) => `<option value="${escapeHtml(it.kode)}">${escapeHtml(it.namaBarang || '')}</option>`)
    .join('');
}

function findPwItem(kode) {
  const norm = kode.trim().toLowerCase();
  return pwBelumMapping.find((it) => String(it.kode).toLowerCase() === norm);
}

function pickPwItem(kode) {
  const item = findPwItem(kode);
  if (!item) return;
  document.getElementById('pwKode').value = item.kode;
  const hint = document.getElementById('pwNamaHint');
  hint.textContent = `${item.namaBarang} — sisa belum ter-mapping: ${item.belumTerMapping} ${item.satuan || ''}`;
  hint.hidden = false;
  document.getElementById('pwSatuan').value = item.satuan || '';
  document.getElementById('pwQty').max = item.belumTerMapping;
  document.getElementById('pwQty').focus();
}

function handlePwKodeInput(e) {
  const item = findPwItem(e.target.value);
  if (item) pickPwItem(item.kode);
  else document.getElementById('pwNamaHint').hidden = true;
}

async function handlePwSubmit(e) {
  e.preventDefault();

  const kode = document.getElementById('pwKode').value.trim();
  const qty = Number(document.getElementById('pwQty').value) || 0;
  const lokasi = document.getElementById('pwLokasi').value.trim();
  const user = document.getElementById('pwUser').value.trim();
  const item = findPwItem(kode);

  if (!item) {
    showToast('Pilih item dari daftar "Belum Ter-mapping" (atau ketik kode yang sesuai).', 'error');
    return;
  }
  if (!lokasi) {
    showToast('Lokasi/Bin wajib diisi (scan QR atau ketik manual).', 'error');
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
      user
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
  // Lokasi & User SENGAJA tidak direset — biasanya scan sekali lokasi, lalu
  // taruh beberapa item berbeda ke bin yang sama secara berurutan.
}
