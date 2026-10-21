/* K.Town — guest menu: browse, order to the table, follow the order, pay, give feedback, reserve. */
(function () {
  'use strict';
  const KT = (window.KT = window.KT || {});
  const { html, useState, useEffect, useRef, useMemo } = window.htmPreact;
  const { Icon, Sheet, Stepper, Glass, Mark, Wordmark } = KT.ui;
  const U = KT.U, S = KT.store;
  const t = (k, v) => KT.i18n.t(k, v);
  const pick = (r, f) => KT.i18n.pick(r, f);
  const L = () => KT.i18n.lang;

  const STATUS_STEP = { new: 0, kitchen: 1, preparing: 1, ready: 2, served: 3, paid: 3 };

  function GuestApp(props) {
    KT.useCols(['settings', 'categories', 'items', 'tables', 'events', 'orders', 'reservations', 'requests']);
    KT.useLang();
    const st = S.settings;
    const rootRef = useRef();
    const [cart, setCartState] = useState(() => U.ss.get('kt1:cart', []));
    const [table, setTableState] = useState(() => initialTable(props.tableId));
    const [sheet, setSheet] = useState(null);
    const [q, setQ] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [bump, setBump] = useState(0);
    const [online, setOnline] = useState(navigator.onLine);

    const setCart = (c) => { setCartState(c); U.ss.set('kt1:cart', c); };
    const setTable = (id) => { setTableState(id); U.ss.set('kt1:table', id); };

    useEffect(() => {
      const on = () => setOnline(true), off = () => setOnline(false);
      window.addEventListener('online', on); window.addEventListener('offline', off);
      const unlock = () => U.sound.unlock();
      document.addEventListener('pointerdown', unlock, { once: true });
      return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
    }, []);

    const cats = S.list('categories').filter((c) => c.active !== false);
    const items = S.list('items').filter((i) => i.hidden !== true);
    const tables = S.list('tables').filter((x) => x.active !== false);
    const myOrders = S.myOrders();
    const openOrders = myOrders.filter((o) => o.status !== 'cancelled' && !(o.status === 'served' && S.isPaid(o)) && o.status !== 'paid');
    const due = S.amountDue(myOrders);
    const payReady = myOrders.some((o) => (o.status === 'ready' || o.status === 'served') && !S.isPaid(o));
    const ordering = st.ordering !== false;

    // Ready popup: the first of my orders that became ready/served and hasn't been shown yet
    const [readyOrder, setReadyOrder] = useState(null);
    useEffect(() => {
      const seen = new Set(U.ss.get('kt1:seenReady', []));
      const o = myOrders.find((x) => (x.status === 'ready' || x.status === 'served') && !seen.has(x.id) && !S.isPaid(x));
      if (o && (!readyOrder || readyOrder.id !== o.id)) {
        seen.add(o.id); U.ss.set('kt1:seenReady', Array.from(seen));
        setReadyOrder(o);
        U.sound.play('ready'); U.vibrate([220, 90, 220, 90, 220]);
      }
    });

    // Demo autopilot: on a phone where no staff screen has been opened, demo orders move on by themselves,
    // so anyone can try the whole guest journey alone. Never runs in live mode or next to staff screens.
    const noStaffHere = () => Date.now() - (U.ls.get('kt1:staffSeen', 0) || 0) > 3600e3;
    const autopilot = S.mode === 'demo' && !props.embedded && noStaffHere();
    useEffect(() => {
      if (S.mode !== 'demo' || props.embedded) return;
      const step = { new: ['kitchen', 5000], kitchen: ['preparing', 4000], preparing: ['ready', 8000] };
      const t = setInterval(() => {
        if (!noStaffHere()) return; // a staff screen is open in this browser: people do the work
        S.myOrders().forEach((o) => {
          const nx = step[o.status]; if (!nx) return;
          const since = (o.statusAt && o.statusAt[o.status]) || o.createdAt;
          if (Date.now() - since > nx[1]) S.setStatus(o.id, nx[0]).catch(() => {});
        });
      }, 1500);
      return () => clearInterval(t);
    }, []);

    const qty = (id) => U.sum(cart.filter((l) => l.itemId === id), (l) => l.qty);
    const cartCount = U.sum(cart, (l) => l.qty);
    const cartTotal = U.sum(cart, (l) => { const it = S.item(l.itemId); return it ? it.price * l.qty : 0; });

    function addToCart(itemId, n, note) {
      const it = S.item(itemId);
      if (!it || it.available === false || !ordering) return;
      const key = itemId + '|' + (note || '').trim();
      const ex = cart.find((l) => l.key === key);
      const next = ex ? cart.map((l) => (l.key === key ? Object.assign({}, l, { qty: Math.min(99, l.qty + n) }) : l)) : cart.concat({ key, itemId, qty: n, note: (note || '').trim() });
      setCart(next); setBump((b) => b + 1);
    }

    const scrollRoot = () => (rootRef.current && rootRef.current.closest('.demo-scroll')) || null;
    function goToCat(id) {
      const el = rootRef.current && rootRef.current.querySelector('#cat-' + CSS.escape(id));
      if (!el) return;
      const root = scrollRoot();
      const navH = 58;
      if (root) root.scrollTo({ top: el.offsetTop - navH, behavior: 'smooth' });
      else window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - navH, behavior: 'smooth' });
    }

    // Search matches the start of words, ignoring accents: "ice" finds iced drinks (not "juice"), "cafe" finds "Café latte"
    const results = useMemo(() => {
      const fold = (x) => ' ' + String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ');
      const words = fold(q).trim().split(' ').filter(Boolean);
      if (!words.length) return null;
      return items.filter((i) => {
        const c = cats.find((x) => x.id === i.cat);
        const hay = fold([pick(i, 'name'), pick(i, 'desc'), i.name, c ? pick(c, 'name') : ''].join(' '));
        return words.every((w) => hay.includes(' ' + w));
      });
    }, [q, items, cats, L()]);

    const open = (type, extra) => setSheet(Object.assign({ type }, extra || {}));
    const close = () => setSheet(null);

    return html`<div class=${'v-guest auto-dark' + (props.embedded ? ' embedded' : '')} ref=${rootRef}>
      ${!online ? html`<div class="g-offline">${t('offline')}</div>` : null}
      <${Cover} st=${st} />
      <div class="g-wrap">
        <div class="g-intro">
          <h1 class="g-welcome">${t('welcome')}</h1>
          <div class="g-intro-row">
            <button class="g-table" onClick=${() => open('table')}>
              <${Icon} name="armchair" />
              ${table ? t('yourTable', { table: S.tableName(table) }) : t('chooseTable')}
              <small>${table ? t('change') : t('add')}</small>
            </button>
          </div>
          <div class="g-actions">
            ${st.reservations !== false ? html`<button class="btn" onClick=${() => open('reserve')}><${Icon} name="calendar-days" />${t('reserve')}</button>` : null}
            ${st.serviceRequests !== false ? html`<button class="btn" onClick=${() => serviceRequest('staff')}><${Icon} name="bell-ring" />${t('callStaff')}</button>` : null}
            ${myOrders.length ? html`<button class="btn" onClick=${() => open('orders')}><${Icon} name="receipt" />${t('myOrders')}</button>` : null}
          </div>
          ${openOrders.length ? html`<${TrackStrip} orders=${openOrders} onOpen=${() => open('orders')} />` : null}
          ${!ordering ? html`<p class="cart-table" style="margin-top:16px"><span>${t('paused')}</span></p>` : null}
        </div>
        <${Events} />
      </div>

      <nav class="g-nav" aria-label="Menu sections">
        <${CatNav} cats=${cats} onGo=${goToCat} rootRef=${rootRef} scrollRoot=${scrollRoot}
          onSearch=${() => { setShowSearch(!showSearch); if (showSearch) setQ(''); }} searching=${showSearch} />
        ${showSearch ? html`<div class="g-search"><label class="g-search-wrap">
          <span class="sr-only">${t('search')}</span><${Icon} name="search" />
          <input class="input" type="search" value=${q} onInput=${(e) => setQ(e.target.value)} placeholder=${t('search')} data-autofocus autoFocus />
        </label></div>` : null}
      </nav>

      <main class="g-wrap">
        ${st.currencyNote !== false ? html`<p class="g-note">${t('pricesIn')}</p>` : null}
        ${results ? html`<section class="g-sec">
            ${results.length ? html`<ul class="g-items">${results.map((it) => html`<${ItemRow} key=${it.id} it=${it} qty=${qty(it.id)} ordering=${ordering}
              onOpen=${() => open('item', { id: it.id })} onAdd=${() => addToCart(it.id, 1, '')} />`)}</ul>`
              : html`<p class="empty">${t('noResults', { q })}</p>`}
          </section>`
          : cats.map((c) => {
            const list = items.filter((i) => i.cat === c.id);
            if (!list.length) return null;
            return html`<section class="g-sec" id=${'cat-' + c.id} key=${c.id} data-cat=${c.id}>
              ${c.image ? html`<img class="g-sec-img" src=${c.image} alt="" loading="lazy" decoding="async" />` : null}
              <div class="g-sec-head"><h2>${pick(c, 'name')}</h2>${pick(c, 'desc') ? html`<p>${pick(c, 'desc')}</p>` : null}</div>
              <ul class="g-items">${list.map((it) => html`<${ItemRow} key=${it.id} it=${it} qty=${qty(it.id)} ordering=${ordering}
                onOpen=${() => open('item', { id: it.id })} onAdd=${() => addToCart(it.id, 1, '')} />`)}</ul>
            </section>`;
          })}
        <${Footer} st=${st} embedded=${!!props.embedded} onFeedback=${() => open('feedback', { general: true })} />
      </main>

      ${cartCount > 0 ? html`<div class=${'g-cartbar' + (bump % 2 ? ' bump' : '')} key=${'bar' + bump}>
        <button onClick=${() => open('cart')} aria-live="polite">
          <span class="badge">${cartCount}</span><span class="grow">${t('viewOrder')}</span><span class="money">RWF ${U.money(cartTotal, L())}</span>
        </button></div>`
        : due > 0 && payReady && !sheet && !readyOrder ? html`<div class="g-cartbar"><button onClick=${() => open('pay')}>
          <${Icon} name="wallet" /><span class="grow">${t('pay')}</span><span class="money">RWF ${U.money(due, L())}</span></button></div>` : null}

      ${sheet && sheet.type === 'item' ? html`<${ItemSheet} id=${sheet.id} ordering=${ordering} onClose=${close}
        onAdd=${(n, note) => { addToCart(sheet.id, n, note); close(); }} />` : null}
      ${sheet && sheet.type === 'cart' ? html`<${CartSheet} cart=${cart} setCart=${setCart} table=${table} tables=${tables}
        setTable=${setTable} onClose=${close}
        onPlaced=${() => { setCart([]); open('orders', { fresh: true }); }} />` : null}
      ${sheet && sheet.type === 'table' ? html`<${TableSheet} tables=${tables} table=${table}
        onPick=${(id) => { setTable(id); sheet.back ? open(sheet.back) : close(); }} onClose=${() => (sheet.back ? open(sheet.back) : close())} />` : null}
      ${sheet && sheet.type === 'orders' && !readyOrder ? html`<${OrdersSheet} orders=${myOrders} table=${table} onClose=${close} autopilot=${autopilot}
        onPay=${() => open('pay')} onMore=${close} onRequest=${serviceRequest} />` : null}
      ${sheet && sheet.type === 'pay' ? html`<${PaySheet} orders=${myOrders} onClose=${close} onPaid=${() => open('feedback', { afterPay: true })} />` : null}
      ${sheet && sheet.type === 'feedback' ? html`<${FeedbackSheet} orders=${myOrders} table=${table} onClose=${close} />` : null}
      ${sheet && sheet.type === 'reserve' ? html`<${ReserveSheet} tables=${tables} onClose=${close} />` : null}
      ${readyOrder && (!sheet || sheet.type === 'orders') ? html`<${ReadyPopup} order=${readyOrder} onClose=${() => setReadyOrder(null)}
        onPay=${() => { setReadyOrder(null); open('pay'); }} />` : null}
    </div>`;

    function serviceRequest(type) {
      if (!table) { open('table'); KT.toast(t('chooseTable')); return; }
      const key = 'kt1:req:' + type;
      const last = U.ss.get(key, 0);
      if (Date.now() - last < 45000) { KT.toast(t('requestSent', { table: S.tableName(table) }), 'ok'); return; }
      S.addRequest(table, type).then(() => {
        U.ss.set(key, Date.now());
        KT.toast(t('requestSent', { table: S.tableName(table) }), 'ok');
      }, KT.toastError);
    }
  }

  function initialTable(fromProps) {
    if (fromProps) return fromProps;
    const m = location.search.match(/[?&]t=([^&#]+)/);
    if (m) { const id = decodeURIComponent(m[1]); U.ss.set('kt1:table', id); return id; }
    return U.ss.get('kt1:table', '');
  }

  /* ---------- Cover ---------- */
  function Cover({ st }) {
    const openNow = U.isOpenNow(st.hours);
    const pour = KT.BRAND.pourPath(30);
    return html`<header class="g-cover">
      <img src=${st.cover || 'assets/img/photos/cover-sunset.webp'} alt="Lake Kivu at sunset, seen from Karongi" fetchpriority="high" decoding="async" />
      <div class="g-lang"><${LangSwitch} /></div>
      <div class="g-cover-in"><div class="g-wrap">
        <div class="g-brand">
          <${Mark} cls="g-mark" black="#fff" wine="#d68a97" />
          <${Wordmark} cls="g-word" color="#fff" />
        </div>
        <p class="g-tagline">${st.tagline || 'Liquor Boutique'}, ${t('location')}</p>
        ${st.hours ? html`<p class=${'g-open' + (openNow ? '' : ' closed')}><span class="dot"></span>
          ${openNow ? t('openUntil', { time: st.hours.close }) : t('closedNow', { time: st.hours.open })}</p>` : null}
      </div></div>
      <svg class="g-pour" viewBox="0 0 1000 60" preserveAspectRatio="none" aria-hidden="true"><path d=${pour} /></svg>
    </header>`;
  }

  function LangSwitch() {
    const lang = KT.useLang();
    const langs = (S.settings.languages || KT.i18n.langs).filter((l) => KT.i18n.strings[l]);
    if (langs.length < 2) return null;
    return html`<div class="seg" role="group" aria-label=${t('language')}>
      ${langs.map((l) => html`<button key=${l} aria-pressed=${lang === l ? 'true' : 'false'} onClick=${() => KT.i18n.set(l)} lang=${l}
        title=${KT.i18n.strings[l].langName}>${l.toUpperCase()}</button>`)}
    </div>`;
  }

  /* ---------- Live tracker strip ---------- */
  function TrackStrip({ orders, onOpen }) {
    const o = orders[0];
    const ready = o.status === 'ready' || o.status === 'served';
    return html`<button class=${'g-track' + (ready ? ' is-ready' : '')} onClick=${onOpen}>
      <${Glass} status=${o.status} size=${40} />
      <div><b>${t('st_' + o.status)}</b><span>${t('orderNo', { n: '#' + o.number })}${orders.length > 1 ? ' + ' + (orders.length - 1) : ''}</span></div>
      <${Icon} name="chevron-right" />
    </button>`;
  }

  /* ---------- Events ---------- */
  function Events() {
    const now = Date.now();
    const list = S.list('events').filter((e) => e.active !== false && (!e.date || U.dayFromKey(e.date) + U.DAY > now - U.DAY * 0))
      .sort(U.by((e) => (e.date ? U.dayFromKey(e.date) : 0)));
    if (!list.length) return null;
    return html`<section class="g-events" aria-label=${t('whatsOn')}>
      <h2 class="g-sec-title">${t('whatsOn')}</h2>
      <div class="g-ev-scroll">
        ${list.map((e) => html`<article class="g-ev" key=${e.id}>
          ${e.image ? html`<img src=${e.image} alt="" loading="lazy" />` : null}
          <div class="g-ev-body">
            <div class="g-ev-kind">${t('ev_' + (e.type || 'news'))}</div>
            <h3>${pick(e, 'title')}</h3>
            ${pick(e, 'body') ? html`<p>${pick(e, 'body')}</p>` : null}
            ${e.date ? html`<time><${Icon} name="calendar-days" cls="ic-sm" />${U.date(U.dayFromKey(e.date) + 12 * 3600e3, L())}${e.time ? ', ' + e.time : ''}</time>` : null}
          </div>
        </article>`)}
      </div>
    </section>`;
  }

  /* ---------- Category nav with scroll-spy ---------- */
  function CatNav({ cats, onGo, rootRef, scrollRoot, onSearch, searching }) {
    const [active, setActive] = useState(cats[0] && cats[0].id);
    const navRef = useRef();
    useEffect(() => {
      const root = scrollRoot();
      const secs = rootRef.current ? rootRef.current.querySelectorAll('.g-sec[data-cat]') : [];
      if (!secs.length || !('IntersectionObserver' in window)) return;
      const io = new IntersectionObserver((entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.dataset.cat);
      }, { root, rootMargin: '-70px 0px -60% 0px', threshold: 0 });
      secs.forEach((s) => io.observe(s));
      return () => io.disconnect();
    }, [cats.map((c) => c.id).join(','), searching]);
    useEffect(() => { // keep the active chip visible
      const b = navRef.current && navRef.current.querySelector('.chip.on');
      if (b && b.scrollIntoView) { const p = b.parentElement; p.scrollTo({ left: b.offsetLeft - 20, behavior: 'smooth' }); }
    }, [active]);
    return html`<div class="g-nav-in" ref=${navRef}>
      ${cats.map((c) => html`<button key=${c.id} class=${'chip' + (active === c.id && !searching ? ' on' : '')}
        onClick=${() => { setActive(c.id); onGo(c.id); }}>${pick(c, 'name')}</button>`)}
      <button class="btn btn-ghost btn-icon btn-sm search-btn" onClick=${onSearch} aria-label=${t('search')} aria-pressed=${searching ? 'true' : 'false'}>
        <${Icon} name=${searching ? 'x' : 'search'} /></button>
    </div>`;
  }

  /* ---------- Menu row ---------- */
  function ItemRow({ it, qty, onOpen, onAdd, ordering }) {
    const sold = it.available === false;
    const name = pick(it, 'name');
    return html`<li class=${'mi' + (sold ? ' sold' : '') + (it.image ? ' has-img' : '')}>
      <button class="mi-main" onClick=${onOpen}>
        <span class="mi-name">${name}${it.tag ? html`<span class="tag">${t('tag_' + it.tag)}</span>` : null}</span>
        ${pick(it, 'desc') ? html`<span class="mi-desc">${pick(it, 'desc')}</span>` : null}
        <span class="mi-price">${U.money(it.price, L())}</span>
      </button>
      <div class="mi-side">
        ${it.image ? html`<button class="mi-thumb" onClick=${onOpen} tabindex="-1" aria-hidden="true"><img src=${U.thumb(it.image)} alt="" loading="lazy" decoding="async" width="92" height="92" /></button>` : null}
        ${sold ? html`<span class="mi-sold">${t('soldOut')}</span>`
          : ordering ? html`<button class=${'mi-add' + (qty ? ' has' : '')} onClick=${onAdd} aria-label=${t('add') + ': ' + name + (qty ? ' (' + qty + ')' : '')}>
            ${qty ? qty : html`<${Icon} name="plus" />`}</button>` : null}
      </div>
    </li>`;
  }

  /* ---------- Item sheet ---------- */
  function ItemSheet({ id, onClose, onAdd, ordering }) {
    KT.useCols(['items']);
    const it = S.item(id);
    const [n, setN] = useState(1);
    const [note, setNote] = useState('');
    if (!it) return null;
    const st = S.settings;
    const sold = it.available === false;
    return html`<${Sheet} title=${pick(it, 'name')} onClose=${onClose} hideHead=${!!it.image}
      foot=${ordering && !sold ? html`<button class="btn btn-primary btn-lg btn-block" onClick=${() => onAdd(n, note)} data-autofocus>
        <span class="grow">${t('addN', { n })}</span><span class="money">RWF ${U.money(it.price * n, L())}</span></button>` : null}>
      ${it.image ? html`<div class="is-photo"><img src=${it.image} alt=${pick(it, 'name')} /></div>` : null}
      ${it.image ? html`<div class="row-between"><h2 class="is-name">${pick(it, 'name')}</h2>
        <button class="btn btn-ghost btn-icon" onClick=${onClose} aria-label=${t('close')}><${Icon} name="x" /></button></div>` : null}
      ${it.tag ? html`<span class="tag" style="margin-top:6px">${t('tag_' + it.tag)}</span>` : null}
      ${pick(it, 'desc') ? html`<p class="is-desc">${pick(it, 'desc')}</p>` : null}
      <p class="is-price">RWF ${U.money(it.price, L())}${st.showUsd && st.usdRate ? html`<small>${t('approx', { usd: U.usd(it.price, st.usdRate) })}</small>` : null}</p>
      ${sold ? html`<p class="cart-table">${t('soldOut')}</p>` : ordering ? html`
        <label class="field" style="margin-top:18px"><span>${t('note')}</span>
          <input class="input" maxlength="140" value=${note} onInput=${(e) => setNote(e.target.value)} placeholder=${t('notePh')} /></label>
        <div class="is-qty"><span class="muted">${t('quantity')}</span><${Stepper} value=${n} onChange=${setN} min=${1} /></div>` : null}
    </${Sheet}>`;
  }

  /* ---------- Cart sheet ---------- */
  function CartSheet({ cart, setCart, table, tables, setTable, onClose, onPlaced }) {
    KT.useCols(['items', 'settings']);
    const me = S.me();
    const st = S.settings;
    const [name, setName] = useState(me.name || '');
    const [phone, setPhone] = useState(me.phone || '');
    const [optIn, setOptIn] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const [picking, setPicking] = useState(!table);
    const tableRef = useRef();
    const onPickTable = () => { setPicking(true); setTimeout(() => tableRef.current && tableRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' }), 30); };
    const lines = cart.map((l) => Object.assign({}, l, { it: S.item(l.itemId) })).filter((l) => l.it);
    const total = U.sum(lines, (l) => l.it.price * l.qty);
    const setQty = (key, v) => setCart(v <= 0 ? cart.filter((l) => l.key !== key) : cart.map((l) => (l.key === key ? Object.assign({}, l, { qty: v }) : l)));
    const ordering = st.ordering !== false;

    async function place() {
      setErr('');
      if (!table) { setErr(t('chooseTable')); onPickTable(); return; }
      if (phone && !U.isPhone(phone)) { setErr(t('phoneInvalid')); return; }
      setBusy(true);
      try {
        await S.placeOrder({ tableId: table, lines: lines.map((l) => ({ itemId: l.itemId, qty: l.qty, note: l.note })), guest: { name, phone, optIn } });
        U.sound.unlock();
        onPlaced();
      } catch (e) {
        setErr(e && e.message && !/network|offline|unavailable/i.test(e.message) ? e.message : t('orderFailed'));
      } finally { setBusy(false); }
    }

    return html`<${Sheet} title=${t('yourOrder')} onClose=${onClose}
      foot=${lines.length ? html`<div class="stack">
        ${err ? html`<p role="alert" style="color:var(--bad);font-size:14.5px">${err}</p>` : null}
        <button class="btn btn-primary btn-lg btn-block" onClick=${place} disabled=${busy || !ordering}>
          ${busy ? html`<span class="spin"></span><span class="grow">${t('sending')}</span>` : html`<span class="grow">${t('placeOrder')}</span>`}
          <span class="money">RWF ${U.money(total, L())}</span></button></div>` : null}>
      ${!lines.length ? html`<p class="empty">${t('emptyCart')}</p>` : html`
        <ul class="cl">${lines.map((l) => html`<li key=${l.key}>
          <div><div class="n">${pick(l.it, 'name')}</div><div class="small-note money">${U.money(l.it.price, L())} × ${l.qty}</div></div>
          <div class="row"><span class="p">${U.money(l.it.price * l.qty, L())}</span>
            <${Stepper} value=${l.qty} onChange=${(v) => setQty(l.key, v)} min=${0} /></div>
          ${l.note ? html`<div class="note"><${Icon} name="message-square-text" cls="ic-sm" />${l.note}</div>` : null}
        </li>`)}</ul>
        <div class="total-row"><span>${t('total')}</span><span class="money">RWF ${U.money(total, L())}</span></div>
        ${st.showUsd && st.usdRate ? html`<p class="small-note" style="text-align:right">${t('approx', { usd: U.usd(total, st.usdRate) })}</p>` : null}

        <div ref=${tableRef}>
          ${picking || !table ? html`<div style="margin:16px 0">
            <b style="color:var(--ink);font-weight:500">${t('chooseTable')}</b><div class="small-note">${t('pickTableHint')}</div>
            <div class="table-pick">
              ${tables.map((x) => html`<button key=${x.id} aria-pressed=${table === x.id ? 'true' : 'false'} onClick=${() => { setTable(x.id); setPicking(false); setErr(''); }}>${x.name}</button>`)}
              <button aria-pressed=${table === 'takeaway' ? 'true' : 'false'} onClick=${() => { setTable('takeaway'); setPicking(false); setErr(''); }}>${t('takeaway')}</button>
            </div></div>`
          : html`<div class="cart-table">
            <div><b>${S.tableName(table)}</b><div class="muted">${t('pickTableHint')}</div></div>
            <button class="btn btn-sm" onClick=${onPickTable}>${t('change')}</button>
          </div>`}
        </div>

        <div class="stack">
          <label class="field"><span>${t('yourName')}</span><input class="input" value=${name} onInput=${(e) => setName(e.target.value)} autocomplete="given-name" maxlength="60" /></label>
          <label class="field"><span>${t('yourPhone')}</span><input class="input" type="tel" inputmode="tel" value=${phone} onInput=${(e) => setPhone(e.target.value)} autocomplete="tel" placeholder="078 000 0000" /></label>
          ${phone ? html`<label class="check"><input type="checkbox" checked=${optIn} onChange=${(e) => setOptIn(e.target.checked)} />${t('optIn')}</label>` : null}
          <p class="small-note">${t('payAfter')}</p>
          ${!ordering ? html`<p class="small-note" role="alert">${t('paused')}</p>` : null}
        </div>`}
    </${Sheet}>`;
  }

  /* ---------- Table picker ---------- */
  function TableSheet({ tables, table, onPick, onClose }) {
    return html`<${Sheet} title=${t('chooseTable')} onClose=${onClose}>
      <p class="muted">${t('pickTableHint')}</p>
      <div class="table-pick">
        ${tables.map((x) => html`<button key=${x.id} aria-pressed=${table === x.id ? 'true' : 'false'} onClick=${() => onPick(x.id)}>${x.name}</button>`)}
        <button aria-pressed=${table === 'takeaway' ? 'true' : 'false'} onClick=${() => onPick('takeaway')}>${t('takeaway')}</button>
      </div>
    </${Sheet}>`;
  }

  /* ---------- Orders / tracker ---------- */
  function OrdersSheet({ orders, table, onClose, onPay, onMore, onRequest, autopilot }) {
    KT.useCols(['orders']);
    KT.useNow(20000);
    const st = S.settings;
    const due = S.amountDue(orders);
    const payReady = orders.some((o) => (o.status === 'ready' || o.status === 'served') && !S.isPaid(o));
    return html`<${Sheet} title=${t('myOrders')} onClose=${onClose}
      foot=${html`<div class="row">
        <button class="btn btn-lg" style="flex:1" onClick=${onMore}><${Icon} name="plus" />${t('orderMore')}</button>
        ${due > 0 && payReady ? html`<button class="btn btn-primary btn-lg" style="flex:1.4" onClick=${onPay}><span class="grow">${t('pay')}</span><span class="money">${U.money(due, L())}</span></button>` : null}
      </div>`}>
      ${autopilot && orders.some((o) => ['new', 'kitchen', 'preparing'].includes(o.status)) ? html`<p class="small-note" style="margin-bottom:12px">${t('demoAuto')}</p>` : null}
      ${orders.map((o) => html`<${OrderCard} key=${o.id} o=${o} />`)}
      ${st.serviceRequests !== false && table ? html`<div class="ord-actions">
        <button class="btn" onClick=${() => onRequest('staff')}><${Icon} name="bell-ring" />${t('callStaff')}</button>
        <button class="btn" onClick=${() => onRequest('bill')}><${Icon} name="receipt" />${t('askBill')}</button>
      </div>` : null}
    </${Sheet}>`;
  }

  function OrderCard({ o }) {
    const step = STATUS_STEP[o.status] == null ? 0 : STATUS_STEP[o.status];
    const paid = S.isPaid(o);
    const status = paid && o.status === 'served' ? 'paid' : o.status;
    const canCancel = (o.status === 'new' || o.status === 'kitchen') && !o.statusAt.preparing;
    const steps = ['received', 'kitchen', 'ready', 'served'];
    async function cancel() {
      const ok = await KT.confirm({ title: t('cancelSure'), ok: t('cancelOrder'), cancel: t('keep'), danger: true });
      if (ok) S.cancelOrder(o.id, 'Cancelled by guest', 'guest').catch(KT.toastError);
    }
    return html`<article class="ord" aria-live="polite">
      <div class="ord-top">
        <${Glass} status=${status} size=${84} />
        <div>
          <h3 class="ord-title">${t('st_' + status)}</h3>
          <p class="ord-sub">${t('sd_' + status)}</p>
          <p class="ord-meta">${t('orderNo', { n: '#' + o.number })}, ${S.tableName(o.tableId) || t('takeaway')}, ${U.time(o.createdAt)}</p>
        </div>
      </div>
      ${o.status !== 'cancelled' ? html`<ol class="steps">${steps.map((s, i) => html`<li key=${s} class=${i < step || (i === step && (paid || o.status === 'served')) ? 'done' : i === step ? 'now' : ''}>${t('step_' + s)}</li>`)}</ol>` : null}
      <div class="ord-lines">
        ${o.lines.map((l, i) => html`<div key=${i}><span>${l.qty} × ${l.name}${l.note ? html` <span class="muted">(${l.note})</span>` : null}</span><span class="num">${U.money(l.price * l.qty, L())}</span></div>`)}
        <div style="font-weight:500;color:var(--ink);margin-top:4px"><span>${t('total')}</span><span class="money">RWF ${U.money(o.total, L())}</span></div>
      </div>
      ${canCancel ? html`<div class="ord-actions"><button class="btn btn-ghost btn-sm btn-danger" onClick=${cancel}>${t('cancelOrder')}</button></div>` : null}
    </article>`;
  }

  /* ---------- Pay ---------- */
  function PaySheet({ orders, onClose, onPaid }) {
    KT.useCols(['orders', 'settings']);
    const st = S.settings;
    const unpaid = orders.filter((o) => o.status !== 'cancelled' && !S.isPaid(o));
    const due = U.sum(unpaid, (o) => o.total);
    const claimed = unpaid.length > 0 && unpaid.every((o) => o.payment && o.payment.status === 'claimed');
    const [copied, setCopied] = useState(false);
    const momo = st.momo || {};
    const code = U.ussd(momo.ussd, momo.number, due);
    const ios = U.isIOS();
    async function paid() {
      try { await S.claimPayment(unpaid.map((o) => o.id), 'momo'); KT.toast(t('paidThanks'), 'ok', 4200); onPaid(); }
      catch (e) { KT.toastError(e); }
    }
    return html`<${Sheet} title=${t('payTitle')} onClose=${onClose}
      foot=${due > 0 ? html`<button class="btn btn-dark btn-lg btn-block" onClick=${paid} disabled=${claimed}>
        <${Icon} name="circle-check" />${claimed ? t('paidThanks') : t('iPaid')}</button>` : null}>
      <div class="pay-amount"><small>${t('amountDue')}</small><b class="money">RWF ${U.money(due, L())}</b>
        ${st.showUsd && st.usdRate && due ? html`<small>${t('approx', { usd: U.usd(due, st.usdRate) })}</small>` : null}</div>
      ${momo.number ? html`<div class="momo">
        <div class="momo-head"><span class="momo-logo">MoMo</span>${t('payMomo')}</div>
        <div class="momo-num">${U.prettyMomo(momo.number)}</div>
        <div class="momo-name">${t('momoName')}: ${momo.name || st.name}</div>
        <div class="row" style="margin-top:14px;flex-wrap:wrap">
          ${momo.quickDial !== false && due > 0 && !ios ? html`<a class="btn btn-lg" style="flex:1" href=${U.ussdHref(code)}><${Icon} name="phone" />${t('payNow', { amount: U.money(due, L()) })}</a>` : null}
          <button class="btn btn-soft" onClick=${() => U.copy(String(momo.number)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); })}>
            <${Icon} name=${copied ? 'check' : 'copy'} />${copied ? t('copied') : t('copyNumber')}</button>
        </div>
        <p class="momo-hint">${ios || momo.quickDial === false ? html`${t('iosHint', { code: '' })}<span class="momo-code">${code}</span>` : t('dialHint')}</p>
      </div>` : null}
      ${st.payCash !== false || st.payCard ? html`<p class="small-note" style="margin-top:14px;text-align:center">${t('payCounter')}</p>` : null}
    </${Sheet}>`;
  }

  /* ---------- Feedback ---------- */
  const RATE_GLASS = '<svg viewBox="0 0 40 52" aria-hidden="true"><path class="w" d="M8 14 Q8 30 20 31 Q32 30 32 14 Z"/><path d="M6 4 H34 Q35 22 28 28 Q24 32 21 32.6 V46 H28 V49 H12 V46 H19 V32.6 Q16 32 12 28 Q5 22 6 4 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
  function FeedbackSheet({ orders, table, onClose }) {
    const me = S.me();
    const st = S.settings;
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState('');
    const [name, setName] = useState(me.name || '');
    const [phone, setPhone] = useState(me.phone || '');
    const [email, setEmail] = useState('');
    const [optIn, setOptIn] = useState(false);
    const [done, setDone] = useState(false);
    const [busy, setBusy] = useState(false);
    const labels = { 1: '😞', 2: '😐', 3: '🙂', 4: '😊', 5: '🤩' };
    async function send() {
      if (!rating && !comment.trim()) return;
      if (phone && !U.isPhone(phone)) { KT.toast(t('phoneInvalid'), 'bad'); return; }
      setBusy(true);
      try {
        await S.addFeedback({ rating, comment: comment.trim().slice(0, 800), name: name.trim(), phone, email: email.trim(), optIn, tableId: table || '', orderIds: orders.map((o) => o.id).slice(0, 10) });
        S.saveMe({ name: name.trim() || me.name, phone: phone || me.phone });
        setDone(true);
      } catch (e) { KT.toastError(e); } finally { setBusy(false); }
    }
    useEffect(() => { if (done) { const b = document.querySelector('.fb-close'); if (b) b.focus({ preventScroll: true }); } }, [done]);
    if (done) {
      return html`<${Sheet} title=${t('fbTitle')} onClose=${onClose}
        foot=${html`<button class="btn btn-lg btn-block fb-close" onClick=${onClose}>${t('close')}</button>`}>
        <div class="done-panel">
          <${Glass} status="ready" size=${92} />
          <h3>${t('fbThanks', { name: name.trim() ? ', ' + name.trim().split(' ')[0] : '' })}</h3>
          ${st.reviewUrl ? html`<p style="margin-top:16px"><a class="btn btn-soft" href=${st.reviewUrl} target="_blank" rel="noopener"><${Icon} name="star" />${t('reviewGoogle')}</a></p>` : null}
        </div>
      </${Sheet}>`;
    }
    return html`<${Sheet} title=${t('fbTitle')} onClose=${onClose}
      foot=${html`<div class="row"><button class="btn btn-lg" onClick=${onClose}>${t('skip')}</button>
        <button class="btn btn-primary btn-lg" style="flex:1" onClick=${send} disabled=${busy || (!rating && !comment.trim())}>${busy ? html`<span class="spin"></span>` : null}${t('send')}</button></div>`}>
      <p class="muted" style="text-align:center">${t('fbRate')}</p>
      <div class="rate" role="radiogroup" aria-label=${t('fbRate')}>
        ${[1, 2, 3, 4, 5].map((n) => html`<button key=${n} role="radio" aria-checked=${rating === n ? 'true' : 'false'} aria-label=${n + ' / 5'}
          class=${n <= rating ? 'on' : ''} onClick=${() => setRating(n)} dangerouslySetInnerHTML=${{ __html: RATE_GLASS }}></button>`)}
      </div>
      <p class="rate-label" aria-hidden="true">${rating ? labels[rating] + ' ' + rating + ' / 5' : ''}</p>
      <div class="stack" style="margin-top:12px">
        <label class="field"><span>${t('fbComment')}</span><textarea class="textarea" value=${comment} onInput=${(e) => setComment(e.target.value)} placeholder=${t('fbCommentPh')} maxlength="800"></textarea></label>
        <p class="small-note">${t('fbContact')}</p>
        <label class="field"><span>${t('name')}</span><input class="input" value=${name} onInput=${(e) => setName(e.target.value)} autocomplete="name" maxlength="60" /></label>
        <label class="field"><span>${t('phone')}</span><input class="input" type="tel" inputmode="tel" value=${phone} onInput=${(e) => setPhone(e.target.value)} autocomplete="tel" /></label>
        <label class="field"><span>Email</span><input class="input" type="email" value=${email} onInput=${(e) => setEmail(e.target.value)} autocomplete="email" /></label>
        ${phone || email ? html`<label class="check"><input type="checkbox" checked=${optIn} onChange=${(e) => setOptIn(e.target.checked)} />${t('optIn')}</label>` : null}
      </div>
    </${Sheet}>`;
  }

  /* ---------- Reserve a table ---------- */
  function slotsFor(dayKey, hours) {
    const o = U.hm((hours && hours.open) || '09:00'), c = U.hm((hours && hours.close) || '23:00');
    const end = (c > o ? c : c + 24 * 60) - 60;
    const out = [];
    const isToday = dayKey === U.dayKey();
    const nowM = U.minutesOfDay(Date.now()) + 30;
    for (let m = Math.ceil(o / 30) * 30; m <= end; m += 30) {
      if (isToday && m < nowM) continue;
      const mm = m % (24 * 60);
      out.push(String(Math.floor(mm / 60)).padStart(2, '0') + ':' + String(mm % 60).padStart(2, '0'));
    }
    return out;
  }
  function ReserveSheet({ tables, onClose }) {
    KT.useCols(['reservations']);
    const st = S.settings;
    const me = S.me();
    const today = U.dayKey(), tomorrow = U.dayKey(Date.now() + U.DAY);
    const [date, setDate] = useState(slotsFor(today, st.hours).length ? today : tomorrow);
    const slots = slotsFor(date, st.hours);
    const [time, setTime] = useState('');
    const [guests, setGuests] = useState(2);
    const [name, setName] = useState(me.name || '');
    const [phone, setPhone] = useState(me.phone || '');
    const [note, setNote] = useState('');
    const [tableId, setTableId] = useState('');
    const [optIn, setOptIn] = useState(false);
    const [err, setErr] = useState('');
    const [busy, setBusy] = useState(false);
    const [sent, setSent] = useState(false);
    const mine = S.myBookings();
    const tm = time && slots.includes(time) ? time : (slots.includes('19:00') ? '19:00' : slots[0] || '');

    async function submit() {
      setErr('');
      if (!name.trim()) { setErr(t('name') + ': ' + t('required')); return; }
      if (!U.isPhone(phone)) { setErr(t('phoneInvalid')); return; }
      if (!tm) { setErr(t('time') + ': ' + t('required')); return; }
      setBusy(true);
      try { await S.addReservation({ date, time: tm, guests, name: name.trim(), phone, note: note.trim(), tableId, optIn }); setSent(true); }
      catch (e) { setErr(e.message); } finally { setBusy(false); }
    }
    return html`<${Sheet} title=${t('reserve')} onClose=${onClose}
      foot=${sent ? html`<button class="btn btn-lg btn-block bk-close" onClick=${onClose} ref=${(b) => b && setTimeout(() => b.focus({ preventScroll: true }), 30)}>${t('close')}</button>`
        : html`<button class="btn btn-primary btn-lg btn-block" onClick=${submit} disabled=${busy}>${busy ? html`<span class="spin"></span>` : html`<${Icon} name="calendar-check" />`}${t('requestBooking')}</button>`}>
      ${sent ? html`<div class="done-panel"><${Icon} name="calendar-check" cls="ic-lg" /><h3>${t('bookingSent')}</h3></div>` : html`<div class="stack">
        <div class="field"><span>${t('date')}</span>
          <div class="row" style="flex-wrap:wrap">
            <button class=${'chip' + (date === today ? ' on' : '')} onClick=${() => setDate(today)} disabled=${!slotsFor(today, st.hours).length}>${t('today')}</button>
            <button class=${'chip' + (date === tomorrow ? ' on' : '')} onClick=${() => setDate(tomorrow)}>${t('tomorrow')}</button>
            <input class="input" style="flex:1;min-width:150px" type="date" value=${date} min=${today} onInput=${(e) => e.target.value && setDate(e.target.value)} aria-label=${t('date')} />
          </div></div>
        <div class="row" style="align-items:flex-end">
          <label class="field" style="flex:1"><span>${t('time')}</span>
            <select class="select" value=${tm} onChange=${(e) => setTime(e.target.value)}>${slots.map((s) => html`<option key=${s} value=${s}>${s}</option>`)}</select></label>
          <div class="field"><span>${t('guests')}</span><${Stepper} value=${guests} onChange=${setGuests} min=${1} max=${30} /></div>
        </div>
        <label class="field"><span>${t('name')}</span><input class="input" value=${name} onInput=${(e) => setName(e.target.value)} autocomplete="name" /></label>
        <label class="field"><span>${t('phone')}</span><input class="input" type="tel" inputmode="tel" value=${phone} onInput=${(e) => setPhone(e.target.value)} autocomplete="tel" placeholder="078 000 0000" /></label>
        ${tables.length ? html`<label class="field"><span>${t('tablePref')}</span><select class="select" value=${tableId} onChange=${(e) => setTableId(e.target.value)}>
          <option value="">${t('anyTable')}</option>${tables.map((x) => html`<option key=${x.id} value=${x.id}>${x.name}</option>`)}</select></label>` : null}
        <label class="field"><span>${t('noteOpt')}</span><input class="input" value=${note} onInput=${(e) => setNote(e.target.value)} maxlength="200" /></label>
        <label class="check"><input type="checkbox" checked=${optIn} onChange=${(e) => setOptIn(e.target.checked)} />${t('optIn')}</label>
        ${err ? html`<p role="alert" style="color:var(--bad)">${err}</p>` : null}
      </div>`}
      ${mine.length ? html`<div style="margin-top:22px"><h3 style="font-size:16px;margin-bottom:8px">${t('yourBookings')}</h3>
        ${mine.map((r) => html`<div class="cart-table" key=${r.id} style="margin:8px 0"><div><b>${U.date(U.dayFromKey(r.date) + 12 * 3600e3, L())}, ${r.time}</b>
          <div class="muted">${r.guests} ${t('guests').toLowerCase()}${r.tableId ? ', ' + S.tableName(r.tableId) : ''}</div></div>
          <span class="tag">${t('bk_' + (r.status || 'pending'))}</span></div>`)}</div>` : null}
    </${Sheet}>`;
  }

  /* ---------- Ready popup ---------- */
  function ReadyPopup({ order, onClose, onPay }) {
    const st = S.settings;
    const counter = !order.tableId || order.tableId === 'takeaway';
    return html`<${Sheet} title=${t('readyTitle')} onClose=${onClose} cls="ready-pop" hideHead=${true}
      foot=${html`<div class="row">
        <button class="btn btn-lg" style="flex:1" onClick=${onClose}>${t('gotIt')}</button>
        <button class="btn btn-primary btn-lg" style="flex:1.4" onClick=${onPay} data-autofocus><${Icon} name="wallet" />${t('payTitle')}</button>
      </div>`}>
      <${Glass} status="ready" size=${110} />
      <h2>${t('readyTitle')}</h2>
      <p class="muted" style="margin-top:6px">${counter ? t('readyBodyCounter') : t('readyBody', { table: S.tableName(order.tableId) })}</p>
      ${st.momo && st.momo.number ? html`<p style="margin-top:14px;font-size:15px">${t('payMomo')}: <b class="money">${U.prettyMomo(st.momo.number)}</b> (${st.momo.name || st.name})</p>` : null}
    </${Sheet}>`;
  }

  /* ---------- Footer ---------- */
  function Footer({ st, onFeedback, embedded }) {
    const [copied, setCopied] = useState(false);
    return html`<footer class="g-foot">
      <${Mark} cls="g-mark" />
      <p class="g-foot-name">${st.name} ${st.tagline}</p>
      <p class="muted" style="font-size:14.5px">${st.address}</p>
      <div class="g-foot-list">
        ${st.hours ? html`<div class="g-foot-row"><${Icon} name="clock" />${t('hoursDaily', { open: st.hours.open, close: st.hours.close })}</div>` : null}
        ${st.mapUrl ? html`<a class="g-foot-row" href=${st.mapUrl} target="_blank" rel="noopener"><${Icon} name="map-pin" />${t('findUs')}<span class="sub">Google Maps</span></a>` : null}
        ${st.phone ? html`<a class="g-foot-row" href=${U.telLink(st.phone)}><${Icon} name="phone" />${t('call')}<span class="sub">${U.prettyPhone(st.phone)}</span></a>` : null}
        ${st.whatsapp ? html`<a class="g-foot-row" href=${U.waLink(st.whatsapp)} target="_blank" rel="noopener"><${Icon} name="message-circle" />WhatsApp<span class="sub">${U.prettyPhone(st.whatsapp)}</span></a>` : null}
        ${st.wifi && st.wifi.name ? html`<button class="g-foot-row" onClick=${() => U.copy(st.wifi.password || '').then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); })}>
          <${Icon} name="wifi" />${t('wifi')}: ${st.wifi.name}<span class="sub">${st.wifi.password ? (copied ? t('copied') : t('password') + ': ' + st.wifi.password) : ''}</span></button>` : null}
        <button class="g-foot-row" onClick=${onFeedback}><${Icon} name="message-square-text" />${t('giveFeedback')}</button>
        ${st.reviewUrl ? html`<a class="g-foot-row" href=${st.reviewUrl} target="_blank" rel="noopener"><${Icon} name="star" />${t('reviewGoogle')}</a>` : null}
      </div>
      <div class="g-foot-small"><${LangSwitch} />${embedded ? null : html`<a href="#/staff">${t('staffLogin')}</a>`}</div>
    </footer>`;
  }

  KT.views = KT.views || {};
  KT.views.GuestApp = GuestApp;
})();
