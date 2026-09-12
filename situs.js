/* ScanLook — skrip bersama untuk semua halaman:
 * 1) tombol "Pengaturan cookie" membuka ulang pesan izin CMP Google (Privasi & pesan AdSense);
 * 2) memberi ruang untuk iklan jangkar AdSense agar tidak menutupi aplikasi;
 * 3) mencatat & menampilkan penghitung pengunjung (total dan per negara) dari /api/counter.
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

  // ------------------------------------------------------------ penghitung pengunjung
  // Setiap halaman mencatat kunjungan (server menghitung sekali per pengunjung per hari),
  // lalu elemen [data-visitor-stats] menampilkan total dan rincian per negara.
  const statBoxes = document.querySelectorAll('[data-visitor-stats]');
  const numberFmt = (n) => Number(n).toLocaleString('id-ID');
  const regionNames = (() => {
    try { return new Intl.DisplayNames(['id'], { type: 'region' }); } catch (e) { return null; }
  })();
  const countryName = (code) => {
    if (code === 'XX') return 'Tidak diketahui';
    try { return (regionNames && regionNames.of(code)) || code; } catch (e) { return code; }
  };

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function countryList(items, max) {
    const ol = el('ol', 'vs-list');
    for (const c of items) {
      const li = el('li');
      li.style.setProperty('--w', `${Math.max(2, (c.count / max) * 100).toFixed(1)}%`);
      li.append(el('span', 'vs-cc', c.code === 'XX' ? '??' : c.code), el('span', 'vs-name', countryName(c.code)), el('span', 'vs-num', numberFmt(c.count)));
      li.title = `${countryName(c.code)}: ${numberFmt(c.count)} pengunjung`;
      ol.append(li);
    }
    return ol;
  }

  function renderStats(box, data) {
    const limit = Number(box.dataset.limit) || 5;
    const countries = Array.isArray(data.countries) ? data.countries.filter((c) => /^[A-Z]{2}$/.test(c.code)) : [];
    const known = countries.filter((c) => c.code !== 'XX').length;
    const max = countries.length ? countries[0].count : 1;

    const head = el('div', 'vs-head');
    head.append(el('h2', 'vs-title', box.dataset.title || 'Pengunjung'), el('span', 'vs-live', 'langsung'));

    const stats = el('div', 'vs-stats');
    for (const [value, label] of [[data.total, 'total'], [data.today, 'hari ini'], [known, 'negara']]) {
      const cell = el('div');
      cell.append(el('strong', null, numberFmt(value || 0)), el('span', null, label));
      stats.append(cell);
    }

    const parts = [head, stats];
    if (countries.length) {
      parts.push(countryList(countries.slice(0, limit), max));
      if (countries.length > limit) {
        const more = el('details', 'vs-more');
        more.append(el('summary', null, `Lihat semua negara (${countries.length})`), countryList(countries.slice(limit), max));
        parts.push(more);
      }
    } else {
      parts.push(el('p', 'vs-note', 'Belum ada data negara.'));
    }
    parts.push(el('p', 'vs-note', 'Dihitung sekali per pengunjung per hari, tanpa cookie dan tanpa menyimpan alamat IP.'));
    box.replaceChildren(...parts);
    box.hidden = false;
  }

  async function loadVisitorStats() {
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    const record = !navigator.webdriver;
    try {
      const r = await fetch('/api/counter', { method: record ? 'POST' : 'GET', headers: { Accept: 'application/json' } });
      if (!r.ok) return;
      const data = await r.json();
      if (data && typeof data.total === 'number') statBoxes.forEach((box) => renderStats(box, data));
    } catch (e) {
      /* penghitung tidak tersedia — widget tetap tersembunyi */
    }
  }

  loadVisitorStats();
})();
