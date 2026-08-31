// ============================================================================
// APP INIT
// ============================================================================

let toastTimer = null;
function showToast(msg, type) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (type ? ' ' + type : '');
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
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
