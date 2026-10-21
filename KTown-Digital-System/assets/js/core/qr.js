/* K.Town — branded QR codes (rounded modules, K.Town mark in the centre).
   Uses the MIT-licensed qrcode-generator by Kazuhiko Arase (assets/js/vendor/qrcode.js).
   High error correction (H) keeps codes readable with the logo in the middle. */
(function () {
  'use strict';
  const KT = (window.KT = window.KT || {});

  function matrix(text, ecc) {
    const q = window.qrcode(0, ecc || 'H');
    q.addData(text);
    q.make();
    const n = q.getModuleCount();
    return { n, dark: (r, c) => q.isDark(r, c) };
  }

  function inFinder(r, c, n) {
    return (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  }

  /* opts: margin (modules), fg (data colour), eye (finder colour), eyeDot, bg, logo (true/false), round (0..1) */
  function svg(text, opts) {
    const o = Object.assign({ margin: 3, fg: '#751228', eye: '#000000', eyeDot: '#751228', bg: '#ffffff', logo: true, round: 0.28, title: 'QR code' }, opts || {});
    const m = matrix(text, 'H');
    const n = m.n;
    const size = n + o.margin * 2;
    const logoFrac = n >= 45 ? 0.16 : 0.22;            // smaller logo on very dense codes
    const lc = n / 2, lr = (n * logoFrac) / 2 + 0.6;    // cleared circle around the logo
    let d = '';
    const s = 0.92, off = (1 - s) / 2, rr = Math.min(0.5, o.round) * s;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!m.dark(r, c) || inFinder(r, c, n)) continue;
        if (o.logo) { const dx = c + 0.5 - lc, dy = r + 0.5 - lc; if (dx * dx + dy * dy < lr * lr) continue; }
        const x = c + o.margin + off, y = r + o.margin + off;
        // rounded square as a path (keeps the file small)
        d += 'M' + (x + rr).toFixed(2) + ',' + y.toFixed(2) + 'h' + (s - 2 * rr).toFixed(2) + 'a' + rr.toFixed(2) + ',' + rr.toFixed(2) + ' 0 0 1 ' + rr.toFixed(2) + ',' + rr.toFixed(2) +
          'v' + (s - 2 * rr).toFixed(2) + 'a' + rr.toFixed(2) + ',' + rr.toFixed(2) + ' 0 0 1 -' + rr.toFixed(2) + ',' + rr.toFixed(2) +
          'h-' + (s - 2 * rr).toFixed(2) + 'a' + rr.toFixed(2) + ',' + rr.toFixed(2) + ' 0 0 1 -' + rr.toFixed(2) + ',-' + rr.toFixed(2) +
          'v-' + (s - 2 * rr).toFixed(2) + 'a' + rr.toFixed(2) + ',' + rr.toFixed(2) + ' 0 0 1 ' + rr.toFixed(2) + ',-' + rr.toFixed(2) + 'z';
      }
    }
    const eye = (r, c) => {
      const x = c + o.margin, y = r + o.margin;
      return '<rect x="' + (x + 0.5) + '" y="' + (y + 0.5) + '" width="6" height="6" rx="1.7" fill="none" stroke="' + o.eye + '" stroke-width="1"/>' +
        '<rect x="' + (x + 2) + '" y="' + (y + 2) + '" width="3" height="3" rx="0.9" fill="' + o.eyeDot + '"/>';
    };
    let logo = '';
    if (o.logo && KT.BRAND) {
      const R = (n * logoFrac) / 2;
      const cx = o.margin + n / 2, cy = cx;
      const vb = KT.BRAND.markViewBox.split(' ').map(Number); // x y w h
      const h = R * 1.72, scale = h / vb[3], w = vb[2] * scale;
      logo = '<circle cx="' + cx + '" cy="' + cy + '" r="' + (R + 0.35) + '" fill="' + o.bg + '"/>' +
        '<g transform="translate(' + (cx - w / 2 - vb[0] * scale).toFixed(3) + ',' + (cy - h / 2 - vb[1] * scale + h * 0.02).toFixed(3) + ') scale(' + scale.toFixed(5) + ')">' +
        KT.BRAND.markInner({ black: '#000', wine: '#751228' }) + '</g>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" shape-rendering="geometricPrecision" role="img" aria-label="' + o.title.replace(/"/g, '') + '">' +
      '<rect width="' + size + '" height="' + size + '" fill="' + o.bg + '"/>' +
      '<path d="' + d + '" fill="' + o.fg + '"/>' + eye(0, 0) + eye(0, n - 7) + eye(n - 7, 0) + logo + '</svg>';
  }

  // Render an SVG string to a PNG data URL (for downloads)
  function png(svgString, px) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = px; c.height = px;
        const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, px, px);
        ctx.drawImage(img, 0, 0, px, px);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('Could not draw the QR code'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
    });
  }

  KT.qr = { matrix, svg, png };
})();
