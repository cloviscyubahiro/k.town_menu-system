/* K.Town — small helpers shared by every screen */
(function () {
  'use strict';
  const KT = (window.KT = window.KT || {});
  const U = (KT.U = {});

  // Rwanda (Africa/Kigali) is UTC+2 all year, no daylight saving.
  const TZ = 'Africa/Kigali';
  const OFFSET = 2 * 3600 * 1000;
  const DAY = 24 * 3600 * 1000;
  U.TZ = TZ;
  U.DAY = DAY;

  U.uid = function (n) {
    n = n || 14;
    const a = 'abcdefghijkmnpqrstuvwxyz23456789';
    let s = '';
    const c = (window.crypto || window.msCrypto).getRandomValues(new Uint8Array(n));
    for (let i = 0; i < c.length; i++) s += a[c[i] % a.length];
    return s;
  };
  U.now = () => Date.now();

  /* ----- Dates & times (always Kigali time, whatever the device clock zone) ----- */
  U.startOfDay = (ts) => Math.floor(((ts == null ? Date.now() : ts) + OFFSET) / DAY) * DAY - OFFSET;
  U.endOfDay = (ts) => U.startOfDay(ts) + DAY - 1;
  U.dayKey = function (ts) {
    const d = new Date((ts == null ? Date.now() : ts) + OFFSET);
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  };
  U.dayFromKey = function (key) { // 'YYYY-MM-DD' -> start of that Kigali day
    const p = key.split('-').map(Number);
    return Date.UTC(p[0], p[1] - 1, p[2]) - OFFSET;
  };
  U.weekday = (ts) => new Date(ts + OFFSET).getUTCDay(); // 0 = Sunday
  U.startOfWeek = function (ts) { // Monday
    const s = U.startOfDay(ts);
    const wd = U.weekday(s);
    return s - ((wd + 6) % 7) * DAY;
  };
  U.hour = (ts) => new Date(ts + OFFSET).getUTCHours();
  U.minutesOfDay = (ts) => { const d = new Date(ts + OFFSET); return d.getUTCHours() * 60 + d.getUTCMinutes(); };

  const locales = { en: 'en-GB', fr: 'fr-FR', rw: 'en-GB' };
  const fmtCache = {};
  function fmt(lang, opts) {
    const key = lang + JSON.stringify(opts);
    if (!fmtCache[key]) fmtCache[key] = new Intl.DateTimeFormat(locales[lang] || 'en-GB', Object.assign({ timeZone: TZ }, opts));
    return fmtCache[key];
  }
  U.time = (ts) => fmt('en', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts));
  U.date = (ts, lang) => fmt(lang || 'en', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(ts));
  U.dateLong = (ts, lang) => fmt(lang || 'en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ts));
  U.dateShort = (ts, lang) => fmt(lang || 'en', { day: 'numeric', month: 'short' }).format(new Date(ts));
  U.dateTime = (ts, lang) => U.date(ts, lang) + ', ' + U.time(ts);
  U.weekdayShort = (ts, lang) => fmt(lang || 'en', { weekday: 'short' }).format(new Date(ts));
  U.isToday = (ts) => U.dayKey(ts) === U.dayKey();
  U.mins = (ms) => Math.max(0, Math.floor(ms / 60000));
  U.elapsed = function (ts, now) {
    const m = U.mins((now || Date.now()) - ts);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min';
    const h = Math.floor(m / 60);
    return h + ' h ' + (m % 60) + ' min';
  };
  // "09:00" -> minutes since midnight
  U.hm = (s) => { const p = String(s || '0:0').split(':'); return (+p[0] || 0) * 60 + (+p[1] || 0); };
  U.isOpenNow = function (hours, ts) {
    if (!hours || !hours.open || !hours.close) return true;
    const m = U.minutesOfDay(ts || Date.now());
    const o = U.hm(hours.open), c = U.hm(hours.close);
    return c > o ? (m >= o && m < c) : (m >= o || m < c); // supports closing after midnight
  };

  /* ----- Money ----- */
  const nf = new Intl.NumberFormat('en-US');
  const nfFr = new Intl.NumberFormat('fr-FR');
  U.money = (n, lang) => (lang === 'fr' ? nfFr : nf).format(Math.round(n || 0)).replace(/ | /g, ' ');
  U.rwf = (n, lang) => 'RWF ' + U.money(n, lang);
  U.usd = function (n, rate) {
    if (!rate) return '';
    const v = (n || 0) / rate;
    return 'US$' + (v < 10 ? v.toFixed(2) : v.toFixed(v < 100 ? 1 : 0));
  };

  /* ----- Phones, links ----- */
  U.normPhone = function (raw) {
    if (!raw) return '';
    let s = String(raw).trim().replace(/[\s\-().]/g, '');
    if (s.startsWith('00')) s = '+' + s.slice(2);
    if (/^0\d{9}$/.test(s)) return '+250' + s.slice(1);          // 0788123456
    if (/^7\d{8}$/.test(s)) return '+250' + s;                    // 788123456
    if (/^250\d{9}$/.test(s)) return '+' + s;                     // 250788123456
    if (/^\+\d{7,15}$/.test(s)) return s;
    return s.replace(/[^\d+]/g, '');
  };
  U.isPhone = (raw) => /^\+\d{9,15}$/.test(U.normPhone(raw));
  U.prettyPhone = function (p) {
    const s = U.normPhone(p);
    const m = s.match(/^\+250(\d{3})(\d{3})(\d{3})$/);
    return m ? '0' + m[1] + ' ' + m[2] + ' ' + m[3] : s;
  };
  U.prettyMomo = function (p) { // 0783094301 -> 0783 094 301
    const d = String(p || '').replace(/\D/g, '');
    if (d.length === 10) return d.slice(0, 4) + ' ' + d.slice(4, 7) + ' ' + d.slice(7);
    return p || '';
  };
  U.waLink = (phone, text) => 'https://wa.me/' + U.normPhone(phone).replace(/^\+/, '') + (text ? '?text=' + encodeURIComponent(text) : '');
  U.smsLink = (phone, text) => 'sms:' + U.normPhone(phone) + (text ? '?body=' + encodeURIComponent(text) : '');
  U.telLink = (phone) => 'tel:' + U.normPhone(phone);
  U.ussd = function (template, number, amount) {
    return String(template || '*182*1*1*{number}*{amount}#')
      .replace('{number}', String(number || '').replace(/\D/g, ''))
      .replace('{amount}', String(Math.round(amount || 0)));
  };
  U.ussdHref = (code) => 'tel:' + String(code).replace(/#/g, '%23');
  U.isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  U.copy = function (text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(() => true, () => fallback());
    }
    return Promise.resolve(fallback());
    function fallback() {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch (e) { return false; }
    }
  };

  /* ----- Safe storage (private mode / blocked storage never crashes the app) ----- */
  U.ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };
  U.ss = {
    get(k, d) { try { const v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  };

  /* ----- Sound & vibration ----- */
  U.sound = {
    ctx: null,
    muted: U.ls.get('kt1:muted', false),
    unlocked: false,
    unlock() {
      try {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume();
        this.unlocked = true;
      } catch (e) { /* no audio */ }
    },
    setMuted(m) { this.muted = !!m; U.ls.set('kt1:muted', this.muted); },
    play(kind) {
      if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
      const tones = { order: [784, 1046.5], ready: [1046.5, 1318.5, 1568], alert: [880, 698.5, 880], soft: [987.8] }[kind || 'order'] || [880];
      const ctx = this.ctx; const t0 = ctx.currentTime + 0.02;
      tones.forEach((f, i) => {
        const t = t0 + i * 0.19;
        [1, 2.01].forEach((mult, j) => { // bell-like: fundamental + soft overtone
          const o = ctx.createOscillator(); const g = ctx.createGain();
          o.type = 'sine'; o.frequency.value = f * mult;
          const peak = j ? 0.06 : 0.28;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(peak, t + 0.015);
          g.gain.exponentialRampToValueAtTime(0.0001, t + (j ? 0.35 : 0.9));
          o.connect(g); g.connect(ctx.destination);
          o.start(t); o.stop(t + 1);
        });
      });
    }
  };
  U.vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p || [180, 80, 180]); } catch (e) { /* ignore */ } };

  /* ----- Images: compress an uploaded photo to a small data URL ----- */
  U.compressImage = function (file, maxW, quality) {
    maxW = maxW || 720; quality = quality || 0.72;
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read the file'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('This file is not a photo we can use'));
        img.onload = () => {
          const scale = Math.min(1, maxW / img.width);
          const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          let url = c.toDataURL('image/webp', quality);
          if (!url.startsWith('data:image/webp')) url = c.toDataURL('image/jpeg', quality);
          resolve(url);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  };

  /* ----- Files ----- */
  U.download = function (filename, content, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: type || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  U.csv = function (rows) {
    return rows.map((r) => r.map((v) => {
      const s = v == null ? '' : String(v);
      return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\r\n');
  };

  /* ----- Misc ----- */
  U.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  U.sum = (arr, f) => arr.reduce((s, x) => s + (f ? f(x) : x), 0);
  U.by = (key, dir) => (a, b) => { const x = typeof key === 'function' ? key(a) : a[key], y = typeof key === 'function' ? key(b) : b[key]; return (x > y ? 1 : x < y ? -1 : 0) * (dir === 'desc' ? -1 : 1); };
  U.groupBy = (arr, f) => arr.reduce((m, x) => { const k = f(x); (m[k] = m[k] || []).push(x); return m; }, {});
  U.debounce = function (fn, ms) { let t; return function () { const a = arguments, s = this; clearTimeout(t); t = setTimeout(() => fn.apply(s, a), ms); }; };
  U.cls = function () { return Array.prototype.filter.call(arguments, Boolean).join(' '); };
  U.plural = (n, one, many) => (n === 1 ? one : many).replace('{n}', n);
  U.slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  U.loadScript = function (src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector('script[data-src="' + src + '"]')) return resolve();
      const s = document.createElement('script');
      s.src = src + (KT.VERSION ? '?v=' + KT.VERSION : ''); s.async = false; s.dataset.src = src;
      s.onload = () => resolve(); s.onerror = () => reject(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  };
  U.loadCss = function (href) {
    if (document.querySelector('link[data-href="' + href + '"]')) return;
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href + (KT.VERSION ? '?v=' + KT.VERSION : ''); l.dataset.href = href;
    document.head.appendChild(l);
  };
  U.publicBase = function (settings) { // the address QR codes should point to
    const fromSettings = settings && settings.publicUrl && String(settings.publicUrl).trim();
    if (fromSettings) return fromSettings.replace(/[#?].*$/, '').replace(/\/?$/, '/').replace(/\/index\.html\/$/, '/');
    const href = location.href.replace(/[#?].*$/, '');
    if (location.protocol === 'file:') return /\.html?$/i.test(href) ? href : href.replace(/\/?$/, '/') + 'index.html';
    return href.replace(/[^/]*$/, '');
  };
  U.menuUrl = function (settings, tableId) {
    return U.publicBase(settings) + (tableId ? '?t=' + encodeURIComponent(tableId) : '');
  };
  // Small version of a bundled photo for lists (uploaded photos are already small)
  U.thumb = (src) => (src && /^assets\/img\/photos\/item-[a-z-]+\.webp$/.test(src) ? src.replace(/\.webp$/, '-sm.webp') : src);
  U.isLocalAddress = (url) => /^file:|\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url);
})();
