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
    getSwVersion(navigator.serviceWorker.controller).then(setSidebarVersion);

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
  Router.init();

  initServiceWorker();
});
