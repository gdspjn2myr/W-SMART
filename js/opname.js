// ============================================================================
// STOCK OPNAME (CYCLE COUNT) — cari/scan Kode Barang ATAU Kode Lokasi/Bin buat
// lihat data referensi lengkap (qty tercatat sistem + riwayat kedatangan:
// kapan, dari vendor mana, No PO — lihat handleGetOpnameItemDetail di Code.gs)
// sebelum menghitung fisik. Scan di sini SENGAJA cuma buat lihat info — qty
// hasil hitung fisik selalu diisi manual & ditambahkan ke sesi lewat aksi
// terpisah (tombol "+ Tambah ke Sesi Opname"), baru semuanya disimpan sekaligus
// lewat "Simpan Hasil Opname". Ini cuma LOG/catatan selisih, BELUM otomatis
// mengoreksi stock (lihat catatan di HEADER_STOCK_OPNAME, Code.gs).
//
// KOREKSI LANGSUNG — tiap item di Sesi yang selisihnya ≠ 0 dapat tombol
// "Koreksi Langsung" (lihat renderOpSesiList). Ini LANGSUNG memanggil
// Api.saveKoreksiStock (endpoint backend Koreksi Stock Manual — halaman
// standalone-nya sudah dihapus, fitur ini sekarang SATU-SATUNYA jalan ke sana)
// begitu Alasan diisi & dikonfirmasi — jadi stock beneran berubah saat itu
// juga, tanpa harus pindah halaman & cari ulang kode barangnya. Sesi Opname
// (log) TETAP jalan seperti biasa di atasnya — "Koreksi Langsung" cuma jalan
// pintas ke aksi yang sudah ada, bukan pengganti "Simpan Hasil Opname". Kalau
// Lokasi diisi saat menghitung, koreksinya per-bin; kalau kosong, koreksi
// total semua lokasi. Plant SELALU ikut terkirim (dari card.dataset.plant,
// hasil resolveBalanceKodePlant_ di server) — lihat opItemKey.
// ============================================================================

let opInitialized = false;
let opMode = 'barang'; // 'barang' | 'bin'
let opContextLokasi = ''; // keisi kalau item dibuka dari hasil scan Bin (prefill Lokasi di form hitung)
let opCurrentItemBins = []; // breakdown per-bin item yang lagi dibuka (buat baseline selisih per-bin)
let opSesiItems = [];

// Bikin id DOM yang aman dari Kode Barang + Plant (buat input Alasan per-item
// di Sesi Opname, karena bisa lebih dari satu item expanded form koreksinya —
// TERMASUK kode yang sama tapi Plant beda, lihat opItemKey).
function opSafeId(kode, plant) {
  return String(kode + '_' + (plant || '')).replace(/[^a-zA-Z0-9_-]/g, '_');
}

// Identitas 1 baris di Sesi Opname: Kode Barang SENDIRIAN tidak cukup kalau
// kode itu multi-Plant (lihat resolveBalanceKodePlant_ di Code.gs) — kode yang
// sama di Plant 1111 & 1112 itu 2 pool stock yang benar2 independen, jadi
// harus bisa jadi 2 baris terpisah di satu sesi opname yang sama.
function opItemKey(it) {
  return it.kode + '|' + (it.plant || '');
}

// Qty sisa di 1 lokasi tertentu, dari breakdown 'bins' item yang lagi dibuka
// di #opDetailCard — dipakai buat baseline selisih waktu Lokasi diisi.
function opFindBinQty(lokasi) {
  const entry = opCurrentItemBins.find((b) => b.lokasi === lokasi);
  return entry ? entry.qty : 0;
}

const OP_STATUS_LABEL = {
  'Stock Out': 'Out of Stock', 'Need Reorder': 'Need Reorder', 'Near ROP': 'Near ROP',
  'Normal': 'Normal', 'Over Max': 'Over Max', 'Belum Terdaftar': 'Belum Terdaftar'
};
const OP_STATUS_CLASS = {
  'Stock Out': 'ra-badge-out', 'Need Reorder': 'ra-badge-reorder', 'Near ROP': 'ra-badge-near',
  'Normal': 'ra-badge-normal', 'Over Max': 'ra-badge-overmax', 'Belum Terdaftar': 'ra-badge-unregistered'
};

function initOpnamePage() {
  loadMasterData(); // supaya datalist #listMasterBarang keisi (dipakai bareng Penerimaan/Pemakaian/Put Away)
  Auth.prefillUserField('opUser'); // identitas selalu dari akun yang login (lihat js/auth.js)

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
  await fetchAndRenderOpnameItem(kode, '');
}

// Dipisah dari handleCariBarang supaya bisa dipanggil ulang dengan Plant yang
// sudah ditentukan (dari renderOpPlantPicker begitu user pilih, atau dari
// renderOpBinResult yang sudah tahu persis Plant-nya dari breakdown per-bin).
async function fetchAndRenderOpnameItem(kode, plant) {
  document.getElementById('opBinResultCard').hidden = true;
  const btn = document.getElementById('btnOpCariBarang');
  btn.disabled = true;
  try {
    const payload = { kode };
    if (plant) payload.plant = plant;
    const res = await Api.getOpnameItemDetail(payload);
    if (res.needsPlantSelection) {
      renderOpPlantPicker(res.kode || kode, res.options || []);
    } else {
      renderOpDetailCard(res.item, res.riwayatKedatangan || []);
    }
  } catch (err) {
    showToast(err.message, 'error');
    document.getElementById('opDetailCard').hidden = true;
  } finally {
    btn.disabled = false;
  }
}

// Kode yang terdaftar di lebih dari 1 Plant (lihat resolveBalanceKodePlant_ di
// Code.gs) — Plant = tempat kerja, jadi user WAJIB pilih dulu Plant mana yang
// mau di-opname sebelum data/qty sistemnya ditampilkan (tiap Plant pool stock-
// nya sepenuhnya independen).
function renderOpPlantPicker(kode, options) {
  const card = document.getElementById('opDetailCard');
  card.innerHTML = `
    <div class="card-header">${escapeHtml(kode)} — Pilih Plant</div>
    <p class="md-preview-hint">Kode ini terdaftar di lebih dari 1 Plant. Pilih tempat kerja yang mau di-opname:</p>
    <div class="op-riwayat-list">
      ${options.map((o) => `
        <button type="button" class="op-bin-item" data-plant="${escapeHtml(o.plant || '')}">
          <div>
            <div class="op-item-title">Plant ${escapeHtml(o.plant || '-')}</div>
            <div class="op-item-sub">${escapeHtml(o.namaBarang || '')}</div>
          </div>
          <div class="op-bin-item-qty">${o.onHand}</div>
        </button>
      `).join('')}
    </div>
  `;
  card.hidden = false;
  card.querySelectorAll('.op-bin-item').forEach((btn) => {
    btn.addEventListener('click', () => fetchAndRenderOpnameItem(kode, btn.dataset.plant));
  });
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
      <button type="button" class="op-bin-item" data-kode="${escapeHtml(it.kode)}" data-plant="${escapeHtml(it.plant || '')}">
        <div>
          <div class="op-item-title">${escapeHtml(it.kode)} — ${escapeHtml(it.namaBarang || '-')}${it.plant ? ' <span class="sb-plant-tag">Plant ' + escapeHtml(it.plant) + '</span>' : ''}</div>
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
      // Plant sudah pasti tahu dari breakdown per-bin ini (lihat
      // handleGetOpnameBinDetail di Code.gs) — langsung fetch tanpa perlu
      // munculin plant-picker lagi.
      fetchAndRenderOpnameItem(btn.dataset.kode, btn.dataset.plant);
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
      ${escapeHtml(item.kode)} — ${escapeHtml(item.namaBarang || '-')}${item.plant ? ' <span class="sb-plant-tag">Plant ' + escapeHtml(item.plant) + '</span>' : ''}
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
  card.dataset.plant = item.plant || '';
  opCurrentItemBins = item.bins || [];

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

  const lokasi = document.getElementById('opDetailLokasi').value.trim();
  // Kalau lagi menghitung 1 bin spesifik, baseline selisihnya qty di bin itu
  // saja (bukan onHand total) — biar akurat & konsisten sama logic per-bin di
  // handleSaveKoreksiStock (Code.gs). Kalau Lokasi dikosongkan, tetap pakai
  // onHand total seperti sebelumnya.
  const qtySistemTotal = Number(card.dataset.qtySistem) || 0;
  const qtySistem = lokasi ? opFindBinQty(lokasi) : qtySistemTotal;
  const item = {
    kode: card.dataset.kode,
    namaBarang: card.dataset.namaBarang,
    satuan: card.dataset.satuan,
    plant: card.dataset.plant || '',
    lokasi,
    catatan: document.getElementById('opCatatan').value.trim(),
    qtySistem: qtySistem,
    qtyFisik: Number(qtyFisik),
    selisih: Number(qtyFisik) - qtySistem,
    dikoreksi: false,
    koreksiExpanded: false
  };

  // Kalau kode + Plant yang sama sudah ada di sesi ini, timpa (bukan dobel) —
  // biasanya berarti user hitung ulang/koreksi input sebelum sempat disimpan.
  // Kode yang sama tapi Plant BEDA sengaja dianggap baris terpisah (lihat
  // opItemKey) — itu 2 pool stock yang independen.
  const idx = opSesiItems.findIndex((it) => opItemKey(it) === opItemKey(item));
  if (idx !== -1) opSesiItems[idx] = item; else opSesiItems.push(item);

  renderOpSesiList();
  showToast(`${item.kode} ditambahkan ke sesi (selisih ${item.selisih > 0 ? '+' : ''}${item.selisih}).`, 'success');

  // Reset buat scan/cari item berikutnya.
  card.hidden = true;
  opContextLokasi = '';
  document.getElementById('opKodeBarang').value = '';
  document.getElementById('opKodeBarang').focus();
}

function removeSesiItem(kode, plant) {
  const key = kode + '|' + (plant || '');
  opSesiItems = opSesiItems.filter((it) => opItemKey(it) !== key);
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
    const safeId = opSafeId(it.kode, it.plant);
    const adaSelisih = it.selisih !== 0;
    const plantAttr = `data-kode="${escapeHtml(it.kode)}" data-plant="${escapeHtml(it.plant || '')}"`;

    let koreksiAksiHtml = '';
    if (adaSelisih) {
      koreksiAksiHtml = it.dikoreksi
        ? '<span class="op-koreksi-done">✓ Stock dikoreksi</span>'
        : `<button type="button" class="btn btn-small op-btn-koreksi-langsung" ${plantAttr}>Koreksi Langsung</button>`;
    }

    const labelLokasi = it.lokasi ? `di lokasi <strong>${escapeHtml(it.lokasi)}</strong>` : 'total <strong>semua lokasi</strong>';
    const formInlineHtml = (it.koreksiExpanded && !it.dikoreksi) ? `
      <div class="op-koreksi-inline">
        <p class="hint-text">Ini akan LANGSUNG mengubah stock sistem ${labelLokasi} untuk <strong>${escapeHtml(it.kode)}</strong>${it.plant ? ' · Plant ' + escapeHtml(it.plant) : ''}, dari ${it.qtySistem} menjadi ${it.qtyFisik} ${escapeHtml(it.satuan || '')} (selisih ${selisihText}) — bukan cuma catatan opname.</p>
        <div class="form-row">
          <label>Alasan Koreksi *</label>
          <input type="text" id="opKsAlasan-${safeId}" placeholder="Mis. hasil hitung ulang, ketemu di bin lain, dst." value="${escapeHtml(it.catatan || '')}">
        </div>
        <div class="op-koreksi-inline-actions">
          <button type="button" class="btn btn-small btn-primary op-btn-koreksi-confirm" ${plantAttr}>Konfirmasi & Ubah Stock</button>
          <button type="button" class="btn btn-small op-btn-koreksi-cancel" ${plantAttr}>Batal</button>
        </div>
      </div>
    ` : '';

    return `
      <div class="op-item-wrap">
        <div class="op-item">
          <div>
            <div class="op-item-title">${escapeHtml(it.kode)} — ${escapeHtml(it.namaBarang || '-')}${it.plant ? ' <span class="sb-plant-tag">Plant ' + escapeHtml(it.plant) + '</span>' : ''}</div>
            <div class="op-item-sub">Sistem ${it.qtySistem} → Fisik ${it.qtyFisik} ${escapeHtml(it.satuan || '')}${it.lokasi ? ' · ' + escapeHtml(it.lokasi) : ''}</div>
          </div>
          <div class="op-item-side">
            <span class="op-selisih-badge ${selisihClass}">Selisih ${selisihText}</span>
            ${koreksiAksiHtml}
            <button type="button" class="op-item-remove" ${plantAttr} title="Hapus dari sesi" aria-label="Hapus dari sesi">×</button>
          </div>
        </div>
        ${formInlineHtml}
      </div>
    `;
  }).join('');

  wrap.querySelectorAll('.op-item-remove').forEach((btn) => {
    btn.addEventListener('click', () => removeSesiItem(btn.dataset.kode, btn.dataset.plant));
  });
  wrap.querySelectorAll('.op-btn-koreksi-langsung').forEach((btn) => {
    btn.addEventListener('click', () => toggleKoreksiLangsung(btn.dataset.kode, btn.dataset.plant, true));
  });
  wrap.querySelectorAll('.op-btn-koreksi-cancel').forEach((btn) => {
    btn.addEventListener('click', () => toggleKoreksiLangsung(btn.dataset.kode, btn.dataset.plant, false));
  });
  wrap.querySelectorAll('.op-btn-koreksi-confirm').forEach((btn) => {
    btn.addEventListener('click', () => handleKoreksiLangsungConfirm(btn.dataset.kode, btn.dataset.plant));
  });
}

function toggleKoreksiLangsung(kode, plant, expand) {
  const key = kode + '|' + (plant || '');
  const it = opSesiItems.find((x) => opItemKey(x) === key);
  if (!it) return;
  it.koreksiExpanded = expand;
  renderOpSesiList();
  if (expand) {
    const el = document.getElementById('opKsAlasan-' + opSafeId(kode, plant));
    if (el) el.focus();
  }
}

// Langsung panggil endpoint yang sama dengan Koreksi Stock Manual
// (Api.saveKoreksiStock) pakai data yang sudah dicatat waktu hitung fisik —
// nggak perlu pindah halaman / cari ulang kode barangnya. Alasan tetap wajib
// (jejak audit), Sesi Opname (log) di atas TIDAK berubah/kepengaruh.
async function handleKoreksiLangsungConfirm(kode, plant) {
  const key = kode + '|' + (plant || '');
  const it = opSesiItems.find((x) => opItemKey(x) === key);
  if (!it) return;

  const alasanInput = document.getElementById('opKsAlasan-' + opSafeId(kode, plant));
  const alasan = alasanInput.value.trim();
  if (!alasan) {
    showToast('Alasan koreksi wajib diisi.', 'error');
    alasanInput.focus();
    return;
  }

  const confirmBtn = document.querySelector(`.op-btn-koreksi-confirm[data-kode="${cssEscapeAttr(kode)}"][data-plant="${cssEscapeAttr(plant || '')}"]`);
  const cancelBtn = document.querySelector(`.op-btn-koreksi-cancel[data-kode="${cssEscapeAttr(kode)}"][data-plant="${cssEscapeAttr(plant || '')}"]`);
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Menyimpan...'; }
  if (cancelBtn) cancelBtn.disabled = true;

  const user = document.getElementById('opUser').value.trim();
  try {
    const res = await Api.saveKoreksiStock({
      kode: it.kode,
      namaBarang: it.namaBarang,
      satuan: it.satuan,
      qtyBaru: it.qtyFisik,
      lokasi: it.lokasi,
      plant: it.plant,
      alasan,
      user,
      sumber: 'Opname'
    });
    it.dikoreksi = true;
    it.koreksiExpanded = false;
    const labelLokasi = res.lokasi ? ` di ${res.lokasi}` : ' (total)';
    showToast(`Stock ${it.kode}${labelLokasi} dikoreksi: ${res.qtySebelum} → ${res.qtyBaru}.`, 'success');
    dashboardLoadedOnce = false; // supaya Dashboard refresh angka onHand terbaru saat dibuka lagi
    renderOpSesiList();
  } catch (err) {
    showToast('Gagal koreksi: ' + err.message, 'error');
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Konfirmasi & Ubah Stock'; }
    if (cancelBtn) cancelBtn.disabled = false;
  }
}

// Kode Barang biasanya cuma alfanumerik/dash, tapi kalau ada karakter aneh
// (spasi, kutip, dst.) escape dulu biar nggak merusak selector CSS querySelector.
function cssEscapeAttr(value) {
  return String(value).replace(/["\\]/g, '\\$&');
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
