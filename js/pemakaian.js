// ============================================================================
// PEMAKAIAN BARANG (barang keluar) — kebalikan dari Penerimaan.
// Kode barang dicocokkan ke masterBarangCache (diisi oleh loadMasterData() di
// js/penerimaan.js) supaya Nama & Satuan bisa terisi otomatis saat kode dipilih.
//
// Lokasi/Bin OPSIONAL — kalau user scan QR lokasi sebelum ambil barang, itu
// dicatat (dipakai buat breakdown stock per bin di Stock Balance). Kalau tidak
// di-scan (manual), tetap boleh disimpan tanpa lokasi — scan cuma prioritas,
// bukan wajib (sesuai konfirmasi user).
// ============================================================================

let pemakaianInitialized = false;
let pmLokasi = '';

function initPemakaianPage() {
  loadMasterData(); // pastikan datalist #listMasterBarang & masterBarangCache terisi

  if (!pemakaianInitialized) {
    pemakaianInitialized = true;

    document.getElementById('pmKode').addEventListener('input', handlePmKodeInput);
    document.getElementById('formPemakaian').addEventListener('submit', handlePmSubmit);

    document.getElementById('btnScanPmLokasi').addEventListener('click', () => {
      openQrScanner(
        (value) => { setPmLokasi(value); showToast('Lokasi terbaca: ' + value, 'success'); },
        (err) => showToast(err, 'error')
      );
    });
    document.getElementById('btnClearPmLokasi').addEventListener('click', () => setPmLokasi(''));
  }

  setPmTanggalDisplay();
}

function setPmLokasi(value) {
  pmLokasi = value;
  const badge = document.getElementById('pmLokasiBadge');
  const clearBtn = document.getElementById('btnClearPmLokasi');
  if (value) {
    badge.textContent = 'Dari: ' + value;
    badge.hidden = false;
    clearBtn.hidden = false;
  } else {
    badge.hidden = true;
    clearBtn.hidden = true;
  }
}

function setPmTanggalDisplay() {
  document.getElementById('pmTanggalDisplay').valueAsDate = new Date();
}

function handlePmKodeInput(e) {
  const kode = e.target.value.trim();
  const match = masterBarangCache.find((b) => b.kodeBarang === kode);
  const hint = document.getElementById('pmNamaHint');

  if (match) {
    document.getElementById('pmSatuan').value = match.satuan || '';
    hint.textContent = '→ ' + match.namaBarang;
    hint.hidden = false;
  } else {
    hint.hidden = true;
  }
}

async function handlePmSubmit(e) {
  e.preventDefault();

  const kode = document.getElementById('pmKode').value.trim();
  const qty = Number(document.getElementById('pmQty').value) || 0;
  const teknisi = document.getElementById('pmTeknisi').value.trim();

  if (!kode) {
    showToast('Kode Barang wajib diisi.', 'error');
    return;
  }
  if (qty <= 0) {
    showToast('Qty harus lebih dari 0.', 'error');
    return;
  }
  if (!teknisi) {
    showToast('Nama Teknisi/User wajib diisi.', 'error');
    document.getElementById('pmTeknisi').focus();
    return;
  }

  const match = masterBarangCache.find((b) => b.kodeBarang === kode);

  const payload = {
    kode,
    namaBarang: match ? match.namaBarang : '',
    qty,
    satuan: document.getElementById('pmSatuan').value.trim(),
    teknisi,
    keterangan: document.getElementById('pmKeterangan').value.trim(),
    lokasi: pmLokasi
  };

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Menyimpan...';

  try {
    await Api.savePemakaian(payload);
    showToast('Pemakaian tersimpan.', 'success');
    resetPmForm();
    dashboardLoadedOnce = false; // supaya Stock Balance & Reorder Alert di dashboard ikut ter-refresh
  } catch (err) {
    showToast('Gagal menyimpan: ' + err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Simpan Pemakaian';
  }
}

function resetPmForm() {
  document.getElementById('formPemakaian').reset();
  setPmTanggalDisplay();
  document.getElementById('pmNamaHint').hidden = true;
  setPmLokasi('');
}
