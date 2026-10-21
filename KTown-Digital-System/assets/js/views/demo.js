/* K.Town — Demo wall: the guest phone, reception, kitchen and the owner's dashboard live on one screen.
   Made for presenting on a single laptop or projector. Everything is real and in sync. */
(function () {
  'use strict';
  const KT = (window.KT = window.KT || {});
  const { html, useState, useEffect, useRef } = window.htmPreact;
  const { Icon, Mark } = KT.ui;
  const U = KT.U, S = KT.store;

  const PANELS = [
    { key: 'reception', label: 'Reception', icon: 'hand-platter', view: 'ReceptionApp' },
    { key: 'kitchen', label: 'Kitchen', icon: 'chef-hat', view: 'KitchenApp' },
    { key: 'admin', label: 'Owner', icon: 'layout-dashboard', view: 'AdminApp' }
  ];

  // The wall is laid out for a 1720px-wide screen (the phone and three screens side by side).
  // On a smaller laptop or projector it is scaled down to fit, so every screen stays visible.
  const WALL_W = 1720;
  function wallLayout() {
    const w = window.innerWidth || WALL_W;
    const zoom = w >= WALL_W ? 1 : w >= 1240 ? w / WALL_W : Math.max(0.7, Math.min(1, w / 1290));
    const fit = Math.max(1, Math.min(3, Math.floor((w / zoom - 424) / 420)));
    return { zoom, fit };
  }

  function DemoWall() {
    KT.useCols(['tables', 'orders', 'settings']);
    const [show, setShow] = useState(() => U.ls.get('kt1:demoPanels', ['reception', 'kitchen', 'admin']));
    const [layout, setLayout] = useState(wallLayout);
    const { zoom, fit } = layout;
    const [table, setTable] = useState(() => U.ls.get('kt1:demoTable', 'T2'));
    const [started, setStarted] = useState(false);
    const [guestKey, setGuestKey] = useState(0);
    const gridRef = useRef();
    const tables = S.list('tables').filter((t) => t.active !== false);

    useEffect(() => {
      const onResize = () => setLayout((cur) => { const n = wallLayout(); return n.zoom === cur.zoom && n.fit === cur.fit ? cur : n; });
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }, []);
    const toggle = (k) => { const n = show.includes(k) ? show.filter((x) => x !== k) : show.concat(k); const ordered = PANELS.map((p) => p.key).filter((x) => n.includes(x)); setShow(ordered); U.ls.set('kt1:demoPanels', ordered); };
    const visible = PANELS.filter((p) => show.includes(p.key)).slice(0, fit);
    const hidden = PANELS.filter((p) => show.includes(p.key)).length > fit;

    async function newGuest() { // a fresh guest phone: new device identity, empty cart
      U.ls.set('kt1:me', { uid: 'g_' + U.uid(10) }); U.ss.set('kt1:cart', []); U.ss.set('kt1:seenReady', []);
      setGuestKey((k) => k + 1); KT.toast('Fresh guest phone ready at ' + S.tableName(table), 'ok');
    }

    return html`<div class="demo" style=${zoom === 1 ? '' : 'zoom:' + zoom.toFixed(4) + ';height:' + (100 / zoom).toFixed(3) + 'vh'}>
      ${!started ? html`<div class="start-overlay" role="dialog" aria-label="Start the demo">
        <div><${Mark} black="#fff" wine="#d68a97" cls="tb-mark" />
          <h2 style="color:#fff;font-size:28px;margin-top:14px">K.Town live demo</h2>
          <p>On the left is a guest's phone at ${S.tableName(table)}. Order something and watch reception, the kitchen and the owner's dashboard react instantly. Sound is on.</p>
          <button class="btn btn-primary" onClick=${() => { U.sound.unlock(); U.sound.play('soft'); setStarted(true); }} data-autofocus>Start the demo</button></div></div>` : null}
      <div class="demo-bar">
        <${Mark} cls="mk" black="#fff" wine="#d68a97" />
        <div><h1>K.Town, live demo</h1><div class="sub">Every screen here is the real system, in sync.</div></div>
        <div class="right">
          ${PANELS.map((p) => html`<button key=${p.key} class="btn btn-sm" aria-pressed=${show.includes(p.key) ? 'true' : 'false'} onClick=${() => toggle(p.key)}><${Icon} name=${p.icon} />${p.label}</button>`)}
          <button class="btn btn-sm" onClick=${newGuest}><${Icon} name="refresh-cw" />New guest</button>
          <button class="btn btn-sm" onClick=${() => S.loadSampleWeek().then((n) => KT.toast(n + ' sample orders loaded for the owner’s reports', 'ok'), KT.toastError)}><${Icon} name="layers" />Sample week</button>
          <a class="btn btn-sm" href="#/staff"><${Icon} name="monitor" />Screens</a>
        </div>
      </div>
      <div class="demo-grid" ref=${gridRef} style=${'--cols:' + Math.max(1, visible.length)}>
        <div class="demo-col">
          <div class="lab"><${Icon} name="smartphone" />Guest phone at
            <select class="select" aria-label="Table of the guest phone" style="width:auto;min-height:28px;padding:2px 8px;font-size:13px;background:#2a1d21;color:#fff;border-color:#3b2a2f" value=${table}
              onChange=${(e) => { setTable(e.target.value); U.ls.set('kt1:demoTable', e.target.value); U.ss.set('kt1:table', e.target.value); setGuestKey((k) => k + 1); }}>
              ${tables.map((t) => html`<option key=${t.id} value=${t.id}>${t.name}</option>`)}</select></div>
          <div class="phone"><div class="phone-notch"></div>
            <div class="demo-panel"><div class="demo-scroll"><${KT.views.GuestApp} key=${'g' + guestKey + table} tableId=${table} embedded=${true} /></div></div></div>
        </div>
        ${visible.map((p) => {
          const V = KT.views[p.view];
          return html`<div class="demo-col" key=${p.key}>
            <div class="lab"><${Icon} name=${p.icon} />${p.label}${p.key === 'admin' ? ' (works on the owner’s phone too)' : ''}</div>
            <div class="demo-panel"><div class="demo-scroll"><${V} embedded=${true} route=${{ parts: [p.key], params: new URLSearchParams() }} /></div></div>
          </div>`;
        })}
      </div>
      ${hidden ? html`<p class="demo-more">This screen is too small for every panel. Untick one at the top, or make the window wider.</p>` : null}
    </div>`;
  }

  KT.views.DemoWall = DemoWall;
})();
