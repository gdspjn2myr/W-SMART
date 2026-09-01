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

document.addEventListener('DOMContentLoaded', () => {
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
