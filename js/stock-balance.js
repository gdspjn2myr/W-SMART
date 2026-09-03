// ============================================================================
// STOCK BALANCE — "Mutasi Stock" (gaya laporan SAP): Beginning Balance,
// Receipt, Issued, Ending Balance per SKU untuk 1 rentang tanggal tertentu,
// dengan filter Periode (WAJIB), Plant, Storage Location & Material — lihat
// handleGetStockMutasi() di Code.gs untuk perhitungannya. BEDA dengan versi
// lama halaman ini yang cuma nunjukin stock REALTIME tanpa periode.
// ============================================================================

let sbInitialized = false;

const SB_KATEGORI_CLASS = { A: 'md-badge-a', B: 'md-badge-b', C: 'md-badge-c' };
const SB_JENIS_CLASS = { 'OBS': 'md-badge-jenis-obs', 'Fast Moving': 'md-badge-jenis-fm' };

function initStockBalancePage() {
  if (!sbInitialized) {
    sbInitialized = true;

    // Default periode: 1 bulan berjalan (dari tanggal 1 sampai hari ini) —
    // supaya halaman langsung ada isinya waktu pertama dibuka, user tinggal
    // ganti kalau mau periode lain. Tanggal tetap WAJIB diisi (lihat validasi
    // di applySbFilter), cuma sudah diisiin default yang masuk akal.
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    document.getElementById('sbTglMulai').valueAsDate = firstOfMonth;
    document.getElementById('sbTglAkhir').valueAsDate = today;

    document.getElementById('btnApplySbFilter').addEventListener('click', applySbFilter);
    document.getElementById('sbDetailToggle').addEventListener('change', (e) => {
      document.getElementById('sbTableWrap').classList.toggle('detail-off', !e.target.checked);
    });
    // Enter di salah satu field filter langsung apply, biar nggak wajib klik tombol.
    ['sbTglMulai', 'sbTglAkhir', 'sbPlant', 'sbStorage', 'sbMaterial'].forEach((id) => {
      document.getElementById(id).addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); applySbFilter(); }
      });
    });

    document.getElementById('sbTableWrap').classList.add('detail-off'); // default OFF
  }

  applySbFilter();
}

async function applySbFilter() {
  const tglMulai = document.getElementById('sbTglMulai').value;
  const tglAkhir = document.getElementById('sbTglAkhir').value;
  const body = document.getElementById('sbTableBody');

  if (!tglMulai || !tglAkhir) {
    showToast('Periode (tanggal dari & sampai) wajib diisi.', 'error');
    body.innerHTML = '<tr><td colspan="14" class="empty-state">Periode wajib diisi.</td></tr>';
    document.getElementById('sbCount').textContent = '0 SKU';
    document.getElementById('sbUpdatedAt').textContent = '';
    return;
  }
  if (tglMulai > tglAkhir) {
    showToast('Tanggal "Dari" tidak boleh lebih besar dari tanggal "Sampai".', 'error');
    return;
  }

  body.innerHTML = '<tr><td colspan="14" class="empty-state">Memuat...</td></tr>';

  const payload = {
    tanggalMulai: tglMulai,
    tanggalAkhir: tglAkhir,
    plant: document.getElementById('sbPlant').value.trim(),
    storage: document.getElementById('sbStorage').value.trim(),
    material: document.getElementById('sbMaterial').value.trim()
  };

  try {
    const res = await Api.getStockMutasi(payload);
    renderSbTable(res.items || []);
    document.getElementById('sbCount').textContent = (res.items || []).length + ' SKU';
    document.getElementById('sbUpdatedAt').textContent =
      `Periode ${escapeHtml(res.tanggalMulai)} s/d ${escapeHtml(res.tanggalAkhir)}`;
  } catch (err) {
    body.innerHTML = `<tr><td colspan="14" class="empty-state">Gagal memuat: ${escapeHtml(err.message)}</td></tr>`;
    document.getElementById('sbCount').textContent = '0 SKU';
    document.getElementById('sbUpdatedAt').textContent = '';
  }
}

function renderSbTable(items) {
  const body = document.getElementById('sbTableBody');
  if (!items.length) {
    body.innerHTML = '<tr><td colspan="14" class="empty-state">Tidak ada SKU yang cocok dengan filter ini.</td></tr>';
    return;
  }
  body.innerHTML = items.map((it) => {
    const kat = (it.kategori || 'B').toUpperCase();
    const katClass = SB_KATEGORI_CLASS[kat] || 'md-badge-b';
    const jenisHtml = it.jenis
      ? `<span class="md-badge-jenis ${SB_JENIS_CLASS[it.jenis] || ''}">${escapeHtml(it.jenis)}</span>`
      : '<span class="sb-jenis-kosong">-</span>';
    const plantTag = it.plant ? `<div class="sb-plant-tag">Plant ${escapeHtml(it.plant)}</div>` : '';

    return `
      <tr>
        <td>
          <div class="sb-kode-cell">${escapeHtml(it.kode)}</div>
          ${plantTag}
        </td>
        <td>${escapeHtml(it.namaBarang || '-')}</td>
        <td>${escapeHtml(it.satuan || '-')}</td>
        <td><span class="md-badge ${katClass}">${escapeHtml(kat)}</span></td>
        <td>${jenisHtml}</td>
        <td class="sb-num">${it.beginningBalance}</td>
        <td class="sb-num sb-num-in">${it.receipt > 0 ? '+' + it.receipt : it.receipt}</td>
        <td class="sb-num sb-num-out">${it.issued > 0 ? '-' + it.issued : it.issued}</td>
        <td class="sb-num sb-num-ending">${it.endingBalance}</td>
        <td class="sb-col-detail sb-num">${it.minStock}</td>
        <td class="sb-col-detail sb-num">${it.max}</td>
        <td class="sb-col-detail sb-num">${it.leadTime}</td>
        <td class="sb-col-detail sb-num">${it.rop}</td>
        <td class="sb-col-detail sb-num">${it.avgUsage}</td>
      </tr>
    `;
  }).join('');
}
