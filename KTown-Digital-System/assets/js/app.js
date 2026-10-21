/* K.Town — start-up and screen routing.
   index.html            → guest menu (QR codes point here, ?t=T1 sets the table)
   index.html#/staff     → staff sign-in and screen picker
   index.html#/reception → reception (front desk)
   index.html#/kitchen   → kitchen display
   index.html#/admin     → owner dashboard
   index.html#/demo      → all screens side by side, for presenting */
(function () {
  'use strict';
  const KT = (window.KT = window.KT || {});
  KT.VERSION = '1.0.1';
  const { html, render, useState, useEffect } = window.htmPreact;
  const U = KT.U;

  const STAFF_JS = ['assets/js/views/staff.js'];
  const ROUTES = {
    staff: { js: STAFF_JS, view: 'StaffHub' },
    reception: { js: STAFF_JS.concat('assets/js/views/reception.js'), view: 'ReceptionApp', gate: 'reception' },
    kitchen: { js: STAFF_JS.concat('assets/js/views/kitchen.js'), view: 'KitchenApp', gate: 'kitchen' },
    admin: { js: STAFF_JS.concat('assets/js/views/print.js', 'assets/js/views/admin.js'), view: 'AdminApp', gate: 'admin' },
    print: { js: STAFF_JS.concat('assets/js/views/print.js'), view: 'PrintApp', gate: 'admin' },
    demo: { js: STAFF_JS.concat('assets/js/views/reception.js', 'assets/js/views/kitchen.js', 'assets/js/views/print.js', 'assets/js/views/admin.js', 'assets/js/views/demo.js'), view: 'DemoWall', gate: 'demo' }
  };

  function parseRoute() {
    const h = location.hash.replace(/^#\/?/, '');
    const [path, qs] = h.split('?');
    const parts = (path || '').split('/').filter(Boolean);
    return { name: parts[0] || 'menu', parts, params: new URLSearchParams(qs || ''), hash: h };
  }
  KT.go = (path) => { location.hash = '#/' + String(path || '').replace(/^#?\/?/, ''); };
  KT.route = parseRoute;

  const loaded = new Set();
  function Lazy({ route }) {
    const def = ROUTES[route.name];
    const need = def.js.filter((f) => !loaded.has(f));
    const [ready, setReady] = useState(!need.length);
    const [err, setErr] = useState(null);
    useEffect(() => {
      if (!need.length) { setReady(true); return; }
      setReady(false);
      U.loadCss('assets/css/staff.css');
      Promise.all(need.map((f) => U.loadScript(f).then(() => loaded.add(f)))).then(() => setReady(true), setErr);
    }, [route.name]);
    if (err) return html`<div class="boot"><p>Could not open this screen. Check your connection and reload.<br /><small>${String(err.message || err)}</small></p></div>`;
    if (!ready) return html`<div class="boot"><span class="spin"></span></div>`;
    const View = KT.views[def.view];
    const body = html`<${View} route=${route} />`;
    return def.gate ? html`<${KT.views.Gate} screen=${def.gate}>${body}</${KT.views.Gate}>` : body;
  }

  function App({ route }) {
    KT.useCols([]);
    const view = ROUTES[route.name] ? html`<${Lazy} route=${route} key=${route.name} />` : html`<${KT.views.GuestApp} />`;
    return html`${view}<${KT.ui.Hosts} />`;
  }

  async function boot() {
    KT.i18n.init();
    const root = document.getElementById('app');
    try {
      await KT.store.init();
    } catch (e) {
      console.error(e);
      root.innerHTML = '<div class="boot" style="padding:24px;text-align:center"><div><h1 style="font-size:20px">K.Town could not start</h1><p class="muted" style="margin-top:8px">' +
        String((e && e.message) || e).replace(/</g, '&lt;') + '</p><p style="margin-top:16px"><a href="?mode=demo">Open in demo mode</a></p></div></div>';
      return;
    }
    const draw = () => {
      const r = parseRoute();
      document.body.dataset.route = r.name;
      render(html`<${App} route=${r} />`, root);
    };
    window.addEventListener('hashchange', () => { draw(); window.scrollTo(0, 0); });
    KT.store.subscribe((c) => { if (c === 'error' && KT.store.adapter.lastError) KT.toast(KT.store.adapter.lastError.message || 'Sync problem', 'bad', 6000); });
    draw();
    const isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || (isLocal && window.KT_FORCE_SW)) && !window.KT_NO_SW) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
  KT.boot = boot;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
