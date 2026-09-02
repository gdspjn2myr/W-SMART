// ============================================================================
// STOCK OPNAME (CYCLE COUNT) — cari/scan Kode Barang ATAU Kode Lokasi/Bin buat
// lihat data referensi lengkap (qty tercatat sistem + riwayat kedatangan:
// kapan, dari vendor mana, No PO — lihat handleGetOpnameItemDetail di Code.gs)
// sebelum menghitung fisik. Scan di sini SENGAJA cuma buat lihat info — qty
// hasil hitung fisik selalu diisi manual & ditambahkan ke sesi lewat aksi
// terpisah (tombol "+ Tambah ke Sesi Opname"), baru semuanya disimpan sekaligus
// lewat "Simpan Hasil Opname". Ini cuma LOG/catatan selisih, BELUM otomatis
// mengoreksi stock (lihat catatan di HEADER_STOCK_OPNAME, Code.gs).
// ============================================================================

let opInitialized = false;
let opMode = 'barang'; // 'barang' | 'bin'
let opContextLokasi = ''; // keisi kalau item dibuka dari hasil scan Bin (prefill Lokasi di form hitung)
let opSesiItems = [];

const OP_STATUS_LABEL = {
  'Stock Out': 'Stock Out', 'Need Reorder': 'Need Reorder', 'Near ROP': 'Near ROP',
  'Normal': 'Normal', 'Over Max': 'Over Max', 'Belum Terdaftar': 'Belum Terdaftar'
};
const OP_STATUS_CLASS = {
  'Stock Out': 'ra-badge-out', 'Need Reorder': 'ra-badge-reorder', 'Near ROP': 'ra-badge-near',
  'Normal': 'ra-badge-normal', 'Over Max': 'ra-badge-overmax', 'Belum Terdaftar': 'ra-badge-unregistered'
};

function initOpnamePage() {
  loadMasterData(); // supaya datalist #listMasterBarang keisi (dipakai bareng Penerimaan/Pemakaian/Put Away)

  if (opInitialized) return;
  opInitialized = true;

  document.getElementById('btnOpModeBarang').addEventListener('click', () => setOpMode('barang'));
  document.getElementById('btnOpModeBin').addEventListener('click', () => setOpMode('bin'));

  document.getElementById('btnOpCariBarang').addEventListener('click', handleCariBarang);
  document.getElementById('opKodeBarang').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleCariBarang(); }
  });

  document.getElementById('btnOpCariBin').addEventListener('click', handleCariBin);
  document.getElementById('opKodeBin').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleCariBin(); }
  });

  document.getElementById('btnScanOpBarang').addEventListener('click', () => {
    openQrScanner(
      (value) => {
        document.getElementById('opKodeBarang').value = value;
        showToast('Kode Barang terbaca: ' + value, 'success');
        handleCariBarang();
      },
      (err) => showToast(err, 'error')
    );
  });
  document.getElementById('btnScanOpBin').addEventListener('click', () => {
    openQrScanner(
      (value) => {
        document.getElementById('opKodeBin').value = value;
        showToast('Kode Lokasi/Bin terbaca: ' + value, 'success');
        handleCariBin();
      },
      (err) => showToast(err, 'error')
    );
  });

  document.getElementById('btnSimpanOpname').addEventListener('click', handleSimpanOpname);

  renderOpSesiList();
}

function setOpMode(mode) {
  opMode = mode;
  document.getElementById('btnOpModeBarang').classList.toggle('active', mode === 'barang');
  document.getElementById('btnOpModeBin').classList.toggle('active', mode === 'bin');
  document.getElementById('opPanelBarang').hidden = mode !== 'barang';
  document.getElementById('opPanelBin').hidden = mode !== 'bin';
}

// ---------------------------------------------------------------------------
// CARI / TAMPILKAN DETAIL
// ---------------------------------------------------------------------------

async function handleCariBarang() {
  const kode = document.getElementById('opKodeBarang').value.trim();
  if (!kode) { showToast('Isi atau scan Kode Barang dulu.', 'error'); return; }

  document.getElementById('opBinResultCard').hidden = true;
  const btn = document.getElementById('btnOpCariBarang');
  btn.disabled = true;
  try {
    const res = await Api.getOpnameItemDetail({ kode });
    renderOpDetailCard(res.item, res.riwayatKedatangan || []);
  } catch (err) {
    showToast(err.message, 'error');
    document.getElementById('opDetailCard').hidden = true;
  } finally {
    btn.disabled = false;
  }
}

async function handleCariBin() {
  const lokasi = document.getElementById('opKodeBin').value.trim();
  if (!lokasi) { showToast('Isi atau scan Kode Lokasi/Bin dulu.', 'error'); return; }

  document.getElementById('opDetailCard').hidden = true;
  const btn = document.getElementById('btnOpCariBin');
  btn.disabled = true;
  try {
    const res = await Api.getOpnameBinDetail({ lokasi });
    renderOpBinResult(res.lokasi, res.items || []);
  } catch (err) {
    showToast(err.message, 'error');
    document.getElementById('opBinResultCard').hidden = true;
  } finally {
    btn.disabled = false;
  }
}

function renderOpBinResult(lokasi, items) {
  document.getElementById('opBinResultLokasi').textContent = lokasi;
  const wrap = document.getElementById('opBinResultList');
  wrap.innerHTML = items.map((it) => `
      <button type="button" class="op-bin-item" data-kode="${escapeHtml(it.kode)}">
        <div>
          <div class="op-item-title">${escapeHtml(it.kode)} — ${escapeHtml(it.namaBarang || '-')}</div>
          <div class="op-item-sub">Klik untuk lihat detail & catat hasil hitung</div>
        </div>
        <div class="op-bin-item-qty">${it.qtyDiBin}<span> ${escapeHtml(it.satuan || '')}</span></div>
      </button>
    `).join('');
  wrap.querySelectorAll('.op-bin-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      opContextLokasi = lokasi;
      document.getElementById('opKodeBarang').value = btn.dataset.kode;
      setOpMode('barang');
      handleCariBarang();
    });
  });
  document.getElementById('opBinResultCard').hidden = false;
}

function renderOpDetailCard(item, riwayatKedatangan) {
  const card = document.getElementById('opDetailCard');
  const statusClass = OP_STATUS_CLASS[item.status] || 'ra-badge-unregistered';
  const statusLabel = OP_STATUS_LABEL[item.status] || (item.belumAdaMaster ? 'Belum Terdaftar' : item.status || '-');

  const binsHtml = (item.bins && item.bins.length)
    ? `<div class="op-section-title">Breakdown per Bin</div>
       <div class="op-riwayat-list">${item.bins.map((b) => `
          <div class="op-riwayat-item"><div class="op-riwayat-main">${escapeHtml(b.lokasi)}</div><div class="op-riwayat-qty">${b.qty} ${escapeHtml(item.satuan || '')}</div></div>
        `).join('')}</div>`
    : '';

  const riwayatHtml = riwayatKedatangan.length
    ? riwayatKedatangan.map((r) => `
        <div class="op-riwayat-item">
          <div class="op-riwayat-main">
            <strong>${escapeHtml(r.kedatangan || '-')}</strong> · No PO ${escapeHtml(r.noPO || '-')} · Vendor ${escapeHtml(r.vendor || '-')}
          </div>
          <div class="op-riwayat-qty">+${r.qty} ${escapeHtml(r.satuan || '')}</div>
        </div>
      `).join('')
    : '<div class="empty-state">Belum ada riwayat Penerimaan tercatat untuk item ini.</div>';

  card.innerHTML = `
    <div class="card-header">
      <span class="md-badge ${item.kategori === 'A' ? 'md-badge-a' : item.kategori === 'C' ? 'md-badge-c' : 'md-badge-b'}">${escapeHtml((item.kategori || '-').toUpperCase())}</span>
      ${escapeHtml(item.kode)} — ${escapeHtml(item.namaBarang || '-')}
    </div>
    ${item.belumAdaMaster ? '<span class="badge-belum-master">⚠ Belum terdaftar di Master Data — data ROP/Min/Max belum ada</span>' : ''}
    <div class="op-detail-stats">
      <div><span>Qty Sistem (Tercatat)</span><strong>${item.onHand} ${escapeHtml(item.satuan || '')}</strong></div>
      <div><span>Lokasi Default</span><strong>${escapeHtml(item.lokasiDefault || '-')}</strong></div>
      <div><span>Status</span><strong><span class="ra-badge ${statusClass}">${escapeHtml(statusLabel)}</span></strong></div>
    </div>
    ${binsHtml}
    <div class="op-section-title">Riwayat Kedatangan Terakhir</div>
    <div class="op-riwayat-list">${riwayatHtml}</div>

    <div class="op-count-form">
      <div class="form-row-pair">
        <div class="form-row">
          <label>Qty Hasil Hitung Fisik *</label>
          <input type="number" id="opQtyFisik" min="0" step="1" placeholder="Hasil hitung di lapangan">
        </div>
        <div class="form-row">
          <label>Lokasi (opsional)</label>
          <input type="text" id="opDetailLokasi" value="${escapeHtml(opContextLokasi || item.lokasiDefault || '')}" placeholder="Bin tempat dihitung">
        </div>
      </div>
      <div class="form-row">
        <label>Catatan (opsional)</label>
        <input type="text" id="opCatatan" placeholder="Mis. barang rusak, salah taruh bin, dst.">
      </div>
      <button type="button" id="btnTambahSesiOpname" class="btn btn-primary btn-block">+ Tambah ke Sesi Opname</button>
    </div>
  `;
  card.hidden = false;
  card.dataset.kode = item.kode;
  card.dataset.namaBarang = item.namaBarang || '';
  card.dataset.satuan = item.satuan || '';
  card.dataset.qtySistem = item.onHand;

  document.getElementById('btnTambahSesiOpname').addEventListener('click', addToSesi);
  document.getElementById('opQtyFisik').focus();
}

// ---------------------------------------------------------------------------
// SESI OPNAME (di memori dulu — baru disimpan semua sekaligus)
// ---------------------------------------------------------------------------

function addToSesi() {
  const card = document.getElementById('opDetailCard');
  const qtyFisikInput = document.getElementById('opQtyFisik');
  const qtyFisik = qtyFisikInput.value.trim();

  if (qtyFisik === '' || isNaN(Number(qtyFisik)) || Number(qtyFisik) < 0) {
    showToast('Isi Qty Hasil Hitung Fisik dengan angka (boleh 0) dulu.', 'error');
    qtyFisikInput.focus();
    return;
  }

  const qtySistem = Number(card.dataset.qtySistem) || 0;
  const item = {
    kode: card.dataset.kode,
    namaBarang: card.dataset.namaBarang,
    satuan: card.dataset.satuan,
    lokasi: document.getElementById('opDetailLokasi').value.trim(),
    catatan: document.getElementById('opCatatan').value.trim(),
    qtySistem: qtySistem,
    qtyFisik: Number(qtyFisik),
    selisih: Number(qtyFisik) - qtySistem
  };

  // Kalau kode yang sama sudah ada di sesi ini, timpa (bukan dobel) — biasanya
  // berarti user hitung ulang/koreksi input sebelum sempat disimpan.
  const idx = opSesiItems.findIndex((it) => it.kode === item.kode);
  if (idx !== -1) opSesiItems[idx] = item; else opSesiItems.push(item);

  renderOpSesiList();
  showToast(`${item.kode} ditambahkan ke sesi (selisih ${item.selisih > 0 ? '+' : ''}${item.selisih}).`, 'success');

  // Reset buat scan/cari item berikutnya.
  card.hidden = true;
  opContextLokasi = '';
  document.getElementById('opKodeBarang').value = '';
  document.getElementById('opKodeBarang').focus();
}

function removeSesiItem(kode) {
  opSesiItems = opSesiItems.filter((it) => it.kode !== kode);
  renderOpSesiList();
}

function renderOpSesiList() {
  const wrap = document.getElementById('opSesiList');
  document.getElementById('opSesiCount').textContent = opSesiItems.length + ' Item';
  document.getElementById('btnSimpanOpname').disabled = opSesiItems.length === 0;

  if (!opSesiItems.length) {
    wrap.innerHTML = '<div class="empty-state">Belum ada item yang dicatat di sesi ini.</div>';
    return;
  }

  wrap.innerHTML = opSesiItems.map((it) => {
    const selisihClass = it.selisih === 0 ? 'op-selisih-zero' : it.selisih < 0 ? 'op-selisih-minus' : 'op-selisih-plus';
    const selisihText = it.selisih > 0 ? '+' + it.selisih : String(it.selisih);
    return `
      <div class="op-item">
        <div>
          <div class="op-item-title">${escapeHtml(it.kode)} — ${escapeHtml(it.namaBarang || '-')}</div>
          <div class="op-item-sub">Sistem ${it.qtySistem} → Fisik ${it.qtyFisik} ${escapeHtml(it.satuan || '')}${it.lokasi ? ' · ' + escapeHtml(it.lokasi) : ''}</div>
        </div>
        <div class="op-item-side">
          <span class="op-selisih-badge ${selisihClass}">Selisih ${selisihText}</span>
          <button type="button" class="op-item-remove" data-kode="${escapeHtml(it.kode)}" title="Hapus dari sesi" aria-label="Hapus dari sesi">×</button>
        </div>
      </div>
    `;
  }).join('');

  wrap.querySelectorAll('.op-item-remove').forEach((btn) => {
    btn.addEventListener('click', () => removeSesiItem(btn.dataset.kode));
  });
}

async function handleSimpanOpname() {
  if (!opSesiItems.length) return;
  const user = document.getElementById('opUser').value.trim();

  const btn = document.getElementById('btnSimpanOpname');
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';
  try {
    const res = await Api.saveStockOpname({ user, items: opSesiItems });
    showToast(`Hasil opname tersimpan (${res.jumlahItem} item, total selisih ${res.totalSelisih > 0 ? '+' : ''}${res.totalSelisih}).`, 'success');
    opSesiItems = [];
    renderOpSesiList();
  } catch (err) {
    showToast('Gagal menyimpan: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Simpan Hasil Opname';
  }
}
