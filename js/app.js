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

document.addEventListener('DOMContentLoaded', () => {
  initSidebar();

  Router.register('dashboard', () => {
    if (!dashboardLoadedOnce) loadDashboard();
  });
  Router.register('penerimaan', () => {
    initPenerimaanPage();
  });
  Router.init();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {
      // gagal daftar service worker tidak menghentikan aplikasi
    });
  }
});
