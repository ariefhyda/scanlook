/* ScanLook — ubah PDF / gambar menjadi seperti hasil scan.
 * Semua proses berjalan di browser; file tidak pernah diunggah ke server.
 * Dependensi: pdf.js (dimuat dari CDN di index.html) untuk membaca PDF.
 * PDF hasil ditulis sendiri oleh buildPdf() — satu gambar JPEG per halaman.
 *
 * Pembuat : ariefhyda — https://github.com/ariefhyda
 * Repo    : https://github.com/ariefhyda/scanlook
 */
'use strict';

(() => {
  // ================================================================== Konstanta
  const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const PAPER = { a4: [595.28, 841.89], f4: [609.45, 935.43], letter: [612, 792], legal: [612, 1008] };
  const A4_AREA = PAPER.a4[0] * PAPER.a4[1];
  const MAX_PIXELS = 36e6; // batas aman ukuran kanvas per halaman
  const BED = { white: '#f3f3f1', gray: '#9d9d9d', black: '#161616' };
  const THUMB_W = 70;
  const STORE_SETTINGS = 'scanlook.settings.v1';
  const STORE_PRESETS = 'scanlook.presets.v1';

  // Kunci pengaturan yang membentuk "gaya" scan (disimpan di preset).
  const STYLE_KEYS = ['colorMode', 'saturation', 'threshold', 'brightness', 'contrast', 'paperTint', 'tintStrength',
    'lighting', 'edgeShadow', 'bed', 'skew', 'randomSkew', 'offset', 'noise', 'dust', 'streaks', 'blur'];

  const PRESETS = [
    {
      id: 'standar', name: 'Scan Standar', desc: 'Paling natural untuk dokumen umum',
      s: { colorMode: 'gray', saturation: 100, threshold: 55, brightness: -4, contrast: 6, paperTint: '#f3eddf', tintStrength: 25,
        lighting: 18, edgeShadow: 20, bed: 'white', skew: 0.9, randomSkew: true, offset: 1.5, noise: 9, dust: 15, streaks: 8, blur: 0.5 },
    },
    {
      id: 'kantor', name: 'Kantor Rapi', desc: 'Bersih, hampir lurus, noise minim',
      s: { colorMode: 'gray', saturation: 100, threshold: 55, brightness: 0, contrast: 10, paperTint: '#f5f2ea', tintStrength: 12,
        lighting: 8, edgeShadow: 0, bed: 'white', skew: 0.4, randomSkew: true, offset: 0.5, noise: 5, dust: 4, streaks: 0, blur: 0.3 },
    },
    {
      id: 'warna', name: 'Scan Warna', desc: 'Menjaga warna logo, stempel & tanda tangan',
      s: { colorMode: 'color', saturation: 85, threshold: 55, brightness: -2, contrast: 6, paperTint: '#f6efdf', tintStrength: 30,
        lighting: 15, edgeShadow: 15, bed: 'white', skew: 0.7, randomSkew: true, offset: 1.5, noise: 8, dust: 10, streaks: 5, blur: 0.5 },
    },
    {
      id: 'fotokopi', name: 'Fotokopi', desc: 'Hitam-putih kontras, bintik toner',
      s: { colorMode: 'bw', saturation: 100, threshold: 55, brightness: 6, contrast: 25, paperTint: '#ffffff', tintStrength: 0,
        lighting: 22, edgeShadow: 35, bed: 'black', skew: 1.2, randomSkew: true, offset: 3, noise: 22, dust: 35, streaks: 25, blur: 0.8 },
    },
    {
      id: 'lama', name: 'Dokumen Lama', desc: 'Kertas menguning, noda, cahaya tak rata',
      s: { colorMode: 'color', saturation: 60, threshold: 55, brightness: -4, contrast: 4, paperTint: '#e9d9b4', tintStrength: 70,
        lighting: 40, edgeShadow: 30, bed: 'gray', skew: 1.6, randomSkew: true, offset: 4, noise: 12, dust: 45, streaks: 12, blur: 0.7 },
    },
    {
      id: 'fax', name: 'Fax', desc: 'Resolusi rendah, hitam-putih kasar',
      s: { colorMode: 'bw', saturation: 100, threshold: 50, brightness: 0, contrast: 30, paperTint: '#ffffff', tintStrength: 0,
        lighting: 10, edgeShadow: 10, bed: 'white', skew: 1.0, randomSkew: true, offset: 2, noise: 28, dust: 25, streaks: 40, blur: 1.0,
        dpi: 100, quality: 55 },
    },
  ];

  const DEFAULTS = Object.assign({}, PRESETS[0].s, { dpi: 200, quality: 70, paperSize: 'source', seed: 1 });

  const PURPOSES = [
    { id: 'kecil', name: 'WA / Email', dpi: 150, quality: 55 },
    { id: 'standar', name: 'Standar', dpi: 200, quality: 70 },
    { id: 'arsip', name: 'Arsip / Cetak', dpi: 300, quality: 85 },
  ];

  const PAPER_TINTS = [['#ffffff', 'Putih'], ['#f3eddf', 'Krem'], ['#e9d9b4', 'Menguning'], ['#e6eaee', 'Keabuan']];

  const CONTROLS = [
    { title: 'Warna', open: true, items: [
      { key: 'colorMode', type: 'seg', label: 'Mode warna', options: [['color', 'Warna'], ['gray', 'Abu-abu'], ['bw', 'Hitam-putih']] },
      { key: 'saturation', type: 'range', label: 'Saturasi', min: 0, max: 150, step: 5, unit: '%', show: (s) => s.colorMode === 'color' },
      { key: 'threshold', type: 'range', label: 'Ambang hitam-putih', min: 25, max: 80, step: 1, unit: '%', show: (s) => s.colorMode === 'bw',
        hint: 'Makin tinggi, makin banyak bagian yang menjadi hitam' },
      { key: 'brightness', type: 'range', label: 'Kecerahan', min: -50, max: 50, step: 1, signed: true },
      { key: 'contrast', type: 'range', label: 'Kontras', min: -50, max: 60, step: 1, signed: true },
    ] },
    { title: 'Kertas & cahaya', open: true, items: [
      { key: 'paperTint', type: 'tint', label: 'Warna kertas' },
      { key: 'tintStrength', type: 'range', label: 'Kekuatan warna kertas', min: 0, max: 100, step: 1, unit: '%' },
      { key: 'lighting', type: 'range', label: 'Cahaya tidak rata', min: 0, max: 100, step: 1 },
      { key: 'edgeShadow', type: 'range', label: 'Bayangan tepi', min: 0, max: 100, step: 1, hint: 'Bayangan dari tutup scanner di salah satu tepi' },
      { key: 'bed', type: 'seg', label: 'Latar pemindai', options: [['white', 'Putih'], ['gray', 'Abu-abu'], ['black', 'Hitam']],
        hint: 'Warna yang tampak di sudut saat kertas miring' },
    ] },
    { title: 'Posisi kertas', items: [
      { key: 'skew', type: 'range', label: 'Kemiringan maks.', min: 0, max: 5, step: 0.1, unit: '°' },
      { key: 'offset', type: 'range', label: 'Pergeseran maks.', min: 0, max: 10, step: 0.5, unit: ' mm' },
      { key: 'randomSkew', type: 'toggle', label: 'Acak berbeda di tiap halaman' },
    ] },
    { title: 'Tekstur & kotoran', items: [
      { key: 'noise', type: 'range', label: 'Noise / grain', min: 0, max: 50, step: 1 },
      { key: 'dust', type: 'range', label: 'Debu & bintik', min: 0, max: 100, step: 1 },
      { key: 'streaks', type: 'range', label: 'Garis scanner', min: 0, max: 100, step: 1, hint: 'Garis vertikal tipis akibat kaca scanner kotor' },
      { key: 'blur', type: 'range', label: 'Blur (kelembutan)', min: 0, max: 3, step: 0.1, unit: ' px' },
    ] },
    { title: 'Output', open: true, items: [
      { key: 'dpi', type: 'seg', label: 'Resolusi (DPI)', options: [[100, '100'], [150, '150'], [200, '200'], [300, '300']] },
      { key: 'quality', type: 'range', label: 'Kualitas JPEG', min: 30, max: 95, step: 1, unit: '%',
        hint: 'Makin rendah, file makin kecil dan artefak kompresi makin terlihat' },
      { key: 'paperSize', type: 'select', label: 'Ukuran kertas', options: [['source', 'Ikuti dokumen asli'], ['a4', 'A4 (210 × 297 mm)'],
        ['f4', 'F4 / Folio (215 × 330 mm)'], ['letter', 'Letter (216 × 279 mm)'], ['legal', 'Legal (216 × 356 mm)']] },
      { key: 'seed', type: 'seed', label: 'Variasi acak' },
    ] },
  ];

  // ================================================================== Utilitas
  const $ = (sel) => document.querySelector(sel);

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : String(c));
    }
    return el;
  }

  function makeCanvas(w, hgt) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(hgt));
    return c;
  }

  function fmtBytes(n) {
    if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
    return `${(n / 1048576).toFixed(1).replace('.', ',')} MB`;
  }

  function fmtVal(def, v) {
    let s = Number(v).toFixed(def.step < 1 ? 1 : 0).replace('.', ',');
    if (def.signed && v > 0) s = '+' + s;
    return s + (def.unit || '');
  }

  function same(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-6;
    return String(a).toLowerCase() === String(b).toLowerCase();
  }

  function mixHex(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = (sh) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }

  // Hash + PRNG deterministik: seed yang sama => hasil yang sama persis.
  function hash32(a, b, c) {
    let x = 0x811c9dc5;
    for (const v of [a, b, c]) {
      x = Math.imul(x ^ (v >>> 0), 0x01000193);
      x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d); x ^= x >>> 12;
    }
    return x >>> 0;
  }
  function prng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Memberi kesempatan browser menggambar ulang tanpa dilambatkan di tab latar.
  function yieldUi() {
    return new Promise((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => resolve();
      ch.port2.postMessage(0);
    });
  }

  function toJpeg(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Browser gagal membuat JPEG.'))), 'image/jpeg', quality);
    });
  }

  function toast(msg, kind) {
    const t = h('div', { class: `toast ${kind || ''}`, role: 'status' }, msg);
    $('#toasts').append(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, kind === 'error' ? 6500 : 3500);
  }

  // ================================================================== State
  const pdfjs = window.pdfjsLib || null;

  const state = {
    settings: loadSettings(),
    userPresets: loadUserPresets(),
    files: [], // {id, name, kind: 'pdf'|'image'|'sample', pageCount, pdf?, bitmap?}
    pages: [], // {id, fileId, kind: 'pdf'|'image', page?, bitmap?, srcW?, wPt, hPt, excluded, thumb}
    current: 0,
    rec: null,
    preview: null, // {bytes, src, geom}
    busy: false,
    cancel: false,
    fileNameTouched: false,
  };
  let fileSeq = 0;
  let pageSeq = 0;

  function sanitize(obj) {
    const out = { ...DEFAULTS };
    if (obj && typeof obj === 'object') {
      for (const k of Object.keys(DEFAULTS)) if (typeof obj[k] === typeof DEFAULTS[k]) out[k] = obj[k];
    }
    return out;
  }
  function loadSettings() {
    try { return sanitize(JSON.parse(localStorage.getItem(STORE_SETTINGS) || 'null')); } catch (e) { return { ...DEFAULTS }; }
  }
  function saveSettings() {
    try { localStorage.setItem(STORE_SETTINGS, JSON.stringify(state.settings)); } catch (e) { /* penyimpanan tidak tersedia */ }
  }
  function loadUserPresets() {
    try {
      const arr = JSON.parse(localStorage.getItem(STORE_PRESETS) || '[]');
      return Array.isArray(arr) ? arr.filter((p) => p && p.id && p.name && p.s && typeof p.s === 'object') : [];
    } catch (e) { return []; }
  }
  function saveUserPresets() {
    try { localStorage.setItem(STORE_PRESETS, JSON.stringify(state.userPresets)); } catch (e) { /* abaikan */ }
  }

  // ================================================================== Membaca file
  const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
  const isImage = (f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(f.name);

  async function addFiles(list) {
    const files = [...list];
    if (!files.length) return;
    const before = state.pages.length;
    setWorking(true);
    for (const f of files) {
      try {
        if (isPdf(f)) await addPdf(f);
        else if (isImage(f)) await addImage(f);
        else toast(`Format tidak didukung: ${f.name}`, 'error');
      } catch (err) {
        console.error(err);
        toast(err && err.message ? err.message : `Gagal membaca ${f.name}`, 'error');
      }
    }
    setWorking(false);
    pagesAdded(before);
  }

  async function addPdf(file) {
    if (!pdfjs) throw new Error('Pustaka PDF gagal dimuat (butuh internet saat membuka aplikasi). File gambar tetap bisa diproses.');
    const data = new Uint8Array(await file.arrayBuffer());
    let pdf;
    try {
      pdf = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
    } catch (err) {
      if (err && err.name === 'PasswordException') throw new Error(`"${file.name}" dilindungi kata sandi. Buka proteksinya terlebih dahulu.`);
      throw new Error(`"${file.name}" tidak dapat dibaca sebagai PDF.`);
    }
    const f = { id: ++fileSeq, name: file.name, kind: 'pdf', pageCount: pdf.numPages, pdf };
    state.files.push(f);
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 1 });
      state.pages.push({ id: ++pageSeq, fileId: f.id, kind: 'pdf', page, wPt: vp.width, hPt: vp.height, excluded: false, thumb: null });
    }
  }

  async function addImage(file) {
    let bmp = null;
    if ('createImageBitmap' in window) {
      try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { bmp = null; }
    }
    if (!bmp) {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      try { await img.decode(); } catch (e) { throw new Error(`Gambar "${file.name}" tidak didukung browser ini.`); }
      bmp = img;
    }
    addBitmapPage(bmp, file.name, 'image');
  }

  function addBitmapPage(bmp, name, kind) {
    const w = bmp.naturalWidth || bmp.width;
    const hgt = bmp.naturalHeight || bmp.height;
    const f = { id: ++fileSeq, name, kind, pageCount: 1, bitmap: bmp };
    state.files.push(f);
    // Gambar diletakkan selebar kertas A4 (tegak/mendatar mengikuti orientasi gambar).
    const wPt = w > hgt ? PAPER.a4[1] : PAPER.a4[0];
    state.pages.push({ id: ++pageSeq, fileId: f.id, kind: 'image', bitmap: bmp, srcW: w, wPt, hPt: (wPt * hgt) / w, excluded: false, thumb: null });
  }

  function pagesAdded(before) {
    if (state.pages.length === before) return;
    if (!state.fileNameTouched && state.files.length) $('#fileName').value = suggestName(state.files[0].name);
    state.current = before; // langsung tampilkan halaman pertama dari file baru
    $('#downloadLink').hidden = true;
    renderFiles();
    renderThumbs();
    updateUi();
    schedulePreview(0);
    pumpThumbs();
    analyze();
  }

  function releaseFile(f) {
    try { if (f.pdf) f.pdf.destroy(); } catch (e) { /* abaikan */ }
    try { if (f.bitmap && f.bitmap.close) f.bitmap.close(); } catch (e) { /* abaikan */ }
  }

  function removeFile(id) {
    const f = state.files.find((x) => x.id === id);
    if (!f) return;
    const cur = state.pages[state.current];
    state.files = state.files.filter((x) => x !== f);
    state.pages = state.pages.filter((p) => p.fileId !== id);
    releaseFile(f);
    srcCache.clear();
    const idx = cur ? state.pages.indexOf(cur) : -1;
    state.current = idx >= 0 ? idx : Math.max(0, Math.min(state.current, state.pages.length - 1));
    afterPagesRemoved();
  }

  function clearAll() {
    state.files.forEach(releaseFile);
    state.files = [];
    state.pages = [];
    state.current = 0;
    srcCache.clear();
    afterPagesRemoved();
  }

  function afterPagesRemoved() {
    jpegToken++;
    if (!state.pages.length) {
      state.rec = null;
      state.preview = null;
      analyzeToken++;
      $('#downloadLink').hidden = true;
      if (!state.fileNameTouched) $('#fileName').value = 'dokumen_scan.pdf';
      setStatus('');
    }
    renderFiles();
    renderThumbs();
    renderRec();
    renderPresetState();
    updateUi();
    schedulePreview(0);
    if (state.pages.length) analyze();
  }

  function suggestName(name) {
    return `${name.replace(/\.[^.]+$/, '').trim() || 'dokumen'}_scan.pdf`;
  }
  function safeName(name) {
    let n = (name || '').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'dokumen_scan.pdf';
    if (!/\.pdf$/i.test(n)) n += '.pdf';
    return n;
  }

  // ================================================================== Render sumber
  async function renderSource(p, w, hgt) {
    const c = makeCanvas(w, hgt);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    if (p.kind === 'pdf') {
      const viewport = p.page.getViewport({ scale: c.width / p.wPt });
      await p.page.render({
        canvasContext: ctx,
        viewport,
        intent: 'print', // tampilkan yang akan tercetak (termasuk isian formulir)
        annotationMode: pdfjs.AnnotationMode ? pdfjs.AnnotationMode.ENABLE : undefined,
      }).promise;
    } else {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(p.bitmap, 0, 0, c.width, c.height);
    }
    return c;
  }

  // Cache kecil untuk render sumber halaman yang sedang dipratinjau.
  const srcCache = new Map();
  async function cachedSource(p, w, hgt) {
    const key = `${p.id}:${w}x${hgt}`;
    let c = srcCache.get(key);
    if (!c) {
      c = await renderSource(p, w, hgt);
      srcCache.set(key, c);
      while (srcCache.size > 2) srcCache.delete(srcCache.keys().next().value);
    }
    return c;
  }

  // ================================================================== Efek scan
  const FILTER_OK = (() => {
    try {
      const x = document.createElement('canvas').getContext('2d');
      x.filter = 'blur(2px)';
      return x.filter === 'blur(2px)';
    } catch (e) { return false; }
  })();

  function geometry(p, s) {
    let wPt = p.wPt;
    let hPt = p.hPt;
    if (s.paperSize !== 'source' && PAPER[s.paperSize]) {
      const [a, b] = PAPER[s.paperSize];
      [wPt, hPt] = p.wPt > p.hPt ? [b, a] : [a, b];
    }
    let dpi = s.dpi;
    const px = ((wPt / 72) * dpi) * ((hPt / 72) * dpi);
    if (px > MAX_PIXELS) dpi *= Math.sqrt(MAX_PIXELS / px);
    const W = Math.round((wPt / 72) * dpi);
    const H = Math.round((hPt / 72) * dpi);
    const fit = Math.min(wPt / p.wPt, hPt / p.hPt); // isi dimuat utuh di kertas tujuan
    const cw = Math.round(((p.wPt * fit) / 72) * dpi);
    const ch = Math.round(((p.hPt * fit) / 72) * dpi);
    return { wPt, hPt, dpi, W, H, cw, ch };
  }

  async function processPage(p, index, s, useCache) {
    const g = geometry(p, s);
    const src = useCache ? await cachedSource(p, g.cw, g.ch) : await renderSource(p, g.cw, g.ch);
    const { W, H } = g;
    const k = g.dpi / 200; // ukuran efek dinyatakan dalam piksel @200 DPI
    const area = (g.wPt * g.hPt) / A4_AREA;
    // Tiap efek punya aliran acak sendiri agar mengubah satu slider tidak mengacak efek lain.
    const R = (stream) => prng(hash32(s.seed, index, stream));

    const out = makeCanvas(W, H);
    const ctx = out.getContext('2d');

    // 1) Latar pemindai lalu kertas yang sedikit miring & bergeser
    ctx.fillStyle = BED[s.bed] || BED.white;
    ctx.fillRect(0, 0, W, H);
    const rg = R(1);
    const vary = s.randomSkew;
    const angle = (vary ? rg() * 2 - 1 : 1) * s.skew * (Math.PI / 180);
    const mm = g.dpi / 25.4;
    const dx = (vary ? rg() * 2 - 1 : 0.7) * s.offset * mm;
    const dy = (vary ? rg() * 2 - 1 : 0.5) * s.offset * mm;
    ctx.save();
    ctx.translate(W / 2 + dx, H / 2 + dy);
    ctx.rotate(angle);
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = Math.max(2, 6 * k);
    ctx.fillStyle = '#fff';
    ctx.fillRect(-W / 2, -H / 2, W, H);
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.shadowBlur = 0;
    const blur = s.blur * k;
    let img = src;
    if (blur >= 0.05) {
      if (FILTER_OK) ctx.filter = `blur(${blur.toFixed(2)}px)`;
      else img = soften(src, blur);
    }
    ctx.drawImage(img, -g.cw / 2, -g.ch / 2, g.cw, g.ch);
    ctx.restore();

    // 2) Kotoran di kaca & garis sensor
    drawDust(ctx, W, H, k, area, s.dust, R);
    drawStreaks(ctx, W, H, k, s.streaks, R(5));

    // 3) Cahaya lampu scanner & bayangan tutup
    drawLighting(ctx, W, H, s.lighting, R(6));
    drawEdgeShadow(ctx, W, H, s.edgeShadow, R(7));

    // 4) Warna kertas
    if (s.tintStrength > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = s.tintStrength / 100;
      ctx.fillStyle = s.paperTint;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // 5) Mode warna, kecerahan/kontras, noise, ambang
    pixelPass(ctx, W, H, s, hash32(s.seed, index, 9));
    return { canvas: out, geom: g, src };
  }

  // Cadangan jika ctx.filter tidak didukung: perkecil lalu perbesar kembali.
  function soften(src, px) {
    const f = 1 / (1 + px * 0.8);
    const t = makeCanvas(src.width * f, src.height * f);
    const tc = t.getContext('2d');
    tc.imageSmoothingQuality = 'high';
    tc.drawImage(src, 0, 0, t.width, t.height);
    return t;
  }

  function drawDust(ctx, W, H, k, area, amount, R) {
    if (amount <= 0) return;
    // bintik debu
    const r1 = R(2);
    const n = Math.round(amount * 2.4 * area);
    for (let i = 0; i < n; i++) {
      const x = r1() * W;
      const y = r1() * H;
      const rad = (0.35 + Math.pow(r1(), 3) * 2.2) * k;
      const shade = 15 + Math.floor(r1() * 70);
      const a = 0.25 + r1() * 0.6;
      const squash = 0.55 + r1() * 0.5;
      const rot = r1() * Math.PI;
      ctx.fillStyle = `rgba(${shade},${shade},${shade},${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(x, y, Math.max(0.3, rad), Math.max(0.3, rad * squash), rot, 0, Math.PI * 2);
      ctx.fill();
    }
    // rambut / serat halus
    const r2 = R(3);
    const hairs = Math.floor((amount / 22) * area * (0.5 + r2()));
    ctx.lineCap = 'round';
    for (let i = 0; i < hairs; i++) {
      const x = r2() * W;
      const y = r2() * H;
      const len = (25 + r2() * 110) * k;
      const ang = r2() * Math.PI * 2;
      const x2 = x + Math.cos(ang) * len;
      const y2 = y + Math.sin(ang) * len;
      const cx = (x + x2) / 2 + (r2() - 0.5) * len * 0.8;
      const cy = (y + y2) / 2 + (r2() - 0.5) * len * 0.8;
      ctx.strokeStyle = `rgba(40,40,40,${(0.25 + r2() * 0.35).toFixed(3)})`;
      ctx.lineWidth = (0.5 + r2() * 0.8) * k;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(cx, cy, x2, y2);
      ctx.stroke();
    }
    // noda samar
    const r3 = R(4);
    const smudges = amount > 30 ? Math.floor(((amount - 30) / 15) * area * (0.5 + r3())) : 0;
    for (let i = 0; i < smudges; i++) {
      const x = r3() * W;
      const y = r3() * H;
      const rad = (30 + r3() * 120) * k;
      const a = (0.035 + r3() * 0.05).toFixed(3);
      const gr = ctx.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(95,80,55,${a})`);
      gr.addColorStop(1, 'rgba(95,80,55,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }

  function drawStreaks(ctx, W, H, k, amount, r) {
    if (amount <= 0) return;
    const n = 1 + Math.floor(r() * (1 + amount / 20));
    for (let i = 0; i < n; i++) {
      const x = r() * W;
      const w = (0.6 + r() * 1.8) * k;
      const light = r() < 0.2;
      const base = (0.05 + r() * 0.25) * (amount / 100);
      const gr = ctx.createLinearGradient(0, 0, 0, H);
      const stops = 4 + Math.floor(r() * 4);
      for (let j = 0; j <= stops; j++) {
        const a = (base * (0.3 + r() * 0.7)).toFixed(3);
        gr.addColorStop(j / stops, light ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);
      }
      ctx.fillStyle = gr;
      ctx.fillRect(x, 0, w, H);
    }
  }

  function drawLighting(ctx, W, H, amount, r) {
    if (amount <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    const cx = W * (0.3 + r() * 0.4);
    const cy = H * (0.3 + r() * 0.4);
    const rad = Math.hypot(W, H) * 0.75;
    const edge = Math.round(255 - amount * 0.8);
    const rg = ctx.createRadialGradient(cx, cy, rad * 0.2, cx, cy, rad);
    rg.addColorStop(0, 'rgb(255,255,255)');
    rg.addColorStop(1, `rgb(${edge},${edge},${edge})`);
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
    // satu sisi sedikit lebih gelap (lampu tidak merata)
    const horizontal = r() < 0.5;
    const lg = horizontal ? ctx.createLinearGradient(0, 0, W, 0) : ctx.createLinearGradient(0, 0, 0, H);
    const v = Math.round(255 - amount * 0.35);
    const dark = `rgb(${v},${v},${v})`;
    if (r() < 0.5) { lg.addColorStop(0, dark); lg.addColorStop(0.6, '#fff'); lg.addColorStop(1, '#fff'); }
    else { lg.addColorStop(0, '#fff'); lg.addColorStop(0.4, '#fff'); lg.addColorStop(1, dark); }
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawEdgeShadow(ctx, W, H, amount, r) {
    if (amount <= 0) return;
    const t = amount / 100;
    const pick = r();
    const side = pick < 0.4 ? 'left' : pick < 0.7 ? 'top' : pick < 0.85 ? 'right' : 'bottom';
    const size = Math.min(W, H) * (0.012 + t * 0.045);
    const alpha = 0.12 + t * 0.55;
    let g;
    let rect;
    if (side === 'left') { g = ctx.createLinearGradient(0, 0, size, 0); rect = [0, 0, size, H]; }
    else if (side === 'right') { g = ctx.createLinearGradient(W, 0, W - size, 0); rect = [W - size, 0, size, H]; }
    else if (side === 'top') { g = ctx.createLinearGradient(0, 0, 0, size); rect = [0, 0, W, size]; }
    else { g = ctx.createLinearGradient(0, H, 0, H - size); rect = [0, H - size, W, size]; }
    g.addColorStop(0, `rgba(0,0,0,${alpha.toFixed(3)})`);
    g.addColorStop(0.18, `rgba(0,0,0,${(alpha * 0.45).toFixed(3)})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(rect[0], rect[1], rect[2], rect[3]);
  }

  function pixelPass(ctx, W, H, s, seed) {
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    const c = s.contrast * 2.55;
    const cf = (259 * (c + 255)) / (255 * (259 - c));
    const br = s.brightness * 2.55;
    const lut = new Float32Array(256);
    for (let v = 0; v < 256; v++) lut[v] = (v - 128) * cf + 128 + br;
    const na = s.noise * 2.45; // jumlah 2 uniform => sebaran segitiga, sd ≈ noise
    // Noise diredam di area terang: kertas tetap bersih seperti hasil scanner (dan file lebih kecil).
    const roll = new Float32Array(256);
    for (let v = 0; v < 256; v++) {
      const t = Math.min(1, Math.max(0, (v - 190) / 65));
      roll[v] = na * (1 - 0.6 * t * t * (3 - 2 * t));
    }
    const thr = s.threshold * 2.55;
    const n = d.length;
    let x = seed | 0 || 0x2545f491;

    if (s.colorMode === 'color') {
      const sat = s.saturation / 100;
      for (let i = 0; i < n; i += 4) {
        let r = d[i];
        let g = d[i + 1];
        let b = d[i + 2];
        if (sat !== 1) {
          const l = 0.299 * r + 0.587 * g + 0.114 * b;
          r = l + (r - l) * sat; r = r <= 0 ? 0 : r >= 255 ? 255 : r | 0;
          g = l + (g - l) * sat; g = g <= 0 ? 0 : g >= 255 ? 255 : g | 0;
          b = l + (b - l) * sat; b = b <= 0 ? 0 : b >= 255 ? 255 : b | 0;
        }
        r = lut[r]; g = lut[g]; b = lut[b];
        if (na) {
          x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
          const u = (x >>> 0) / 4294967296;
          x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
          const e = (u + (x >>> 0) / 4294967296 - 1) * roll[g <= 0 ? 0 : g >= 255 ? 255 : g | 0];
          r += e; g += e; b += e;
        }
        d[i] = r; d[i + 1] = g; d[i + 2] = b;
      }
    } else {
      const bw = s.colorMode === 'bw';
      for (let i = 0; i < n; i += 4) {
        let v = lut[(d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8];
        if (na) {
          x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
          const u = (x >>> 0) / 4294967296;
          x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
          v += (u + (x >>> 0) / 4294967296 - 1) * roll[v <= 0 ? 0 : v >= 255 ? 255 : v | 0];
        }
        if (bw) v = v >= thr ? 255 : 0;
        d[i] = v; d[i + 1] = v; d[i + 2] = v;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // ================================================================== Penulis PDF
  // PDF minimal: satu gambar JPEG (DCTDecode) per halaman, ukuran halaman dalam point.
  function buildPdf(pages, title) {
    const enc = new TextEncoder();
    const parts = [];
    const offsets = [];
    let pos = 0;
    const put = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); pos += b.length; };
    const obj = (num, body) => { offsets[num] = pos; put(`${num} 0 obj\n${body}\nendobj\n`); };
    const fmt = (v) => String(Math.round(v * 100) / 100);

    put(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // %PDF-1.4
    const kids = pages.map((_, i) => `${4 + i * 3} 0 R`).join(' ');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
    obj(3, `<< /Producer (ScanLook) /Title ${pdfText(title)} /CreationDate (${pdfDate(new Date())}) >>`);
    pages.forEach((p, i) => {
      const pn = 4 + i * 3;
      const im = pn + 1;
      const cn = pn + 2;
      const w = fmt(p.wPt);
      const hh = fmt(p.hPt);
      obj(pn, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${hh}] /Resources << /XObject << /Im0 ${im} 0 R >> /ProcSet [/PDF /ImageC] >> /Contents ${cn} 0 R >>`);
      offsets[im] = pos;
      put(`${im} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.W} /Height ${p.H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
      put(p.jpeg);
      put('\nendstream\nendobj\n');
      const content = `q ${w} 0 0 ${hh} 0 0 cm /Im0 Do Q`;
      obj(cn, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    });
    const size = 4 + pages.length * 3;
    const xref = pos;
    let t = `xref\n0 ${size}\n0000000000 65535 f \n`;
    for (let i = 1; i < size; i++) t += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    t += `trailer\n<< /Size ${size} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    put(t);
    return new Blob(parts, { type: 'application/pdf' });
  }
  function pdfText(str) {
    let hex = 'FEFF';
    for (let i = 0; i < str.length; i++) hex += str.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
    return `<${hex}>`;
  }
  function pdfDate(d) {
    const p = (v) => String(v).padStart(2, '0');
    return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  // ================================================================== Rekomendasi otomatis
  let analyzeToken = 0;

  function analyzeCanvas(c) {
    const w = c.width;
    const hgt = c.height;
    const d = c.getContext('2d').getImageData(0, 0, w, hgt).data;
    let total = 0, ink = 0, colored = 0, smooth = 0;
    for (let y = 0; y < hgt - 1; y += 2) {
      for (let x = 0; x < w - 1; x += 2) {
        const i = (y * w + x) * 4;
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const l = (r * 77 + g * 150 + b * 29) >> 8;
        total++;
        if (l > 232) continue;
        ink++;
        if (Math.max(r, g, b) - Math.min(r, g, b) > 48) colored++;
        if (l > 50 && l < 215) {
          const j = i + 4;
          const q = i + w * 4;
          const lr = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
          const ld = (d[q] * 77 + d[q + 1] * 150 + d[q + 2] * 29) >> 8;
          if (Math.abs(lr - l) < 10 && Math.abs(ld - l) < 10) smooth++; // area gradasi/foto, bukan tepi huruf
        }
      }
    }
    return { total, ink, colored, smooth };
  }

  async function analyze() {
    const token = ++analyzeToken;
    const included = state.pages.filter((p) => !p.excluded);
    if (!included.length) { state.rec = null; renderRec(); return; }
    renderRec('loading');
    const agg = { total: 0, ink: 0, colored: 0, smooth: 0 };
    for (const p of included.slice(0, 6)) {
      try {
        const w = Math.round(Math.min(p.wPt, 700));
        const c = await renderSource(p, w, (w * p.hPt) / p.wPt);
        const r = analyzeCanvas(c);
        for (const key of Object.keys(agg)) agg[key] += r[key];
        c.width = 0; c.height = 0;
      } catch (e) { /* halaman dilewati */ }
      if (token !== analyzeToken) return;
    }
    let minImgDpi = Infinity;
    for (const p of included) if (p.kind === 'image') minImgDpi = Math.min(minImgDpi, p.srcW / (p.wPt / 72));
    state.rec = buildRecommendation(agg, included.length, minImgDpi);
    renderRec();
    renderPresetState();
  }

  function buildRecommendation(a, count, minImgDpi) {
    const colorRatio = a.ink ? a.colored / a.ink : 0;
    const photoRatio = a.total ? a.smooth / a.total : 0;
    const reasons = [];
    let preset = 'standar';
    if (colorRatio > 0.02) {
      preset = 'warna';
      reasons.push('Ada elemen berwarna (logo, stempel, tanda tangan, atau tautan). Mode warna menjaga warnanya tetap terlihat.');
    } else if (photoRatio > 0.04) {
      reasons.push('Ada foto atau arsiran abu-abu. Mode abu-abu lebih natural daripada hitam-putih.');
    } else {
      reasons.push('Isi dominan teks hitam. Mode abu-abu memberi hasil paling natural; pilih "Fotokopi" bila ingin hitam-putih.');
    }
    let dpi = 200;
    let quality = 70;
    const before = reasons.length;
    if (count >= 25) {
      dpi = 150; quality = 60;
      reasons.push(`${count} halaman — 150 DPI & kualitas 60% agar ukuran file tetap ringan untuk dikirim.`);
    }
    if (minImgDpi < 140) {
      dpi = 150;
      reasons.push('Resolusi gambar sumber rendah — 150 DPI sudah cukup, DPI lebih tinggi tidak menambah ketajaman.');
    }
    if (reasons.length === before) reasons.push('200 DPI & kualitas 70% — tajam dibaca, ukuran file tetap wajar.');
    return { preset, dpi, quality, reasons };
  }

  function isRecApplied() {
    const r = state.rec;
    if (!r) return false;
    const p = PRESETS.find((x) => x.id === r.preset);
    return matchesPreset(p) && state.settings.dpi === r.dpi && state.settings.quality === r.quality;
  }

  function applyRec() {
    const r = state.rec;
    if (!r) return;
    const p = PRESETS.find((x) => x.id === r.preset);
    applySettings({ ...p.s, dpi: r.dpi, quality: r.quality });
    toast(`Rekomendasi diterapkan: ${p.name}, ${r.dpi} DPI`, 'ok');
  }

  function renderRec(mode) {
    const box = $('#recBox');
    box.classList.remove('has');
    if (mode === 'loading') {
      box.replaceChildren(h('p', { class: 'muted' }, 'Menganalisis isi dokumen…'));
      return;
    }
    const r = state.rec;
    if (!r) {
      box.replaceChildren(h('p', { class: 'muted' }, 'Tambahkan file untuk mendapatkan rekomendasi otomatis sesuai isi dokumen. Atau pilih gaya scan di bawah.'));
      return;
    }
    const p = PRESETS.find((x) => x.id === r.preset);
    box.classList.add('has');
    box.replaceChildren(
      h('div', { class: 'rec-head' },
        sparkIcon(),
        h('div', {},
          h('div', { class: 'rec-kicker' }, 'Disarankan untuk dokumen ini'),
          h('div', { class: 'rec-title' }, `${p.name} · ${r.dpi} DPI · kualitas ${r.quality}%`))),
      h('ul', { class: 'rec-reasons' }, r.reasons.map((t) => h('li', {}, t))),
      h('button', { type: 'button', class: 'btn block', id: 'applyRec', onclick: applyRec }, 'Terapkan rekomendasi'),
    );
    renderPresetState();
  }

  function sparkIcon() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '18'); svg.setAttribute('height', '18'); svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'currentColor'); svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9L12 2zm7 11l.95 2.55L22.5 16.5l-2.55.95L19 20l-.95-2.55-2.55-.95 2.55-.95L19 13z');
    svg.append(path);
    return svg;
  }

  // ================================================================== Pengaturan (UI)
  const controls = [];

  function setSetting(key, value) {
    state.settings[key] = value;
    afterSettingsChange();
  }
  function applySettings(partial) {
    Object.assign(state.settings, partial);
    afterSettingsChange();
  }
  function afterSettingsChange() {
    $('#downloadLink').hidden = true; // PDF lama tidak lagi sesuai pengaturan
    saveSettings();
    syncControls();
    renderPresetState();
    schedulePreview();
  }

  function buildControls() {
    const root = $('#controls');
    const makers = { range: rangeControl, seg: segControl, toggle: toggleControl, tint: tintControl, select: selectControl, seed: seedControl };
    for (const grp of CONTROLS) {
      const body = h('div', { class: 'group-body' });
      for (const def of grp.items) {
        const c = makers[def.type](def);
        c.def = def;
        controls.push(c);
        body.append(c.row);
      }
      root.append(h('details', { class: 'group', open: !!grp.open }, h('summary', {}, grp.title), body));
    }
  }

  function syncControls() {
    for (const c of controls) {
      c.update();
      if (c.def.show) c.row.hidden = !c.def.show(state.settings);
    }
  }

  function rangeControl(def) {
    const id = `c-${def.key}`;
    const out = h('output', { for: id });
    const input = h('input', { type: 'range', id, min: def.min, max: def.max, step: def.step });
    input.addEventListener('input', () => setSetting(def.key, parseFloat(input.value)));
    input.addEventListener('dblclick', () => setSetting(def.key, DEFAULTS[def.key]));
    const row = h('div', { class: 'ctl' },
      h('div', { class: 'ctl-top' }, h('label', { for: id, title: def.hint }, def.label), out),
      input);
    return {
      row,
      update() {
        const v = state.settings[def.key];
        input.value = v;
        out.textContent = fmtVal(def, v);
      },
    };
  }

  function segControl(def) {
    const btns = def.options.map(([val, text]) => h('button', { type: 'button', role: 'radio', onclick: () => setSetting(def.key, val) }, text));
    const row = h('div', { class: 'ctl' },
      h('div', { class: 'ctl-top' }, h('span', { class: 'lbl', title: def.hint }, def.label)),
      h('div', { class: 'seg', role: 'radiogroup', 'aria-label': def.label }, btns));
    return {
      row,
      update() { def.options.forEach(([val], i) => btns[i].setAttribute('aria-checked', String(state.settings[def.key] === val))); },
    };
  }

  function toggleControl(def) {
    const input = h('input', { type: 'checkbox', class: 'switch' });
    input.addEventListener('change', () => setSetting(def.key, input.checked));
    const row = h('label', { class: 'ctl ctl-toggle' }, h('span', {}, def.label), input);
    return { row, update() { input.checked = !!state.settings[def.key]; } };
  }

  function tintControl(def) {
    const out = h('output', {});
    const chips = PAPER_TINTS.map(([val, name]) => h('button', {
      type: 'button', class: 'chip', title: name, 'aria-label': `Kertas ${name}`, style: `--c:${val}`,
      onclick: () => setSetting(def.key, val),
    }));
    const picker = h('input', { type: 'color', 'aria-label': 'Pilih warna kertas lain' });
    picker.addEventListener('input', () => setSetting(def.key, picker.value));
    const custom = h('label', { class: 'chip chip-custom', title: 'Warna lain' }, picker);
    const row = h('div', { class: 'ctl' },
      h('div', { class: 'ctl-top' }, h('span', { class: 'lbl' }, def.label), out),
      h('div', { class: 'chips' }, chips, custom));
    return {
      row,
      update() {
        const v = String(state.settings[def.key]).toLowerCase();
        picker.value = v;
        let name = v.toUpperCase();
        chips.forEach((c, i) => {
          const on = PAPER_TINTS[i][0] === v;
          c.setAttribute('aria-pressed', String(on));
          if (on) name = PAPER_TINTS[i][1];
        });
        custom.setAttribute('aria-pressed', String(!PAPER_TINTS.some(([t]) => t === v)));
        out.textContent = name;
      },
    };
  }

  function selectControl(def) {
    const id = `c-${def.key}`;
    const sel = h('select', { id }, def.options.map(([v, t]) => h('option', { value: v }, t)));
    sel.addEventListener('change', () => setSetting(def.key, sel.value));
    const row = h('div', { class: 'ctl' }, h('div', { class: 'ctl-top' }, h('label', { for: id }, def.label)), sel);
    return { row, update() { sel.value = state.settings[def.key]; } };
  }

  function seedControl(def) {
    const input = h('input', { type: 'number', id: 'c-seed', min: 1, max: 99999, step: 1 });
    input.addEventListener('change', () => {
      const v = Math.max(1, Math.min(99999, parseInt(input.value, 10) || 1));
      setSetting('seed', v);
    });
    const btn = h('button', { type: 'button', class: 'btn sm', onclick: () => setSetting('seed', 1 + Math.floor(Math.random() * 99999)) }, 'Acak ulang');
    const row = h('div', { class: 'ctl' },
      h('div', { class: 'ctl-top' }, h('label', { for: 'c-seed', title: 'Mengubah posisi debu, arah miring, dan pola noise' }, def.label)),
      h('div', { class: 'seed-row' }, input, btn));
    return { row, update() { input.value = state.settings.seed; } };
  }

  // ------------------------------------------------------------------ preset & tujuan
  function matchesPreset(p) {
    return !!p && Object.keys(p.s).every((k) => same(state.settings[k], p.s[k]));
  }

  function applyPreset(p) {
    const partial = { ...p.s };
    // Preset tanpa DPI (mis. setelah memilih Fax) kembali ke resolusi standar.
    if (!('dpi' in p.s) && state.settings.dpi < 150) Object.assign(partial, { dpi: 200, quality: 70 });
    applySettings(partial);
  }

  function swatch(s) {
    const paper = mixHex('#ffffff', s.paperTint, (s.tintStrength / 100) * 0.9);
    const ink = s.colorMode === 'bw' ? '#000' : s.colorMode === 'gray' ? '#444' : '#2b3a55';
    const hi = s.colorMode === 'color' ? '#2f67d0' : ink;
    return h('span', {
      class: 'sw',
      style: `--bed:${BED[s.bed] || BED.white};--paper:${paper};--ink:${ink};--hi:${hi};--rot:${(s.skew * 1.4).toFixed(2)}deg`,
    }, h('span', { class: 'sw-page' }, h('i'), h('i'), h('i'), h('i')));
  }

  function renderPresets() {
    const grid = $('#presetGrid');
    const cards = PRESETS.map((p) => h('div', { class: 'preset', 'data-id': p.id },
      h('button', { type: 'button', class: 'preset-main', title: p.desc, onclick: () => applyPreset(p) },
        swatch({ ...DEFAULTS, ...p.s }),
        h('span', { class: 'preset-text' }, h('strong', {}, p.name), h('small', {}, p.desc))),
      h('em', { class: 'tag', hidden: true }, 'Disarankan')));
    for (const p of state.userPresets) {
      cards.push(h('div', { class: 'preset', 'data-id': p.id },
        h('button', { type: 'button', class: 'preset-main', onclick: () => applyPreset(p) },
          swatch({ ...DEFAULTS, ...p.s }),
          h('span', { class: 'preset-text' }, h('strong', {}, p.name), h('small', {}, p.desc || 'Preset saya'))),
        h('button', { type: 'button', class: 'preset-del', title: 'Hapus preset', 'aria-label': `Hapus preset ${p.name}`, onclick: () => deletePreset(p) }, '×')));
    }
    grid.replaceChildren(...cards);
    renderPresetState();
  }

  function renderPurposes() {
    $('#purposeSeg').replaceChildren(...PURPOSES.map((p) => h('button', {
      type: 'button', role: 'radio', 'data-id': p.id, title: `${p.dpi} DPI, kualitas ${p.quality}%`,
      onclick: () => applySettings({ dpi: p.dpi, quality: p.quality }),
    }, p.name, h('small', {}, `${p.dpi} DPI`))));
  }

  function renderPresetState() {
    const all = [...PRESETS, ...state.userPresets];
    const recId = state.rec ? state.rec.preset : 'standar';
    let any = false;
    document.querySelectorAll('#presetGrid .preset').forEach((el) => {
      const on = matchesPreset(all.find((x) => x.id === el.dataset.id));
      if (on) any = true;
      el.classList.toggle('active', on);
      el.querySelector('.preset-main').setAttribute('aria-pressed', String(on));
      const tag = el.querySelector('.tag');
      if (tag) tag.hidden = el.dataset.id !== recId;
    });
    $('#customBadge').hidden = any;
    document.querySelectorAll('#purposeSeg button').forEach((b) => {
      const p = PURPOSES.find((x) => x.id === b.dataset.id);
      b.setAttribute('aria-checked', String(state.settings.dpi === p.dpi && state.settings.quality === p.quality));
    });
    const ab = $('#applyRec');
    if (ab) {
      const ok = isRecApplied();
      ab.disabled = ok;
      ab.textContent = ok ? '✓ Rekomendasi sudah diterapkan' : 'Terapkan rekomendasi';
      ab.classList.toggle('primary', !ok);
    }
  }

  function savePreset() {
    const name = (window.prompt('Nama preset baru:', 'Preset saya') || '').trim().slice(0, 40);
    if (!name) return;
    const s = {};
    for (const k of [...STYLE_KEYS, 'dpi', 'quality']) s[k] = state.settings[k];
    const mode = { color: 'Warna', gray: 'Abu-abu', bw: 'Hitam-putih' }[s.colorMode];
    state.userPresets.push({ id: `u${Date.now().toString(36)}`, name, desc: `${mode} · ${s.dpi} DPI`, s });
    saveUserPresets();
    renderPresets();
    toast(`Preset "${name}" disimpan`, 'ok');
  }

  function deletePreset(p) {
    if (!window.confirm(`Hapus preset "${p.name}"?`)) return;
    state.userPresets = state.userPresets.filter((x) => x.id !== p.id);
    saveUserPresets();
    renderPresets();
  }

  // ================================================================== Daftar file & thumbnail
  function renderFiles() {
    const kindLabel = { pdf: 'PDF', image: 'IMG', sample: 'CONTOH' };
    $('#fileList').replaceChildren(...state.files.map((f) => h('li', {},
      h('span', { class: `fi-kind ${f.kind}` }, kindLabel[f.kind]),
      h('span', { class: 'fi-name', title: f.name }, f.name),
      h('span', { class: 'fi-meta' }, `${f.pageCount} hlm`),
      h('button', { type: 'button', class: 'icon-btn sm', title: 'Hapus file', 'aria-label': `Hapus ${f.name}`, onclick: () => removeFile(f.id) }, '×'))));
    $('#sampleBtn').hidden = state.files.length > 0;
    $('#clearAll').hidden = state.files.length === 0;
  }

  function renderThumbs() {
    const box = $('#thumbs');
    box.hidden = state.pages.length === 0;
    box.replaceChildren(...state.pages.map((p, i) => {
      const holder = h('span', { class: 'thumb-img', style: `aspect-ratio:${p.wPt.toFixed(1)}/${p.hPt.toFixed(1)}` });
      if (p.thumb === 'error') holder.append(h('span', { class: 'thumb-err' }, '!'));
      else if (p.thumb) holder.append(p.thumb);
      return h('div', { class: `thumb${i === state.current ? ' active' : ''}${p.excluded ? ' excluded' : ''}`, 'data-id': p.id },
        h('button', { type: 'button', class: 'thumb-sel', title: `Halaman ${i + 1}`, onclick: () => goTo(i) },
          holder, h('span', { class: 'thumb-no' }, String(i + 1))),
        h('button', {
          type: 'button', class: 'thumb-x', 'aria-pressed': String(p.excluded),
          title: p.excluded ? 'Sertakan kembali halaman ini' : 'Jangan sertakan halaman ini di PDF',
          onclick: () => toggleExclude(i),
        }, p.excluded ? '↺' : '×'));
    }));
  }

  let thumbsBusy = false;
  async function pumpThumbs() {
    if (thumbsBusy) return;
    thumbsBusy = true;
    try {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      let p;
      while ((p = state.pages.find((x) => !x.thumb))) {
        try {
          const w = Math.round(THUMB_W * dpr);
          p.thumb = await renderSource(p, w, (w * p.hPt) / p.wPt);
        } catch (e) {
          p.thumb = 'error';
        }
        const holder = document.querySelector(`.thumb[data-id="${p.id}"] .thumb-img`);
        if (holder) holder.replaceChildren(p.thumb === 'error' ? h('span', { class: 'thumb-err' }, '!') : p.thumb);
      }
    } finally {
      thumbsBusy = false;
    }
  }

  function toggleExclude(i) {
    const p = state.pages[i];
    if (!p) return;
    p.excluded = !p.excluded;
    $('#downloadLink').hidden = true;
    renderThumbs();
    updateUi();
  }

  function goTo(i) {
    if (i < 0 || i >= state.pages.length || i === state.current) return;
    state.current = i;
    jpegToken++;
    document.querySelectorAll('#thumbs .thumb').forEach((el, j) => el.classList.toggle('active', j === i));
    const active = document.querySelector('#thumbs .thumb.active');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    updateUi();
    schedulePreview(0);
  }

  function updateUi() {
    const n = state.pages.length;
    const included = state.pages.filter((p) => !p.excluded).length;
    const cur = state.pages[state.current];
    $('#emptyState').hidden = n > 0;
    refreshVisual();
    $('#pageLabel').textContent = n ? `Halaman ${state.current + 1} / ${n}` : 'Belum ada file';
    $('#prevBtn').disabled = state.current <= 0;
    $('#nextBtn').disabled = state.current >= n - 1;
    $('#excludedNote').hidden = !(cur && cur.excluded);
    $('#compareBtn').disabled = !n;
    $('#zoomBtn').disabled = !n;
    const gb = $('#generateBtn');
    gb.disabled = !included || state.busy;
    gb.textContent = included ? `Buat PDF Scan · ${included} hlm` : 'Buat PDF Scan';
    updateEstimate();
  }

  function updateEstimate() {
    const el = $('#estimate');
    const included = state.pages.filter((p) => !p.excluded).length;
    if (!included || !state.preview || !state.preview.bytes) { el.replaceChildren(); return; }
    const est = state.preview.bytes * included + 2048;
    el.replaceChildren('Perkiraan ukuran ', h('strong', {}, `± ${fmtBytes(est)}`));
  }

  function setStatus(t) { $('#status').textContent = t || ''; }
  function setWorking(on) { $('#spinner').hidden = !on; }

  // ================================================================== Pratinjau
  let previewTimer = 0;
  let previewRunning = false;
  let previewDirty = false;
  let previewUrl = null;

  function schedulePreview(delay) {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(runPreview, delay == null ? 160 : delay);
  }

  async function runPreview() {
    if (previewRunning || state.busy) { previewDirty = true; return; }
    previewRunning = true;
    try {
      do {
        previewDirty = false;
        await renderPreview();
      } while (previewDirty && !state.busy);
    } finally {
      previewRunning = false;
    }
  }

  // Hasil ditampilkan dua tahap: kanvas mentah segera muncul, lalu diganti versi JPEG
  // (agar artefak kompresi terlihat dan ukuran file bisa dihitung).
  let resultVisual = null; // 'canvas' | 'img' | null
  let showingOrig = false;
  let jpegToken = 0;

  function refreshVisual() {
    const has = state.pages.length > 0;
    $('#outCanvas').hidden = !(has && !showingOrig && resultVisual === 'canvas');
    $('#outImg').hidden = !(has && !showingOrig && resultVisual === 'img');
    $('#origCanvas').hidden = !(has && showingOrig);
    $('#origBadge').hidden = !(has && showingOrig);
  }

  async function renderPreview() {
    jpegToken++; // JPEG dari pratinjau sebelumnya sudah basi
    const p = state.pages[state.current];
    if (!p) {
      resultVisual = null;
      state.preview = null;
      refreshVisual();
      updateEstimate();
      return;
    }
    setWorking(true);
    const s = { ...state.settings };
    const t0 = performance.now();
    let res;
    try {
      res = await processPage(p, state.current, s, true);
    } catch (err) {
      console.error(err);
      setStatus('Pratinjau gagal');
      toast(`Gagal memproses halaman: ${err && err.message ? err.message : err}`, 'error');
      return;
    } finally {
      setWorking(false);
    }
    if (state.pages[state.current] !== p) {
      res.canvas.width = 0;
      previewDirty = true;
      return;
    }
    const oc = $('#outCanvas');
    oc.width = res.canvas.width;
    oc.height = res.canvas.height;
    oc.getContext('2d').drawImage(res.canvas, 0, 0);
    resultVisual = 'canvas';
    refreshVisual();
    const { W, H } = res.geom;
    state.preview = { bytes: state.preview ? state.preview.bytes : 0, src: res.src, geom: res.geom };
    setStatus(`${W} × ${H} px · ${Math.round(performance.now() - t0)} ms`);

    const token = ++jpegToken;
    setTimeout(async () => {
      try {
        if (token !== jpegToken) return;
        const blob = await toJpeg(res.canvas, s.quality / 100);
        if (token !== jpegToken) return;
        const url = URL.createObjectURL(blob);
        const tmp = new Image();
        tmp.src = url;
        try { await tmp.decode(); } catch (e) { /* tetap tampilkan */ }
        if (token !== jpegToken) { URL.revokeObjectURL(url); return; }
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = url;
        $('#outImg').src = url;
        resultVisual = 'img';
        refreshVisual();
        if (state.preview) state.preview.bytes = blob.size;
        updateEstimate();
        setStatus(`${W} × ${H} px · ${fmtBytes(blob.size)}/hlm`);
      } catch (err) {
        console.error(err);
      } finally {
        res.canvas.width = 0;
        res.canvas.height = 0;
      }
    }, 220);
  }

  let zoomed = false;
  function setZoom(on, focus) {
    zoomed = on;
    const v = $('#viewer');
    v.classList.toggle('zoomed', on);
    $('#zoomBtn').textContent = on ? 'Pas layar' : 'Zoom 100%';
    const el = ['#outImg', '#outCanvas', '#origCanvas'].map($).find((x) => !x.hidden);
    if (on && focus && el) {
      v.scrollLeft = el.offsetLeft + el.offsetWidth * focus.x - v.clientWidth / 2;
      v.scrollTop = el.offsetTop + el.offsetHeight * focus.y - v.clientHeight / 2;
    }
  }
  function onVisualClick(e) {
    const r = e.currentTarget.getBoundingClientRect();
    setZoom(!zoomed, { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
  }

  function showOriginal(on) {
    const src = state.preview && state.preview.src;
    showingOrig = !!(on && src);
    if (showingOrig) {
      const oc = $('#origCanvas');
      oc.width = src.width;
      oc.height = src.height;
      oc.getContext('2d').drawImage(src, 0, 0);
    }
    $('#compareBtn').classList.toggle('pressed', showingOrig);
    refreshVisual();
  }

  // ================================================================== Membuat PDF
  let downloadUrl = null;

  async function generate() {
    const pages = state.pages.filter((p) => !p.excluded);
    if (!pages.length || state.busy) return;
    state.busy = true;
    state.cancel = false;
    const s = { ...state.settings };
    const fileName = safeName($('#fileName').value);
    $('#progress').hidden = false;
    $('#generateBtn').hidden = true;
    $('#downloadLink').hidden = true;
    updateUi();
    const out = [];
    try {
      for (let i = 0; i < pages.length; i++) {
        if (state.cancel) break;
        setProgress(i, pages.length);
        await yieldUi();
        const p = pages[i];
        const res = await processPage(p, state.pages.indexOf(p), s, p === state.pages[state.current]);
        const blob = await toJpeg(res.canvas, s.quality / 100);
        res.canvas.width = 0; res.canvas.height = 0;
        out.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), W: res.geom.W, H: res.geom.H, wPt: res.geom.wPt, hPt: res.geom.hPt });
      }
      if (state.cancel) {
        toast('Pembuatan PDF dibatalkan');
        return;
      }
      setProgress(pages.length, pages.length, 'Menyusun PDF…');
      const pdf = buildPdf(out, fileName.replace(/\.pdf$/i, ''));
      offerDownload(pdf, fileName);
      toast(`PDF selesai — ${pages.length} halaman, ${fmtBytes(pdf.size)}`, 'ok');
    } catch (err) {
      console.error(err);
      toast(`Gagal membuat PDF: ${err && err.message ? err.message : err}`, 'error');
    } finally {
      state.busy = false;
      $('#progress').hidden = true;
      $('#generateBtn').hidden = false;
      updateUi();
      if (previewDirty) schedulePreview(0);
    }
  }

  function setProgress(done, total, text) {
    $('#progressBar').style.width = `${((done / total) * 100).toFixed(1)}%`;
    $('#progressText').textContent = text || `Halaman ${Math.min(done + 1, total)} dari ${total}…`;
  }

  function offerDownload(blob, name) {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = URL.createObjectURL(blob);
    const a = $('#downloadLink');
    a.href = downloadUrl;
    a.download = name;
    a.textContent = `Unduh lagi (${fmtBytes(blob.size)})`;
    a.hidden = false;
    a.click();
  }

  // ================================================================== Dokumen contoh
  function makeSample() {
    const W = 1240;
    const H = 1754; // A4 @150 DPI
    const c = makeCanvas(W, H);
    const x = c.getContext('2d');
    const M = 130;
    const serif = '"Times New Roman", Times, serif';
    x.fillStyle = '#fff';
    x.fillRect(0, 0, W, H);

    // kop
    x.fillStyle = '#0f7a6a';
    x.beginPath(); x.arc(M + 44, 150, 44, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff';
    x.font = 'bold 38px Georgia, serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('CS', M + 44, 152);
    x.textAlign = 'left'; x.textBaseline = 'alphabetic';
    x.fillStyle = '#111';
    x.font = 'bold 40px Arial, sans-serif';
    x.fillText('PT CONTOH SEJAHTERA', M + 112, 142);
    x.fillStyle = '#444';
    x.font = '22px Arial, sans-serif';
    x.fillText('Jl. Contoh Raya No. 123, Kota Contoh 12345 · Telp. (000) 1234-5678', M + 112, 182);
    x.fillStyle = '#111';
    x.fillRect(M, 218, W - 2 * M, 5);
    x.fillRect(M, 229, W - 2 * M, 2);

    // judul
    x.textAlign = 'center';
    x.font = `bold 36px ${serif}`;
    x.fillText('SURAT KETERANGAN', W / 2, 320);
    const tw = x.measureText('SURAT KETERANGAN').width;
    x.fillRect(W / 2 - tw / 2, 329, tw, 2.5);
    x.font = `25px ${serif}`;
    x.fillText('Nomor: 001/CONTOH/2026', W / 2, 368);
    x.textAlign = 'left';

    // isi
    x.font = `26px ${serif}`;
    const lh = 40;
    const width = W - 2 * M;
    let y = 460;
    y = para(x, 'Yang bertanda tangan di bawah ini menerangkan dengan sebenarnya bahwa:', M, y, width, lh) + 10;
    for (const [k, v] of [['Nama', 'Nama Contoh'], ['Jabatan', 'Staf Administrasi'], ['Periode', 'Januari 2024 – Agustus 2026']]) {
      x.fillText(k, M + 40, y); x.fillText(':', M + 230, y); x.fillText(v, M + 258, y);
      y += lh;
    }
    y += 16;
    y = para(x, 'Selama bekerja, yang bersangkutan menunjukkan dedikasi, tanggung jawab, dan kerja sama yang baik dengan rekan kerja. Rincian tugas utama adalah sebagai berikut:', M, y, width, lh) + 14;

    // tabel
    const cols = [M, M + 90, M + 700, W - M];
    const rows = [['No', 'Uraian tugas', 'Keterangan'], ['1', 'Pengelolaan arsip dan surat masuk', 'Rutin'], ['2', 'Penyusunan laporan bulanan', 'Bulanan'], ['3', 'Pendataan inventaris kantor', 'Triwulan']];
    const rh = 50;
    x.fillStyle = '#e4e4e4';
    x.fillRect(cols[0], y, cols[3] - cols[0], rh);
    x.strokeStyle = '#222'; x.lineWidth = 2;
    rows.forEach((row, ri) => {
      x.font = ri === 0 ? `bold 24px ${serif}` : `24px ${serif}`;
      x.fillStyle = '#111';
      row.forEach((cell, ci) => x.fillText(cell, cols[ci] + 14, y + ri * rh + 33));
    });
    for (let ri = 0; ri <= rows.length; ri++) { x.beginPath(); x.moveTo(cols[0], y + ri * rh); x.lineTo(cols[3], y + ri * rh); x.stroke(); }
    for (const cx of cols) { x.beginPath(); x.moveTo(cx, y); x.lineTo(cx, y + rows.length * rh); x.stroke(); }
    y += rows.length * rh + 50;

    x.font = `26px ${serif}`;
    y = para(x, 'Demikian surat keterangan ini dibuat untuk dapat dipergunakan sebagaimana mestinya.', M, y, width, lh);

    // tanda tangan (tinta biru)
    const sx = W - M - 400;
    const sy = y + 70;
    const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    x.fillText(`Kota Contoh, ${today}`, sx, sy);
    x.fillText('Direktur,', sx, sy + lh);
    x.strokeStyle = '#1f3fae'; x.lineWidth = 3.2; x.lineCap = 'round'; x.lineJoin = 'round';
    x.beginPath();
    x.moveTo(sx + 20, sy + 150);
    x.bezierCurveTo(sx + 50, sy + 60, sx + 90, sy + 70, sx + 80, sy + 150);
    x.bezierCurveTo(sx + 75, sy + 190, sx + 120, sy + 100, sx + 160, sy + 120);
    x.bezierCurveTo(sx + 190, sy + 135, sx + 200, sy + 90, sx + 240, sy + 110);
    x.bezierCurveTo(sx + 270, sy + 125, sx + 300, sy + 95, sx + 330, sy + 105);
    x.stroke();
    x.beginPath(); x.moveTo(sx + 40, sy + 170); x.quadraticCurveTo(sx + 200, sy + 150, sx + 340, sy + 162); x.stroke();
    x.fillStyle = '#111';
    x.font = `bold 26px ${serif}`;
    x.fillText('Nama Direktur Contoh', sx, sy + 225);
    const nw = x.measureText('Nama Direktur Contoh').width;
    x.fillRect(sx, sy + 232, nw, 2);

    x.font = 'italic 19px Arial, sans-serif';
    x.fillStyle = '#777';
    x.fillText('Dokumen contoh untuk mencoba ScanLook — tidak memiliki arti apa pun.', M, H - 90);
    return c;
  }

  function para(x, text, left, y, maxW, lh) {
    let line = '';
    for (const word of text.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (line && x.measureText(test).width > maxW) {
        x.fillText(line, left, y);
        y += lh;
        line = word;
      } else {
        line = test;
      }
    }
    if (line) { x.fillText(line, left, y); y += lh; }
    return y;
  }

  function addSample() {
    const before = state.pages.length;
    addBitmapPage(makeSample(), 'Contoh surat.png', 'sample');
    pagesAdded(before);
  }

  // ================================================================== Inisialisasi
  function init() {
    if (pdfjs) pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    buildControls();
    renderPurposes();
    renderPresets();
    syncControls();
    renderRec();
    renderFiles();
    updateUi();

    const input = $('#fileInput');
    const pick = () => input.click();
    $('#dropzone').addEventListener('click', pick);
    $('#emptyPick').addEventListener('click', pick);
    input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
    $('#sampleBtn').addEventListener('click', addSample);
    $('#emptySample').addEventListener('click', addSample);
    $('#clearAll').addEventListener('click', clearAll);
    $('#prevBtn').addEventListener('click', () => goTo(state.current - 1));
    $('#nextBtn').addEventListener('click', () => goTo(state.current + 1));
    $('#zoomBtn').addEventListener('click', () => setZoom(!zoomed));
    for (const id of ['#outImg', '#outCanvas', '#origCanvas']) $(id).addEventListener('click', onVisualClick);
    $('#generateBtn').addEventListener('click', generate);
    $('#cancelBtn').addEventListener('click', () => { state.cancel = true; });
    $('#resetBtn').addEventListener('click', () => { applySettings({ ...DEFAULTS }); toast('Pengaturan dikembalikan ke bawaan'); });
    $('#savePresetBtn').addEventListener('click', savePreset);
    $('#fileName').addEventListener('input', () => { state.fileNameTouched = true; });

    // tahan untuk membandingkan dengan dokumen asli
    const cmp = $('#compareBtn');
    cmp.addEventListener('pointerdown', (e) => { e.preventDefault(); showOriginal(true); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) cmp.addEventListener(ev, () => showOriginal(false));
    cmp.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); showOriginal(true); } });
    cmp.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') showOriginal(false); });
    cmp.addEventListener('contextmenu', (e) => e.preventDefault());

    // seret & lepas file ke seluruh jendela
    const overlay = $('#dropOverlay');
    const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    let depth = 0;
    window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; overlay.hidden = false; });
    window.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) overlay.hidden = true; });
    window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
    window.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      overlay.hidden = true;
      addFiles(e.dataTransfer.files);
    });

    // tempel gambar dari clipboard (Ctrl+V)
    window.addEventListener('paste', (e) => {
      const files = e.clipboardData ? Array.from(e.clipboardData.files || []) : [];
      if (files.length) addFiles(files);
    });

    document.addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('input, select, textarea')) return;
      if (e.key === 'ArrowLeft') goTo(state.current - 1);
      else if (e.key === 'ArrowRight') goTo(state.current + 1);
    });

    if (!pdfjs) toast('Pustaka PDF tidak termuat — periksa koneksi internet lalu muat ulang. File gambar tetap bisa diproses.', 'error');
  }

  init();
})();
