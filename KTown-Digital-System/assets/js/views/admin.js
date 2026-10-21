/* K.Town — Owner dashboard (works on the phone): sales today and this week, live orders,
   menu editor, tables & QR codes, events & promotions, bookings, feedback, guest contacts, settings. */
(function () {
  'use strict';
  const KT = (window.KT = window.KT || {});
  const { html, useState, useEffect, useMemo, useRef } = window.htmPreact;
  const { Icon, Sheet, Switch, Mark, Raw, ModePill, Stepper } = KT.ui;
  const U = KT.U, S = KT.store;
  const { StatusPill, PayPill } = KT.staff;

  const IMG = 'assets/img/photos/';
  KT.GALLERY = {
    covers: ['cover-sunset', 'cover-lake', 'cover-night', 'cover-terrace', 'cover-rooftop'].map((n) => IMG + n + '.webp'),
    photos: ['item-watermelon', 'item-mango', 'item-ice-latte', 'item-ice-cappuccino', 'item-ice-americano', 'item-cappuccino', 'item-tea', 'cat-juice', 'cat-coffee', 'cat-tea', 'cover-sunset', 'cover-lake', 'cover-night', 'cover-terrace', 'cover-rooftop'].map((n) => IMG + n + '.webp')
  };

  const PAGES = [
    { id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
    { id: 'orders', label: 'Orders', icon: 'receipt' },
    { id: 'reports', label: 'Reports', icon: 'chart-column' },
    { id: 'menu', label: 'Menu', icon: 'utensils' },
    { id: 'tables', label: 'Tables & QR', icon: 'qr-code' },
    { id: 'events', label: 'Events & offers', icon: 'megaphone' },
    { id: 'bookings', label: 'Bookings', icon: 'calendar-days' },
    { id: 'feedback', label: 'Feedback', icon: 'message-square-text' },
    { id: 'guests', label: 'Guests', icon: 'users' },
    { id: 'settings', label: 'Settings', icon: 'settings' }
  ];
  const BOTTOM = ['overview', 'orders', 'menu', 'reports'];

  function AdminApp({ route, embedded, page: pageProp }) {
    KT.useCols(['orders', 'feedback', 'reservations', 'settings', 'requests']);
    const [localPage, setLocalPage] = useState(pageProp || 'overview');
    const page = embedded ? localPage : ((route && route.parts[1]) || 'overview');
    const go = (p) => { if (embedded) setLocalPage(p); else KT.go('admin/' + p); };
    const [more, setMore] = useState(false);
    const rootRef = useRef();
    useEffect(() => { // on the demo wall, a new page starts at the top like it does on its own screen
      const box = embedded && rootRef.current && rootRef.current.closest('.demo-scroll');
      if (box) box.scrollTop = 0;
    }, [page]);
    const pendingBookings = S.list('reservations').filter((r) => r.status === 'pending' && U.dayFromKey(r.date) >= U.startOfDay()).length;
    const newFb = S.list('feedback').filter((f) => f.createdAt > U.startOfDay()).length;
    const badges = { bookings: pendingBookings, feedback: newFb };
    const P = { overview: Overview, orders: Orders, reports: Reports, menu: MenuEditor, tables: Tables, events: Events, bookings: Bookings, feedback: Feedback, guests: Guests, settings: Settings }[page] || Overview;
    const link = (p) => ({ href: embedded ? undefined : '#/admin/' + p.id, onClick: embedded ? (e) => { e.preventDefault(); go(p.id); } : undefined });
    return html`<div class="v-staff v-admin" ref=${rootRef}><div class="adm">
      <aside class="adm-side">
        <div class="adm-brand"><${Mark} cls="mk" /><div><b>${S.settings.name}</b><small>Owner dashboard</small></div></div>
        <nav class="adm-nav" aria-label="Admin">
          ${PAGES.map((p) => html`<a key=${p.id} ...${link(p)} href=${embedded ? '#' : '#/admin/' + p.id} aria-current=${page === p.id ? 'page' : undefined}>
            <${Icon} name=${p.icon} />${p.label}${badges[p.id] ? html`<span class="badge">${badges[p.id]}</span>` : null}</a>`)}
          <div class="sep"></div>
          <a href="#/reception"><${Icon} name="hand-platter" />Reception</a>
          <a href="#/kitchen"><${Icon} name="chef-hat" />Kitchen</a>
          <a href="./" target="_blank" rel="noopener"><${Icon} name="smartphone" />Guest menu</a>
        </nav>
        <div class="adm-side-foot"><${ModePill} /><button class="btn btn-sm" onClick=${() => S.signOut()}><${Icon} name="log-out" />Sign out</button></div>
      </aside>
      <main class="adm-main">
        ${S.hasSample() ? html`<div class="adm-page" style="padding-bottom:0"><div class="notice"><${Icon} name="info" />
          <div>This dashboard includes <b>sample orders and feedback</b> for the demo. Remove them before you start using the system for real.</div>
          <button class="btn btn-sm" onClick=${async () => { const n = await S.clearSample(); KT.toast(n + ' sample records removed', 'ok'); }}>Remove sample data</button></div></div>` : null}
        ${S.mode === 'live' && S.adapter.isEmpty() ? html`<div class="adm-page" style="padding-bottom:0"><div class="notice info"><${Icon} name="info" />
          <div>Your live database is empty. Copy the starting K.Town menu, tables and settings into it.</div>
          <button class="btn btn-sm btn-primary" onClick=${() => S.seed().then(() => KT.toast('Menu copied to the live database', 'ok'), KT.toastError)}>Set up menu</button></div></div>` : null}
        <${P} go=${go} embedded=${!!embedded} />
      </main>
      <nav class="adm-bottom" aria-label="Admin">
        ${BOTTOM.map((id) => PAGES.find((p) => p.id === id)).map((p) => html`<a key=${p.id} ...${link(p)} href=${embedded ? '#' : '#/admin/' + p.id} aria-current=${page === p.id ? 'page' : undefined}><${Icon} name=${p.icon} />${p.label}</a>`)}
        <button onClick=${() => setMore(true)} aria-current=${BOTTOM.includes(page) ? undefined : 'page'}><${Icon} name="menu" />More${pendingBookings + newFb ? html`<span class="badge" style="position:absolute;margin-left:22px;margin-top:-4px;height:18px;min-width:18px;font-size:11px">${pendingBookings + newFb}</span>` : null}</button>
      </nav>
      ${more ? html`<${Sheet} title="More" onClose=${() => setMore(false)}>
        <div class="list">${PAGES.filter((p) => !BOTTOM.includes(p.id)).map((p) => html`<a class="li" key=${p.id} style="text-decoration:none;color:var(--ink)" ...${link(p)} href=${embedded ? '#' : '#/admin/' + p.id}
          onClick=${(e) => { e.preventDefault(); setMore(false); go(p.id); }}><${Icon} name=${p.icon} /><span class="grow t">${p.label}</span>${badges[p.id] ? html`<span class="badge">${badges[p.id]}</span>` : null}<${Icon} name="chevron-right" /></a>`)}
          ${embedded ? null : html`<a class="li" href="#/reception" style="text-decoration:none;color:var(--ink)"><${Icon} name="hand-platter" /><span class="grow t">Reception screen</span></a>
          <a class="li" href="#/kitchen" style="text-decoration:none;color:var(--ink)"><${Icon} name="chef-hat" /><span class="grow t">Kitchen screen</span></a>`}
          <button class="li" style="background:none;border-left:0;border-right:0;border-top:0;width:100%;text-align:left" onClick=${() => S.signOut()}><${Icon} name="log-out" /><span class="grow t">Sign out</span></button>
        </div></${Sheet}>` : null}
    </div></div>`;
  }

  /* ==================================================================
     Overview
  ================================================================== */
  function Overview({ go, embedded }) {
    KT.useCols(['orders', 'feedback', 'reservations', 'items', 'requests']);
    const now = KT.useNow(30000);
    const day0 = U.startOfDay(now);
    const today = S.ordersBetween(day0, now + 60e3);
    const t = S.sales(today);
    const ySame = S.sales(S.ordersBetween(day0 - U.DAY, now - U.DAY));
    const change = ySame.revenue ? Math.round(((t.revenue - ySame.revenue) / ySame.revenue) * 100) : null;
    const days = [];
    for (let i = 6; i >= 0; i--) { const d0 = day0 - i * U.DAY; days.push({ ts: d0, label: i === 0 ? 'Today' : U.weekdayShort(d0 + 12 * 3600e3), value: S.sales(S.ordersBetween(d0, d0 + U.DAY - 1)).revenue, today: i === 0 }); }
    const week = U.sum(days, (d) => d.value);
    const live = S.list('orders').filter((o) => o.createdAt >= day0 - 6 * 3600e3);
    const count = (f) => live.filter(f).length;
    const top = S.topItems(today.length ? today : S.ordersBetween(day0 - 6 * U.DAY, now), 5);
    const fb = S.list('feedback');
    const weekFb = fb.filter((f) => f.createdAt >= day0 - 6 * U.DAY && f.rating);
    const avg = weekFb.length ? U.sum(weekFb, (f) => f.rating) / weekFb.length : 0;
    const bookings = S.list('reservations').filter((r) => U.dayFromKey(r.date) >= day0 && r.status !== 'declined').sort(U.by((r) => r.date + r.time)).slice(0, 4);
    const requests = S.list('requests').filter((r) => r.status === 'open');
    return html`<div class="adm-page">
      <div class="adm-head"><div><h1>Good ${U.hour(now) < 12 ? 'morning' : U.hour(now) < 18 ? 'afternoon' : 'evening'}</h1><p>${U.dateLong(now)}, ${U.time(now)}</p></div>
        <div class="actions"><button class="btn btn-sm" onClick=${() => go('orders')}><${Icon} name="receipt" />All orders</button></div></div>
      <div class="grid grid-2">
        <section class="panel today-hero" aria-label="Sales today">
          <small>Money received today</small>
          <div class="big"><span>RWF</span>${U.money(t.revenue)}</div>
          <div class="vs">${change != null ? html`<b class=${change < 0 ? 'down' : ''}>${change >= 0 ? '+' : ''}${change}%</b> compared with this time yesterday`
            : t.revenue ? U.plural(today.filter((o) => o.status !== 'cancelled' && S.isPaid(o)).length, '{n} order paid so far today.', '{n} orders paid so far today.')
            : 'First sales of the day show here as payments are confirmed.'}</div>
          <div class="facts">
            <div><small>Orders</small><b>${t.orders}</b></div>
            <div><small>Average order</small><b>${U.money(t.avg)}</b></div>
            <div><small>Not yet paid</small><b>${U.money(t.unpaid)}</b></div>
          </div>
          <svg class="pour" viewBox="0 0 1000 60" preserveAspectRatio="none" aria-hidden="true"><path d=${KT.BRAND.pourPath(26)} /></svg>
        </section>
        <section class="panel">
          <div class="panel-head"><h2>Right now</h2>${embedded ? null : html`<a href="#/reception">Open reception</a>`}</div>
          <div class="kpis">
            <div class="kpi"><small>New, waiting</small><b>${count((o) => o.status === 'new')}</b></div>
            <div class="kpi"><small>In the kitchen</small><b>${count((o) => o.status === 'kitchen' || o.status === 'preparing')}</b></div>
            <div class="kpi"><small>Ready to serve</small><b>${count((o) => o.status === 'ready')}</b></div>
            <div class="kpi"><small>Waiting to pay</small><b>${count((o) => o.status === 'served' && !S.isPaid(o))}</b></div>
          </div>
          ${requests.length ? html`<p class="notice info" style="margin-top:12px"><${Icon} name="bell-ring" /><span>${requests.map((r) => S.tableName(r.tableId) + (r.type === 'bill' ? ' wants the bill' : ' is calling staff')).join('; ')}</span></p>` : null}
        </section>
        <section class="panel span-2">
          <div class="panel-head"><h2>Last 7 days</h2><button class="link" onClick=${() => go('reports')}>Weekly report</button></div>
          <p class="muted" style="font-size:14px;margin-top:-6px">Money received each day. Total RWF ${U.money(week)}.</p>
          <${Bars} data=${days} />
        </section>
        <section class="panel">
          <div class="panel-head"><h2>Best sellers ${today.length ? 'today' : 'this week'}</h2></div>
          ${top.length ? html`<${HBars} rows=${top.map((x) => ({ label: x.name, value: x.qty, text: x.qty + ' sold' }))} />` : html`<p class="muted">No orders yet.</p>`}
        </section>
        <section class="panel">
          <div class="panel-head"><h2>Guest feedback</h2><button class="link" onClick=${() => go('feedback')}>All feedback</button></div>
          ${weekFb.length ? html`<p style="margin-bottom:6px"><b style="font-size:22px;font-weight:500;color:var(--ink)">${avg.toFixed(1)}</b> <span class="muted">out of 5 this week, from ${weekFb.length} guest${weekFb.length > 1 ? 's' : ''}</span></p>` : null}
          ${fb.slice(0, 3).map((f) => html`<${FbRow} f=${f} key=${f.id} />`)}
          ${!fb.length ? html`<p class="muted">Feedback from guests arrives here the moment they send it.</p>` : null}
        </section>
        <section class="panel span-2">
          <div class="panel-head"><h2>Coming up</h2><button class="link" onClick=${() => go('bookings')}>Bookings</button></div>
          ${bookings.length ? html`<div class="list">${bookings.map((r) => html`<div class="li" key=${r.id}><${Icon} name="calendar-days" />
            <div class="grow"><div class="t">${U.date(U.dayFromKey(r.date) + 12 * 3600e3)}, ${r.time}: ${r.name}, ${r.guests} guest${r.guests > 1 ? 's' : ''}</div>${r.note ? html`<div class="s">${r.note}</div>` : null}</div>
            <span class="pill" data-s=${r.status === 'confirmed' ? 'ready' : 'new'}>${r.status === 'confirmed' ? 'Confirmed' : r.status === 'seated' ? 'Seated' : 'Waiting'}</span></div>`)}</div>`
            : html`<p class="muted">No bookings yet. Guests can reserve from the menu.</p>`}
        </section>
      </div>
    </div>`;
  }

  /* ---------- Charts (single series: today / best day emphasised, values in tooltips + tables) ---------- */
  function Bars({ data, fmt, height }) {
    const max = Math.max(1, ...data.map((d) => d.value));
    const peak = data.reduce((a, b) => (b.value > a.value ? b : a), data[0] || { value: 0 });
    const f = fmt || ((v) => U.money(v));
    const [tip, setTip] = useState(null);
    const nice = niceMax(max);
    return html`<div class="chart" style="position:relative">
      <div class="bars" style=${height ? 'height:' + height + 'px' : ''} role="img" aria-label=${data.map((d) => d.label + ' ' + f(d.value)).join(', ')}>
        ${data.map((d, i) => {
          const pct = (d.value / nice) * 100;
          const show = d.today || (d === peak && d.value > 0);
          return html`<div class=${'bar' + (d.today ? ' today' : '') + (d === peak && d.value > 0 && !data.some((x) => x.today) ? ' peak' : '')} key=${i}
            tabindex="0" onPointerEnter=${() => setTip(i)} onPointerLeave=${() => setTip(null)} onFocus=${() => setTip(i)} onBlur=${() => setTip(null)}>
            <div class="bar-col"><div class="bar-fill" style=${'height:' + Math.max(1.5, pct) + '%;max-width:24px;margin:0 auto;' + (tip === i ? 'filter:brightness(1.12)' : '')}>
              ${show || tip === i ? html`<span class="bar-val">${f(d.value)}</span>` : null}</div></div>
            <div class="bar-lab">${d.label}</div>
          </div>`;
        })}
      </div>
    </div>`;
  }
  function niceMax(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
  function HBars({ rows }) {
    const max = Math.max(1, ...rows.map((r) => r.value));
    return html`<div class="hbars">${rows.map((r, i) => html`<div class="hbar" key=${i}>
      <span>${r.label}</span><span class="v">${r.text}</span>
      <div class="track" aria-hidden="true"><i style=${'width:' + (r.value / max) * 100 + '%'}></i></div></div>`)}</div>`;
  }
  function Glasses({ n }) {
    return html`<span class="stars" aria-label=${n + ' out of 5'}>${[1, 2, 3, 4, 5].map((i) => html`<${Icon} key=${i} name="wine" cls=${i <= n ? '' : 'off'} />`)}</span>`;
  }
  function FbRow({ f }) {
    return html`<div class="fb">
      <div class="row-between">${f.rating ? html`<${Glasses} n=${f.rating} />` : html`<span class="muted">No rating</span>`}<span class="s" style="margin:0">${U.dateTime(f.createdAt)}</span></div>
      ${f.comment ? html`<p>“${f.comment}”</p>` : null}
      <p class="s">${[f.name, f.phone ? U.prettyPhone(f.phone) : '', f.tableId ? S.tableName(f.tableId) : '', f.source === 'paper' ? 'paper card' : ''].filter(Boolean).join(', ') || 'Anonymous'}</p>
    </div>`;
  }

  /* ==================================================================
     Orders
  ================================================================== */
  function Orders() {
    KT.useCols(['orders', 'tables']);
    const [day, setDay] = useState(U.dayKey());
    const [filter, setFilter] = useState('all');
    const [q, setQ] = useState('');
    const [sheet, setSheet] = useState(null);
    const d0 = U.dayFromKey(day);
    const all = S.ordersBetween(d0, d0 + U.DAY - 1);
    const list = all.filter((o) => ({ all: true, open: S.isOpen(o), unpaid: o.status !== 'cancelled' && !S.isPaid(o), paid: S.isPaid(o), cancelled: o.status === 'cancelled' }[filter]))
      .filter((o) => !q || (String(o.number) === q.replace('#', '') || (o.guestName || '').toLowerCase().includes(q.toLowerCase()) || (o.tableName || '').toLowerCase().includes(q.toLowerCase())));
    const s = S.sales(all);
    function exportCsv() {
      const rows = [['Order', 'Date', 'Time', 'Table', 'Items', 'Total (RWF)', 'Status', 'Payment', 'Method', 'Guest', 'Phone', 'Entered by']];
      all.slice().reverse().forEach((o) => rows.push([o.number, U.dayKey(o.createdAt), U.time(o.createdAt), S.tableName(o.tableId), o.lines.map((l) => l.qty + 'x ' + l.name).join('; '), o.total, o.status, (o.payment || {}).status || 'unpaid', (o.payment || {}).method || '', o.guestName || '', o.guestPhone || '', o.source]));
      U.download('ktown-orders-' + day + '.csv', '﻿' + U.csv(rows), 'text/csv;charset=utf-8');
    }
    return html`<div class="adm-page">
      <div class="adm-head"><div><h1>Orders</h1><p>${s.orders} orders, RWF ${U.money(s.billed)} ordered, RWF ${U.money(s.revenue)} received</p></div>
        <div class="actions"><button class="btn btn-sm btn-primary" onClick=${() => setSheet({ type: 'pos' })}><${Icon} name="plus" />New order</button>
          <button class="btn btn-sm" onClick=${exportCsv}><${Icon} name="file-down" />Export CSV</button></div></div>
      <div class="row" style="flex-wrap:wrap;gap:8px;margin-bottom:12px">
        <button class="btn btn-sm btn-icon" aria-label="Previous day" onClick=${() => setDay(U.dayKey(d0 - U.DAY + 3600e3))}><${Icon} name="chevron-left" /></button>
        <input class="input" type="date" style="width:auto;min-height:34px" value=${day} onInput=${(e) => e.target.value && setDay(e.target.value)} aria-label="Day" />
        <button class="btn btn-sm btn-icon" aria-label="Next day" onClick=${() => setDay(U.dayKey(d0 + U.DAY + 3600e3))} disabled=${day >= U.dayKey()}><${Icon} name="chevron-right" /></button>
        ${['all', 'open', 'unpaid', 'paid', 'cancelled'].map((f) => html`<button key=${f} class=${'chip' + (filter === f ? ' on' : '')} onClick=${() => setFilter(f)}>${f[0].toUpperCase() + f.slice(1)}</button>`)}
        <input class="input" style="flex:1;min-width:150px;min-height:34px" placeholder="Search number, name or table" value=${q} onInput=${(e) => setQ(e.target.value)} />
      </div>
      <div class="panel"><div class="dt-wrap"><table class="dt">
        <thead><tr><th>#</th><th>Time</th><th>Table</th><th>Items</th><th class="r">Total</th><th>Status</th><th>Payment</th></tr></thead>
        <tbody>${list.map((o) => html`<tr class="click" key=${o.id} onClick=${() => setSheet({ type: 'order', id: o.id })}>
          <td class="num"><b>${o.number}</b></td><td class="num">${U.time(o.createdAt)}</td><td>${S.tableName(o.tableId)}</td>
          <td>${o.lines.map((l) => l.qty + '× ' + l.name).join(', ')}${o.guestName ? html`<div class="muted" style="font-size:13px">${o.guestName}</div>` : null}</td>
          <td class="r">${U.money(o.total)}</td><td><${StatusPill} o=${o} /></td><td><${PayPill} o=${o} /></td></tr>`)}
        </tbody></table>
        ${!list.length ? html`<p class="empty">No orders ${filter !== 'all' ? 'match this filter' : 'on this day'}.</p>` : null}</div></div>
      ${sheet && sheet.type === 'order' ? html`<${KT.views.OrderSheet} id=${sheet.id} onClose=${() => setSheet(null)} />` : null}
      ${sheet && sheet.type === 'pos' ? html`<${KT.views.PosSheet} onClose=${() => setSheet(null)} />` : null}
    </div>`;
  }

  /* ==================================================================
     Reports — daily and weekly
  ================================================================== */
  function Reports() {
    KT.useCols(['orders', 'feedback', 'items', 'categories']);
    const [weekStart, setWeekStart] = useState(U.startOfWeek(Date.now()));
    const end = weekStart + 7 * U.DAY - 1;
    const orders = S.ordersBetween(weekStart, end);
    const s = S.sales(orders);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d0 = weekStart + i * U.DAY;
      const list = orders.filter((o) => o.createdAt >= d0 && o.createdAt < d0 + U.DAY);
      days.push(Object.assign({ ts: d0, label: U.weekdayShort(d0 + 12 * 3600e3), date: U.dateShort(d0 + 12 * 3600e3), today: U.dayKey(d0) === U.dayKey() }, S.sales(list)));
    }
    const best = days.reduce((a, b) => (b.revenue > a.revenue ? b : a), days[0]);
    const top = S.topItems(orders, 10);
    const cats = S.list('categories');
    const allItems = S.topItems(orders, 999);
    const byCat = cats.map((c) => ({ label: c.name, value: U.sum(allItems.filter((x) => x.cat === c.id), (x) => x.revenue) })).filter((x) => x.value > 0);
    const paidOrders = orders.filter(S.isPaid);
    const methods = ['momo', 'cash', 'card'].map((m) => ({ label: KT.METHOD[m], value: U.sum(paidOrders.filter((o) => o.payment.method === m), (o) => o.total) })).filter((x) => x.value > 0);
    const hours = [];
    for (let h = 8; h <= 23; h++) hours.push({ label: String(h), value: orders.filter((o) => o.status !== 'cancelled' && U.hour(o.createdAt) === h).length });
    const fb = S.list('feedback').filter((f) => f.createdAt >= weekStart && f.createdAt <= end && f.rating);
    const avg = fb.length ? U.sum(fb, (f) => f.rating) / fb.length : 0;
    const thisWeek = weekStart === U.startOfWeek(Date.now());
    const title = U.dateShort(weekStart + 12 * 3600e3) + ' to ' + U.dateShort(end - 12 * 3600e3);
    function exportCsv() {
      const rows = [['K.Town weekly report', title], [], ['Day', 'Date', 'Orders', 'Ordered (RWF)', 'Received (RWF)', 'Not paid (RWF)', 'Cancelled']];
      days.forEach((d) => rows.push([d.label, U.dayKey(d.ts), d.orders, d.billed, d.revenue, d.unpaid, d.cancelled]));
      rows.push(['Total', '', s.orders, s.billed, s.revenue, s.unpaid, s.cancelled], [], ['Item', 'Sold', 'Revenue (RWF)']);
      S.topItems(orders, 999).forEach((x) => rows.push([x.name, x.qty, x.revenue]));
      rows.push([], ['Payment method', 'Received (RWF)']); methods.forEach((m) => rows.push([m.label, m.value]));
      U.download('ktown-week-' + U.dayKey(weekStart) + '.csv', '﻿' + U.csv(rows), 'text/csv;charset=utf-8');
    }
    return html`<div class="adm-page report">
      <div class="adm-head"><div><h1>Weekly report</h1><p>${title}${thisWeek ? ' (this week so far)' : ''}</p></div>
        <div class="actions no-print">
          <button class="btn btn-sm btn-icon" aria-label="Previous week" onClick=${() => setWeekStart(weekStart - 7 * U.DAY)}><${Icon} name="chevron-left" /></button>
          <button class="btn btn-sm" onClick=${() => setWeekStart(U.startOfWeek(Date.now()))} disabled=${thisWeek}>This week</button>
          <button class="btn btn-sm btn-icon" aria-label="Next week" onClick=${() => setWeekStart(weekStart + 7 * U.DAY)} disabled=${thisWeek}><${Icon} name="chevron-right" /></button>
          <button class="btn btn-sm" onClick=${exportCsv}><${Icon} name="file-down" />CSV</button>
          <button class="btn btn-sm" onClick=${() => window.print()}><${Icon} name="printer" />Print</button>
        </div></div>
      <div class="grid grid-3" style="margin-bottom:14px">
        <div class="panel"><div class="kpi" style="background:none;padding:0"><small>Money received</small><b style="font-size:26px">RWF ${U.money(s.revenue)}</b>
          <div class="sub">${s.unpaid ? 'RWF ' + U.money(s.unpaid) + ' still to collect' : 'Everything collected'}</div></div></div>
        <div class="panel"><div class="kpi" style="background:none;padding:0"><small>Orders</small><b style="font-size:26px">${s.orders}</b>
          <div class="sub">Average RWF ${U.money(s.avg)}, ${s.items} drinks and dishes</div></div></div>
        <div class="panel"><div class="kpi" style="background:none;padding:0"><small>Best day</small><b style="font-size:26px">${best && best.revenue ? best.label + ' ' + best.date : 'None yet'}</b>
          <div class="sub">${best && best.revenue ? 'RWF ' + U.money(best.revenue) : 'No sales this week yet'}${fb.length ? ', rating ' + avg.toFixed(1) + '/5' : ''}</div></div></div>
      </div>
      <div class="grid grid-2">
        <section class="panel span-2"><div class="panel-head"><h2>Money received per day</h2></div>
          <${Bars} data=${days.map((d) => ({ label: d.label, value: d.revenue, today: d.today }))} />
          <div class="dt-wrap" style="margin-top:14px"><table class="dt">
            <thead><tr><th>Day</th><th class="r">Orders</th><th class="r">Ordered</th><th class="r">Received</th><th class="r">Not paid</th></tr></thead>
            <tbody>${days.map((d) => html`<tr key=${d.ts}><td>${d.label} ${d.date}</td><td class="r">${d.orders}</td><td class="r">${U.money(d.billed)}</td><td class="r">${U.money(d.revenue)}</td><td class="r">${U.money(d.unpaid)}</td></tr>`)}</tbody>
            <tfoot><tr><td>Week</td><td class="r">${s.orders}</td><td class="r">${U.money(s.billed)}</td><td class="r">${U.money(s.revenue)}</td><td class="r">${U.money(s.unpaid)}</td></tr></tfoot>
          </table></div>
        </section>
        <section class="panel"><div class="panel-head"><h2>Best sellers</h2></div>
          ${top.length ? html`<div class="dt-wrap"><table class="dt"><thead><tr><th>Item</th><th class="r">Sold</th><th class="r">Revenue</th></tr></thead>
            <tbody>${top.map((x) => html`<tr key=${x.id}><td>${x.name}</td><td class="r">${x.qty}</td><td class="r">${U.money(x.revenue)}</td></tr>`)}</tbody></table></div>` : html`<p class="muted">No sales this week yet.</p>`}
        </section>
        <section class="panel"><div class="panel-head"><h2>Busiest hours</h2></div>
          <p class="muted" style="font-size:14px;margin-top:-6px">Orders by hour of the day.</p>
          <${Bars} data=${hours} fmt=${(v) => String(v)} height=${150} />
        </section>
        <section class="panel"><div class="panel-head"><h2>By menu section</h2></div>
          ${byCat.length ? html`<${HBars} rows=${byCat.map((c) => ({ label: c.label, value: c.value, text: 'RWF ' + U.money(c.value) }))} />` : html`<p class="muted">No sales yet.</p>`}
        </section>
        <section class="panel"><div class="panel-head"><h2>How guests paid</h2></div>
          ${methods.length ? html`<${HBars} rows=${methods.map((m) => ({ label: m.label, value: m.value, text: 'RWF ' + U.money(m.value) + ' (' + Math.round((m.value / Math.max(1, s.revenue)) * 100) + '%)' }))} />` : html`<p class="muted">No payments yet.</p>`}
        </section>
      </div>
    </div>`;
  }

  /* ==================================================================
     Menu editor
  ================================================================== */
  function MenuEditor() {
    KT.useCols(['items', 'categories']);
    const [sheet, setSheet] = useState(null);
    const cats = S.list('categories');
    const items = S.list('items');
    const move = async (col, list, i, dir) => {
      const j = i + dir; if (j < 0 || j >= list.length) return;
      await Promise.all([S.update(col, list[i].id, { sort: j + 1 }), S.update(col, list[j].id, { sort: i + 1 })].concat(list.map((x, k) => (k !== i && k !== j && x.sort !== k + 1 ? S.update(col, x.id, { sort: k + 1 }) : null)).filter(Boolean)));
    };
    return html`<div class="adm-page">
      <div class="adm-head"><div><h1>Menu</h1><p>${items.length} items in ${cats.length} sections. Changes show on guests’ phones straight away.</p></div>
        <div class="actions"><a class="btn btn-sm" href="./" target="_blank" rel="noopener"><${Icon} name="eye" />See guest menu</a>
          <a class="btn btn-sm" href="#/print/menu" target="_blank" rel="noopener"><${Icon} name="printer" />Printed menu</a>
          <button class="btn btn-sm btn-primary" onClick=${() => setSheet({ type: 'item', cat: cats[0] && cats[0].id })}><${Icon} name="plus" />Add item</button></div></div>
      ${cats.map((c, ci) => {
        const list = items.filter((i) => i.cat === c.id);
        return html`<section class="panel cat-block" key=${c.id}>
          <div class="row-between cat-head"><h2>${c.name}</h2>
            <div class="row" style="gap:4px">
              <button class="btn btn-ghost btn-icon btn-sm" aria-label=${'Move ' + c.name + ' up'} onClick=${() => move('categories', cats, ci, -1)} disabled=${ci === 0}><${Icon} name="arrow-up" /></button>
              <button class="btn btn-ghost btn-icon btn-sm" aria-label=${'Move ' + c.name + ' down'} onClick=${() => move('categories', cats, ci, 1)} disabled=${ci === cats.length - 1}><${Icon} name="arrow-down" /></button>
              <button class="btn btn-sm" onClick=${() => setSheet({ type: 'cat', id: c.id })}><${Icon} name="pencil" />Section</button>
              <button class="btn btn-sm" onClick=${() => setSheet({ type: 'item', cat: c.id })}><${Icon} name="plus" />Item</button>
            </div></div>
          <div class="list">${list.map((it, ii) => html`<div class=${'li mrow' + (it.available === false ? ' off' : '')} key=${it.id}>
            ${it.image ? html`<img class="thumb" src=${U.thumb(it.image)} alt="" loading="lazy" />` : html`<span class="thumb ph"><${Icon} name="image" /></span>`}
            <button class="grow" style="background:none;border:0;text-align:left;padding:0" onClick=${() => setSheet({ type: 'item', id: it.id })}>
              <div class="t">${it.name}${it.tag ? html` <span class="tag">${{ new: 'New', popular: 'Popular', house: 'House special' }[it.tag]}</span>` : null}</div>
              <div class="s">${it.available === false ? 'Sold out, hidden from ordering' : it.desc || 'No description'}</div></button>
            <span class="price">${U.money(it.price)}</span>
            <div class="row mrow-sort" style="gap:2px">
              <button class="btn btn-ghost btn-icon btn-sm" aria-label=${'Move ' + it.name + ' up'} onClick=${() => move('items', list, ii, -1)} disabled=${ii === 0}><${Icon} name="arrow-up" /></button>
              <button class="btn btn-ghost btn-icon btn-sm" aria-label=${'Move ' + it.name + ' down'} onClick=${() => move('items', list, ii, 1)} disabled=${ii === list.length - 1}><${Icon} name="arrow-down" /></button>
            </div>
            <${Switch} checked=${it.available !== false} label=${it.name + ' available'} onChange=${(v) => S.update('items', it.id, { available: v }).catch(KT.toastError)} />
          </div>`)}
          ${!list.length ? html`<p class="muted" style="padding:10px 0">No items yet in this section.</p>` : null}</div>
        </section>`;
      })}
      <button class="btn" onClick=${() => setSheet({ type: 'cat' })}><${Icon} name="plus" />Add a menu section</button>
      ${sheet && sheet.type === 'item' ? html`<${ItemEditor} id=${sheet.id} cat=${sheet.cat} onClose=${() => setSheet(null)} />` : null}
      ${sheet && sheet.type === 'cat' ? html`<${CatEditor} id=${sheet.id} onClose=${() => setSheet(null)} />` : null}
    </div>`;
  }

  function PhotoPicker({ value, onChange, list }) {
    const [gallery, setGallery] = useState(false);
    const fileRef = useRef();
    async function onFile(e) {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try { onChange(await U.compressImage(f, 720, 0.7)); KT.toast('Photo added', 'ok'); } catch (x) { KT.toastError(x); }
      e.target.value = '';
    }
    return html`<div>
      <div class="img-pick">
        ${value ? html`<img src=${value} alt="" />` : html`<span class="ph"><${Icon} name="image" cls="ic-lg" /></span>`}
        <div class="row" style="flex-wrap:wrap;gap:6px">
          <button type="button" class="btn btn-sm" onClick=${() => fileRef.current.click()}><${Icon} name="image" />Upload photo</button>
          <button type="button" class="btn btn-sm" onClick=${() => setGallery(!gallery)}>Choose from K.Town photos</button>
          ${value ? html`<button type="button" class="btn btn-sm btn-ghost btn-danger" onClick=${() => onChange('')}>Remove</button>` : null}
          <input type="file" accept="image/*" ref=${fileRef} onChange=${onFile} hidden />
        </div>
      </div>
      ${gallery ? html`<div class="gallery">${(list || KT.GALLERY.photos).map((src) => html`<button type="button" key=${src} aria-pressed=${value === src ? 'true' : 'false'} onClick=${() => { onChange(src); setGallery(false); }}><img src=${src} alt="" loading="lazy" /></button>`)}</div>` : null}
    </div>`;
  }

  function ItemEditor({ id, cat, onClose }) {
    const cur = id ? S.item(id) : null;
    const cats = S.list('categories');
    const [f, setF] = useState(() => Object.assign({ name: '', price: '', cat: cat || (cats[0] && cats[0].id) || '', desc: '', tag: '', image: '', available: true, name_fr: '', desc_fr: '', name_rw: '', desc_rw: '' }, cur || {}));
    const [tr, setTr] = useState(false);
    const [busy, setBusy] = useState(false);
    const set = (k) => (e) => setF(Object.assign({}, f, { [k]: e && e.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
    async function save() {
      const price = Math.round(Number(String(f.price).replace(/[^\d.]/g, '')));
      if (!f.name.trim()) { KT.toast('Give the item a name', 'bad'); return; }
      if (!price || price < 0) { KT.toast('Enter a price in RWF, for example 4000', 'bad'); return; }
      setBusy(true);
      const data = { name: f.name.trim(), price, cat: f.cat, desc: f.desc.trim(), tag: f.tag || '', image: f.image || '', available: f.available !== false,
        name_fr: (f.name_fr || '').trim(), desc_fr: (f.desc_fr || '').trim(), name_rw: (f.name_rw || '').trim(), desc_rw: (f.desc_rw || '').trim() };
      try {
        if (cur) await S.update('items', cur.id, data);
        else {
          const siblings = S.list('items').filter((i) => i.cat === f.cat);
          let nid = U.slug(data.name) || U.uid(8); if (S.item(nid)) nid += '-' + U.uid(4);
          await S.set('items', nid, Object.assign(data, { sort: siblings.length + 1, createdAt: Date.now() }));
        }
        KT.toast(cur ? 'Saved. Guests see the change now.' : data.name + ' added to the menu', 'ok');
        onClose();
      } catch (e) { KT.toastError(e); } finally { setBusy(false); }
    }
    async function del() {
      if (await KT.confirm({ title: 'Delete ' + cur.name + '?', body: 'It disappears from the menu. Past orders keep their record. To hide it for today only, switch it to sold out instead.', ok: 'Delete', danger: true })) {
        S.remove('items', cur.id).then(() => { KT.toast('Deleted'); onClose(); }, KT.toastError);
      }
    }
    return html`<${Sheet} title=${cur ? 'Edit ' + cur.name : 'New menu item'} onClose=${onClose} wide=${true}
      foot=${html`<div class="row">${cur ? html`<button class="btn btn-ghost btn-danger" onClick=${del}><${Icon} name="trash-2" />Delete</button>` : null}
        <span style="flex:1"></span><button class="btn" onClick=${onClose}>Cancel</button><button class="btn btn-primary" onClick=${save} disabled=${busy}>${cur ? 'Save changes' : 'Add to menu'}</button></div>`}>
      <div class="form">
        <div class="form-row">
          <label class="field"><span>Name</span><input class="input" value=${f.name} onInput=${set('name')} placeholder="House red wine (glass)" data-autofocus /></label>
          <label class="field"><span>Price (RWF)</span><input class="input" inputmode="numeric" value=${f.price} onInput=${set('price')} placeholder="5000" /></label>
        </div>
        <div class="form-row">
          <label class="field"><span>Menu section</span><select class="select" value=${f.cat} onChange=${set('cat')}>${cats.map((c) => html`<option key=${c.id} value=${c.id}>${c.name}</option>`)}</select></label>
          <label class="field"><span>Label</span><select class="select" value=${f.tag || ''} onChange=${set('tag')}>
            <option value="">None</option><option value="new">New</option><option value="popular">Popular</option><option value="house">House special</option></select></label>
        </div>
        <label class="field"><span>Description</span><textarea class="textarea" value=${f.desc} onInput=${set('desc')} placeholder="One short line: what it is and why it's good." maxlength="200"></textarea></label>
        <div class="field"><span>Photo</span><${PhotoPicker} value=${f.image} onChange=${(v) => setF(Object.assign({}, f, { image: v }))} /></div>
        <div class="set-row"><div class="grow"><div class="t">Available to order</div><div class="s">Switch off when it runs out. Guests see “Sold out”.</div></div>
          <${Switch} checked=${f.available !== false} onChange=${(v) => setF(Object.assign({}, f, { available: v }))} label="Available" /></div>
        <button type="button" class="btn btn-sm" onClick=${() => setTr(!tr)}><${Icon} name="globe" />${tr ? 'Hide' : 'Add'} French and Kinyarwanda</button>
        ${tr ? html`<div class="form-row">
          <label class="field"><span>Name in French</span><input class="input" value=${f.name_fr} onInput=${set('name_fr')} /></label>
          <label class="field"><span>Name in Kinyarwanda</span><input class="input" value=${f.name_rw} onInput=${set('name_rw')} /></label></div>
          <div class="form-row">
          <label class="field"><span>Description in French</span><input class="input" value=${f.desc_fr} onInput=${set('desc_fr')} /></label>
          <label class="field"><span>Description in Kinyarwanda</span><input class="input" value=${f.desc_rw} onInput=${set('desc_rw')} /></label></div>
          <p class="hint">Empty fields show the English text.</p>` : null}
      </div>
    </${Sheet}>`;
  }

  function CatEditor({ id, onClose }) {
    const cur = id ? S.get('categories', id) : null;
    const [f, setF] = useState(() => Object.assign({ name: '', desc: '', image: '', name_fr: '', name_rw: '', desc_fr: '', desc_rw: '' }, cur || {}));
    const set = (k) => (e) => setF(Object.assign({}, f, { [k]: e.target.value }));
    const count = cur ? S.list('items').filter((i) => i.cat === cur.id).length : 0;
    async function save() {
      if (!f.name.trim()) { KT.toast('Give the section a name, for example Wines', 'bad'); return; }
      const data = { name: f.name.trim(), desc: (f.desc || '').trim(), image: f.image || '', name_fr: (f.name_fr || '').trim(), name_rw: (f.name_rw || '').trim(), desc_fr: (f.desc_fr || '').trim(), desc_rw: (f.desc_rw || '').trim() };
      try {
        if (cur) await S.update('categories', cur.id, data);
        else { let nid = U.slug(data.name) || U.uid(8); if (S.get('categories', nid)) nid += '-' + U.uid(4); await S.set('categories', nid, Object.assign(data, { sort: S.list('categories').length + 1, active: true, createdAt: Date.now() })); }
        KT.toast('Saved', 'ok'); onClose();
      } catch (e) { KT.toastError(e); }
    }
    async function del() {
      if (count) { KT.toast('Move or delete the ' + count + ' items in this section first', 'bad'); return; }
      if (await KT.confirm({ title: 'Delete the section ' + cur.name + '?', ok: 'Delete', danger: true })) S.remove('categories', cur.id).then(onClose, KT.toastError);
    }
    return html`<${Sheet} title=${cur ? 'Edit section' : 'New menu section'} onClose=${onClose} wide=${true}
      foot=${html`<div class="row">${cur ? html`<button class="btn btn-ghost btn-danger" onClick=${del}><${Icon} name="trash-2" />Delete</button>` : null}<span style="flex:1"></span>
        <button class="btn" onClick=${onClose}>Cancel</button><button class="btn btn-primary" onClick=${save}>Save</button></div>`}>
      <div class="form">
        <label class="field"><span>Section name</span><input class="input" value=${f.name} onInput=${set('name')} placeholder="Wines, Beers, Breakfast…" data-autofocus /></label>
        <label class="field"><span>One line under the title (optional)</span><input class="input" value=${f.desc} onInput=${set('desc')} /></label>
        <div class="form-row">
          <label class="field"><span>Name in French</span><input class="input" value=${f.name_fr} onInput=${set('name_fr')} /></label>
          <label class="field"><span>Name in Kinyarwanda</span><input class="input" value=${f.name_rw} onInput=${set('name_rw')} /></label></div>
        <div class="field"><span>Banner photo (optional)</span><${PhotoPicker} value=${f.image} onChange=${(v) => setF(Object.assign({}, f, { image: v }))} /></div>
      </div>
    </${Sheet}>`;
  }

  /* ==================================================================
     Tables & QR codes
  ================================================================== */
  function Tables() {
    KT.useCols(['tables', 'settings']);
    const st = S.settings;
    const tables = S.list('tables');
    const [url, setUrl] = useState(st.publicUrl || '');
    const [edit, setEdit] = useState(null);
    const base = U.publicBase(st);
    const local = U.isLocalAddress(base);
    async function add() {
      const n = tables.length + 1;
      let id = 'T' + n; while (S.table(id)) id = 'T' + (parseInt(id.slice(1), 10) + 1);
      await S.set('tables', id, { name: 'Table ' + id.slice(1), seats: 4, sort: n, active: true, createdAt: Date.now() }).catch(KT.toastError);
      KT.toast('Table added. Print its QR card below.', 'ok');
    }
    async function download(t) {
      const svg = KT.qr.svg(U.menuUrl(st, t && t.id), { title: 'K.Town menu' + (t ? ', ' + t.name : '') });
      try { const png = await KT.qr.png(svg, 1200); const a = document.createElement('a'); a.href = png; a.download = 'ktown-qr-' + (t ? U.slug(t.name) : 'menu') + '.png'; a.click(); } catch (e) { KT.toastError(e); }
    }
    return html`<div class="adm-page">
      <div class="adm-head"><div><h1>Tables & QR codes</h1><p>Each table has its own QR code, so orders arrive with the table already known.</p></div>
        <div class="actions"><a class="btn btn-sm" href="#/print/tables" target="_blank" rel="noopener"><${Icon} name="printer" />Print table cards</a>
          <a class="btn btn-sm" href="#/print/poster" target="_blank" rel="noopener"><${Icon} name="printer" />Print poster</a>
          <button class="btn btn-sm btn-primary" onClick=${add}><${Icon} name="plus" />Add table</button></div></div>
      <section class="panel" style="margin-bottom:14px">
        <div class="panel-head"><h2>Web address in the QR codes</h2></div>
        ${local ? html`<p class="notice" style="margin-bottom:12px"><${Icon} name="circle-alert" /><span>This copy is running from <b>${location.protocol === 'file:' ? 'a file on this computer' : 'this computer'}</b>, so phones can’t open these QR codes yet. Put the system online (docs/GO-LIVE.html), then type its address here and print the cards.</span></p>` : null}
        <div class="row" style="flex-wrap:wrap">
          <input class="input" style="flex:1;min-width:220px" value=${url} onInput=${(e) => setUrl(e.target.value)} placeholder="https://ktown-karongi.netlify.app" aria-label="Public web address" />
          <button class="btn btn-primary" onClick=${() => S.saveSettings({ publicUrl: url.trim() }).then(() => KT.toast('Saved. QR codes updated.', 'ok'), KT.toastError)}>Save address</button>
        </div>
        <p class="url-box" style="margin-top:10px">Table 1 opens: ${U.menuUrl(st, tables[0] && tables[0].id)}</p>
      </section>
      <div class="tables-grid">
        ${tables.map((t) => html`<div class=${'table-card' + (t.active === false ? ' off' : '')} key=${t.id}>
          <div class="row-between"><span class="name">${t.name}</span><${Switch} checked=${t.active !== false} label=${t.name + ' in use'} onChange=${(v) => S.update('tables', t.id, { active: v }).catch(KT.toastError)} /></div>
          <div class="qr-box"><${Raw} svg=${KT.qr.svg(U.menuUrl(st, t.id), { margin: 2, title: 'QR code for ' + t.name })} /></div>
          <div class="muted" style="font-size:13.5px">${t.seats || 4} seats, code ${t.id}</div>
          <div class="row" style="gap:6px;flex-wrap:wrap">
            <button class="btn btn-sm" onClick=${() => setEdit(t)}><${Icon} name="pencil" />Rename</button>
            <button class="btn btn-sm" onClick=${() => download(t)}><${Icon} name="download" />PNG</button>
            <a class="btn btn-sm" href=${'#/print/tables?only=' + encodeURIComponent(t.id)} target="_blank" rel="noopener"><${Icon} name="printer" />Card</a>
          </div>
        </div>`)}
        <div class="table-card">
          <span class="name">Menu without a table</span>
          <div class="qr-box"><${Raw} svg=${KT.qr.svg(U.menuUrl(st, ''), { margin: 2, title: 'QR code for the menu' })} /></div>
          <div class="muted" style="font-size:13.5px">For the entrance, the counter or social media. Guests choose their table.</div>
          <div class="row" style="gap:6px"><button class="btn btn-sm" onClick=${() => download(null)}><${Icon} name="download" />PNG</button></div>
        </div>
      </div>
      ${edit ? html`<${TableEditor} t=${edit} onClose=${() => setEdit(null)} />` : null}
    </div>`;
  }
  function TableEditor({ t, onClose }) {
    const [name, setName] = useState(t.name);
    const [seats, setSeats] = useState(t.seats || 4);
    async function del() {
      if (await KT.confirm({ title: 'Remove ' + t.name + '?', body: 'Its QR code stops choosing a table (guests can still order and pick another table). Past orders keep their record.', ok: 'Remove table', danger: true })) S.remove('tables', t.id).then(() => { KT.toast(t.name + ' removed'); onClose(); }, KT.toastError);
    }
    return html`<${Sheet} title=${'Edit ' + t.name} onClose=${onClose}
      foot=${html`<div class="row"><button class="btn btn-ghost btn-danger" onClick=${del}><${Icon} name="trash-2" />Remove</button><span style="flex:1"></span>
        <button class="btn btn-primary" onClick=${() => { if (!name.trim()) return; S.update('tables', t.id, { name: name.trim(), seats }).then(() => { KT.toast('Saved', 'ok'); onClose(); }, KT.toastError); }}>Save</button></div>`}>
      <div class="form">
        <label class="field"><span>Name guests and staff see</span><input class="input" value=${name} onInput=${(e) => setName(e.target.value)} placeholder="Terrace 1, Lake view, Rooftop…" data-autofocus /></label>
        <div class="field"><span>Seats</span><${Stepper} value=${seats} onChange=${setSeats} min=${1} max=${30} /></div>
        <p class="hint">Renaming keeps the same QR code, so printed cards keep working.</p>
      </div>
    </${Sheet}>`;
  }

  /* ==================================================================
     Events & promotions
  ================================================================== */
  const EV_TYPES = { event: 'Event', promo: 'Offer / promotion', new: 'New on the menu', news: 'News' };
  function Events({ go }) {
    KT.useCols(['events']);
    const [edit, setEdit] = useState(null);
    const list = S.list('events');
    return html`<div class="adm-page">
      <div class="adm-head"><div><h1>Events & offers</h1><p>Headlines shown at the top of the guest menu: events, promotions, new dishes, news.</p></div>
        <div class="actions"><button class="btn btn-sm btn-primary" onClick=${() => setEdit({})}><${Icon} name="plus" />Add headline</button></div></div>
      <div class="panel"><div class="list">
        ${list.map((e) => html`<div class=${'li' + (e.active === false ? ' off' : '')} key=${e.id}>
          ${e.image ? html`<img class="thumb" src=${e.image} alt="" />` : html`<span class="thumb ph"><${Icon} name="megaphone" /></span>`}
          <button class="grow" style="background:none;border:0;text-align:left;padding:0" onClick=${() => setEdit(e)}>
            <div class="t">${e.title}</div><div class="s">${EV_TYPES[e.type] || 'News'}${e.date ? ', ' + U.date(U.dayFromKey(e.date) + 12 * 3600e3) + (e.time ? ' ' + e.time : '') : ''}${e.active === false ? ', hidden' : ''}</div></button>
          <${Switch} checked=${e.active !== false} label=${'Show ' + e.title} onChange=${(v) => S.update('events', e.id, { active: v }).catch(KT.toastError)} />
        </div>`)}
        ${!list.length ? html`<p class="empty">No headlines yet. Add your next event, a happy hour or a new drink.</p>` : null}
      </div></div>
      ${edit ? html`<${EventEditor} ev=${edit} onClose=${() => setEdit(null)} onMessage=${() => { setEdit(null); go('guests'); }} />` : null}
    </div>`;
  }
  function EventEditor({ ev, onClose, onMessage }) {
    const cur = ev && ev.id ? ev : null;
    const [f, setF] = useState(() => Object.assign({ type: 'event', title: '', body: '', date: '', time: '', image: '', active: true, title_fr: '', body_fr: '', title_rw: '', body_rw: '' }, cur || {}));
    const [tr, setTr] = useState(false);
    const set = (k) => (e) => setF(Object.assign({}, f, { [k]: e.target.value }));
    async function save() {
      if (!f.title.trim()) { KT.toast('Write a headline', 'bad'); return; }
      const data = { type: f.type, title: f.title.trim(), body: (f.body || '').trim(), date: f.date || '', time: f.time || '', image: f.image || '', active: f.active !== false,
        title_fr: (f.title_fr || '').trim(), body_fr: (f.body_fr || '').trim(), title_rw: (f.title_rw || '').trim(), body_rw: (f.body_rw || '').trim() };
      try {
        if (cur) await S.update('events', cur.id, data); else await S.add('events', Object.assign(data, { sort: S.list('events').length + 1 }));
        KT.toast('Saved. Guests see it at the top of the menu.', 'ok'); onClose();
      } catch (e) { KT.toastError(e); }
    }
    async function del() { if (await KT.confirm({ title: 'Delete this headline?', ok: 'Delete', danger: true })) S.remove('events', cur.id).then(onClose, KT.toastError); }
    return html`<${Sheet} title=${cur ? 'Edit headline' : 'New headline'} onClose=${onClose} wide=${true}
      foot=${html`<div class="row" style="flex-wrap:wrap">${cur ? html`<button class="btn btn-ghost btn-danger" onClick=${del}><${Icon} name="trash-2" />Delete</button>` : null}
        ${cur ? html`<button class="btn" onClick=${() => { U.ss.set('kt1:msgEvent', cur.id); onMessage(); }}><${Icon} name="send" />Tell guests</button>` : null}
        <span style="flex:1"></span><button class="btn" onClick=${onClose}>Cancel</button><button class="btn btn-primary" onClick=${save}>Save</button></div>`}>
      <div class="form">
        <div class="field"><span>Type</span><div class="row" style="flex-wrap:wrap;gap:6px">${Object.keys(EV_TYPES).map((k) => html`<button type="button" key=${k} class=${'chip' + (f.type === k ? ' on' : '')} onClick=${() => setF(Object.assign({}, f, { type: k }))}>${EV_TYPES[k]}</button>`)}</div></div>
        <label class="field"><span>Headline</span><input class="input" value=${f.title} onInput=${set('title')} placeholder="Live music on the terrace" maxlength="80" data-autofocus /></label>
        <label class="field"><span>Details</span><textarea class="textarea" value=${f.body} onInput=${set('body')} placeholder="Friday from 7 pm. Free entry, cocktails at happy-hour prices." maxlength="240"></textarea></label>
        <div class="form-row">
          <label class="field"><span>Date (optional)</span><input class="input" type="date" value=${f.date} onInput=${set('date')} /></label>
          <label class="field"><span>Time (optional)</span><input class="input" type="time" value=${f.time} onInput=${set('time')} /></label>
        </div>
        <p class="hint">With a date, the headline disappears by itself after the day has passed.</p>
        <div class="field"><span>Picture (optional)</span><${PhotoPicker} value=${f.image} onChange=${(v) => setF(Object.assign({}, f, { image: v }))} /></div>
        <div class="set-row"><div class="grow"><div class="t">Show on the menu</div></div><${Switch} checked=${f.active !== false} onChange=${(v) => setF(Object.assign({}, f, { active: v }))} label="Show on the menu" /></div>
        <button type="button" class="btn btn-sm" onClick=${() => setTr(!tr)}><${Icon} name="globe" />${tr ? 'Hide' : 'Add'} French and Kinyarwanda</button>
        ${tr ? html`<div class="form-row"><label class="field"><span>Headline in French</span><input class="input" value=${f.title_fr} onInput=${set('title_fr')} /></label>
          <label class="field"><span>Headline in Kinyarwanda</span><input class="input" value=${f.title_rw} onInput=${set('title_rw')} /></label></div>
          <div class="form-row"><label class="field"><span>Details in French</span><input class="input" value=${f.body_fr} onInput=${set('body_fr')} /></label>
          <label class="field"><span>Details in Kinyarwanda</span><input class="input" value=${f.body_rw} onInput=${set('body_rw')} /></label></div>` : null}
      </div>
    </${Sheet}>`;
  }

  /* ==================================================================
     Bookings
  ================================================================== */
  function Bookings() {
    KT.useCols(['reservations']);
    const [open, setOpen] = useState(false);
    const day0 = U.startOfDay();
    const upcoming = S.list('reservations').filter((r) => U.dayFromKey(r.date) >= day0);
    const past = S.list('reservations').filter((r) => U.dayFromKey(r.date) < day0).slice(0, 30);
    return html`<div class="adm-page">
      <div class="adm-head"><div><h1>Bookings</h1><p>${upcoming.length} upcoming. Guests book from the menu; reception confirms.</p></div>
        <div class="actions"><button class="btn btn-sm btn-primary" onClick=${() => setOpen(true)}><${Icon} name="calendar-days" />Manage upcoming</button></div></div>
      <div class="panel"><div class="panel-head"><h2>Upcoming</h2></div><div class="list">
        ${upcoming.sort(U.by((r) => r.date + r.time)).map((r) => html`<div class="li" key=${r.id}><div class="grow"><div class="t">${U.date(U.dayFromKey(r.date) + 12 * 3600e3)}, ${r.time}: ${r.name}, ${r.guests} guests</div>
          <div class="s">${U.prettyPhone(r.phone)}${r.tableId ? ', ' + S.tableName(r.tableId) : ''}${r.note ? ', “' + r.note + '”' : ''}</div></div>
          <span class="pill" data-s=${r.status === 'confirmed' ? 'ready' : r.status === 'declined' ? 'cancelled' : r.status === 'seated' ? 'served' : 'new'}>${{ pending: 'Waiting', confirmed: 'Confirmed', declined: 'Declined', seated: 'Seated' }[r.status]}</span></div>`)}
        ${!upcoming.length ? html`<p class="empty">No upcoming bookings.</p>` : null}</div></div>
      ${past.length ? html`<div class="panel" style="margin-top:14px"><div class="panel-head"><h2>Past</h2></div><div class="list">${past.map((r) => html`<div class="li" key=${r.id}><div class="grow"><div class="t">${U.date(U.dayFromKey(r.date) + 12 * 3600e3)}, ${r.time}: ${r.name}</div><div class="s">${r.guests} guests, ${r.status}</div></div></div>`)}</div></div>` : null}
      ${open ? html`<${KT.views.BookingsSheet} onClose=${() => setOpen(false)} />` : null}
    </div>`;
  }

  /* ==================================================================
     Feedback
  ================================================================== */
  function Feedback() {
    KT.useCols(['feedback']);
    const [filter, setFilter] = useState('all');
    const [add, setAdd] = useState(false);
    const all = S.list('feedback');
    const list = all.filter((f) => filter === 'all' || (filter === 'low' ? f.rating && f.rating <= 3 : f.source === filter));
    const rated = all.filter((f) => f.rating);
    const avg = rated.length ? U.sum(rated, (f) => f.rating) / rated.length : 0;
    const dist = [5, 4, 3, 2, 1].map((n) => ({ label: n + ' glass' + (n > 1 ? 'es' : ''), value: rated.filter((f) => f.rating === n).length }));
    return html`<div class="adm-page">
      <div class="adm-head"><div><h1>Feedback</h1><p>Straight from guests’ phones, plus paper cards typed in by staff.</p></div>
        <div class="actions"><a class="btn btn-sm" href="#/print/feedback" target="_blank" rel="noopener"><${Icon} name="printer" />Print paper cards</a>
          <button class="btn btn-sm btn-primary" onClick=${() => setAdd(true)}><${Icon} name="plus" />Add a paper card</button></div></div>
      <div class="grid grid-2" style="margin-bottom:14px">
        <div class="panel"><small class="muted">Average rating</small><div style="font-size:40px;font-weight:500;color:var(--ink);line-height:1.1">${rated.length ? avg.toFixed(1) : '–'}<span class="muted" style="font-size:16px"> / 5</span></div>
          <p class="muted" style="font-size:14px">${rated.length} rating${rated.length === 1 ? '' : 's'} in total</p></div>
        <div class="panel"><${HBars} rows=${dist.map((d) => ({ label: d.label, value: d.value, text: String(d.value) }))} /></div>
      </div>
      <div class="row" style="gap:6px;margin-bottom:10px;flex-wrap:wrap">${[['all', 'All'], ['low', '3 or less'], ['digital', 'From phones'], ['paper', 'Paper cards']].map(([k, l]) => html`<button key=${k} class=${'chip' + (filter === k ? ' on' : '')} onClick=${() => setFilter(k)}>${l}</button>`)}</div>
      <div class="panel">${list.map((f) => html`<${FbRow} f=${f} key=${f.id} />`)}${!list.length ? html`<p class="empty">No feedback here yet.</p>` : null}</div>
      ${add ? html`<${PaperFeedback} onClose=${() => setAdd(false)} />` : null}
    </div>`;
  }
  function PaperFeedback({ onClose }) {
    const [rating, setRating] = useState(5);
    const [comment, setComment] = useState('');
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [optIn, setOptIn] = useState(false);
    const [day, setDay] = useState(U.dayKey());
    async function save() {
      if (phone && !U.isPhone(phone)) { KT.toast('Check the phone number', 'bad'); return; }
      const createdAt = day === U.dayKey() ? Date.now() : U.dayFromKey(day) + 12 * 3600e3;
      try { await S.addFeedback({ rating, comment: comment.trim(), name: name.trim(), phone, optIn, source: 'paper', createdAt }); KT.toast('Paper feedback saved', 'ok'); onClose(); } catch (e) { KT.toastError(e); }
    }
    return html`<${Sheet} title="Paper feedback card" onClose=${onClose}
      foot=${html`<div class="row"><span style="flex:1"></span><button class="btn" onClick=${onClose}>Cancel</button><button class="btn btn-primary" onClick=${save}>Save</button></div>`}>
      <div class="form">
        <div class="field"><span>Rating</span><div class="row" style="gap:6px">${[1, 2, 3, 4, 5].map((n) => html`<button type="button" key=${n} class=${'chip' + (rating === n ? ' on' : '')} onClick=${() => setRating(n)}>${n}</button>`)}</div></div>
        <label class="field"><span>Comment</span><textarea class="textarea" value=${comment} onInput=${(e) => setComment(e.target.value)}></textarea></label>
        <div class="form-row"><label class="field"><span>Name</span><input class="input" value=${name} onInput=${(e) => setName(e.target.value)} /></label>
          <label class="field"><span>Phone</span><input class="input" type="tel" value=${phone} onInput=${(e) => setPhone(e.target.value)} /></label></div>
        <label class="field"><span>Date on the card</span><input class="input" type="date" value=${day} max=${U.dayKey()} onInput=${(e) => e.target.value && setDay(e.target.value)} /></label>
        <label class="check"><input type="checkbox" checked=${optIn} onChange=${(e) => setOptIn(e.target.checked)} />The guest ticked “tell me about events”</label>
      </div>
    </${Sheet}>`;
  }

  /* ==================================================================
     Guests (contacts who agreed to hear about events)
  ================================================================== */
  function Guests() {
    KT.useCols(['contacts', 'events']);
    const [q, setQ] = useState('');
    const [compose, setCompose] = useState(() => !!U.ss.get('kt1:msgEvent', null));
    const list = S.contactsList().filter((c) => !q || [c.name, c.phone, c.email].join(' ').toLowerCase().includes(q.toLowerCase()));
    function exportCsv() {
      const rows = [['Name', 'Phone', 'Email', 'From', 'First seen', 'Times']];
      S.contactsList().forEach((c) => rows.push([c.name, c.phone, c.email, c.source, U.dayKey(c.first || c.createdAt), c.visits]));
      U.download('ktown-guests.csv', '﻿' + U.csv(rows), 'text/csv;charset=utf-8');
    }
    return html`<div class="adm-page">
      <div class="adm-head"><div><h1>Guests</h1><p>${list.length} guest${list.length === 1 ? '' : 's'} agreed to hear about K.Town events and offers.</p></div>
        <div class="actions"><button class="btn btn-sm" onClick=${exportCsv}><${Icon} name="file-down" />Export CSV</button>
          <button class="btn btn-sm btn-primary" onClick=${() => setCompose(true)} disabled=${!list.length}><${Icon} name="send" />Message guests</button></div></div>
      <input class="input" style="margin-bottom:12px" placeholder="Search name, phone or email" value=${q} onInput=${(e) => setQ(e.target.value)} />
      <div class="panel"><div class="list">
        ${list.map((c) => html`<div class="li" key=${c.phone || c.email || c.id}><${Icon} name="circle-user" />
          <div class="grow"><div class="t">${c.name || 'No name'}</div><div class="s">${[c.phone ? U.prettyPhone(c.phone) : '', c.email, 'since ' + U.dateShort(c.first || c.createdAt)].filter(Boolean).join(', ')}</div></div>
          ${c.phone ? html`<a class="btn btn-sm btn-icon" href=${U.waLink(c.phone)} target="_blank" rel="noopener" aria-label=${'WhatsApp ' + (c.name || c.phone)}><${Icon} name="message-circle" /></a>` : null}
        </div>`)}
        ${!list.length ? html`<p class="empty">When guests tick “send me news” while ordering, booking or giving feedback, they appear here.</p>` : null}
      </div></div>
      <p class="muted" style="font-size:13px;margin-top:10px">Only guests who said yes are listed. Message them only about K.Town news, and remove anyone who asks.</p>
      ${compose ? html`<${Compose} onClose=${() => { setCompose(false); U.ss.set('kt1:msgEvent', null); }} />` : null}
    </div>`;
  }
  function Compose({ onClose }) {
    const st = S.settings;
    const events = S.list('events').filter((e) => e.active !== false);
    const [evId, setEvId] = useState(U.ss.get('kt1:msgEvent', null) || (events[0] && events[0].id) || '');
    const ev = S.get('events', evId);
    const tpl = (e) => (e ? 'Hello {name}! ' + st.name + ': ' + e.title + (e.date ? ', ' + U.date(U.dayFromKey(e.date) + 12 * 3600e3) + (e.time ? ' ' + e.time : '') : '') + '. ' + (e.body || '') + ' See you in Karongi!' : 'Hello {name}! News from ' + st.name + ', Karongi: ');
    const [text, setText] = useState(tpl(ev));
    const [done, setDone] = useState({});
    const people = S.contactsList().filter((c) => c.phone);
    const forP = (c) => text.split('{name}').join((c.name || '').split(' ')[0] || 'there').replace('Hello there!', 'Hello!');
    return html`<${Sheet} title="Message guests" onClose=${onClose} wide=${true}>
      <div class="form">
        ${events.length ? html`<label class="field"><span>About</span><select class="select" value=${evId} onChange=${(e) => { setEvId(e.target.value); setText(tpl(S.get('events', e.target.value))); }}>
          <option value="">General message</option>${events.map((e) => html`<option key=${e.id} value=${e.id}>${e.title}</option>`)}</select></label>` : null}
        <label class="field"><span>Message ({name} becomes each guest’s first name)</span><textarea class="textarea" style="min-height:110px" value=${text} onInput=${(e) => setText(e.target.value)}></textarea></label>
        <div class="row" style="flex-wrap:wrap"><button class="btn btn-sm" onClick=${() => U.copy(people.map((c) => c.phone).join(', ')).then(() => KT.toast('Numbers copied. Paste them into a WhatsApp broadcast list.', 'ok'))}><${Icon} name="copy" />Copy all ${people.length} numbers</button>
          <button class="btn btn-sm" onClick=${() => U.copy(text.split('{name}').join('')).then(() => KT.toast('Message copied', 'ok'))}><${Icon} name="copy" />Copy message</button></div>
        <p class="hint">Tap WhatsApp or SMS for each guest; the message opens ready to send from your phone.</p>
        <div class="list">${people.map((c) => html`<div class="li" key=${c.phone}><div class="grow"><div class="t">${c.name || U.prettyPhone(c.phone)}</div><div class="s">${U.prettyPhone(c.phone)}</div></div>
          ${done[c.phone] ? html`<span class="pill" data-s="ready">Opened</span>` : null}
          <a class="btn btn-sm" href=${U.waLink(c.phone, forP(c))} target="_blank" rel="noopener" onClick=${() => setDone(Object.assign({}, done, { [c.phone]: 1 }))}><${Icon} name="message-circle" />WhatsApp</a>
          <a class="btn btn-sm" href=${U.smsLink(c.phone, forP(c))} onClick=${() => setDone(Object.assign({}, done, { [c.phone]: 1 }))}>SMS</a></div>`)}</div>
      </div>
    </${Sheet}>`;
  }

  /* ==================================================================
     Settings
  ================================================================== */
  function Settings() {
    KT.useCols(['settings', 'staff']);
    const st = S.settings;
    const [f, setF] = useState(() => JSON.parse(JSON.stringify(st)));
    const [dirty, setDirty] = useState(false);
    const [busy, setBusy] = useState(false);
    const fileRef = useRef();
    const upd = (path, v) => { const n = JSON.parse(JSON.stringify(f)); const p = path.split('.'); let o = n; for (let i = 0; i < p.length - 1; i++) o = o[p[i]] = o[p[i]] || {}; o[p[p.length - 1]] = v; setF(n); setDirty(true); };
    const inp = (path, opts) => html`<input class="input" type=${(opts && opts.type) || 'text'} value=${get(f, path) == null ? '' : get(f, path)} placeholder=${opts && opts.ph}
      onInput=${(e) => upd(path, opts && opts.num ? Number(e.target.value) || 0 : e.target.value)} />`;
    const sw = (path, label, sub) => html`<div class="set-row"><div class="grow"><div class="t">${label}</div>${sub ? html`<div class="s">${sub}</div>` : null}</div>
      <${Switch} checked=${get(f, path) !== false} label=${label} onChange=${(v) => upd(path, v)} /></div>`;
    async function save() {
      setBusy(true);
      const patch = Object.assign({}, f); delete patch.id; delete patch.seed;
      if (patch.momo) patch.momo.number = String(patch.momo.number || '').replace(/\s/g, '');
      if (patch.phone) patch.phone = U.normPhone(patch.phone);
      if (patch.whatsapp) patch.whatsapp = U.normPhone(patch.whatsapp);
      try { await S.saveSettings(patch); setDirty(false); KT.toast('Settings saved', 'ok'); } catch (e) { KT.toastError(e); } finally { setBusy(false); }
    }
    async function importFile(e) {
      const file = e.target.files && e.target.files[0]; if (!file) return;
      try { const json = JSON.parse(await file.text()); if (await KT.confirm({ title: 'Import this backup?', body: 'Records with the same ID are replaced by the backup copy.', ok: 'Import' })) { const n = await S.importAll(json); KT.toast(n + ' records imported', 'ok'); } }
      catch (x) { KT.toastError(x); } e.target.value = '';
    }
    return html`<div class="adm-page">
      <div class="adm-head"><div><h1>Settings</h1><p>Business details, payment, ordering, guest menu and data.</p></div>
        <div class="actions"><button class="btn btn-primary" onClick=${save} disabled=${!dirty || busy}>${dirty ? 'Save changes' : 'Saved'}</button></div></div>
      <div class="grid grid-2">
        <section class="panel form"><h2>Business</h2>
          <div class="form-row"><label class="field"><span>Name</span>${inp('name')}</label><label class="field"><span>Tagline</span>${inp('tagline')}</label></div>
          <label class="field"><span>Address</span>${inp('address')}</label>
          <div class="form-row"><label class="field"><span>Phone</span>${inp('phone', { type: 'tel' })}</label><label class="field"><span>WhatsApp</span>${inp('whatsapp', { type: 'tel' })}</label></div>
          <div class="form-row"><label class="field"><span>Opens</span>${inp('hours.open', { type: 'time' })}</label><label class="field"><span>Closes</span>${inp('hours.close', { type: 'time' })}</label></div>
          <label class="field"><span>Google Maps link</span>${inp('mapUrl')}</label>
          <label class="field"><span>Google review link</span>${inp('reviewUrl')}</label>
        </section>
        <section class="panel form"><h2>Payment</h2>
          <div class="form-row"><label class="field"><span>MTN MoMo number</span>${inp('momo.number', { type: 'tel', ph: '0783094301' })}</label><label class="field"><span>Name on the MoMo account</span>${inp('momo.name')}</label></div>
          <p class="hint">Guests see this number when their order is ready. Check the account name matches what MoMo shows when paying.</p>
          ${sw('momo.quickDial', '“Pay with MoMo” button', 'Opens the phone dialer with the number and amount filled in (Android). iPhones show the code to dial.')}
          <label class="field"><span>MoMo quick-dial pattern (advanced)</span>${inp('momo.ussd', { ph: '*182*1*1*{number}*{amount}#' })}</label>
          ${sw('payCash', 'Cash at the counter')}${sw('payCard', 'Card at the counter', 'Only if you have a card machine.')}
        </section>
        <section class="panel form"><h2>Ordering</h2>
          ${sw('ordering', 'Guests can order from their phone', 'Switch off to pause ordering. The menu stays visible.')}
          <div class="field"><span>When a guest orders</span><div class="seg" role="group">
            <button aria-pressed=${f.orderFlow !== 'direct' ? 'true' : 'false'} onClick=${() => upd('orderFlow', 'reception')}>Reception confirms first</button>
            <button aria-pressed=${f.orderFlow === 'direct' ? 'true' : 'false'} onClick=${() => upd('orderFlow', 'direct')}>Straight to the kitchen</button></div></div>
          ${sw('serviceRequests', '“Call staff” and “Ask for the bill” buttons')}
          ${sw('reservations', 'Table bookings from the menu')}
        </section>
        <section class="panel form"><h2>Guest menu</h2>
          <div class="field"><span>Cover photo</span><${PhotoPicker} value=${f.cover} list=${KT.GALLERY.covers} onChange=${(v) => upd('cover', v)} /></div>
          ${sw('currencyNote', 'Show “Prices in Rwandan francs”')}
          ${sw('showUsd', 'Show approximate US dollar prices', 'Helps international visitors.')}
          ${f.showUsd !== false ? html`<label class="field"><span>Rwandan francs per US dollar</span>${inp('usdRate', { num: true, type: 'number' })}</label>` : null}
          <div class="field"><span>Languages on the menu</span><div class="row" style="gap:6px">${['en', 'fr', 'rw'].map((l) => html`<button type="button" key=${l} class=${'chip' + ((f.languages || []).includes(l) ? ' on' : '')}
            onClick=${() => { const cur = f.languages || []; const next = cur.includes(l) ? cur.filter((x) => x !== l) : cur.concat(l); if (next.length) upd('languages', ['en', 'fr', 'rw'].filter((x) => next.includes(x))); }}>${{ en: 'English', fr: 'Français', rw: 'Kinyarwanda' }[l]}</button>`)}</div></div>
          <div class="form-row"><label class="field"><span>Wi-Fi name (optional)</span>${inp('wifi.name')}</label><label class="field"><span>Wi-Fi password</span>${inp('wifi.password')}</label></div>
          <label class="field"><span>Web address for QR codes</span>${inp('publicUrl', { ph: 'https://ktown-karongi.netlify.app' })}</label>
        </section>
        <section class="panel form"><h2>Staff access</h2>
          ${S.mode === 'demo' ? html`<p class="hint">Demo mode uses PIN codes on this device. Live mode uses a separate account for each person (docs/GO-LIVE.html).</p>
            <div class="form-row"><label class="field"><span>Owner PIN</span>${inp('pins.admin', { type: 'text' })}</label><label class="field"><span>Reception PIN</span>${inp('pins.reception')}</label><label class="field"><span>Kitchen PIN</span>${inp('pins.kitchen')}</label></div>`
          : html`<${StaffList} />`}
        </section>
        <section class="panel form"><h2>Data</h2>
          <div class="row" style="flex-wrap:wrap;gap:8px">
            <button class="btn btn-sm" onClick=${() => S.loadSampleWeek().then((n) => KT.toast(n + ' sample orders added for the demo', 'ok'), KT.toastError)}><${Icon} name="layers" />Load a sample week</button>
            <button class="btn btn-sm" onClick=${() => S.clearSample().then((n) => KT.toast(n + ' sample records removed', 'ok'))} disabled=${!S.hasSample()}>Remove sample data</button>
            <button class="btn btn-sm" onClick=${() => U.download('ktown-backup-' + U.dayKey() + '.json', JSON.stringify(S.exportAll(), null, 1), 'application/json')}><${Icon} name="download" />Download backup</button>
            <button class="btn btn-sm" onClick=${() => fileRef.current.click()}>Import backup</button><input type="file" accept="application/json,.json" ref=${fileRef} hidden onChange=${importFile} />
          </div>
          ${S.mode === 'demo' ? html`<div class="row" style="flex-wrap:wrap;gap:8px">
            <button class="btn btn-sm btn-ghost btn-danger" onClick=${async () => { if (await KT.confirm({ title: 'Delete all orders and requests?', body: 'Menu, tables, events and settings stay.', ok: 'Delete orders', danger: true })) S.clearOrders().then(() => KT.toast('Orders cleared')); }}>Clear all orders</button>
            <button class="btn btn-sm btn-ghost btn-danger" onClick=${async () => { if (await KT.confirm({ title: 'Reset everything?', body: 'Back to the original K.Town menu, 4 tables and default settings. All orders, feedback and guests on this device are deleted.', ok: 'Reset', danger: true })) { await S.resetEverything(); setF(JSON.parse(JSON.stringify(S.settings))); KT.toast('Reset done'); } }}>Reset everything</button></div>` : null}
          <p class="hint">Version ${KT.VERSION}, ${S.mode === 'live' ? 'live mode (Firebase)' : 'demo mode (this browser)'}.</p>
        </section>
      </div>
      ${dirty ? html`<div style="position:sticky;bottom:90px;display:flex;justify-content:flex-end;margin-top:12px" class="no-print"><button class="btn btn-primary btn-lg" onClick=${save} disabled=${busy}>Save changes</button></div>` : null}
    </div>`;
  }
  function get(o, path) { return path.split('.').reduce((x, k) => (x == null ? x : x[k]), o); }

  function StaffList() {
    KT.useCols(['staff']);
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('reception');
    const list = S.list('staff');
    async function add() {
      const e = email.trim().toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(e)) { KT.toast('Enter a valid email', 'bad'); return; }
      try { await S.set('staff', e, { role, name: e.split('@')[0], createdAt: Date.now() }); setEmail(''); KT.toast('Added. Now create the same email as a user in Firebase Authentication.', 'ok', 6000); } catch (x) { KT.toastError(x); }
    }
    return html`<div class="form">
      <div class="list">${list.map((s) => html`<div class="li" key=${s.id}><${Icon} name="circle-user" /><div class="grow"><div class="t">${s.id}</div><div class="s">${KT.staff.ROLE_LABEL[s.role] || s.role}</div></div>
        <button class="btn btn-sm btn-ghost btn-danger" onClick=${async () => { if (await KT.confirm({ title: 'Remove ' + s.id + '?', ok: 'Remove', danger: true })) S.remove('staff', s.id).catch(KT.toastError); }}>Remove</button></div>`)}</div>
      <div class="form-row"><input class="input" type="email" placeholder="kitchen@ktown.rw" value=${email} onInput=${(e) => setEmail(e.target.value)} aria-label="Staff email" />
        <select class="select" value=${role} onChange=${(e) => setRole(e.target.value)} aria-label="Role"><option value="reception">Reception</option><option value="kitchen">Kitchen</option><option value="admin">Owner (admin)</option></select>
        <button class="btn" onClick=${add}>Add staff</button></div>
    </div>`;
  }

  KT.views.AdminApp = AdminApp;
})();
