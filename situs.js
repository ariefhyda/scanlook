/* ScanLook — skrip bersama untuk semua halaman:
 * 1) tombol "Pengaturan cookie" membuka ulang pesan izin CMP Google (Privasi & pesan AdSense);
 * 2) memberi ruang untuk iklan jangkar AdSense agar tidak menutupi aplikasi.
 * Pembuat: ariefhyda — https://github.com/ariefhyda/scanlook
 */
'use strict';

(() => {
  // ------------------------------------------------------------ pengaturan izin
  window.googlefc = window.googlefc || {};
  window.googlefc.callbackQueue = window.googlefc.callbackQueue || [];

  document.querySelectorAll('[data-consent-settings]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      window.googlefc.callbackQueue.push(() => {
        if (typeof window.googlefc.showRevocationMessage === 'function') window.googlefc.showRevocationMessage();
      });
    });
  });

  // ------------------------------------------------------------ ruang iklan jangkar
  const root = document.documentElement;
  let lastTop = -1;
  let lastBottom = -1;

  function syncAnchorAds() {
    let top = 0;
    let bottom = 0;
    const vh = window.innerHeight;
    document.querySelectorAll('ins.adsbygoogle').forEach((el) => {
      if (getComputedStyle(el).position !== 'fixed') return;
      const r = el.getBoundingClientRect();
      // abaikan yang tersembunyi dan iklan layar penuh (vignette)
      if (r.height < 1 || r.width < window.innerWidth * 0.5 || r.height > vh * 0.5) return;
      if (r.top < vh / 2) top = Math.max(top, Math.round(r.bottom));
      else bottom = Math.max(bottom, Math.round(vh - r.top));
    });
    if (top !== lastTop) { root.style.setProperty('--ad-top', `${top}px`); lastTop = top; }
    if (bottom !== lastBottom) { root.style.setProperty('--ad-bottom', `${bottom}px`); lastBottom = bottom; }
  }

  syncAnchorAds();
  setInterval(syncAnchorAds, 1500);
  window.addEventListener('resize', syncAnchorAds);
})();
