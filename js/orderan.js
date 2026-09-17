// ============================================================================
// ORDERAN — daftar SEMUA barang yang sudah pernah dibuatkan PR dari halaman
// Alert Order, dari PR dibuat sampai barang datang (siklus procurement penuh:
// PR -> Release PR -> PO -> Release PO -> barang datang). Data-nya SATU
// SUMBER sama sheet PurchaseRequest yang sudah dipakai Alert Order/Lead Time
// Otomatis (lihat handleGetOrderanList di Code.gs) — halaman ini cuma
// nampilkan & kasih cara edit field manualnya, TIDAK bikin sheet baru.
//
// Kolom manual (No PR, Tanggal Release PR, No PO, Tanggal Release PO) diisi
// lewat modal Edit per baris (ikon pensil) -> handleUpdateOrderan. Kolom
// otomatis (Tanggal Datang, Qty Datang, Outstanding, Leadtime, Status) TIDAK
// bisa diedit di sini — itu kesinkron sendiri dari Barang Masuk begitu ada
// barang yang kode-nya cocok sama baris Orderan yang masih "Menunggu" (lihat
// syncOrderanFromPenerimaan_ di Code.gs, dipanggil dari handleSavePenerimaan).
// Qty Datang AKUMULATIF (mendukung barang yang datangnya bertahap/partial
// buat 1 PR yang sama) & baris baru jadi "Selesai" begitu Qty Datang sudah
// >= Qty Order.
// ============================================================================

let orInitialized = false;
let orData = [];
let orSearchText = '';
let orPlantSelected = '';
let orStatusSelected = '';
let orEditingNo = null;

function initOrderanPage() {
  if (!orInitialized) {
    orInitialized = true;
    document.getElementById('orSearch').addEventListener('input', (e) => {
      orSearchText = e.target.value.trim().toLowerCase();
      renderOrderanList();
    });
    document.getElementById('orPlantFilter').addEventListener('change', (e) => {
      orPlantSelected = e.target.value;
      renderOrderanList();
    });
    document.getElementById('orStatusFilter').addEventListener('change', (e) => {
      orStatusSelected = e.target.value;
      renderOrderanList();
    });
    wireRefreshButton('btnRefreshOrderan', loadOrderan);

    document.getElementById('orTbody').addEventListener('click', (e) => {
      const editBtn = e.target.closest('[data-action="edit"]');
      if (editBtn) openEditOrderanModal(editBtn.dataset.no);
    });

    document.getElementById('btnCloseOrderanEditModal').addEventListener('click', closeEditOrderanModal);
    document.getElementById('orderanEditModalBackdrop').addEventListener('click', closeEditOrderanModal);
    document.getElementById('orderanEditForm').addEventListener('submit', submitEditOrderan);
  }
  loadOrderan();
}

async function loadOrderan() {
  const tbody = document.getElementById('orTbody');
  try {
    const res = await Api.getOrderanList();
    orData = res.items || [];
    renderOrderanList();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="15" class="empty-state">Gagal memuat: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function orMatchesFilter_(it) {
  if (orPlantSelected && (it.plant || '') !== orPlantSelected) return false;
  if (orStatusSelected && it.status !== orStatusSelected) return false;
  if (orSearchText) {
    const hay = ((it.kode || '') + ' ' + (it.namaBarang || '') + ' ' + (it.noPR || '') + ' ' + (it.noPO || '')).toLowerCase();
    if (!hay.includes(orSearchText)) return false;
  }
  return true;
}

function orFormatQty_(n) {
  return (Number(n) || 0).toLocaleString('id-ID');
}

function orCell_(v) {
  return v ? escapeHtml(v) : '<span class="or-empty">—</span>';
}

function renderOrderanList() {
  const tbody = document.getElementById('orTbody');
  const filtered = orData.filter(orMatchesFilter_);
  document.getElementById('orCount').textContent = filtered.length + ' Item';

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="15" class="empty-state">Belum ada barang yang cocok dengan filter ini.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map((it) => {
    const statusBadge = it.status === 'Selesai'
      ? '<span class="rw-jenis-badge rw-badge-masuk">Selesai</span>'
      : '<span class="rw-jenis-badge rw-badge-koreksi">Menunggu</span>';
    const outstandingClass = it.outstanding > 0 ? ' vs-trend-down' : ' vs-trend-up';
    const leadTimeText = (it.leadTime === null || it.leadTime === undefined) ? '<span class="or-empty">—</span>' : it.leadTime + ' hari';

    return `
      <tr>
        <td>${escapeHtml(it.kode || '-')}</td>
        <td>${escapeHtml(it.namaBarang || '-')}</td>
        <td>${escapeHtml(it.plant || '-')}</td>
        <td class="sb-num">${orFormatQty_(it.qtyOrder)}<span class="or-satuan">${escapeHtml(it.satuan || '')}</span></td>
        <td>${orCell_(it.tanggalPR)}</td>
        <td>${orCell_(it.tanggalReleasePR)}</td>
        <td>${orCell_(it.noPR)}</td>
        <td>${orCell_(it.tanggalReleasePO)}</td>
        <td>${orCell_(it.noPO)}</td>
        <td>${orCell_(it.tanggalDatang)}</td>
        <td class="sb-num">${orFormatQty_(it.qtyDatang)}</td>
        <td class="sb-num${outstandingClass}">${orFormatQty_(it.outstanding)}</td>
        <td class="sb-num">${leadTimeText}</td>
        <td>${statusBadge}</td>
        <td>
          <button type="button" class="btn-icon" data-action="edit" data-no="${escapeHtml(String(it.no))}" title="Edit No PR/PO &amp; Tanggal Release" aria-label="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function openEditOrderanModal(no) {
  const it = orData.find((x) => String(x.no) === String(no));
  if (!it) return;
  orEditingNo = it.no;
  document.getElementById('orderanEditItemInfo').textContent = escapeHtml(it.kode || '-') + ' — ' + (it.namaBarang || '-');
  document.getElementById('orEditNoPR').value = it.noPR || '';
  document.getElementById('orEditTglReleasePR').value = it.tanggalReleasePR || '';
  document.getElementById('orEditNoPO').value = it.noPO || '';
  document.getElementById('orEditTglReleasePO').value = it.tanggalReleasePO || '';
  document.getElementById('orderanEditModalBackdrop').hidden = false;
  document.getElementById('orderanEditModal').hidden = false;
}

function closeEditOrderanModal() {
  orEditingNo = null;
  document.getElementById('orderanEditModalBackdrop').hidden = true;
  document.getElementById('orderanEditModal').hidden = true;
}

async function submitEditOrderan(e) {
  e.preventDefault();
  if (orEditingNo === null) return;
  const payload = {
    no: orEditingNo,
    noPR: document.getElementById('orEditNoPR').value.trim(),
    tanggalReleasePR: document.getElementById('orEditTglReleasePR').value,
    noPO: document.getElementById('orEditNoPO').value.trim(),
    tanggalReleasePO: document.getElementById('orEditTglReleasePO').value
  };
  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Menyimpan...';
  try {
    await Api.updateOrderan(payload);
    showToast('Orderan tersimpan.', 'success');
    closeEditOrderanModal();
    loadOrderan();
  } catch (err) {
    showToast('Gagal menyimpan: ' + err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Simpan';
  }
}
