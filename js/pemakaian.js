// ============================================================================
// PEMAKAIAN BARANG (barang keluar) — kebalikan dari Penerimaan.
// Kode barang dicocokkan ke masterBarangCache (diisi oleh loadMasterData() di
// js/penerimaan.js) supaya Nama & Satuan bisa terisi otomatis saat kode dipilih.
//
// Lokasi/Bin OPSIONAL — diisi lewat scan QR (#pmLokasi diisi otomatis) ATAU
// ketik manual langsung di field-nya (permintaan Bos: dulu cuma bisa scan,
// nggak ada opsi ketik — sama polanya kayak Lokasi/Bin di Put Away). Kalau
// dikosongin sama sekali, tetap boleh disimpan tanpa lokasi.
// ============================================================================

let pemakaianInitialized = false;
let pmStockHintTimer = null;
let pmStockHintSeq = 0; // dipakai buang jawaban getStockHint yang basi (kalau user ngetik cepat & respons datang gak berurutan)
let pmSumberOptions = []; // opsi Sumber (OBS/Fast Moving/User+nama) terakhir dari server buat Kode+Plant yang lagi dipilih — lihat renderPmSumberField

// ID anti-dobel-simpan (lihat js/api.js dekat generateClientRequestId) —
// diganti lagi cuma setelah submit sukses (resetPmForm).
let pmRequestId = generateClientRequestId();

function initPemakaianPage() {
  loadMasterData(); // pastikan datalist #listMasterBarang & masterBarangCache terisi
  Auth.prefillUserField('pmTeknisi'); // identitas selalu dari akun yang login (lihat js/auth.js)

  if (!pemakaianInitialized) {
    pemakaianInitialized = true;

    document.getElementById('pmKode').addEventListener('input', (e) => { handlePmKodeInput(e); scheduleStockHint(); });
    // Begitu Plant diganti, daftar saran Kode Barang (listMasterBarangPemakaian)
    // langsung ke-filter ngikutin Plant itu — lihat renderMasterBarangDatalist
    // (js/penerimaan.js) & keluhan user soal kode barang kelihatan dobel di saran.
    document.getElementById('pmPlant').addEventListener('change', (e) => {
      renderMasterBarangDatalist('listMasterBarangPemakaian', e.target.value);
      scheduleStockHint();
    });
    document.getElementById('pmSLoc').addEventListener('input', scheduleStockHint);
    document.getElementById('formPemakaian').addEventListener('submit', handlePmSubmit);
    wireUppercaseInput('pmSLoc'); // S.Loc ikut mengikat stock di backend, selalu huruf besar (lihat normalizeSloc_ di Code.gs)

    document.getElementById('btnScanPmLokasi').addEventListener('click', () => {
      openQrScanner(
        (value) => {
          document.getElementById('pmLokasi').value = value;
          showToast('Lokasi terbaca: ' + value, 'success');
        },
        (err) => showToast(err, 'error')
      );
    });
  }

  setPmTanggalDisplay();
}

function setPmTanggalDisplay() {
  document.getElementById('pmTanggalDisplay').valueAsDate = new Date();
}

function handlePmKodeInput(e) {
  const kode = e.target.value.trim();
  // Satu Kode Barang bisa punya lebih dari 1 baris di Master Data (beda Plant,
  // lihat js/master-data.js) — pakai .filter() bukan .find() supaya kita tahu
  // semua Plant yang terdaftar buat kode ini, bukan cuma baris pertama yang
  // ketemu (yang bisa jadi bukan Plant yang mau dipakai user).
  const matches = masterBarangCache.filter((b) => b.kodeBarang === kode);
  const hint = document.getElementById('pmNamaHint');

  if (matches.length) {
    // Kalau Plant udah dipilih & ada baris Master Data yang PERSIS Plant itu,
    // pakai baris itu buat Satuan/Nama (paling akurat) — kalau belum dipilih
    // atau kodenya belum kedaftar di Plant itu, fallback ke baris pertama.
    const plant = document.getElementById('pmPlant').value.trim();
    const primary = (plant && matches.find((m) => String(m.plant || '').trim() === plant)) || matches[0];
    document.getElementById('pmSatuan').value = primary.satuan || '';
    const meta = itemMetaLine({ kategori: primary.kategori, itemJenis: primary.jenis });
    const metaHtml = meta ? ` <span class="item-meta-line">· ${meta}</span>` : '';
    if (matches.length > 1) {
      const plants = matches.map((m) => m.plant).filter(Boolean).join(', ');
      hint.innerHTML = '→ ' + escapeHtml(primary.namaBarang) + ' — kode ini ada di beberapa Plant (' + escapeHtml(plants) + '). Pastikan Plant di bawah sesuai tempat barang fisiknya, transaksi akan ditolak kalau stock-nya kosong di Plant yang dipilih.' + metaHtml;
    } else {
      hint.innerHTML = '→ ' + escapeHtml(primary.namaBarang) + metaHtml;
    }
    hint.hidden = false;
  } else {
    hint.hidden = true;
  }
}

// ---------------------------------------------------------------------------
// "Sisa stock" — dipanggil tiap kali Kode/Plant/S.Loc berubah (lihat wiring di
// initPemakaianPage), biar user tau berapa sisa stock SEBELUM klik Simpan,
// bukan baru tau pas ditolak (lihat keluhan user: "saya gatau sisa stock
// barang yg sudah dipilih"). Didebounce 350ms & pakai nomor urut (pmStockHint-
// Seq) buat buang jawaban server yang keburu basi kalau user ngetik cepat.
// ---------------------------------------------------------------------------
function scheduleStockHint() {
  clearTimeout(pmStockHintTimer);
  pmStockHintTimer = setTimeout(updateStockHint, 350);
}

async function updateStockHint() {
  const hintEl = document.getElementById('pmStockHint');
  const kode = document.getElementById('pmKode').value.trim();
  const plant = document.getElementById('pmPlant').value.trim();
  const sloc = document.getElementById('pmSLoc').value.trim().toUpperCase();

  if (!kode || !plant) {
    hintEl.hidden = true;
    renderPmSumberField([]);
    return;
  }

  const mySeq = ++pmStockHintSeq;
  try {
    const res = await Api.getStockHint({ kode, plant, sloc });
    if (mySeq !== pmStockHintSeq) return; // ada request lebih baru nyusul duluan, buang yang ini

    if (res.needsPlantSelection) {
      hintEl.textContent = 'Kode ini ada di beberapa Plant — pilih Plant yang sesuai dulu buat lihat sisa stock.';
      hintEl.hidden = false;
      renderPmSumberField([]);
    } else if (res.notFound) {
      hintEl.textContent = `Belum ada stock tercatat untuk kode ini di Plant ${plant}.`;
      hintEl.hidden = false;
      renderPmSumberField([]);
    } else if (sloc) {
      hintEl.textContent = `Sisa stock di Plant ${plant} · S.Loc ${sloc}: ${Math.max(0, res.onHandPlantSloc)} ${res.satuan || ''} (total Plant ${plant} semua S.Loc: ${res.onHandPlant})`;
      hintEl.hidden = false;
      renderPmSumberField(res.sumberOptions || []);
    } else {
      hintEl.textContent = `Stock di Plant ${plant} (semua S.Loc): ${res.onHandPlant} ${res.satuan || ''} — isi S.Loc buat lihat sisa spesifik di lokasi itu.`;
      hintEl.hidden = false;
      renderPmSumberField(res.sumberOptions || []);
    }
  } catch (err) {
    if (mySeq !== pmStockHintSeq) return;
    hintEl.hidden = true; // gagal ambil hint bukan hal fatal, biarin aja sunyi — validasi beneran tetap di server pas Simpan
    renderPmSumberField([]);
  }
}

// ---------------------------------------------------------------------------
// SUMBER BARANG (OBS/Fast Moving/User+nama) — "kantong" stock yang mau
// diambil, dicocokkan ke Pemesan yang dicatat pas Barang Masuk (lihat
// hitungSumberBarangKeluar_ di Code.gs). Permintaan user: dalam 1 Kode+Plant
// bisa ada lebih dari 1 kantong (misal sisa Fast Moving DAN sisa milik orang
// tertentu) — kalau cuma 1 yang masih ada sisanya, auto-default TANPA perlu
// milih; kalau lebih dari 1, WAJIB pilih salah satu dari yang beneran masih
// ada stock-nya (bukan 3 pilihan tetap yang belum tentu semuanya ada
// barangnya). options = [{ tipe, nama, sisa }, ...] dari server, sudah
// diurutkan & sudah difilter cuma yang sisa > 0.
// ---------------------------------------------------------------------------
function sumberOptionValue(o) {
  return o.tipe + '|' + (o.nama || '');
}
function sumberOptionLabel(o) {
  if (o.tipe === 'USER') return (o.nama || '-') + ' (User)';
  if (o.tipe === 'OBS') return 'OBS';
  // 'KOREKSI' cuma pernah muncul dari hitungSumberBreakdownTampilan_ di
  // Code.gs (breakdown "Sisa saat ini per Sumber" di Stock Balance) — NGGAK
  // PERNAH jadi opsi di dropdown form Barang Keluar ini (Koreksi Stock bukan
  // "Sumber" yang bisa dipilih user), tapi label-nya tetap ditaruh di sini
  // biar 1 fungsi label ini dipakai konsisten di semua tempat.
  if (o.tipe === 'KOREKSI') return 'Koreksi Stock';
  return 'Fast Moving';
}

function renderPmSumberField(options) {
  pmSumberOptions = options;
  const wrap = document.getElementById('pmSumberWrap');
  const select = document.getElementById('pmSumber');
  const hint = document.getElementById('pmSumberHint');

  if (!options.length) {
    // Nggak ada data Pemesan sama sekali buat Kode+Plant ini (mis. Kode/Plant
    // belum lengkap, atau stock-nya dari Koreksi Stock bukan Penerimaan) —
    // diam-diam default ke Fast Moving (paling umum/aman), sembunyikan field-nya
    // biar user nggak perlu mikirin apa-apa.
    select.innerHTML = '<option value="FAST MOVING|">Fast Moving</option>';
    select.value = 'FAST MOVING|';
    select.disabled = true;
    wrap.hidden = true;
    hint.hidden = true;
    return;
  }

  select.innerHTML = options.map((o) =>
    `<option value="${escapeHtml(sumberOptionValue(o))}">${escapeHtml(sumberOptionLabel(o))} (sisa ${o.sisa})</option>`
  ).join('');
  wrap.hidden = false;

  if (options.length === 1) {
    select.value = sumberOptionValue(options[0]);
    select.disabled = true;
    hint.textContent = `Otomatis: ${sumberOptionLabel(options[0])} — cuma 1 sumber yang masih ada stock-nya buat Kode+Plant ini.`;
    hint.hidden = false;
  } else {
    select.disabled = false;
    select.insertAdjacentHTML('afterbegin', '<option value="" disabled selected>Pilih sumber...</option>');
    select.value = '';
    hint.textContent = `Kode ini punya stock dari ${options.length} sumber berbeda — pilih yang mau diambil.`;
    hint.hidden = false;
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
  const plant = document.getElementById('pmPlant').value.trim();
  if (!plant) {
    showToast('Plant wajib dipilih — transaksi ini akan dicocokkan ke stock yang benar2 ada di Plant tsb.', 'error');
    return;
  }
  // S.Loc SEKARANG IKUT MENGIKAT stock bareng Plant (bukan cuma catatan) —
  // walau Plant sama, S.Loc beda tetap ditolak servernya, jadi wajib diisi.
  const sloc = document.getElementById('pmSLoc').value.trim().toUpperCase();
  if (!sloc) {
    showToast('S.Loc wajib diisi — dipakai bareng Plant buat mencocokkan stock yang benar2 ada di lokasi itu.', 'error');
    document.getElementById('pmSLoc').focus();
    return;
  }
  // Sumber (OBS/Fast Moving/User) — auto-keisi kalau cuma 1 opsi (lihat
  // renderPmSumberField), tapi WAJIB dipilih manual kalau lebih dari 1 opsi
  // (select-nya sengaja dikasih placeholder kosong buat kasus itu).
  const sumberRaw = document.getElementById('pmSumber').value;
  if (!sumberRaw) {
    showToast('Sumber barang (OBS/Fast Moving/User) wajib dipilih.', 'error');
    document.getElementById('pmSumber').focus();
    return;
  }
  const [sumberTipe, sumberNama] = sumberRaw.split('|');

  const match = masterBarangCache.find((b) => b.kodeBarang === kode);

  const payload = {
    kode,
    namaBarang: match ? match.namaBarang : '',
    qty,
    satuan: document.getElementById('pmSatuan').value.trim(),
    teknisi,
    keterangan: document.getElementById('pmKeterangan').value.trim(),
    lokasi: document.getElementById('pmLokasi').value.trim(),
    plant,
    sloc,
    sumberTipe,
    sumberNama,
    clientRequestId: pmRequestId
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
  pmRequestId = generateClientRequestId(); // transaksi baru -> ID baru
  setPmTanggalDisplay();
  document.getElementById('pmNamaHint').hidden = true;
  document.getElementById('pmStockHint').hidden = true;
  renderPmSumberField([]);
  // pmLokasi ikut ke-reset otomatis lewat formPemakaian.reset() di atas — dia
  // sekarang input beneran di dalam form itu (dulu badge/variabel terpisah).
}
