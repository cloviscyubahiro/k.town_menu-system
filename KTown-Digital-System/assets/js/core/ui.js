/* K.Town — shared interface pieces (icons, sheets, toasts, steppers, the order glass) */
(function () {
  'use strict';
  const KT = (window.KT = window.KT || {});
  const { html, render, useState, useEffect, useLayoutEffect, useRef } = window.htmPreact;
  const U = KT.U;

  /* ---------- Icon & raw SVG ---------- */
  function Icon({ name, cls, label }) {
    return html`<svg class=${'ic ' + (cls || '')} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden=${label ? undefined : 'true'} role=${label ? 'img' : undefined}
      aria-label=${label} dangerouslySetInnerHTML=${{ __html: KT.ICONS[name] || '' }}></svg>`;
  }
  function Raw({ svg, cls, tag, label }) {
    const T = tag || 'span';
    return html`<${T} class=${cls} role=${label ? 'img' : undefined} aria-label=${label} dangerouslySetInnerHTML=${{ __html: svg }}></${T}>`;
  }

  /* ---------- Toasts ---------- */
  const toastSubs = new Set();
  let toasts = [];
  KT.toast = function (msg, kind, ms) {
    const t = { id: U.uid(5), msg, kind: kind || '' };
    toasts = toasts.concat(t).slice(-3);
    toastSubs.forEach((f) => f(toasts));
    setTimeout(() => { toasts = toasts.filter((x) => x.id !== t.id); toastSubs.forEach((f) => f(toasts)); }, ms || 3200);
  };
  KT.toastError = (e) => KT.toast((e && e.message) || String(e), 'bad', 5200);
  function Toasts() {
    const [list, setList] = useState(toasts);
    useEffect(() => { toastSubs.add(setList); return () => toastSubs.delete(setList); }, []);
    return html`<div class="toasts" role="status" aria-live="polite">
      ${list.map((t) => html`<div class=${'toast ' + (t.kind ? 'toast-' + t.kind : '')} key=${t.id}>
        ${t.kind === 'ok' ? html`<${Icon} name="circle-check" />` : t.kind === 'bad' ? html`<${Icon} name="circle-alert" />` : null}<span>${t.msg}</span></div>`)}
    </div>`;
  }

  /* ---------- Sheet (bottom sheet / dialog) ---------- */
  const sheetStack = [];
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !sheetStack.length) return;
    const top = sheetStack[sheetStack.length - 1];
    e.preventDefault(); top.close();
  });
  function Sheet({ title, onClose, children, foot, wide, label, cls, hideHead }) {
    const ref = useRef();
    const closeRef = useRef(onClose); closeRef.current = onClose;
    useLayoutEffect(() => {
      const prev = document.activeElement;
      const el = ref.current;
      const entry = { close: () => closeRef.current && closeRef.current() };
      sheetStack.push(entry);
      // focus the first field, unless the person already tapped into the sheet
      if (el) setTimeout(() => { if (el.contains(document.activeElement) && document.activeElement !== el) return; const f = el.querySelector('[data-autofocus]'); (f || el).focus({ preventScroll: true }); }, 30);
      const onKey = (e) => {
        if (e.key === 'Tab' && el) { // keep focus inside
          const f = el.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])');
          if (!f.length) return;
          const first = f[0], last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      };
      el && el.addEventListener('keydown', onKey);
      const fullPage = !el.closest('.demo-panel');
      const prevOverflow = document.documentElement.style.overflow;
      if (fullPage) document.documentElement.style.overflow = 'hidden';
      return () => {
        const i = sheetStack.indexOf(entry); if (i >= 0) sheetStack.splice(i, 1);
        el && el.removeEventListener('keydown', onKey);
        if (fullPage) document.documentElement.style.overflow = prevOverflow;
        if (prev && prev.focus && document.contains(prev)) prev.focus({ preventScroll: true });
      };
    }, []);
    return html`<div class=${'sheet-root ' + (cls || '')}>
      <div class="sheet-scrim" onClick=${onClose}></div>
      <div class=${'sheet' + (wide ? ' sheet-wide' : '')} role="dialog" aria-modal="true" aria-label=${label || title} tabindex="-1" ref=${ref}>
        <div class="sheet-grip" aria-hidden="true"></div>
        ${hideHead ? null : html`<div class="sheet-head">
          <h2>${title}</h2>
          <button class="btn btn-ghost btn-icon" onClick=${onClose} aria-label=${KT.t('close')}><${Icon} name="x" /></button>
        </div>`}
        <div class="sheet-body">${children}</div>
        ${foot ? html`<div class="sheet-foot">${foot}</div>` : null}
      </div>
    </div>`;
  }

  /* ---------- Confirm dialog (promise based) ---------- */
  let confirmSet = null;
  KT.confirm = function (opts) {
    return new Promise((resolve) => {
      if (!confirmSet) { resolve(window.confirm(opts.title)); return; }
      confirmSet(Object.assign({}, opts, { resolve }));
    });
  };
  function ConfirmHost() {
    const [c, setC] = useState(null);
    useEffect(() => { confirmSet = setC; return () => { confirmSet = null; }; }, []);
    if (!c) return null;
    const done = (v) => { setC(null); c.resolve(v); };
    return html`<${Sheet} title=${c.title} onClose=${() => done(false)} label=${c.title}
      foot=${html`<div class="row" style="justify-content:flex-end">
        <button class="btn" onClick=${() => done(false)}>${c.cancel || 'Cancel'}</button>
        <button class=${'btn ' + (c.danger ? 'btn-dark' : 'btn-primary')} data-autofocus onClick=${() => done(true)}>${c.ok || 'OK'}</button>
      </div>`}>
      ${c.body ? html`<p class="muted" style="margin-bottom:6px">${c.body}</p>` : null}
    </${Sheet}>`;
  }

  /* ---------- Stepper ---------- */
  function Stepper({ value, onChange, min, max, label }) {
    min = min == null ? 0 : min; max = max || 99;
    return html`<div class="stepper" role="group" aria-label=${label || KT.t('quantity') || 'Quantity'}>
      <button type="button" onClick=${() => onChange(Math.max(min, value - 1))} disabled=${value <= min} aria-label="Less"><${Icon} name="minus" /></button>
      <output aria-live="polite">${value}</output>
      <button type="button" onClick=${() => onChange(Math.min(max, value + 1))} disabled=${value >= max} aria-label="More"><${Icon} name="plus" /></button>
    </div>`;
  }

  function Switch({ checked, onChange, label, id }) {
    return html`<label class="switch"><input type="checkbox" id=${id} checked=${checked} onChange=${(e) => onChange(e.target.checked)} aria-label=${label} /><span></span></label>`;
  }

  /* ---------- The order glass: wine rises as the order progresses ---------- */
  const LEVEL = { new: 0.18, kitchen: 0.38, preparing: 0.62, ready: 0.9, served: 0.9, paid: 0.9, cancelled: 0 };
  const WAVE = 'M-60,95 C-35,87 -10,86 10,94 S60,103 105,95 S150,87 175,95 S220,103 265,95 V260 H-60 Z';
  function Glass({ status, size }) {
    const idRef = useRef('kt-bowl-' + U.uid(5));
    const level = LEVEL[status] == null ? 0.2 : LEVEL[status];
    // Bowl interior ≈ circle centred (112.4, 97.6), r 58.6 — measured from the logo.
    // Full (level 1) puts the wine surface at y≈92; empty at the bottom of the bowl (y≈156).
    const offset = ((1 - level) * 66).toFixed(1);
    const w = size || 150;
    const markBody = KT.BRAND.markInner({ black: 'currentColor', wine: 'transparent' });
    return html`<div class=${'glass glass-' + status} style=${'width:' + w + 'px'} aria-hidden="true">
      <svg viewBox=${KT.BRAND.markViewBox} xmlns="http://www.w3.org/2000/svg">
        <defs><clipPath id=${idRef.current}><circle cx="112.4" cy="97.6" r="58.6" /></clipPath></defs>
        <g clip-path=${'url(#' + idRef.current + ')'}>
          <g class="glass-level" style=${'transform:translateY(' + offset + 'px)'}>
            <path class="glass-wine" d=${WAVE} />
          </g>
        </g>
        <g class="glass-line" dangerouslySetInnerHTML=${{ __html: markBody }}></g>
      </svg>
    </div>`;
  }

  /* ---------- Small helpers ---------- */
  function Money({ value, cls, prefix }) {
    return html`<span class=${'money ' + (cls || '')}>${prefix === false ? '' : 'RWF '}${U.money(value, KT.i18n.lang)}</span>`;
  }
  function Empty({ icon, children }) {
    return html`<div class="empty">${icon ? html`<${Icon} name=${icon} />` : null}${children}</div>`;
  }
  function Mark({ cls, black, wine, label }) {
    return html`<${Raw} cls=${cls} svg=${KT.BRAND.mark({ black, wine, label: label || 'K.Town' })} />`;
  }
  function Wordmark({ cls, color }) {
    return html`<${Raw} cls=${cls} svg=${KT.BRAND.wordmark({ color })} />`;
  }
  function ModePill() {
    const live = KT.store.mode === 'live';
    return html`<span class=${'mode-pill' + (live ? ' live' : '')} title=${live ? 'Live: synced through Firebase' : 'Demo: data stays in this browser'}>
      <span class="dot"></span>${live ? 'Live' : 'Demo mode'}</span>`;
  }

  // Hosts that every screen mounts once
  function Hosts() { return html`<${Toasts} /><${ConfirmHost} />`; }

  KT.ui = { html, render, Icon, Raw, Sheet, Stepper, Switch, Glass, Money, Empty, Mark, Wordmark, ModePill, Hosts };
})();
