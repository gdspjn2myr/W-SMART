// ============================================================================
// KOREKSI STOCK MANUAL — satu-satunya cara stock realtime bisa "disesuaikan"
// di luar Penerimaan/Pemakaian (lihat koreksiMap di hitungBalances_, Code.gs).
// Beda dari Stock Opname (js/opname.js) yang cuma catatan/log selisih: begitu
// disimpan di sini, qty-nya LANGSUNG berubah di seluruh app (Dashboard, Stock
// Balance, Put Away, dst) — makanya Alasan wajib diisi (jejak audit).
//
// Lookup item pakai endpoint yang SAMA dengan Stock Opname (getOpnameItemDetail)
// — datanya kebetulan pas: qty tercatat sistem + info dasar item — biar nggak
// dobel logic di backend. OP_STATUS_CLASS/OP_STATUS_LABEL dipakai bareng dari
// js/opname.js (dimuat sebelum file ini, lihat index.html).
// ============================================================================

let ksInitialized = false;
let ksCurrentItem = null; // { kode, namaBarang, satuan, onHand, kategori, lokasiDefault, status, belumAdaMaster }

function initKoreksiPage() {
  loadMasterData(); // datalist #listMasterBarang, dipakai bareng halaman lain

  if (ksInitialized) return;
  ksInitialized = true;

  document.getElementById('btnKsCari').addEventListener('click', handleKsCari);
  document.getElementById('ksKode').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleKsCari(); }
  });
  document.getElementById('btnScanKsBarang').addEventListener('click', () => {
    openQrScanner(
      (value) => {
        document.getElementById('ksKode').value = value;
        showToast('Kode Barang terbaca: ' + value, 'success');
        handleKsCari();
      },
      (err) => showToast(err, 'error')
    );
  });
}

// Cari qty sisa di 1 lokasi tertentu (dari breakdown 'bins' item yang lagi
// dibuka) — dipakai bareng buat update preview selisih & submit payload.
function ksFindBinQty(lokasi) {
  const entry = (ksCurrentItem && ksCurrentItem.bins || []).find((b) => b.lokasi === lokasi);
  return entry ? entry.qty : 0;
}

async function handleKsCari() {
  const kode = document.getElementById('ksKode').value.trim();
  if (!kode) { showToast('Isi atau scan Kode Barang dulu.', 'error'); return; }

  const btn = document.getElementById('btnKsCari');
  btn.disabled = true;
  try {
    const res = await Api.getOpnameItemDetail({ kode });
    renderKsDetailCard(res.item);
  } catch (err) {
    showToast(err.message, 'error');
    document.getElementById('ksDetailCard').hidden = true;
    ksCurrentItem = null;
  } finally {
    btn.disabled = false;
  }
}

function renderKsDetailCard(item) {
  ksCurrentItem = item;
  const card = document.getElementById('ksDetailCard');
  const statusClass = OP_STATUS_CLASS[item.status] || 'ra-badge-unregistered';
  const statusLabel = OP_STATUS_LABEL[item.status] || (item.belumAdaMaster ? 'Belum Terdaftar' : item.status || '-');

  const bins = item.bins || [];

  card.innerHTML = `
    <div class="card-header">
      <span class="md-badge ${item.kategori === 'A' ? 'md-badge-a' : item.kategori === 'C' ? 'md-badge-c' : 'md-badge-b'}">${escapeHtml((item.kategori || '-').toUpperCase())}</span>
      ${escapeHtml(item.kode)} — ${escapeHtml(item.namaBarang || '-')}
    </div>
    ${item.belumAdaMaster ? '<span class="badge-belum-master">⚠ Belum terdaftar di Master Data — akan otomatis didaftarkan saat koreksi disimpan</span>' : ''}
    <div class="op-detail-stats">
      <div><span>Qty Sistem Saat Ini (Total Semua Lokasi)</span><strong>${item.onHand} ${escapeHtml(item.satuan || '')}</strong></div>
      <div><span>Lokasi Default</span><strong>${escapeHtml(item.lokasiDefault || '-')}</strong></div>
      <div><span>Status</span><strong><span class="ra-badge ${statusClass}">${escapeHtml(statusLabel)}</span></strong></div>
    </div>

    ${bins.length ? `
      <div class="op-section-title">Breakdown per Lokasi Saat Ini (klik buat koreksi bin itu saja)</div>
      <div class="op-bin-list">
        ${bins.map((b) => `
          <button type="button" class="op-bin-item ks-bin-pick" data-lokasi="${escapeHtml(b.lokasi)}">
            <span>${escapeHtml(b.lokasi)}</span>
            <span class="op-bin-item-qty">${b.qty} ${escapeHtml(item.satuan || '')}</span>
          </button>
        `).join('')}
      </div>
    ` : ''}

    <div class="op-count-form">
      <div class="form-row">
        <label>Lokasi/Bin (opsional)</label>
        <div class="scan-lokasi-row">
          <button type="button" id="btnScanKsLokasi" class="btn btn-small btn-scan">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2"/><rect x="8" y="8" width="8" height="8" rx="1"/></svg>
            Scan QR Bin
          </button>
        </div>
        <input type="text" id="ksLokasi" placeholder="Kosongkan = koreksi TOTAL semua lokasi" autocomplete="off">
        <p class="hint-text">Diisi = cuma koreksi stock di bin ini. Dikosongkan = koreksi total (semua bin digabung), seperti sebelumnya.</p>
      </div>
      <div class="form-row-pair">
        <div class="form-row">
          <label>Qty Baru (Hasil Koreksi) *</label>
          <input type="number" id="ksQtyBaru" min="0" step="1" placeholder="Qty yang benar setelah dikoreksi">
        </div>
        <div class="form-row">
          <label>Sumber</label>
          <select id="ksSumber">
            <option value="Manual">Koreksi Manual</option>
            <option value="Opname">Hasil Stock Opname</option>
          </select>
        </div>
      </div>
      <div id="ksSelisihPreview" class="hint-text" hidden></div>
      <div class="form-row">
        <label>Alasan *</label>
        <input type="text" id="ksAlasan" placeholder="Mis. barang ketemu di gudang lain, rusak, hasil opname tgl ..., dst.">
      </div>
      <div class="form-row">
        <label>Nama User (yang koreksi)</label>
        <input type="text" id="ksUser" placeholder="Otomatis terisi dari akun yang login" readonly>
      </div>
      <button type="button" id="btnSimpanKoreksi" class="btn btn-primary btn-block">Simpan Koreksi Stock</button>
    </div>
  `;
  card.hidden = false;
  Auth.prefillUserField('ksUser'); // identitas selalu dari akun yang login (lihat js/auth.js) — kartu ini dirender ulang tiap barang/bin baru dipilih, jadi diisi ulang tiap kali juga

  document.getElementById('ksQtyBaru').addEventListener('input', updateKsSelisihPreview);
  document.getElementById('ksLokasi').addEventListener('input', updateKsSelisihPreview);
  document.getElementById('btnScanKsLokasi').addEventListener('click', () => {
    openQrScanner(
      (value) => {
        document.getElementById('ksLokasi').value = value;
        showToast('Lokasi/Bin terbaca: ' + value, 'success');
        updateKsSelisihPreview();
      },
      (err) => showToast(err, 'error')
    );
  });
  card.querySelectorAll('.ks-bin-pick').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById('ksLokasi').value = btn.dataset.lokasi;
      updateKsSelisihPreview();
      document.getElementById('ksQtyBaru').focus();
    });
  });
  document.getElementById('btnSimpanKoreksi').addEventListener('click', handleSimpanKoreksi);
  document.getElementById('ksQtyBaru').focus();
}

function updateKsSelisihPreview() {
  const el = document.getElementById('ksSelisihPreview');
  const val = document.getElementById('ksQtyBaru').value.trim();
  if (val === '' || isNaN(Number(val)) || !ksCurrentItem) { el.hidden = true; return; }

  const lokasi = document.getElementById('ksLokasi').value.trim();
  const baseline = lokasi ? ksFindBinQty(lokasi) : ksCurrentItem.onHand;
  const labelLokasi = lokasi ? `di lokasi ${lokasi}` : 'total semua lokasi';

  const selisih = Number(val) - baseline;
  const sign = selisih > 0 ? '+' : '';
  el.textContent = `Selisih: ${sign}${selisih} ${ksCurrentItem.satuan || ''} (qty sistem ${labelLokasi} akan berubah dari ${baseline} menjadi ${val})`;
  el.hidden = false;
}

async function handleSimpanKoreksi() {
  if (!ksCurrentItem) return;
  const qtyBaru = document.getElementById('ksQtyBaru').value.trim();
  const alasan = document.getElementById('ksAlasan').value.trim();
  const user = document.getElementById('ksUser').value.trim();
  const sumber = document.getElementById('ksSumber').value;

  if (qtyBaru === '' || isNaN(Number(qtyBaru)) || Number(qtyBaru) < 0) {
    showToast('Isi Qty Baru dengan angka (boleh 0) dulu.', 'error');
    document.getElementById('ksQtyBaru').focus();
    return;
  }
  if (!alasan) {
    showToast('Alasan koreksi wajib diisi.', 'error');
    document.getElementById('ksAlasan').focus();
    return;
  }

  const lokasi = document.getElementById('ksLokasi').value.trim();

  const payload = {
    kode: ksCurrentItem.kode,
    namaBarang: ksCurrentItem.namaBarang,
    satuan: ksCurrentItem.satuan,
    qtyBaru: Number(qtyBaru),
    lokasi, alasan, user, sumber
  };

  const btn = document.getElementById('btnSimpanKoreksi');
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';
  try {
    const res = await Api.saveKoreksiStock(payload);
    const sign = res.selisih > 0 ? '+' : '';
    const labelLokasi = res.lokasi ? ` di ${res.lokasi}` : ' (total)';
    showToast(`Koreksi tersimpan. Qty ${ksCurrentItem.kode}${labelLokasi}: ${res.qtySebelum} → ${res.qtyBaru} (selisih ${sign}${res.selisih}).`, 'success');
    document.getElementById('ksDetailCard').hidden = true;
    document.getElementById('ksKode').value = '';
    document.getElementById('ksKode').focus();
    ksCurrentItem = null;
    dashboardLoadedOnce = false; // supaya Dashboard refresh angka onHand terbaru saat dibuka lagi
  } catch (err) {
    showToast('Gagal menyimpan: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Simpan Koreksi Stock';
  }
}
