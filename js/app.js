// ============================================================================
// APP INIT
// ============================================================================

let toastTimer = null;
let toastHideTimer = null;
function showToast(msg, type) {
  const el = document.getElementById('toast');
  clearTimeout(toastTimer);
  clearTimeout(toastHideTimer);
  el.textContent = msg;
  el.className = 'toast' + (type ? ' ' + type : '');
  el.hidden = false;

  // Feedback getar/bunyi nyambung ke SEMUA toast sukses/gagal di seluruh app
  // (scan lokasi, simpan Barang Masuk/Put Away/Barang Keluar, dsb) lewat satu
  // titik ini — bukan ditaruh manual di tiap halaman, biar konsisten & nggak
  // ada yang kelewatan. Toast tipe 'info' sengaja dilewati (mis. "Mengecek
  // update...") supaya nggak berisik untuk hal yang bukan hasil aksi.
  if (type === 'success' && typeof feedbackSuccess === 'function') feedbackSuccess();
  else if (type === 'error' && typeof feedbackError === 'function') feedbackError();

  void el.offsetWidth; // reflow supaya transisi masuk selalu jalan (walau toast sebelumnya baru saja hilang)
  el.classList.add('show');
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    toastHideTimer = setTimeout(() => { el.hidden = true; }, 260);
  }, 3500);
}

// ---------------------------------------------------------------------------
// UPPERCASE-ON-INPUT — dipakai buat field S.Loc (Barang Masuk & Barang
// Keluar, lihat js/penerimaan.js & js/pemakaian.js) yang sekarang ikut
// mengikat stock bareng Plant di backend (selalu dicocokkan huruf besar
// semua di sana, lihat normalizeSloc_ di Code.gs) — field-nya dibikin ikut
// huruf besar juga secara live pas diketik, biar kelihatan konsisten dari
// awal & user nggak kaget kalau isiannya "berubah sendiri" pas disimpan.
// Reassign value (bukan cuma CSS text-transform) supaya isian yang benar2
// dikirim ke server juga sudah uppercase, termasuk kalau di-paste.
// ---------------------------------------------------------------------------
function wireUppercaseInput(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.addEventListener('input', () => {
    const start = el.selectionStart, end = el.selectionEnd;
    el.value = el.value.toUpperCase();
    // Uppercase-in-place tidak mengubah panjang string, jadi posisi kursor
    // aman dikembalikan persis seperti semula (kalau browser dukung setSelectionRange
    // buat tipe input ini — 'text' selalu dukung).
    if (start !== null && end !== null) el.setSelectionRange(start, end);
  });
}

// ---------------------------------------------------------------------------
// TOMBOL REFRESH — kasih feedback visual pas diklik (ikon muter + tombol
// nonaktif sesaat) biar kelihatan jelas klik-nya "kena", bukan cuma diem
// nunggu data baru muncul tanpa tanda apa-apa (keluhan user). 1 helper di
// sini dipakai bareng buat 4 tombol Refresh yang sepola (Dashboard, Stock
// Balance, Riwayat Transaksi, Alert Order — lihat pemanggilannya di
// dashboard.js/stock-balance.js/riwayat.js/alert-order.js), bukan didobelin
// nulis logic yang sama 4x. loadFn boleh function biasa maupun async — kalau
// dia nolak/reject pun animasinya tetap berhenti dengan benar (finally),
// walau ke-4 fungsi yang dipakai sekarang selalu nangkep error-nya sendiri
// jadi gak pernah reject.
// ---------------------------------------------------------------------------
function wireRefreshButton(buttonId, loadFn) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (btn.classList.contains('is-refreshing')) return; // cegah dobel-klik numpuk request
    btn.classList.add('is-refreshing');
    btn.disabled = true;
    try {
      await loadFn();
    } finally {
      btn.classList.remove('is-refreshing');
      btn.disabled = false;
    }
  });
}

// ---------------------------------------------------------------------------
// SIDEBAR (drawer navigasi via tombol hamburger)
// ---------------------------------------------------------------------------

// Deteksi apakah SATU interaksi klik ini beneran pakai mouse — dipakai buat
// bedain desktop vs HP/sentuh di initSidebar & initNavGroups di bawah.
// SEBELUMNYA pakai matchMedia('(hover: hover) and (pointer: fine)') doang,
// tapi itu ngecek KEMAMPUAN device (device-nya PUNYA layar sentuh atau
// nggak), BUKAN input yang beneran dipakai saat itu — di laptop/PC layar
// SENTUH yang dipakai pakai MOUSE, matchMedia itu tetap bilang "nggak ada
// hover presisi" (dianggap kayak HP) walau usernya jelas-jelas nge-klik pakai
// mouse. Makanya sidebar ikut nutup sendiri & grup navigasi ikut meluas ke
// bawah padahal harusnya nggak (keluhan user, device: desktop layar sentuh +
// mouse). e.pointerType ('mouse'/'touch'/'pen') di event click browser
// modern jauh lebih akurat karena based on INPUT YANG BENERAN DIPAKAI saat
// event itu terjadi — kalau kosong (klik dipicu keyboard Enter/Space, bukan
// pointer device sama sekali), baru balik pakai matchMedia sebagai fallback.
function isMouseClickEvent(e) {
  if (e && typeof e.pointerType === 'string' && e.pointerType) {
    return e.pointerType === 'mouse';
  }
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const menuToggle = document.getElementById('btnMenuToggle');
  if (!sidebar || !backdrop || !menuToggle) return;

  function openSidebar() {
    sidebar.classList.add('open');
    backdrop.hidden = false;
    menuToggle.setAttribute('aria-expanded', 'true');
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    backdrop.hidden = true;
    menuToggle.setAttribute('aria-expanded', 'false');
  }

  menuToggle.addEventListener('click', () => {
    if (sidebar.classList.contains('open')) closeSidebar(); else openSidebar();
  });
  backdrop.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSidebar();
  });
  // Di device sentuh (HP/tablet) sidebar-nya drawer sekali-pakai — cocok
  // ditutup otomatis abis pilih 1 halaman. Tapi di desktop (mouse), sidebar
  // ini overlay yang harus dibuka manual lewat hamburger tiap kali, jadi
  // kalau ikut auto-close abis klik, user kepaksa buka-hover-klik ulang dari
  // nol buat pindah ke halaman lain (keluhan user: "susah buat pindah
  // halaman"). Makanya di desktop sidebar DIBIARKAN TERBUKA abis klik link,
  // biar bisa lanjut klik halaman lain tanpa perlu buka-tutup berulang.
  // Dicek pas klik (bukan sekali di awal) biar tetap benar kalau device-nya
  // hybrid (laptop layar sentuh, dst).
  sidebar.querySelectorAll('.nav-item').forEach((el) => {
    el.addEventListener('click', (e) => {
      const isDesktopPointer = isMouseClickEvent(e);
      if (!isDesktopPointer) { closeSidebar(); return; }

      // Desktop: sidebar KESELURUHAN tetap terbuka (lihat catatan di atas) —
      // tapi kalau link yang diklik ada di dalam flyout submenu (Transaksi/
      // Stock Control), flyout itu SENDIRI harus langsung nutup begitu
      // dipilih. Tanpa ini, flyout-nya cuma nutup pas kursor bener2 pindah
      // (murni CSS :hover) — kalau kursor diem di tempat abis klik (yang
      // wajar, klik gak selalu diikuti gerak mouse), flyout-nya kelihatan
      // "nyangkut" ngambang di atas halaman yang baru aja dibuka (keluhan
      // user: "setelah memilih halaman harusnya ke-close si navigation tab").
      // Class .just-picked maksa nutup instan lewat CSS (lihat style.css),
      // dilepas lagi begitu kursor beneran ninggalin grup-nya (atau abis
      // 1.5 detik sebagai jaga-jaga kalau mouseleave gak sempat kepicu).
      const group = el.closest('.nav-group');
      if (group) {
        group.classList.add('just-picked');
        const clearJustPicked = () => group.classList.remove('just-picked');
        group.addEventListener('mouseleave', clearJustPicked, { once: true });
        setTimeout(() => { group.removeEventListener('mouseleave', clearJustPicked); clearJustPicked(); }, 1500);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// SHOW/HIDE PASSWORD (ikon mata) — dipasang di field Password mana pun yang
// dibungkus .password-field (login, daftar akun, & modal Kelola User).
// Pakai event delegation di document supaya field yang muncul belakangan
// (mis. field di dalam modal) otomatis ikut kepakai tanpa wiring ulang.
// ---------------------------------------------------------------------------
function wirePasswordToggles() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.toggle-password');
    if (!btn) return;
    const input = document.getElementById(btn.dataset.target);
    if (!input) return;
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    btn.querySelector('.icon-eye').hidden = !showing;
    btn.querySelector('.icon-eye-off').hidden = showing;
    btn.setAttribute('aria-label', showing ? 'Tampilkan Password' : 'Sembunyikan Password');
  });
}

// ---------------------------------------------------------------------------
// MODAL KONFIRMASI — pengganti confirm() bawaan browser (popupnya jelek &
// gak senada sama tampilan app, keluhan user). Dipanggil kayak gini:
//   const ok = await showConfirmModal({ message: 'Yakin?', danger: true });
//   if (!ok) return;
// Cuma boleh ada 1 yang aktif dalam satu waktu (dipakai berurutan, bukan
// bertumpuk), jadi 1 variabel resolver module-level sudah cukup.
// ---------------------------------------------------------------------------
let confirmModalResolve = null;

function showConfirmModal(opts) {
  const o = opts || {};
  return new Promise((resolve) => {
    confirmModalResolve = resolve;
    document.getElementById('confirmModalTitle').textContent = o.title || 'Konfirmasi';
    document.getElementById('confirmModalMessage').textContent = o.message || 'Yakin mau lanjut?';
    const okBtn = document.getElementById('btnConfirmModalOk');
    okBtn.textContent = o.confirmText || 'OK';
    okBtn.classList.toggle('btn-danger', !!o.danger);
    okBtn.classList.toggle('btn-primary', !o.danger);
    document.getElementById('btnConfirmModalCancel').textContent = o.cancelText || 'Batal';
    document.getElementById('confirmModalBackdrop').hidden = false;
    document.getElementById('confirmModal').hidden = false;
    okBtn.focus();
  });
}

function resolveConfirmModal(result) {
  document.getElementById('confirmModalBackdrop').hidden = true;
  document.getElementById('confirmModal').hidden = true;
  if (confirmModalResolve) {
    const resolve = confirmModalResolve;
    confirmModalResolve = null;
    resolve(result);
  }
}

function wireConfirmModal() {
  document.getElementById('btnConfirmModalOk').addEventListener('click', () => resolveConfirmModal(true));
  document.getElementById('btnConfirmModalCancel').addEventListener('click', () => resolveConfirmModal(false));
  document.getElementById('btnCloseConfirmModal').addEventListener('click', () => resolveConfirmModal(false));
  document.getElementById('confirmModalBackdrop').addEventListener('click', () => resolveConfirmModal(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('confirmModal').hidden) resolveConfirmModal(false);
  });
}

// ---------------------------------------------------------------------------
// GRUP NAVIGASI (Transaksi / Stock Control) — accordion tap-to-expand.
// Di device dengan mouse (hover:hover & pointer:fine), submenu-nya justru
// tampil sebagai flyout melayang pas di-hover (murni CSS, lihat style.css).
// Di HP/tablet/pen (gak ada hover presisi) INI yang jadi cara utama: tap
// togglenya -> submenu meluas ke bawah di tempat, tap lagi -> nutup.
// Klik pakai MOUSE (termasuk di laptop/PC layar SENTUH yang dipakai pakai
// mouse, lihat catatan di isMouseClickEvent) SENGAJA di-skip di sini —
// biarkan hover-flyout yang nangani, soalnya kalau accordion ini ikut
// kepicu, judul grup lain ikut ketutup & seluruh sidebar meluas ke bawah
// (keluhan user: "masih kebawah" walau di desktop, gara-gara ke-klik pakai
// mouse padahal maksudnya cuma mau lihat submenu-nya).
// Buka salah satu grup otomatis nutup grup lain biar sidebar gak kepanjangan.
// ---------------------------------------------------------------------------
function initNavGroups() {
  const groups = document.querySelectorAll('.sidebar-nav .nav-group');
  if (!groups.length) return;

  groups.forEach((group) => {
    const toggle = group.querySelector('.nav-group-toggle');
    if (!toggle) return;
    toggle.addEventListener('click', (e) => {
      // Skip toggle JS-nya HANYA kalau CSS hover-flyout-nya beneran aktif
      // (media query hover:hover & pointer:fine match) — bukan cuma ngecek
      // pointerType 'mouse' doang. Soalnya di laptop 2-in-1 yang lagi di
      // Windows "Tablet Mode", OS bisa lapor ke browser bahwa device ini
      // touch-primary (hover:hover & pointer:fine jadi FALSE) WALAU klik yang
      // masuk aslinya dari mouse fisik (USB/Bluetooth) — pointerType klik itu
      // tetap 'mouse'. Kalau JS di sini masih ngandelin pointerType doang buat
      // skip, submenu jadi GAK BISA DIBUKA SAMA SEKALI di kondisi itu: CSS
      // hover-flyout-nya udah nggak aktif (media query gak match), tapi JS
      // accordion-nya juga ikut di-skip (padahal harusnya dia yang nangani).
      // Keluhan user: "pake mouse di mode tablet gak muncul, pake tangan
      // muncul". Makanya kondisinya harus SAMA PERSIS kaya media query di
      // CSS, biar JS & CSS selalu sinkron soal mode mana yang lagi aktif.
      const hoverFlyoutActive = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      if (e.pointerType === 'mouse' && hoverFlyoutActive) return;
      const willExpand = !group.classList.contains('expanded');
      groups.forEach((g) => {
        g.classList.remove('expanded');
        const t = g.querySelector('.nav-group-toggle');
        if (t) t.setAttribute('aria-expanded', 'false');
      });
      if (willExpand) {
        group.classList.add('expanded');
        toggle.setAttribute('aria-expanded', 'true');
      }
    });
  });
}

// ---------------------------------------------------------------------------
// SERVICE WORKER & NOTIFIKASI UPDATE VERSI
// ---------------------------------------------------------------------------
// Minta nomor versi ke sebuah service worker (installing/waiting/controller)
// lewat MessageChannel. Resolve null kalau workernya kosong atau tidak
// membalas dalam 2 detik (mis. browser lama yang belum dukung message ini).
function getSwVersion(worker) {
  return new Promise((resolve) => {
    if (!worker) { resolve(null); return; }
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), 2000);
    channel.port1.onmessage = (e) => {
      clearTimeout(timer);
      resolve(e.data && e.data.version);
    };
    worker.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
  });
}

function setSidebarVersion(v) {
  const el = document.getElementById('sidebarVersion');
  if (el && v) el.textContent = 'v' + v;
}

// Worker mana pun yang lagi ada boleh ditanya versinya — script service worker
// sudah daftarin listener 'message' di scope paling atas (bukan di dalam event
// 'install'), jadi TETAP bisa jawab GET_VERSION walau masih 'installing' atau
// bahkan kalau proses cache.addAll()-nya di 'install' gagal. Sebelumnya cuma
// nanya ke `controller`, yang kosong terus di kunjungan pertama sampai
// 'controllerchange' kepicu — kalau itu nggak pernah kepicu (mis. registrasi SW
// gagal total), versi di sidebar nggak pernah keisi & macet di placeholder.
function pickAnySwWorker(registration) {
  return navigator.serviceWorker.controller || registration.active || registration.waiting || registration.installing || null;
}

function showUpdateBanner(version) {
  const banner = document.getElementById('updateBanner');
  if (!banner) return;
  document.getElementById('updateBannerVersion').textContent = version ? 'v' + version + ' siap dipasang' : 'Siap dipasang';
  banner.hidden = false;
  void banner.offsetWidth; // reflow supaya transisi masuk selalu jalan
  banner.classList.add('show');
}

function hideUpdateBanner() {
  const banner = document.getElementById('updateBanner');
  if (!banner) return;
  banner.classList.remove('show');
  setTimeout(() => { banner.hidden = true; }, 280);
}

function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  // Kalau saat halaman ini dimuat SUDAH ada worker yang mengontrol, berarti ini
  // bukan kunjungan pertama. Dipakai untuk membedakan "aktivasi pertama kali"
  // (jangan reload) vs "user baru saja update ke versi baru" (reload).
  let hadControllerAtLoad = !!navigator.serviceWorker.controller;
  let reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadControllerAtLoad) {
      hadControllerAtLoad = true;
      getSwVersion(navigator.serviceWorker.controller).then(setSidebarVersion);
      return;
    }
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker.register('service-worker.js').then((registration) => {
    getSwVersion(pickAnySwWorker(registration)).then((v) => { if (v) setSidebarVersion(v); });

    // Ada worker baru yang sudah selesai install & tinggal nunggu konfirmasi user.
    if (registration.waiting && navigator.serviceWorker.controller) {
      getSwVersion(registration.waiting).then(showUpdateBanner);
    }

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          getSwVersion(newWorker).then(showUpdateBanner);
        }
      });
    });

    // App PWA biasanya dibiarkan terbuka lama di background — cek update tiap
    // kali user balik buka lagi, bukan cuma pas pertama kali load.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update().catch(() => {});
    });

    // Klik nomor versi di sidebar -> cek update sekarang juga (manual), nggak
    // nunggu visibilitychange atau interval browser. Kalau ada versi baru,
    // banner "Versi baru tersedia" bakal muncul otomatis lewat listener
    // 'updatefound' di atas; kalau nggak ada, kasih tahu sudah paling baru.
    const footerBtn = document.getElementById('sidebarFooter');
    if (footerBtn) {
      let checkingUpdate = false;
      footerBtn.addEventListener('click', async () => {
        if (checkingUpdate) return;
        checkingUpdate = true;
        footerBtn.classList.add('checking');
        showToast('Mengecek update...', 'info');
        try {
          await registration.update();
          // Beri jeda sedikit supaya event 'updatefound' -> 'installed' (kalau ada
          // versi baru) sempat kepicu duluan sebelum kita cek registration.waiting.
          await new Promise((resolve) => setTimeout(resolve, 1000));
          if (!registration.waiting) {
            showToast('Sudah pakai versi terbaru.', 'success');
          }
        } catch (err) {
          showToast('Gagal cek update: ' + err.message, 'error');
        } finally {
          checkingUpdate = false;
          footerBtn.classList.remove('checking');
        }
      });
    }
  }).catch(() => {
    // gagal daftar service worker tidak menghentikan aplikasi
  });

  const btnUpdateNow = document.getElementById('btnUpdateNow');
  const btnUpdateLater = document.getElementById('btnUpdateLater');
  if (btnUpdateNow) {
    btnUpdateNow.addEventListener('click', () => {
      navigator.serviceWorker.getRegistration().then((registration) => {
        if (registration && registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      });
      hideUpdateBanner();
    });
  }
  if (btnUpdateLater) {
    btnUpdateLater.addEventListener('click', hideUpdateBanner);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Setiap kali app ini DIBUKA (bukan hashchange biasa di dalam sesi yang sama),
  // selalu mulai dari Dashboard — beberapa browser/PWA runtime (terutama HP)
  // suka "mengingat" URL/hash terakhir sebelum app ditutup dan langsung balik ke
  // situ waktu dibuka lagi, padahal maunya selalu balik ke Dashboard dulu.
  if (window.location.hash && window.location.hash !== '#/dashboard') {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  // Login & Hak Akses per Role (lihat js/auth.js) — cek dulu apa ada sesi
  // tersimpan (localStorage) SEBELUM apa pun lain dijalankan, supaya layar
  // login/app shell yang tepat langsung kelihatan tanpa kedip.
  Auth.init();
  wireLoginForm();
  wireRegisterForm();
  wireLoginRegisterToggle();
  wireLogoutButton();

  initSidebar();
  initNavGroups();
  wirePasswordToggles();
  wireConfirmModal();

  const btnCloseQrScan = document.getElementById('btnCloseQrScan');
  if (btnCloseQrScan) btnCloseQrScan.addEventListener('click', closeQrScanner);

  // Kartu Reorder Alert di Dashboard: klik/Enter buat buka popup daftar
  // lengkapnya (lihat renderReorderAlert & openReorderAlertModal di dashboard.js) —
  // dibiarkan di sini (bukan di initDashboardPage) karena Dashboard memang
  // tidak punya fungsi init tersendiri, cuma loadDashboard() yang dipanggil ulang.
  const reorderAlertCard = document.getElementById('reorderAlertCard');
  if (reorderAlertCard) {
    reorderAlertCard.addEventListener('click', openReorderAlertModal);
    reorderAlertCard.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openReorderAlertModal(); }
    });
  }
  document.getElementById('btnCloseReorderAlertModal').addEventListener('click', closeReorderAlertModal);
  document.getElementById('reorderAlertModalBackdrop').addEventListener('click', closeReorderAlertModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('reorderAlertModal').hidden) closeReorderAlertModal();
  });

  // Kartu-kartu statistik lain di Dashboard (Stock Saat Ini, Total SKU, Normal,
  // Near ROP, Need Reorder, Out of Stock) — SEMUA klik-able, popup isinya
  // menyesuaikan kartu mana yang diklik lewat atribut data-dash-filter (lihat
  // DASH_CARD_FILTERS & openDashStatModal di dashboard.js). Delegated ke
  // #page-dashboard biar 1 listener aja buat semua kartu, bukan pasang 1-1.
  const dashboardPage = document.getElementById('page-dashboard');
  if (dashboardPage) {
    dashboardPage.addEventListener('click', (e) => {
      const card = e.target.closest('[data-dash-filter]');
      if (card) openDashStatModal(card.dataset.dashFilter);
    });
    dashboardPage.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('[data-dash-filter]');
      if (card) { e.preventDefault(); openDashStatModal(card.dataset.dashFilter); }
    });
  }
  document.getElementById('btnCloseDashListModal').addEventListener('click', closeDashListModal);
  document.getElementById('dashListModalBackdrop').addEventListener('click', closeDashListModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('dashListModal').hidden) closeDashListModal();
  });

  // Chip filter Plant di popup "Total SKU Terdaftar" (lihat renderDashPlantFilterChips
  // & selectDashPlantFilter di dashboard.js) — delegated karena isi chip-nya
  // dibangun ulang tiap kali popup dibuka/plant dipilih.
  document.getElementById('dashListModalPlantFilter').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-plant]');
    if (chip) selectDashPlantFilter(chip.dataset.plant);
  });

  // Tombol "Daftarkan" di tiap baris kartu "Belum Terdaftar di Master Data"
  // (lihat dashStockItemHtml di dashboard.js) — delegated karena isi list-nya
  // dibangun ulang tiap kali popup dibuka. Pindah ke halaman Master Data &
  // langsung buka form Tambah Item yang sudah keisi kode/nama/satuan/Plant-nya
  // (lihat gotoRegisterMasterData di dashboard.js), biar user nggak perlu
  // nyari & ngetik ulang manual.
  document.getElementById('dashListModalBody').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-goto-master]');
    if (btn) gotoRegisterMasterData(btn.dataset);
  });

  // Popup Riwayat Transaksi 1 SKU (klik baris di halaman Stock Balance / Mutasi
  // Stock — lihat openSbRiwayatModal di stock-balance.js).
  document.getElementById('btnCloseSbRiwayatModal').addEventListener('click', closeSbRiwayatModal);
  document.getElementById('sbRiwayatModalBackdrop').addEventListener('click', closeSbRiwayatModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('sbRiwayatModal').hidden) closeSbRiwayatModal();
  });

  Router.register('dashboard', () => {
    if (!dashboardLoadedOnce) loadDashboard();
  });
  // Dashboard cuma narik data server SEKALI per sesi (lihat dashboardLoadedOnce
  // di dashboard.js) — pindah halaman terus balik lagi TIDAK menarik ulang.
  // Tombol Refresh ini satu-satunya cara narik data terbaru tanpa reload
  // seluruh app (mis. abis nambah Barang Masuk di tab/perangkat lain).
  wireRefreshButton('btnRefreshDashboard', loadDashboard);
  Router.register('penerimaan', () => {
    initPenerimaanPage();
  });
  Router.register('putaway', () => {
    initPutawayPage();
  });
  Router.register('pemakaian', () => {
    initPemakaianPage();
  });
  Router.register('stock-balance', () => {
    initStockBalancePage();
  });
  Router.register('master-data', () => {
    initMasterDataPage();
  });
  Router.register('qr-labels', () => {
    initQrLabelsPage();
  });
  Router.register('riwayat', () => {
    initRiwayatPage();
  });
  Router.register('opname', () => {
    initOpnamePage();
  });
  Router.register('alert-order', () => {
    initAlertOrderPage();
  });
  Router.register('users', () => {
    initUsersPage();
  });
  Router.register('pengaturan', () => {
    initPengaturanPage();
  });

  // Router HANYA di-init (daftar listener hashchange + render pertama) kalau
  // sudah ada sesi login valid tersimpan. Kalau belum, layar login yang
  // tampil duluan (lihat showLoginScreen di auth.js) — Router baru dijalankan
  // dari startAppAfterLogin() begitu login berhasil.
  if (Auth.isLoggedIn()) {
    startAppAfterLogin();
  } else {
    showLoginScreen();
  }

  initServiceWorker();
});
