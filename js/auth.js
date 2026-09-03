// ============================================================================
// AUTH — Login, sesi (token), & hak akses per Role (Admin/Staff/Viewer)
// Fase 5: sebelum ini SIAPA SAJA yang buka link app bisa akses semua halaman &
// aksi tanpa dibedakan. Sekarang app selalu mulai dari layar login; setelah
// berhasil, akses tiap halaman dibatasi sesuai Role akun yang login.
// ============================================================================

const AUTH_STORAGE_KEY = 'wsmartSession';

// Halaman mana yang boleh diakses Role apa — dipakai baik buat SEMBUNYIKAN
// menu sidebar (applyRoleVisibility) MAUPUN dipanggil Router.resolve() lewat
// window.canAccessPage (lihat router.js) supaya kalau ada yang buka hash
// halaman terbatas langsung (bookmark lama, ketik URL manual), tetap dilempar
// balik ke Dashboard walau item sidebar-nya sudah disembunyikan. Backend
// (ROLE_PERMISSIONS di Code.gs) TETAP jadi penjaga utama yang sesungguhnya —
// daftar ini "cuma" UX, biar Staff/Viewer tidak lihat menu yang nanti
// ditolak servernya.
const PAGE_ROLES = {
  dashboard: ['Admin', 'Staff', 'Viewer'],
  penerimaan: ['Admin', 'Staff'],
  putaway: ['Admin', 'Staff'],
  pemakaian: ['Admin', 'Staff'],
  'stock-balance': ['Admin', 'Staff', 'Viewer'],
  'master-data': ['Admin'],
  'qr-labels': ['Admin', 'Staff'],
  riwayat: ['Admin', 'Staff', 'Viewer'],
  opname: ['Admin', 'Staff'],
  'alert-order': ['Admin', 'Staff', 'Viewer'],
  users: ['Admin']
};

let currentSession = null; // { token, nama, username, role }
let routerStarted = false;

function loadSessionFromStorage() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.token || !parsed.role) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function saveSessionToStorage(session) {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  } catch (e) {
    // localStorage penuh/diblokir browser — sesi tetap jalan di memori sampai reload
  }
}

function clearSessionStorage() {
  try { localStorage.removeItem(AUTH_STORAGE_KEY); } catch (e) { /* no-op */ }
}

const Auth = {
  init() {
    currentSession = loadSessionFromStorage();
    return currentSession;
  },
  isLoggedIn() {
    return !!currentSession;
  },
  getUser() {
    return currentSession;
  },
  getToken() {
    return currentSession ? currentSession.token : '';
  },
  setSession(session) {
    currentSession = session;
    saveSessionToStorage(session);
  },
  logout() {
    currentSession = null;
    clearSessionStorage();
  },
  canAccessPage(page) {
    if (!currentSession) return false;
    const allowed = PAGE_ROLES[page];
    if (!allowed) return true; // halaman di luar daftar (bukan bagian sistem Role) -> biarkan lolos
    return allowed.indexOf(currentSession.role) !== -1;
  },
  // Isi & kunci field "User"/"Teknisi" di form transaksi supaya SELALU sama
  // dengan identitas yang login — backend override ini juga (lihat doPost di
  // Code.gs), field readonly di sini cuma supaya UI tidak menyesatkan (jangan
  // sampai user ngetik nama lain padahal nanti diabaikan server).
  prefillUserField(id) {
    const el = document.getElementById(id);
    if (!el || !currentSession) return;
    el.value = currentSession.nama;
    el.readOnly = true;
    el.classList.add('input-readonly-auth');
  }
};

// Dipakai Router.resolve() (lihat router.js) sebagai lapis pertahanan kedua —
// menu sidebar yang tersembunyi (applyRoleVisibility) sudah cukup buat
// pemakaian normal, ini jaga-jaga kalau ada yang buka hash terlarang langsung.
window.canAccessPage = (page) => Auth.canAccessPage(page);

// Nav item yang tidak diizinkan buat Role ini disembunyikan pakai inline style
// (bukan atribut `hidden`) — .nav-item punya `display:flex` di CSS yang bisa
// menang lawan `[hidden]{display:none}` bawaan browser tergantung urutan
// cascade, jadi inline style paling aman/pasti menang.
function applyRoleVisibility() {
  const role = currentSession ? currentSession.role : null;
  document.querySelectorAll('.nav-item[data-nav]').forEach((el) => {
    const allowed = PAGE_ROLES[el.dataset.nav];
    const ok = !allowed || !role || allowed.indexOf(role) !== -1;
    el.style.display = ok ? '' : 'none';
  });
  // Grup "Transaksi"/"Stock Control" (lihat index.html & js/app.js) ikut
  // disembunyikan total kalau SEMUA anaknya tidak boleh diakses Role ini —
  // supaya Role itu tidak lihat header grup kosong yang kalau dibuka
  // submenu-nya tidak ada isinya sama sekali.
  document.querySelectorAll('.sidebar-nav .nav-group').forEach((group) => {
    const anyVisible = Array.from(group.querySelectorAll('.nav-item[data-nav]'))
      .some((el) => el.style.display !== 'none');
    group.style.display = anyVisible ? '' : 'none';
  });
}

function renderSidebarUserBox() {
  if (!currentSession) return;
  const nameEl = document.getElementById('sidebarUserName');
  const roleEl = document.getElementById('sidebarUserRole');
  if (nameEl) nameEl.textContent = currentSession.nama;
  if (roleEl) roleEl.textContent = currentSession.role;
}

function showLoginScreen(message) {
  document.getElementById('loginScreen').hidden = false;
  document.getElementById('appShell').hidden = true;
  const errEl = document.getElementById('loginError');
  if (errEl) {
    if (message) {
      errEl.textContent = message;
      errEl.hidden = false;
    } else {
      errEl.hidden = true;
      errEl.textContent = '';
    }
  }
  const userInput = document.getElementById('loginUsername');
  if (userInput) setTimeout(() => userInput.focus(), 50);
}

function showAppShell() {
  document.getElementById('loginScreen').hidden = true;
  document.getElementById('appShell').hidden = false;
  applyRoleVisibility();
  renderSidebarUserBox();
}

// Dipanggil dari api.js kalau server bilang sesi sudah tidak valid lagi (token
// habis masa berlaku di CacheService GAS, atau di-logout dari tab/perangkat
// lain) — paksa balik ke layar login supaya user tidak terus-terusan dapat
// error yang membingungkan di setiap aksi yang dicoba.
function handleSessionExpired() {
  Auth.logout();
  showLoginScreen('Sesi kamu berakhir, silakan login lagi.');
}
window.handleSessionExpired = handleSessionExpired;

// Dipanggil setelah login BERHASIL (baik dari submit form, maupun sesi yang
// sudah tersimpan sebelumnya di localStorage saat app baru dibuka). Router
// hanya boleh Router.init() SEKALI (daftar listener hashchange) — kalau
// dipanggil ulang tiap re-login bisa nge-double listener & nge-double fetch
// data tiap ganti halaman.
function startAppAfterLogin() {
  showAppShell();
  if (!routerStarted) {
    routerStarted = true;
    Router.init();
    return;
  }
  if (window.location.hash === '#/dashboard' || window.location.hash === '') {
    Router.resolve();
  } else {
    window.location.hash = '#/dashboard'; // listener hashchange (sudah aktif) yang akan resolve()
  }
}

function wireLoginForm() {
  const form = document.getElementById('loginForm');
  if (!form) return;
  const btnSubmit = document.getElementById('btnLoginSubmit');
  const errEl = document.getElementById('loginError');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const pin = document.getElementById('loginPin').value.trim();
    if (!username || !pin) {
      errEl.textContent = 'Username & Password wajib diisi.';
      errEl.hidden = false;
      return;
    }
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Masuk...';
    errEl.hidden = true;
    try {
      const res = await Api.login({ username, pin });
      Auth.setSession({ token: res.token, nama: res.user.nama, username: res.user.username, role: res.user.role });
      form.reset();
      startAppAfterLogin();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Masuk';
    }
  });
}

// Toggle antara form Login & form Daftar Akun di layar yang sama (login-card).
// Dipisah dari wireLoginForm supaya init.js/app.js cukup panggil satu fungsi
// buat wiring seluruh layar login (lihat pemanggilnya di bagian bawah app.js).
function wireLoginRegisterToggle() {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const btnShowRegister = document.getElementById('btnShowRegister');
  const btnShowLogin = document.getElementById('btnShowLogin');
  if (!loginForm || !registerForm || !btnShowRegister || !btnShowLogin) return;

  btnShowRegister.addEventListener('click', () => {
    loginForm.hidden = true;
    registerForm.hidden = false;
    const el = document.getElementById('registerNama');
    if (el) setTimeout(() => el.focus(), 50);
  });
  btnShowLogin.addEventListener('click', () => {
    registerForm.hidden = true;
    loginForm.hidden = false;
    const el = document.getElementById('loginUsername');
    if (el) setTimeout(() => el.focus(), 50);
  });
}

function wireRegisterForm() {
  const form = document.getElementById('registerForm');
  if (!form) return;
  const btnSubmit = document.getElementById('btnRegisterSubmit');
  const errEl = document.getElementById('registerError');
  const successEl = document.getElementById('registerSuccess');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.hidden = true;
    successEl.hidden = true;

    const nama = document.getElementById('registerNama').value.trim();
    const username = document.getElementById('registerUsername').value.trim();
    const pin = document.getElementById('registerPin').value.trim();
    const pinConfirm = document.getElementById('registerPinConfirm').value.trim();

    if (!nama || !username || !pin || !pinConfirm) {
      errEl.textContent = 'Semua field wajib diisi.';
      errEl.hidden = false;
      return;
    }
    if (pin.length < 4) {
      errEl.textContent = 'Password minimal 4 karakter.';
      errEl.hidden = false;
      return;
    }
    if (pin !== pinConfirm) {
      errEl.textContent = 'Password & ulangi Password tidak sama.';
      errEl.hidden = false;
      return;
    }

    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Mendaftar...';
    try {
      const res = await Api.register({ nama, username, pin });
      form.reset();
      successEl.textContent = res.message || 'Pendaftaran berhasil dikirim. Tunggu Admin menyetujui akun kamu.';
      successEl.hidden = false;
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Daftar';
    }
  });
}

function wireLogoutButton() {
  const btn = document.getElementById('btnLogout');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (!confirm('Keluar dari W-SMART?')) return;
    try { await Api.logout(); } catch (e) { /* tetap logout lokal walau panggilan gagal (mis. offline) */ }
    Auth.logout();
    showLoginScreen();
  });
}
