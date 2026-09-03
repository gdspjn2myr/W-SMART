// ============================================================================
// STOCK BALANCE — cek stock realtime per SKU (masuk PENERIMAAN dikurangi
// keluar PEMAKAIAN, dicocokkan Min/ROP/Max di Master Data). Beda dengan
// Reorder Alert di Dashboard yang cuma nampilin item bermasalah, di sini
// SEMUA SKU aktif kelihatan — bisa dicari per kode/nama/satuan.
// ============================================================================

let sbInitialized = false;
let sbSearchDebounce = null;

const SB_STATUS_CLASS = {
  'Stock Out': 'sb-badge-out',
  'Need Reorder': 'sb-badge-reorder',
  'Near ROP': 'sb-badge-near',
  'Over Max': 'sb-badge-over',
  'Normal': 'sb-badge-normal'
};

function initStockBalancePage() {
  if (!sbInitialized) {
    sbInitialized = true;
    document.getElementById('sbSearch').addEventListener('input', (e) => {
      clearTimeout(sbSearchDebounce);
      const val = e.target.value;
      sbSearchDebounce = setTimeout(() => loadStockBalance(val.trim()), 300);
    });
    document.getElementById('btnRefreshStockBalance').addEventListener('click', () => {
      loadStockBalance(document.getElementById('sbSearch').value.trim());
    });
  }
  loadStockBalance(document.getElementById('sbSearch').value.trim());
}

async function loadStockBalance(search) {
  const wrap = document.getElementById('sbList');
  try {
    const res = await Api.getStockBalance({ search: search || '' });
    renderSbList(res.data || []);
    document.getElementById('sbCount').textContent = (res.data || []).length + ' SKU';
    document.getElementById('sbUpdatedAt').textContent = res.updatedAt ? 'Update ' + res.updatedAt : '';
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state">Gagal memuat stock: ${escapeHtml(err.message)}</div>`;
  }
}

function renderSbList(items) {
  const wrap = document.getElementById('sbList');
  if (!items.length) {
    wrap.innerHTML = '<div class="empty-state">Tidak ada SKU aktif yang cocok.</div>';
    return;
  }
  wrap.innerHTML = items.map((it) => {
    const kat = (it.kategori || 'B').toUpperCase();
    const katClass = kat === 'A' ? 'md-badge-a' : kat === 'C' ? 'md-badge-c' : 'md-badge-b';
    return `
      <div class="sb-item">
        <div class="sb-item-main">
          <div class="sb-item-title">
            <span class="md-badge ${katClass}">${escapeHtml(kat)}</span>
            ${escapeHtml(it.kode)} — ${escapeHtml(it.namaBarang || '-')}
          </div>
          <div class="sb-item-sub">
            ${escapeHtml(it.satuan || '-')}${it.lokasiDefault ? ' · ' + escapeHtml(it.lokasiDefault) : ''}
            ${it.belumAdaMaster ? '<span class="badge-belum-master">⚠ Belum terdaftar di Master Data</span>' : `· Min ${it.minStock} · ROP ${it.rop} · MAX ${it.max}`}
            ${it.belumTerMapping > 0 ? `<span class="sb-belum-mapping">⚠ ${it.belumTerMapping} belum ter-mapping</span>` : ''}
          </div>
        </div>
        <div class="sb-item-side">
          <div class="sb-onhand">${it.onHand}<span>${escapeHtml(it.satuan || 'pcs')}</span></div>
          <span class="sb-badge ${SB_STATUS_CLASS[it.status] || ''}">${escapeHtml(STATUS_LABEL[it.status] || it.status)}</span>
        </div>
      </div>
    `;
  }).join('');
}
