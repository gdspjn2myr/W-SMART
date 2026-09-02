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
// SIDEBAR (drawer navigasi via tombol hamburger)
// ---------------------------------------------------------------------------
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
  sidebar.querySelectorAll('.nav-item').forEach((el) => {
    el.addEventListener('click', closeSidebar);
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
  initSidebar();

  const btnCloseQrScan = document.getElementById('btnCloseQrScan');
  if (btnCloseQrScan) btnCloseQrScan.addEventListener('click', closeQrScanner);

  Router.register('dashboard', () => {
    if (!dashboardLoadedOnce) loadDashboard();
  });
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
  Router.register('koreksi', () => {
    initKoreksiPage();
  });
  Router.register('alert-order', () => {
    initAlertOrderPage();
  });
  Router.init();

  initServiceWorker();
});
