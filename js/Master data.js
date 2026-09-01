// ============================================================================
// MASTER DATA — daftar SKU + setting Min-Max/ROP per item.
// Rumus (harus SAMA dengan hitungRopMaxMin_ di Code.gs — di sini cuma dipakai
// untuk preview instan di form, angka final tetap dihitung ulang di server):
//   ROP = (Avg Usage x Lead Time) + Safety Stock
//   MAX = ROP + (Avg Usage x Extra Day)
//   Min Stock = Safety Stock
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

    ['mdAvgUsage', 'mdLeadTime', 'mdSafetyStock', 'mdExtraDay'].forEach((id) => {
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
    return `
      <div class="md-item">
        <div class="md-item-main">
          <div class="md-item-title">
            <span class="md-badge ${katClass}">${escapeHtml(kat)}</span>
            ${escapeHtml(it.kodeBarang)} — ${escapeHtml(it.namaBarang)}
          </div>
          <div class="md-item-sub">
            ${escapeHtml(it.satuan || '-')}${it.lokasiDefault ? ' · ' + escapeHtml(it.lokasiDefault) : ''}
            · ROP ${it.rop} · MAX ${it.max} · Min ${it.minStock}
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
  document.getElementById('mdAvgUsage').value = item ? item.avgUsage : 0;
  document.getElementById('mdLeadTime').value = item ? item.leadTime : 0;
  document.getElementById('mdSafetyStock').value = item ? item.safetyStock : 0;
  document.getElementById('mdExtraDay').value = item ? item.extraDay : 0;
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
  const safetyStock = Number(document.getElementById('mdSafetyStock').value) || 0;
  const extraDay = Number(document.getElementById('mdExtraDay').value) || 0;

  const rop = Math.round(avgUsage * leadTime + safetyStock);
  const max = Math.round(rop + avgUsage * extraDay);
  const minStock = Math.round(safetyStock);

  document.getElementById('mdPreviewRop').textContent = rop;
  document.getElementById('mdPreviewMax').textContent = max;
  document.getElementById('mdPreviewMin').textContent = minStock;
}

async function handleMdSubmit(e) {
  e.preventDefault();

  const kode = document.getElementById('mdKode').value.trim();
  const nama = document.getElementById('mdNama').value.trim();
  if (!kode || !nama) {
    showToast('Kode Barang & Nama Barang wajib diisi.', 'error');
    return;
  }

  const payload = {
    kodeBarang: kode,
    namaBarang: nama,
    satuan: document.getElementById('mdSatuan').value.trim(),
    kategori: document.getElementById('mdKategori').value,
    lokasiDefault: document.getElementById('mdLokasi').value.trim(),
    avgUsage: Number(document.getElementById('mdAvgUsage').value) || 0,
    leadTime: Number(document.getElementById('mdLeadTime').value) || 0,
    safetyStock: Number(document.getElementById('mdSafetyStock').value) || 0,
    extraDay: Number(document.getElementById('mdExtraDay').value) || 0,
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
    showToast('Item tersimpan.', 'success');
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
