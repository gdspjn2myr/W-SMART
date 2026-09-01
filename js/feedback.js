// ============================================================================
// FEEDBACK GETAR & BUNYI — konfirmasi non-visual untuk aksi sukses/gagal (scan,
// simpan, dsb). Penting dipakai di gudang: tangan kadang kotor/pakai sarung
// tangan, atau mata lagi fokus ke rak/barang, jadi nggak selalu sempat lihat
// layar tiap kali. Pakai Vibration API + beep sintetis lewat WebAudio (BUKAN
// file audio eksternal) — tetap ringan & jalan offline, sama seperti alasan
// qrcode-lib.js divendor bukan dipanggil dari CDN.
//
// Semua dibungkus try/catch — device/browser yang tidak dukung salah satu (mis.
// desktop tanpa getar, atau browser yang block autoplay AudioContext) TIDAK
// BOLEH bikin aksi utama (scan/simpan) ikut gagal, feedback ini cuma pemanis.
// ============================================================================

let feedbackAudioCtx = null;
function getFeedbackAudioCtx_() {
  if (feedbackAudioCtx) return feedbackAudioCtx;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    feedbackAudioCtx = new Ctx();
    return feedbackAudioCtx;
  } catch (e) {
    return null;
  }
}

function playFeedbackTone_(freq, durationMs, delayMs) {
  const ctx = getFeedbackAudioCtx_();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const startAt = ctx.currentTime + (delayMs || 0) / 1000;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.22, startAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + durationMs / 1000 + 0.03);
  } catch (e) {
    // abaikan — feedback bukan hal kritis
  }
}

// Nada tinggi pendek + getar singkat = "berhasil".
function feedbackSuccess() {
  try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) {}
  playFeedbackTone_(880, 90, 0);
}

// Dua nada rendah + getar dobel = "gagal", sengaja beda pola supaya kebedaan
// tanpa perlu lihat layar sama sekali.
function feedbackError() {
  try { if (navigator.vibrate) navigator.vibrate([70, 60, 70]); } catch (e) {}
  playFeedbackTone_(220, 130, 0);
  playFeedbackTone_(220, 130, 160);
}
