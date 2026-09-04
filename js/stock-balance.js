// ============================================================================
// STOCK BALANCE — "Mutasi Stock" (gaya laporan SAP): Beginning Balance,
// Receipt, Issued, Ending Balance per SKU untuk 1 rentang tanggal tertentu,
// dengan filter Periode (WAJIB), Plant, Storage Location & Material — lihat
// handleGetStockMutasi() di Code.gs untuk perhitungannya. BEDA dengan versi
// lama halaman ini yang cuma nunjukin stock REALTIME tanpa periode.
// ============================================================================

let sbInitialized = false;
let sbCurrentPeriod = null; // { tanggalMulai, tanggalAkhir } dari filter yang lagi aktif — dipakai popup Riwayat Transaksi biar rentangnya SAMA dengan yang lagi ditampilkan di tabel

const SB_KATEGORI_CLASS = { A: 'md-badge-a', B: 'md-badge-b', C: 'md-badge-c' };
const SB_JENIS_CLASS = { 'OBS': 'md-badge-jenis-obs', 'Fast Moving': 'md-badge-jenis-fm' };
const SB_RIWAYAT_JENIS_CLASS = { 'Penerimaan': 'ra-badge-normal', 'Pemakaian': 'ra-badge-out', 'Koreksi Stock': 'ra-badge-near' };

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
    // Halaman ini sebenarnya SUDAH narik data ulang tiap kali dikunjungi (lihat
    // applySbFilter() di bawah initStockBalancePage), tapi tombol Refresh ini
    // tetap dikasih (konsisten sama pola di Riwayat Transaksi/Alert Order) buat
    // narik ulang data TERBARU tanpa perlu pindah halaman/reload, mis. abis
    // nambah Barang Masuk baru di tab lain sementara halaman ini masih kebuka.
    wireRefreshButton('btnRefreshStockBalance', applySbFilter);
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

    // Klik 1 baris SKU -> popup Riwayat Transaksi (lihat openSbRiwayatModal),
    // delegated ke tbody karena isinya di-render ulang tiap kali filter diganti.
    const sbTableBody = document.getElementById('sbTableBody');
    sbTableBody.addEventListener('click', (e) => {
      const row = e.target.closest('tr[data-kode]');
      if (row) openSbRiwayatModal(row.dataset.kode, row.dataset.plant || '', row.dataset.nama || '');
    });
    sbTableBody.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const row = e.target.closest('tr[data-kode]');
      if (row) { e.preventDefault(); openSbRiwayatModal(row.dataset.kode, row.dataset.plant || '', row.dataset.nama || ''); }
    });
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
    sbCurrentPeriod = { tanggalMulai: res.tanggalMulai, tanggalAkhir: res.tanggalAkhir };
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
      <tr class="sb-row-clickable" data-kode="${escapeHtml(it.kode)}" data-plant="${escapeHtml(it.plant || '')}" data-nama="${escapeHtml(it.namaBarang || '')}" tabindex="0">
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

// ---------------------------------------------------------------------------
// Popup Riwayat Transaksi 1 SKU — muncul waktu 1 baris di tabel Mutasi Stock
// diklik, isinya gabungan Penerimaan + Pemakaian + Koreksi Stock kode itu,
// dibatasi ke rentang tanggal yang LAGI DIPAKAI di filter tabel (sbCurrentPeriod)
// — lihat handleGetItemMutasiRiwayat di Code.gs.
// ---------------------------------------------------------------------------
async function openSbRiwayatModal(kode, plant, namaBarang) {
  const titleEl = document.getElementById('sbRiwayatModalTitle');
  const hintEl = document.getElementById('sbRiwayatModalHint');
  const bodyEl = document.getElementById('sbRiwayatModalBody');

  titleEl.textContent = namaBarang ? `${kode} — ${namaBarang}` : kode;
  hintEl.textContent = sbCurrentPeriod
    ? `Riwayat transaksi periode ${sbCurrentPeriod.tanggalMulai} s/d ${sbCurrentPeriod.tanggalAkhir}${plant ? ' · Plant ' + plant : ''}`
    : '';
  bodyEl.innerHTML = '<div class="empty-state">Memuat...</div>';
  document.getElementById('sbRiwayatModalBackdrop').hidden = false;
  document.getElementById('sbRiwayatModal').hidden = false;

  if (!sbCurrentPeriod) {
    bodyEl.innerHTML = '<div class="empty-state">Periode belum dipilih.</div>';
    return;
  }

  try {
    const res = await Api.getItemMutasiRiwayat({
      kode,
      plant,
      tanggalMulai: sbCurrentPeriod.tanggalMulai,
      tanggalAkhir: sbCurrentPeriod.tanggalAkhir
    });
    renderSbRiwayatModalBody(res.riwayat || []);
  } catch (err) {
    bodyEl.innerHTML = `<div class="empty-state">Gagal memuat: ${escapeHtml(err.message)}</div>`;
  }
}

function renderSbRiwayatModalBody(riwayat) {
  const body = document.getElementById('sbRiwayatModalBody');
  if (!riwayat.length) {
    body.innerHTML = '<div class="empty-state">Tidak ada transaksi di periode ini.</div>';
    return;
  }
  body.innerHTML = riwayat.map((r) => {
    const qtyText = r.qty > 0 ? `+${r.qty}` : String(r.qty);
    const qtyClass = r.qty > 0 ? 'sb-num-in' : (r.qty < 0 ? 'sb-num-out' : '');
    const meta = itemMetaLine(r);
    return `
      <div class="ra-item">
        <div class="ra-item-main">
          <div class="ra-item-title">${escapeHtml(r.tanggal)} <span class="${qtyClass}">${escapeHtml(qtyText)}</span></div>
          <div class="ra-item-sub">${escapeHtml(r.keterangan || '-')}${r.user ? ' · ' + escapeHtml(r.user) : ''}</div>
          ${meta ? `<div class="item-meta-line">${meta}</div>` : ''}
        </div>
        <span class="ra-badge ${SB_RIWAYAT_JENIS_CLASS[r.jenis] || ''}">${escapeHtml(r.jenis)}</span>
      </div>
    `;
  }).join('');
}

function closeSbRiwayatModal() {
  document.getElementById('sbRiwayatModalBackdrop').hidden = true;
  document.getElementById('sbRiwayatModal').hidden = true;
}
