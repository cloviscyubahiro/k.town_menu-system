/* K.Town — pieces shared by the staff screens: sign-in, top bar, tickets, new-order (POS) sheet */
(function () {
  'use strict';
  const KT = (window.KT = window.KT || {});
  const { html, useState, useEffect, useRef, useMemo } = window.htmPreact;
  const { Icon, Sheet, Stepper, Mark, ModePill, Switch } = KT.ui;
  const U = KT.U, S = KT.store;
  KT.views = KT.views || {};

  const ROLE_LABEL = { admin: 'Owner (admin)', reception: 'Reception', kitchen: 'Kitchen' };
  const SCREEN_LABEL = { admin: 'Admin', reception: 'Reception', kitchen: 'Kitchen', demo: 'Demo wall' };
  const STATUS_LABEL = { new: 'New', kitchen: 'In kitchen', preparing: 'Preparing', ready: 'Ready', served: 'Served', paid: 'Paid', cancelled: 'Cancelled' };
  const PAY_LABEL = { unpaid: 'Unpaid', claimed: 'Guest says paid', paid: 'Paid' };
  const METHOD = { momo: 'MoMo', cash: 'Cash', card: 'Card' };
  KT.STATUS_LABEL = STATUS_LABEL; KT.PAY_LABEL = PAY_LABEL; KT.METHOD = METHOD;

  /* ---------- Gate: only the right people see staff screens ---------- */
  // Remember that staff screens are used in this browser (the guest demo autopilot stays off here)
  function markStaffSeen() { U.ls.set('kt1:staffSeen', Date.now()); }
  function Gate({ screen, children }) {
    KT.useCols(['settings', 'staff']);
    useEffect(() => { markStaffSeen(); const t = setInterval(markStaffSeen, 60000); return () => clearInterval(t); }, []);
    const sess = S.session();
    if (screen === 'demo' && S.mode === 'demo') return children;
    const need = screen === 'demo' ? 'admin' : screen;
    if (sess && S.can(sess.role, need)) return children;
    return html`<${Login} screen=${need} wrongRole=${sess && sess.role} />`;
  }

  function Login({ screen, wrongRole }) {
    const [role, setRole] = useState(screen === 'kitchen' ? 'kitchen' : screen === 'reception' ? 'reception' : 'admin');
    const [pin, setPin] = useState('');
    const [shake, setShake] = useState(false);
    const [email, setEmail] = useState('');
    const [pass, setPass] = useState('');
    const [err, setErr] = useState('');
    const [busy, setBusy] = useState(false);
    const live = S.mode === 'live';
    const pins = S.settings.pins || {};

    async function tryPin(p) {
      try { await S.signIn(role, p); }
      catch (e) { setShake(true); setTimeout(() => { setShake(false); setPin(''); }, 380); setErr(e.message); }
    }
    function press(d) {
      setErr('');
      const p = (pin + d).slice(0, 6);
      setPin(p);
      const target = String(pins[role] || '');
      if (p.length >= Math.max(4, target.length)) tryPin(p);
    }
    useEffect(() => {
      if (live) return;
      const onKey = (e) => { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') setPin((x) => x.slice(0, -1)); };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    });
    async function liveSignIn(e) {
      e.preventDefault(); setErr(''); setBusy(true);
      try { await S.signIn(null, pass, email); }
      catch (x) { setErr(x.message); }
      finally { setBusy(false); }
    }

    return html`<main class="login">
      <div class="login-card">
        <${Mark} cls="mk" />
        <h1>${SCREEN_LABEL[screen] || 'Staff'}</h1>
        <p class="muted">${wrongRole ? 'Signed in as ' + (ROLE_LABEL[wrongRole] || wrongRole) + '. This screen needs ' + (ROLE_LABEL[screen] || screen) + '.' : 'Sign in to continue'}</p>
        ${live ? html`<form class="form" style="margin-top:20px" onSubmit=${liveSignIn}>
            <label class="field"><span>Email</span><input class="input" type="email" value=${email} onInput=${(e) => setEmail(e.target.value)} autocomplete="username" required data-autofocus /></label>
            <label class="field"><span>Password</span><input class="input" type="password" value=${pass} onInput=${(e) => setPass(e.target.value)} autocomplete="current-password" required /></label>
            ${err ? html`<p role="alert" style="color:var(--bad);font-size:14px">${err}</p>` : null}
            <button class="btn btn-primary btn-lg" disabled=${busy}>${busy ? html`<span class="spin"></span>` : null}Sign in</button>
          </form>`
          : html`
          <div class="role-pick" role="group" aria-label="Who is signing in">
            ${['reception', 'kitchen', 'admin'].map((r) => html`<button key=${r} aria-pressed=${role === r ? 'true' : 'false'} onClick=${() => { setRole(r); setPin(''); setErr(''); }}>${r === 'admin' ? 'Owner' : ROLE_LABEL[r]}</button>`)}
          </div>
          <div class=${'pin-dots' + (shake ? ' shake' : '')} role="img" aria-label=${'PIN, ' + pin.length + ' digits entered'}>
            ${[0, 1, 2, 3].map((i) => html`<span key=${i} class=${i < pin.length ? 'on' : ''}></span>`)}
          </div>
          ${err ? html`<p role="alert" style="color:var(--bad);font-size:14px;text-align:center;margin-bottom:10px">${err}</p>` : null}
          <div class="pinpad">
            ${['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => html`<button key=${d} onClick=${() => press(d)}>${d}</button>`)}
            <a class="btn ghost" href="./" style="height:62px">Menu</a>
            <button onClick=${() => press('0')}>0</button>
            <button class="ghost" onClick=${() => setPin(pin.slice(0, -1))} aria-label="Delete">⌫</button>
          </div>
          <p class="demo-hint">Demo PINs: reception ${pins.reception}, kitchen ${pins.kitchen}, owner ${pins.admin}. Change them in Admin, Settings.</p>`}
      </div>
    </main>`;
  }

  /* ---------- Staff hub ---------- */
  function StaffHub() {
    KT.useCols(['settings', 'orders']);
    const sess = S.session();
    const live = S.mode === 'live';
    const tiles = [
      { to: '#/reception', icon: 'hand-platter', title: 'Reception', text: 'New orders, send to kitchen, serve, take payment.' },
      { to: '#/kitchen', icon: 'chef-hat', title: 'Kitchen', text: 'Big tickets to prepare. Mark orders ready.' },
      { to: '#/admin', icon: 'layout-dashboard', title: 'Owner dashboard', text: 'Sales today and this week, menu, tables, events, feedback.' },
      { to: './', icon: 'smartphone', title: 'Guest menu', text: 'What guests see after scanning the QR code.' }
    ];
    if (!live) tiles.unshift({ to: '#/demo', icon: 'monitor', title: 'Demo wall', text: 'Guest phone, reception, kitchen and owner on one screen. Best for presenting.', feature: true });
    return html`<div class="v-staff"><main class="hub">
      <div class="hub-head"><${Mark} cls="mk" /><div><h1>K.Town staff</h1><div class="row" style="margin-top:4px"><${ModePill} />
        ${sess ? html`<span class="muted" style="font-size:14px">Signed in: ${ROLE_LABEL[sess.role] || sess.role}</span>` : null}</div></div>
        ${sess ? html`<button class="btn btn-sm" style="margin-left:auto" onClick=${() => S.signOut()}><${Icon} name="log-out" />Sign out</button>` : null}
      </div>
      <div class="hub-grid">
        ${tiles.map((x) => html`<a class=${'hub-tile' + (x.feature ? ' feature' : '')} href=${x.to} key=${x.to}><${Icon} name=${x.icon} /><b>${x.title}</b><span>${x.text}</span></a>`)}
      </div>
      ${!live ? html`<div class="notice info" style="margin-top:18px"><${Icon} name="info" /><div>
        <b>Demo mode.</b> Everything works, and all screens opened in this browser stay in sync. To connect real phones and the owner's phone anywhere, follow docs/GO-LIVE.html.</div></div>` : null}
    </main></div>`;
  }

  /* ---------- Top bar ---------- */
  function TopBar({ title, sub, children, dark }) {
    const now = KT.useNow(15000);
    const [menu, setMenu] = useState(false);
    const [muted, setMuted] = useState(U.sound.muted);
    const sess = S.session();
    return html`<header class="topbar">
      <${Mark} cls="tb-mark" black=${dark ? '#fff' : '#000'} wine=${dark ? '#d68a97' : '#751228'} />
      <div class="tb-title"><h1>${title}</h1>${sub ? html`<div class="tb-sub">${sub}</div>` : null}</div>
      ${children ? html`<div class="tb-actions">${children}</div>` : null}
      <div class="tb-right">
        <${ModePill} />
        <span class="clock" aria-label="Time now">${U.time(now)}</span>
        <button class="btn btn-ghost btn-icon btn-sm" onClick=${() => { U.sound.unlock(); U.sound.setMuted(!muted); setMuted(!muted); if (muted) U.sound.play('soft'); }}
          aria-label=${muted ? 'Turn sound on' : 'Turn sound off'} title=${muted ? 'Sound off' : 'Sound on'}><${Icon} name=${muted ? 'volume-x' : 'volume-2'} /></button>
        <div class="tb-menu">
          <button class="btn btn-ghost btn-icon btn-sm" onClick=${() => setMenu(!menu)} aria-expanded=${menu ? 'true' : 'false'} aria-label="Menu"><${Icon} name="menu" /></button>
          ${menu ? html`<div class="tb-pop" onClick=${() => setMenu(false)}>
            <a href="#/reception"><${Icon} name="hand-platter" />Reception</a>
            <a href="#/kitchen"><${Icon} name="chef-hat" />Kitchen</a>
            <a href="#/admin"><${Icon} name="layout-dashboard" />Owner dashboard</a>
            <a href="./" target="_blank" rel="noopener"><${Icon} name="smartphone" />Guest menu</a>
            ${S.mode === 'demo' ? html`<a href="#/demo"><${Icon} name="monitor" />Demo wall</a>` : null}
            <hr />
            ${sess ? html`<button onClick=${() => S.signOut()}><${Icon} name="log-out" />Sign out (${ROLE_LABEL[sess.role] || sess.role})</button>` : null}
          </div>` : null}
        </div>
      </div>
    </header>`;
  }

  /* ---------- "Tap to start" overlay: unlocks sound and keeps the screen awake ---------- */
  function StartOverlay({ label, text, onStart }) {
    return html`<div class="start-overlay" role="dialog" aria-label=${label}>
      <div><${Mark} black="#fff" wine="#d68a97" cls="tb-mark" />
        <h2 style="color:#fff;font-size:26px;margin-top:14px">${label}</h2>
        <p>${text}</p>
        <button class="btn btn-primary" onClick=${onStart} data-autofocus>Start with sound</button></div>
    </div>`;
  }
  function useStart(key) {
    const [started, setStarted] = useState(false);
    const lock = useRef(null);
    async function start() {
      U.sound.unlock(); U.sound.play('soft');
      setStarted(true);
      try { if (navigator.wakeLock) lock.current = await navigator.wakeLock.request('screen'); } catch (e) { /* not supported */ }
    }
    useEffect(() => {
      const re = async () => { if (document.visibilityState === 'visible' && started && navigator.wakeLock) { try { lock.current = await navigator.wakeLock.request('screen'); } catch (e) { /* ignore */ } } };
      document.addEventListener('visibilitychange', re);
      return () => { document.removeEventListener('visibilitychange', re); if (lock.current) lock.current.release().catch(() => {}); };
    }, [started]);
    return [started, start];
  }

  /* ---------- Sound when new things arrive ---------- */
  function useArrivals(list, kind) {
    const seen = useRef(null);
    const [fresh, setFresh] = useState({});
    useEffect(() => {
      const ids = list.map((x) => x.id);
      if (seen.current === null) { seen.current = new Set(ids); return; }
      const added = ids.filter((id) => !seen.current.has(id));
      ids.forEach((id) => seen.current.add(id));
      if (added.length) {
        U.sound.play(kind || 'order'); U.vibrate([160, 70, 160]);
        setFresh((f) => { const n = Object.assign({}, f); added.forEach((id) => { n[id] = Date.now(); }); return n; });
        setTimeout(() => setFresh((f) => { const n = Object.assign({}, f); added.forEach((id) => delete n[id]); return n; }), 4500);
        if (document.hidden) flashTitle(added.length);
      }
    });
    return fresh;
  }
  let titleTimer = null;
  function flashTitle(n) {
    const orig = document.title; let on = false; let k = 0;
    clearInterval(titleTimer);
    titleTimer = setInterval(() => { document.title = (on = !on) ? '(' + n + ') New at K.Town' : orig; if (++k > 12 || !document.hidden) { clearInterval(titleTimer); document.title = orig; } }, 900);
  }

  /* ---------- Ticket pieces ---------- */
  function elapsedClass(mins) { return mins >= 20 ? 'late' : mins >= 10 ? 'warn' : ''; }
  function Elapsed({ from, now }) {
    const m = U.mins(now - from);
    return html`<span class=${'tk-time ' + elapsedClass(m)}><${Icon} name="timer" cls="ic-sm" />${m < 1 ? 'now' : m + ' min'}</span>`;
  }
  function Lines({ o, prices }) {
    return html`<ul class="tk-lines">${(o.lines || []).map((l, i) => html`<li key=${i}>
      <span class="tk-q">${l.qty}×</span><span class="tk-n">${l.name}</span>${prices ? html`<span class="tk-p">${U.money(l.price * l.qty)}</span>` : html`<span></span>`}
      ${l.note ? html`<span class="tk-note"><${Icon} name="message-square-text" cls="ic-sm" />${l.note}</span>` : null}
    </li>`)}</ul>`;
  }
  function priceWarning(o) {
    const diffs = (o.lines || []).filter((l) => { const it = S.item(l.id); return it && it.price !== l.price; });
    return diffs.length ? diffs.map((l) => l.name).join(', ') : '';
  }
  function StatusPill({ o }) {
    const paid = S.isPaid(o);
    const s = o.status === 'served' && paid ? 'paid' : o.status;
    return html`<span class="pill" data-s=${s}>${STATUS_LABEL[s] || s}</span>`;
  }
  function PayPill({ o }) {
    const p = (o.payment && o.payment.status) || 'unpaid';
    if (o.status === 'cancelled') return null;
    return html`<span class="pill" data-s=${p}>${PAY_LABEL[p]}${p === 'paid' && o.payment.method ? ', ' + METHOD[o.payment.method] : ''}</span>`;
  }

  /* ---------- Order detail sheet (reception & admin) ---------- */
  function OrderSheet({ id, onClose }) {
    KT.useCols(['orders']);
    const o = S.get('orders', id);
    if (!o) return null;
    const paid = S.isPaid(o);
    const at = o.statusAt || {};
    const steps = [['new', 'Placed'], ['kitchen', 'Sent to kitchen'], ['preparing', 'Preparing'], ['ready', 'Ready'], ['served', 'Served'], ['cancelled', 'Cancelled']].filter(([k]) => at[k]);
    const act = (p) => p.then(() => KT.toast('Saved', 'ok'), KT.toastError);
    async function cancel() {
      if (await KT.confirm({ title: 'Cancel order #' + o.number + '?', body: 'The guest will see it as cancelled.', ok: 'Cancel order', cancel: 'Keep', danger: true })) act(S.cancelOrder(o.id, 'Cancelled by staff'));
    }
    return html`<${Sheet} title=${'Order #' + o.number} onClose=${onClose} wide=${true}
      foot=${html`<div class="row" style="flex-wrap:wrap">
        ${o.status !== 'cancelled' && !paid ? html`
          <button class="btn btn-primary" onClick=${() => act(S.confirmPayment([o.id], 'momo'))}><${Icon} name="smartphone" />Paid by MoMo</button>
          <button class="btn" onClick=${() => act(S.confirmPayment([o.id], 'cash'))}><${Icon} name="banknote" />Cash</button>
          ${S.settings.payCard ? html`<button class="btn" onClick=${() => act(S.confirmPayment([o.id], 'card'))}><${Icon} name="credit-card" />Card</button>` : null}` : null}
        ${paid ? html`<button class="btn" onClick=${() => act(S.undoPayment(o.id))}><${Icon} name="undo-2" />Mark unpaid</button>` : null}
        ${o.status !== 'cancelled' && o.status !== 'served' ? html`<button class="btn btn-ghost btn-danger" style="margin-left:auto" onClick=${cancel}>Cancel order</button>` : null}
      </div>`}>
      <div class="row" style="flex-wrap:wrap;gap:8px"><${StatusPill} o=${o} /><${PayPill} o=${o} />
        <span class="muted" style="font-size:14px">${S.tableName(o.tableId) || 'No table'}, ${U.dateTime(o.createdAt)}${o.source === 'staff' ? ', entered by staff' : ''}</span></div>
      ${o.guestName || o.guestPhone ? html`<p style="margin-top:10px">${o.guestName}${o.guestPhone ? html` <a href=${U.telLink(o.guestPhone)}>${U.prettyPhone(o.guestPhone)}</a>` : null}</p>` : null}
      <div class="ticket" style="margin-top:12px"><${Lines} o=${o} prices=${true} /><div class="tk-total"><span>Total</span><span class="money">RWF ${U.money(o.total)}</span></div></div>
      ${priceWarning(o) ? html`<p class="tk-warn" style="margin:10px 0 0"><${Icon} name="circle-alert" cls="ic-sm" />Price differs from today's menu: ${priceWarning(o)}</p>` : null}
      <h3 style="font-size:15px;margin:16px 0 6px">Timeline</h3>
      <div class="list">${steps.map(([k, label]) => html`<div class="li" key=${k}><span class="pill" data-s=${k}>${label}</span><span class="grow"></span><span class="muted num">${U.time(at[k])}</span></div>`)}
        ${o.payment && o.payment.claimedAt ? html`<div class="li"><span class="pill" data-s="claimed">Guest says paid</span><span class="grow"></span><span class="muted num">${U.time(o.payment.claimedAt)}</span></div>` : null}
        ${paid ? html`<div class="li"><span class="pill" data-s="paid">Payment confirmed, ${METHOD[o.payment.method] || ''}</span><span class="grow"></span><span class="muted num">${U.time(o.payment.paidAt)}</span></div>` : null}
      </div>
      ${o.cancelReason ? html`<p class="muted" style="margin-top:10px">Reason: ${o.cancelReason}</p>` : null}
    </${Sheet}>`;
  }

  /* ---------- New order entered by staff (for guests using the printed menu) ---------- */
  function PosSheet({ onClose, tableId: initialTable }) {
    KT.useCols(['items', 'categories', 'tables']);
    const tables = S.list('tables').filter((x) => x.active !== false);
    const cats = S.list('categories');
    const [table, setTable] = useState(initialTable || '');
    const [cat, setCat] = useState('all');
    const [q, setQ] = useState('');
    const [lines, setLines] = useState({});
    const [notes, setNotes] = useState({});
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    const items = S.list('items').filter((i) => (cat === 'all' || i.cat === cat) && (!q || i.name.toLowerCase().includes(q.toLowerCase())));
    const count = U.sum(Object.values(lines));
    const total = U.sum(Object.keys(lines), (id) => (S.item(id) ? S.item(id).price * lines[id] : 0));
    const setQty = (id, n) => setLines((l) => { const x = Object.assign({}, l); if (n <= 0) delete x[id]; else x[id] = n; return x; });
    async function send() {
      if (!table) { KT.toast('Choose a table first', 'bad'); return; }
      setBusy(true);
      try {
        const r = await S.placeOrder({ tableId: table, source: 'staff', guest: { name }, lines: Object.keys(lines).map((id) => ({ itemId: id, qty: lines[id], note: notes[id] || '' })) });
        KT.toast('Order #' + r.number + ' sent to the kitchen', 'ok');
        onClose();
      } catch (e) { KT.toastError(e); } finally { setBusy(false); }
    }
    return html`<${Sheet} title="New order" onClose=${onClose} wide=${true}
      foot=${html`<button class="btn btn-primary btn-lg btn-block" onClick=${send} disabled=${busy || !count}>
        <span class="grow">Send to kitchen${count ? ' (' + count + ')' : ''}</span><span class="money">RWF ${U.money(total)}</span></button>`}>
      <p class="muted" style="font-size:14px">For guests ordering from the printed menu or at the counter.</p>
      <div class="field" style="margin-top:12px"><span>Table</span>
        <div class="row" style="flex-wrap:wrap;gap:6px">${tables.map((x) => html`<button key=${x.id} class=${'chip' + (table === x.id ? ' on' : '')} onClick=${() => setTable(x.id)}>${x.name}</button>`)}
          <button class=${'chip' + (table === 'takeaway' ? ' on' : '')} onClick=${() => setTable('takeaway')}>Takeaway</button></div></div>
      <div class="row" style="margin-top:14px;flex-wrap:wrap;gap:6px">
        <button class=${'chip' + (cat === 'all' ? ' on' : '')} onClick=${() => setCat('all')}>All</button>
        ${cats.map((c) => html`<button key=${c.id} class=${'chip' + (cat === c.id ? ' on' : '')} onClick=${() => setCat(c.id)}>${c.name}</button>`)}
        <input class="input" style="flex:1;min-width:160px;min-height:36px" placeholder="Search" value=${q} onInput=${(e) => setQ(e.target.value)} />
      </div>
      <div class="list" style="margin-top:8px">
        ${items.map((it) => html`<div class=${'li' + (it.available === false ? ' off' : '')} key=${it.id}>
          <div class="grow"><div class="t">${it.name}</div><div class="s">${U.money(it.price)}${it.available === false ? ', sold out' : ''}</div>
            ${lines[it.id] ? html`<input class="input" style="margin-top:6px;min-height:36px;font-size:14px" placeholder="Note (optional)" value=${notes[it.id] || ''} onInput=${(e) => setNotes(Object.assign({}, notes, { [it.id]: e.target.value }))} />` : null}</div>
          <${Stepper} value=${lines[it.id] || 0} onChange=${(n) => setQty(it.id, n)} min=${0} label=${it.name} />
        </div>`)}
      </div>
      <label class="field" style="margin-top:12px"><span>Guest name (optional)</span><input class="input" value=${name} onInput=${(e) => setName(e.target.value)} /></label>
    </${Sheet}>`;
  }

  /* ---------- Bookings ---------- */
  function BookingsSheet({ onClose }) {
    KT.useCols(['reservations', 'tables']);
    const day0 = U.startOfDay();
    const list = S.list('reservations').filter((r) => U.dayFromKey(r.date) >= day0).sort(U.by((r) => r.date + ' ' + r.time));
    const st = S.settings;
    const set = (r, status) => S.update('reservations', r.id, { status }).then(() => KT.toast('Booking ' + status, 'ok'), KT.toastError);
    const msg = (r, status) => (status === 'declined'
      ? 'Hello ' + r.name + ', thank you for choosing ' + st.name + '. Sorry, we are fully booked on ' + U.date(U.dayFromKey(r.date) + 12 * 3600e3) + ' at ' + r.time + '. Could another time work for you?'
      : 'Hello ' + r.name + ', your table at ' + st.name + ' is confirmed for ' + r.guests + ' on ' + U.date(U.dayFromKey(r.date) + 12 * 3600e3) + ' at ' + r.time + '. See you soon!');
    return html`<${Sheet} title="Bookings" onClose=${onClose} wide=${true}>
      ${!list.length ? html`<p class="empty">No upcoming bookings. Guests can book from the menu: Reserve a table.</p>` : null}
      <div class="list">${list.map((r) => html`<div class="li" key=${r.id} style="flex-wrap:wrap">
        <div class="grow" style="min-width:200px"><div class="t">${U.date(U.dayFromKey(r.date) + 12 * 3600e3)}, ${r.time}, ${r.guests} guest${r.guests > 1 ? 's' : ''}</div>
          <div class="s">${r.name}, <a href=${U.telLink(r.phone)}>${U.prettyPhone(r.phone)}</a>${r.tableId ? ', ' + S.tableName(r.tableId) : ''}${r.note ? ', “' + r.note + '”' : ''}</div></div>
        <span class="pill" data-s=${r.status === 'confirmed' ? 'ready' : r.status === 'declined' ? 'cancelled' : r.status === 'seated' ? 'served' : 'new'}>${{ pending: 'Waiting', confirmed: 'Confirmed', declined: 'Declined', seated: 'Seated' }[r.status] || r.status}</span>
        <div class="row" style="gap:6px;flex-wrap:wrap">
          ${r.status === 'pending' ? html`<button class="btn btn-sm btn-primary" onClick=${() => set(r, 'confirmed')}>Confirm</button><button class="btn btn-sm" onClick=${() => set(r, 'declined')}>Decline</button>` : null}
          ${r.status === 'confirmed' ? html`<button class="btn btn-sm" onClick=${() => set(r, 'seated')}>Seated</button>` : null}
          ${r.phone && r.status !== 'pending' && r.status !== 'seated' ? html`<a class="btn btn-sm" href=${U.waLink(r.phone, msg(r, r.status))} target="_blank" rel="noopener"><${Icon} name="message-circle" />WhatsApp</a>` : null}
        </div>
      </div>`)}</div>
    </${Sheet}>`;
  }

  /* ---------- Stock (sold out today) ---------- */
  function StockSheet({ onClose }) {
    KT.useCols(['items', 'categories']);
    const cats = S.list('categories');
    const items = S.list('items');
    return html`<${Sheet} title="What's available today" onClose=${onClose}>
      <p class="muted" style="font-size:14px">Switch off anything that runs out. Guests see it as sold out straight away.</p>
      ${cats.map((c) => html`<div key=${c.id} style="margin-top:14px"><h3 style="font-size:15px">${c.name}</h3>
        <div class="stock">${items.filter((i) => i.cat === c.id).map((i) => html`<div class="stock-row" key=${i.id}>
          <div class="grow"><div>${i.name}</div><div class="muted">${i.available === false ? 'Sold out' : 'Available'}</div></div>
          <${Switch} checked=${i.available !== false} label=${i.name + ' available'} onChange=${(v) => S.update('items', i.id, { available: v }).catch(KT.toastError)} />
        </div>`)}</div></div>`)}
    </${Sheet}>`;
  }

  Object.assign(KT.views, { Gate, Login, StaffHub, TopBar, StartOverlay, OrderSheet, PosSheet, BookingsSheet, StockSheet });
  KT.staff = { useArrivals, useStart, Elapsed, Lines, StatusPill, PayPill, priceWarning, ROLE_LABEL };
})();
