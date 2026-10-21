/* K.Town — Reception (front desk): receive guest orders, send them to the kitchen,
   serve what's ready, confirm payments, answer "call staff" and bill requests, manage bookings. */
(function () {
  'use strict';
  const KT = (window.KT = window.KT || {});
  const { html, useState, useEffect } = window.htmPreact;
  const { Icon } = KT.ui;
  const U = KT.U, S = KT.store;
  const { useArrivals, useStart, Elapsed, Lines, PayPill, priceWarning } = KT.staff;

  function ReceptionApp({ embedded }) {
    KT.useCols(['orders', 'requests', 'reservations', 'tables', 'items', 'settings']);
    const now = KT.useNow(20000);
    const [started, start] = useStart();
    const [tab, setTab] = useState('new');
    const [sheet, setSheet] = useState(null);
    const st = S.settings;
    const day0 = U.startOfDay();
    const today = S.list('orders').filter((o) => o.createdAt >= day0 - 6 * 3600e3); // include late-night orders from yesterday
    const fresh = today.filter((o) => o.status === 'new');
    const inKitchen = today.filter((o) => o.status === 'kitchen' || o.status === 'preparing').sort(U.by('createdAt'));
    const ready = today.filter((o) => o.status === 'ready').sort(U.by((o) => o.statusAt.ready || 0));
    const toPay = today.filter((o) => o.status !== 'cancelled' && !S.isPaid(o) && (o.status === 'served' || (o.payment && o.payment.status === 'claimed')));
    const requests = S.list('requests').filter((r) => r.status === 'open');
    const bookingsToday = S.list('reservations').filter((r) => r.date === U.dayKey() && r.status !== 'declined');
    const pendingBookings = S.list('reservations').filter((r) => r.status === 'pending' && U.dayFromKey(r.date) >= day0);

    const freshIds = useArrivals(fresh.concat(st.orderFlow === 'direct' ? inKitchen.filter((o) => o.status === 'kitchen') : []), 'order');
    useArrivals(ready, 'ready');
    useArrivals(requests, 'alert');
    useArrivals(pendingBookings, 'soft');

    const sales = S.sales(today.filter((o) => o.createdAt >= day0));
    const act = (p, msg) => p.then(() => msg && KT.toast(msg, 'ok'), KT.toastError);

    const payGroups = Object.values(U.groupBy(toPay, (o) => o.tableId || 'none')).map((list) => ({ tableId: list[0].tableId, list, total: U.sum(list, (o) => o.total), claimed: list.some((o) => o.payment && o.payment.status === 'claimed') }));

    // On a narrow screen only one column shows: if it is empty, jump to the column that needs attention
    const lens = { new: fresh.length, kitchen: inKitchen.length, ready: ready.length, pay: payGroups.length };
    useEffect(() => { if (!lens[tab]) { const next = ['new', 'ready', 'pay', 'kitchen'].find((k) => lens[k]); if (next) setTab(next); } }, [lens.new, lens.kitchen, lens.ready, lens.pay]);
    const cols = [
      { key: 'new', title: 'New orders', color: 'var(--st-new)', list: fresh },
      { key: 'kitchen', title: 'In the kitchen', color: 'var(--st-preparing)', list: inKitchen },
      { key: 'ready', title: 'Ready to serve', color: 'var(--st-ready)', list: ready },
      { key: 'pay', title: 'To be paid', color: 'var(--st-served)', list: payGroups }
    ];

    return html`<div class="v-staff v-reception">
      ${!started && !embedded ? html`<${KT.views.StartOverlay} label="Reception" text="Tap Start with sound to hear a chime when guests order, call for staff or ask for the bill." onStart=${start} />` : null}
      <${KT.views.TopBar} title="Reception" sub=${U.dateLong(now)}>
        <button class="btn btn-primary btn-sm" onClick=${() => setSheet({ type: 'pos' })}><${Icon} name="plus" />New order</button>
        <button class="btn btn-sm" onClick=${() => setSheet({ type: 'bookings' })}><${Icon} name="calendar-days" />Bookings${pendingBookings.length ? html` <span class="badge">${pendingBookings.length}</span>` : null}</button>
        <button class="btn btn-sm" onClick=${() => setSheet({ type: 'stock' })}><${Icon} name="list" />Stock</button>
      </${KT.views.TopBar}>

      ${requests.length ? html`<div class="alerts" aria-live="assertive">${requests.map((r) => {
        const due = S.amountDue(today.filter((o) => o.tableId === r.tableId));
        return html`<div class=${'alert' + (r.type === 'bill' ? ' bill' : '')} key=${r.id}>
          <${Icon} name=${r.type === 'bill' ? 'receipt' : 'bell-ring'} />
          <div class="grow"><b>${S.tableName(r.tableId)}</b> ${r.type === 'bill' ? 'asks for the bill' + (due ? ', RWF ' + U.money(due) + ' to pay' : '') : 'is calling for staff'}
            <div style="font-size:13px;opacity:.8">${U.mins(now - r.createdAt) < 1 ? 'Just now' : U.elapsed(r.createdAt, now) + ' ago'}</div></div>
          <button class="btn btn-sm" onClick=${() => act(S.resolveRequest(r.id))}>Done</button></div>`;
      })}</div>` : null}

      <div class="sumstrip" tabindex="0" role="region" aria-label="Today at a glance">
        <div class="s"><small>Paid today</small><b class="money">${U.money(sales.revenue)}</b></div>
        <div class="s"><small>Orders today</small><b>${sales.orders}</b></div>
        <div class="s"><small>Waiting payment</small><b class="money">${U.money(sales.unpaid)}</b></div>
        <div class="s"><small>Bookings today</small><b>${bookingsToday.length}</b></div>
        ${st.orderFlow === 'direct' ? html`<div class="s"><small>Order flow</small><b style="font-size:14px">Straight to kitchen</b></div>` : null}
      </div>

      <div class="tabs narrow-only" role="tablist">${cols.map((c) => html`<button key=${c.key} role="tab" aria-selected=${tab === c.key ? 'true' : 'false'}
        class=${'chip' + (tab === c.key ? ' on' : '')} onClick=${() => setTab(c.key)}>${c.title} <span class="badge">${c.list.length}</span></button>`)}</div>

      <main class="board cols-4" aria-label="Orders">
        ${cols.map((c) => html`<section class="col" key=${c.key} data-hidden=${tab !== c.key ? 'true' : 'false'} aria-label=${c.title}>
          <div class="col-head"><span class="dot" style=${'background:' + c.color}></span><h2>${c.title}</h2><span class="count">${c.list.length}</span></div>
          ${!c.list.length ? html`<div class="col-empty">${{ new: 'New guest orders appear here.', kitchen: 'Nothing being prepared.', ready: 'Nothing waiting to be served.', pay: 'Everyone has paid.' }[c.key]}</div>` : null}
          ${c.key === 'pay' ? c.list.map((g) => html`<${PayCard} key=${g.tableId || 'none'} g=${g} onOpen=${(id) => setSheet({ type: 'order', id })} />`)
            : c.list.map((o) => html`<${RTicket} key=${o.id} o=${o} now=${now} fresh=${!!freshIds[o.id]} onOpen=${() => setSheet({ type: 'order', id: o.id })} />`)}
        </section>`)}
      </main>

      ${sheet && sheet.type === 'pos' ? html`<${KT.views.PosSheet} onClose=${() => setSheet(null)} />` : null}
      ${sheet && sheet.type === 'order' ? html`<${KT.views.OrderSheet} id=${sheet.id} onClose=${() => setSheet(null)} />` : null}
      ${sheet && sheet.type === 'bookings' ? html`<${KT.views.BookingsSheet} onClose=${() => setSheet(null)} />` : null}
      ${sheet && sheet.type === 'stock' ? html`<${KT.views.StockSheet} onClose=${() => setSheet(null)} />` : null}
    </div>`;
  }

  function RTicket({ o, now, fresh, onOpen }) {
    const act = (p) => p.catch(KT.toastError);
    const warn = priceWarning(o);
    const since = o.status === 'ready' ? o.statusAt.ready : o.status === 'new' ? o.createdAt : (o.statusAt.kitchen || o.createdAt);
    async function decline() {
      if (await KT.confirm({ title: 'Decline order #' + o.number + '?', body: 'The guest will see that the order was cancelled. Tell them why at the table.', ok: 'Decline', cancel: 'Keep', danger: true })) act(S.cancelOrder(o.id, 'Declined by reception'));
    }
    return html`<article class=${'ticket' + (fresh ? ' fresh' : '')} data-status=${o.status}>
      <div class="st-bar"></div>
      <div class="tk-head"><span class="tk-no">#${o.number}</span><span class="tk-table">${S.tableName(o.tableId) || 'No table'}</span><${Elapsed} from=${since} now=${now} />
        <button class="btn btn-icon btn-ghost btn-sm" onClick=${onOpen} aria-label=${'Details for order ' + o.number} title="Details"><${Icon} name="info" /></button></div>
      ${o.guestName || o.source === 'staff' ? html`<div class="tk-guest">${o.guestName}${o.source === 'staff' ? (o.guestName ? ', ' : '') + 'entered at reception' : ''}</div>` : null}
      <${Lines} o=${o} prices=${true} />
      <div class="tk-total"><span>Total</span><span class="money">RWF ${U.money(o.total)}</span></div>
      ${warn ? html`<p class="tk-warn"><${Icon} name="circle-alert" cls="ic-sm" />Check price: ${warn}</p>` : null}
      ${o.payment && o.payment.status === 'claimed' ? html`<div class="tk-pay"><span class="claim">Guest says paid by MoMo</span></div>` : null}
      <div class="tk-foot">
        ${o.status === 'new' ? html`<button class="btn btn-primary" onClick=${() => act(S.setStatus(o.id, 'kitchen'))}><${Icon} name="send" />Send to kitchen</button>
          <button class="btn btn-icon" onClick=${decline} aria-label="Decline order" title="Decline"><${Icon} name="x" /></button>` : null}
        ${o.status === 'kitchen' || o.status === 'preparing' ? html`<span class="pill" data-s=${o.status} style="align-self:center">${o.status === 'kitchen' ? 'Waiting for the kitchen' : 'Kitchen is preparing'}</span>
          <button class="btn btn-sm" style="flex:none;min-width:0;margin-left:auto" onClick=${() => act(S.setStatus(o.id, 'ready'))} title="Use this when reception prepared the drinks">Mark ready</button>` : null}
        ${o.status === 'ready' ? html`<button class="btn btn-primary" onClick=${() => act(S.setStatus(o.id, 'served'))}><${Icon} name="hand-platter" />Served to ${S.tableName(o.tableId) || 'guest'}</button>` : null}
      </div>
    </article>`;
  }

  function PayCard({ g, onOpen }) {
    const ids = g.list.map((o) => o.id);
    const act = (method) => S.confirmPayment(ids, method).then(() => KT.toast('Payment saved for ' + (S.tableName(g.tableId) || 'guest'), 'ok'), KT.toastError);
    return html`<article class="ticket" data-status="served">
      <div class="st-bar"></div>
      <div class="tk-head"><span class="tk-table">${S.tableName(g.tableId) || 'No table'}</span><span class="tk-time">${g.list.length} order${g.list.length > 1 ? 's' : ''}</span></div>
      <div class="list" style="padding:0 14px">${g.list.map((o) => html`<button class="li" style="background:none;border-left:0;border-right:0;border-top:0;text-align:left;width:100%" key=${o.id} onClick=${() => onOpen(o.id)}>
        <span class="grow"><span class="t">#${o.number}</span> <span class="s">${o.lines.map((l) => l.qty + '× ' + l.name).join(', ')}</span></span><span class="price">${U.money(o.total)}</span></button>`)}</div>
      <div class="tk-total"><span>To pay</span><span class="money">RWF ${U.money(g.total)}</span></div>
      ${g.claimed ? html`<div class="tk-pay"><span class="claim">Guest says paid by MoMo, check your MoMo messages</span></div>` : null}
      <div class="tk-foot">
        <button class="btn btn-primary" onClick=${() => act('momo')}><${Icon} name="smartphone" />MoMo received</button>
        <button class="btn" onClick=${() => act('cash')}><${Icon} name="banknote" />Cash</button>
        ${S.settings.payCard ? html`<button class="btn" onClick=${() => act('card')}><${Icon} name="credit-card" />Card</button>` : null}
      </div>
    </article>`;
  }

  KT.views.ReceptionApp = ReceptionApp;
})();
