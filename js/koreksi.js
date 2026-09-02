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

  card.innerHTML = `
    <div class="card-header">
      <span class="md-badge ${item.kategori === 'A' ? 'md-badge-a' : item.kategori === 'C' ? 'md-badge-c' : 'md-badge-b'}">${escapeHtml((item.kategori || '-').toUpperCase())}</span>
      ${escapeHtml(item.kode)} — ${escapeHtml(item.namaBarang || '-')}
    </div>
    ${item.belumAdaMaster ? '<span class="badge-belum-master">⚠ Belum terdaftar di Master Data — akan otomatis didaftarkan saat koreksi disimpan</span>' : ''}
    <div class="op-detail-stats">
      <div><span>Qty Sistem Saat Ini</span><strong>${item.onHand} ${escapeHtml(item.satuan || '')}</strong></div>
      <div><span>Lokasi Default</span><strong>${escapeHtml(item.lokasiDefault || '-')}</strong></div>
      <div><span>Status</span><strong><span class="ra-badge ${statusClass}">${escapeHtml(statusLabel)}</span></strong></div>
    </div>

    <div class="op-count-form">
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
        <input type="text" id="ksUser" placeholder="Nama yang melakukan koreksi">
      </div>
      <button type="button" id="btnSimpanKoreksi" class="btn btn-primary btn-block">Simpan Koreksi Stock</button>
    </div>
  `;
  card.hidden = false;

  document.getElementById('ksQtyBaru').addEventListener('input', updateKsSelisihPreview);
  document.getElementById('btnSimpanKoreksi').addEventListener('click', handleSimpanKoreksi);
  document.getElementById('ksQtyBaru').focus();
}

function updateKsSelisihPreview() {
  const el = document.getElementById('ksSelisihPreview');
  const val = document.getElementById('ksQtyBaru').value.trim();
  if (val === '' || isNaN(Number(val)) || !ksCurrentItem) { el.hidden = true; return; }

  const selisih = Number(val) - ksCurrentItem.onHand;
  const sign = selisih > 0 ? '+' : '';
  el.textContent = `Selisih: ${sign}${selisih} ${ksCurrentItem.satuan || ''} (qty sistem akan berubah dari ${ksCurrentItem.onHand} menjadi ${val})`;
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

  const payload = {
    kode: ksCurrentItem.kode,
    namaBarang: ksCurrentItem.namaBarang,
    satuan: ksCurrentItem.satuan,
    qtyBaru: Number(qtyBaru),
    alasan, user, sumber
  };

  const btn = document.getElementById('btnSimpanKoreksi');
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';
  try {
    const res = await Api.saveKoreksiStock(payload);
    const sign = res.selisih > 0 ? '+' : '';
    showToast(`Koreksi tersimpan. Qty ${ksCurrentItem.kode}: ${res.qtySebelum} → ${res.qtyBaru} (selisih ${sign}${res.selisih}).`, 'success');
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
