// ============================================================================
// RIWAYAT TRANSAKSI TERPADU — log gabungan SEMUA jenis transaksi (Barang Masuk,
// Put Away, Barang Keluar — nanti nyusul Koreksi Stock & Stock Opname) dalam
// satu daftar urut waktu, terbaru dulu. Dicatat otomatis di server tiap kali
// transaksi berhasil disimpan (lihat catatRiwayat_ di Code.gs) — halaman ini
// cuma nampilkan & filter, tidak menyimpan apa pun sendiri.
// ============================================================================

let rwInitialized = false;
let rwData = [];
let rwDebounceTimer = null;

const RW_JENIS_LABEL = {
  Penerimaan: 'Barang Masuk',
  Putaway: 'Put Away',
  Pemakaian: 'Barang Keluar',
  Koreksi: 'Koreksi Stock',
  Opname: 'Stock Opname',
  PR: 'Purchase Request'
};
const RW_JENIS_CLASS = {
  Penerimaan: 'rw-badge-masuk',
  Putaway: 'rw-badge-putaway',
  Pemakaian: 'rw-badge-keluar',
  Koreksi: 'rw-badge-koreksi',
  Opname: 'rw-badge-opname',
  PR: 'rw-badge-pr'
};
const RW_JENIS_SIGN = {
  Penerimaan: '+',
  Putaway: '',
  Pemakaian: '−', // minus
  Koreksi: '±', // plus-minus
  Opname: '±',
  PR: '' // PR cuma catatan "order dimulai", belum mengubah qty stock
};

function initRiwayatPage() {
  if (!rwInitialized) {
    rwInitialized = true;
    document.getElementById('rwSearch').addEventListener('input', () => {
      clearTimeout(rwDebounceTimer);
      rwDebounceTimer = setTimeout(loadRiwayat, 350);
    });
    document.getElementById('rwJenis').addEventListener('change', loadRiwayat);
    document.getElementById('btnRwFilter').addEventListener('click', loadRiwayat);
    document.getElementById('btnRwReset').addEventListener('click', resetRwFilter);
    document.getElementById('btnRefreshRiwayat').addEventListener('click', loadRiwayat);
  }
  loadRiwayat();
}

function resetRwFilter() {
  document.getElementById('rwSearch').value = '';
  document.getElementById('rwJenis').value = 'Semua';
  document.getElementById('rwDari').value = '';
  document.getElementById('rwSampai').value = '';
  loadRiwayat();
}

async function loadRiwayat() {
  const wrap = document.getElementById('rwList');
  const payload = {
    jenis: document.getElementById('rwJenis').value,
    search: document.getElementById('rwSearch').value.trim(),
    tanggalDari: document.getElementById('rwDari').value,
    tanggalSampai: document.getElementById('rwSampai').value
  };
  try {
    const res = await Api.getRiwayatTerpadu(payload);
    rwData = res.data || [];
    renderRiwayatList();
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state">Gagal memuat: ${escapeHtml(err.message)}</div>`;
  }
}

function renderRiwayatList() {
  const wrap = document.getElementById('rwList');
  document.getElementById('rwCount').textContent = rwData.length + ' Transaksi';
  if (!rwData.length) {
    wrap.innerHTML = '<div class="empty-state">Belum ada transaksi yang cocok dengan filter ini.</div>';
    return;
  }
  wrap.innerHTML = rwData.map((it) => {
    const meta = itemMetaLine(it);
    return `
      <div class="rw-item">
        <div class="rw-item-main">
          <div class="rw-item-title">
            <span class="rw-jenis-badge ${RW_JENIS_CLASS[it.jenis] || ''}">${escapeHtml(RW_JENIS_LABEL[it.jenis] || it.jenis || '-')}</span>
            ${escapeHtml(it.kode || '-')} — ${escapeHtml(it.namaBarang || '-')}
          </div>
          <div class="rw-item-sub">
            ${escapeHtml(it.waktu || '-')} · ${escapeHtml(it.user || '-')}${it.lokasi ? ' · ' + escapeHtml(it.lokasi) : ''}${it.keterangan ? ' · ' + escapeHtml(it.keterangan) : ''}
          </div>
          ${meta ? `<div class="item-meta-line">${meta}</div>` : ''}
        </div>
        <div class="rw-item-side">
          <div class="rw-qty">${RW_JENIS_SIGN[it.jenis] || ''}${it.qty}<span>${escapeHtml(it.satuan || '')}</span></div>
        </div>
      </div>
    `;
  }).join('');
}
