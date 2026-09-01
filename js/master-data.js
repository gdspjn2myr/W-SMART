// ============================================================================
// MASTER DATA — daftar SKU + setting Min-Max/ROP per item.
// Min Stock & Max Stock DIISI LANGSUNG (sudah ditentukan perusahaan) — bukan
// hasil hitungan. Yang dihitung otomatis cuma ROP (titik order/buffer), rumus
// (harus SAMA dengan hitungRop_ di Code.gs — di sini cuma dipakai untuk preview
// instan di form, angka final tetap dihitung ulang di server):
//   ROP = Min Stock + (Avg Usage x Lead Time)
// Kalau ROP hasil hitungan lebih besar dari Max Stock, berarti rentang Min-Max
// dari perusahaan kekecilan untuk pola pemakaian & lead time item ini — form
// akan kasih peringatan (lihat updateMdPreview).
// ============================================================================

let mdInitialized = false;
let mdItems = [];
let mdEditingKode = null; // null = mode tambah baru
let mdSearchText = '';

function initMasterDataPage() {
  if (!mdInitialized) {
    mdInitialized = true;

    document.getElementById('btnAddMasterItem').addEventListener('click', () => openMdModal(null));
    document.getElementById('btnCloseMdModal').addEventListener('click', closeMdModal);
    document.getElementById('mdModalBackdrop').addEventListener('click', closeMdModal);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !document.getElementById('mdModal').hidden) closeMdModal();
    });

    document.getElementById('mdSearch').addEventListener('input', (e) => {
      mdSearchText = e.target.value.trim().toLowerCase();
      renderMdList();
    });

    ['mdAvgUsage', 'mdLeadTime', 'mdMinStock', 'mdMaxStock'].forEach((id) => {
      document.getElementById(id).addEventListener('input', updateMdPreview);
    });

    document.getElementById('mdForm').addEventListener('submit', handleMdSubmit);

    document.getElementById('mdList').addEventListener('click', (e) => {
      const statusBtn = e.target.closest('[data-action="toggle-status"]');
      const editBtn = e.target.closest('[data-action="edit"]');
      if (statusBtn) {
        handleToggleStatus(statusBtn.dataset.kode);
      } else if (editBtn) {
        const item = mdItems.find((it) => it.kodeBarang === editBtn.dataset.kode);
        if (item) openMdModal(item);
      }
    });
  }

  loadMdList();
}

async function loadMdList() {
  const wrap = document.getElementById('mdList');
  try {
    const res = await Api.getMasterBarang();
    mdItems = res.data || [];
    renderMdList();
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state">Gagal memuat data: ${escapeHtml(err.message)}</div>`;
  }
}

function renderMdList() {
  const wrap = document.getElementById('mdList');
  let items = mdItems;
  if (mdSearchText) {
    items = items.filter((it) =>
      (it.kodeBarang || '').toLowerCase().includes(mdSearchText) ||
      (it.namaBarang || '').toLowerCase().includes(mdSearchText)
    );
  }

  if (!items.length) {
    wrap.innerHTML = mdItems.length
      ? '<div class="empty-state">Tidak ada item yang cocok dengan pencarian.</div>'
      : '<div class="empty-state">Belum ada data master barang. Klik "+ Tambah Item" untuk mulai.</div>';
    return;
  }

  wrap.innerHTML = items.map((it) => {
    const kat = (it.kategori || 'B').toUpperCase();
    const katClass = kat === 'A' ? 'md-badge-a' : kat === 'C' ? 'md-badge-c' : 'md-badge-b';
    const isAktif = it.status !== 'Nonaktif';
    const ropOverMax = it.max > 0 && it.rop > it.max;
    // Min & Max sama-sama 0 = belum pernah dilengkapi manual — kombinasi ini
    // yang dipakai buat nandain item hasil auto-daftar dari Barang Masuk (lihat
    // autoRegisterMasterBarang_ di Code.gs), bukan cuma item ROP > MAX.
    const belumLengkap = it.minStock === 0 && it.max === 0;
    const jenisClass = it.jenis === 'OBS' ? 'md-badge-jenis-obs' : it.jenis === 'Fast Moving' ? 'md-badge-jenis-fm' : '';
    return `
      <div class="md-item">
        <div class="md-item-main">
          <div class="md-item-title">
            <span class="md-badge ${katClass}">${escapeHtml(kat)}</span>
            ${escapeHtml(it.kodeBarang)} — ${escapeHtml(it.namaBarang)}
            ${it.jenis ? `<span class="md-badge-jenis ${jenisClass}">${escapeHtml(it.jenis)}</span>` : ''}
          </div>
          <div class="md-item-sub">
            ${escapeHtml(it.satuan || '-')}${it.lokasiDefault ? ' · ' + escapeHtml(it.lokasiDefault) : ''}${it.area ? ' · Area ' + escapeHtml(it.area) : ''}
            · Min ${it.minStock} · ROP ${it.rop} · MAX ${it.max}
            ${ropOverMax ? '<span class="md-rop-warning">⚠ ROP &gt; MAX</span>' : ''}
            ${!ropOverMax && belumLengkap ? '<span class="badge-belum-master">⚠ Kategori &amp; Min/Max belum diisi</span>' : ''}
          </div>
        </div>
        <div class="md-item-actions">
          <button type="button" class="status-pill ${isAktif ? 'status-aktif' : 'status-nonaktif'}"
            data-action="toggle-status" data-kode="${escapeHtml(it.kodeBarang)}">${isAktif ? 'Aktif' : 'Nonaktif'}</button>
          <button type="button" class="btn-icon" data-action="edit" data-kode="${escapeHtml(it.kodeBarang)}" title="Edit item" aria-label="Edit item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function openMdModal(item) {
  mdEditingKode = item ? item.kodeBarang : null;
  document.getElementById('mdModalTitle').textContent = item ? 'Edit Item' : 'Tambah Item';

  document.getElementById('mdKode').value = item ? item.kodeBarang : '';
  document.getElementById('mdKode').disabled = !!item; // kode barang jadi kunci, tidak diubah saat edit
  document.getElementById('mdNama').value = item ? item.namaBarang : '';
  document.getElementById('mdSatuan').value = item ? (item.satuan || '') : '';
  document.getElementById('mdKategori').value = item ? (item.kategori || 'B') : 'B';
  document.getElementById('mdLokasi').value = item ? (item.lokasiDefault || '') : '';
  document.getElementById('mdJenis').value = item ? (item.jenis || '') : '';
  document.getElementById('mdArea').value = item ? (item.area || '') : '';
  document.getElementById('mdAvgUsage').value = item ? item.avgUsage : 0;
  document.getElementById('mdLeadTime').value = item ? item.leadTime : 0;
  document.getElementById('mdMinStock').value = item ? item.minStock : 0;
  document.getElementById('mdMaxStock').value = item ? item.max : 0;
  updateMdPreview();

  document.getElementById('mdModalBackdrop').hidden = false;
  document.getElementById('mdModal').hidden = false;
  if (!item) document.getElementById('mdKode').focus();
}

function closeMdModal() {
  document.getElementById('mdModalBackdrop').hidden = true;
  document.getElementById('mdModal').hidden = true;
  document.getElementById('mdKode').disabled = false;
}

function updateMdPreview() {
  const avgUsage = Number(document.getElementById('mdAvgUsage').value) || 0;
  const leadTime = Number(document.getElementById('mdLeadTime').value) || 0;
  const minStock = Number(document.getElementById('mdMinStock').value) || 0;
  const maxStock = Number(document.getElementById('mdMaxStock').value) || 0;

  const rop = Math.round(minStock + avgUsage * leadTime);
  const buffer = rop - minStock;

  document.getElementById('mdPreviewRop').textContent = rop;
  document.getElementById('mdPreviewBuffer').textContent = buffer;

  const warningEl = document.getElementById('mdPreviewWarning');
  if (maxStock > 0 && rop > maxStock) {
    warningEl.textContent = `⚠ ROP (${rop}) melebihi Max Stock (${maxStock}). Rentang Min-Max dari perusahaan kemungkinan kekecilan untuk pemakaian & lead time item ini — pertimbangkan order lebih sering, percepat lead time, atau ajukan review Min-Max ke perusahaan.`;
    warningEl.hidden = false;
  } else {
    warningEl.hidden = true;
  }
}

async function handleMdSubmit(e) {
  e.preventDefault();

  const kode = document.getElementById('mdKode').value.trim();
  const nama = document.getElementById('mdNama').value.trim();
  if (!kode || !nama) {
    showToast('Kode Barang & Nama Barang wajib diisi.', 'error');
    return;
  }

  const minStock = Number(document.getElementById('mdMinStock').value) || 0;
  const maxStock = Number(document.getElementById('mdMaxStock').value) || 0;
  if (maxStock > 0 && maxStock < minStock) {
    showToast('Max Stock tidak boleh lebih kecil dari Min Stock.', 'error');
    return;
  }

  const payload = {
    kodeBarang: kode,
    namaBarang: nama,
    satuan: document.getElementById('mdSatuan').value.trim(),
    kategori: document.getElementById('mdKategori').value,
    lokasiDefault: document.getElementById('mdLokasi').value.trim(),
    jenis: document.getElementById('mdJenis').value,
    area: document.getElementById('mdArea').value.trim(),
    avgUsage: Number(document.getElementById('mdAvgUsage').value) || 0,
    leadTime: Number(document.getElementById('mdLeadTime').value) || 0,
    minStock: minStock,
    maxStock: maxStock,
    status: mdEditingKode
      ? (mdItems.find((it) => it.kodeBarang === mdEditingKode) || {}).status || 'Aktif'
      : 'Aktif'
  };

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Menyimpan...';

  try {
    const res = await Api.saveMasterBarang(payload);
    const idx = mdItems.findIndex((it) => it.kodeBarang === res.item.kodeBarang);
    if (idx === -1) mdItems.push(res.item); else mdItems[idx] = res.item;
    renderMdList();
    if (res.warning) {
      showToast(res.warning, 'error');
    } else {
      showToast('Item tersimpan.', 'success');
    }
    closeMdModal();
    masterDataLoaded = false; // supaya autocomplete di Penerimaan ikut ter-refresh
  } catch (err) {
    showToast('Gagal menyimpan: ' + err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Simpan Item';
  }
}

async function handleToggleStatus(kode) {
  const item = mdItems.find((it) => it.kodeBarang === kode);
  if (!item) return;
  const newStatus = item.status === 'Nonaktif' ? 'Aktif' : 'Nonaktif';
  try {
    await Api.toggleMasterBarangStatus({ kodeBarang: kode, status: newStatus });
    item.status = newStatus;
    renderMdList();
    showToast(newStatus === 'Aktif' ? 'Item diaktifkan.' : 'Item dinonaktifkan.', 'success');
    masterDataLoaded = false;
  } catch (err) {
    showToast('Gagal mengubah status: ' + err.message, 'error');
  }
}
