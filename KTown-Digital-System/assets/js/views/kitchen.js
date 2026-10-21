/* K.Town — Kitchen display: big tickets, start preparing, mark ready (reception and the guest are told at once). */
(function () {
  'use strict';
  const KT = (window.KT = window.KT || {});
  const { html, useState, useEffect } = window.htmPreact;
  const { Icon } = KT.ui;
  const U = KT.U, S = KT.store;
  const { useArrivals, useStart, Elapsed, Lines } = KT.staff;

  function KitchenApp({ embedded }) {
    KT.useCols(['orders', 'items', 'categories', 'settings']);
    const now = KT.useNow(15000);
    const [started, start] = useStart();
    const [tab, setTab] = useState('todo');
    const [stock, setStock] = useState(false);
    const since = U.startOfDay() - 6 * 3600e3;
    const orders = S.list('orders').filter((o) => o.createdAt >= since);
    const todo = orders.filter((o) => o.status === 'kitchen').sort(U.by((o) => o.statusAt.kitchen || o.createdAt));
    const doing = orders.filter((o) => o.status === 'preparing').sort(U.by((o) => o.statusAt.preparing || o.createdAt));
    const ready = orders.filter((o) => o.status === 'ready').sort(U.by((o) => o.statusAt.ready || 0));
    const waiting = orders.filter((o) => o.status === 'new').length;
    const fresh = useArrivals(todo, 'order');
    const soldOut = S.list('items').filter((i) => i.available === false).length;
    const act = (p) => p.catch(KT.toastError);
    const lens = { todo: todo.length, doing: doing.length, ready: ready.length };
    useEffect(() => { if (!lens[tab]) { const next = ['todo', 'doing', 'ready'].find((k) => lens[k]); if (next) setTab(next); } }, [lens.todo, lens.doing, lens.ready]);
    const cols = [
      { key: 'todo', title: 'To prepare', list: todo, color: 'var(--st-kitchen)' },
      { key: 'doing', title: 'Preparing', list: doing, color: 'var(--st-preparing)' },
      { key: 'ready', title: 'Ready for pickup', list: ready, color: 'var(--st-ready)' }
    ];
    return html`<div class="v-staff v-kitchen theme-dark">
      ${!started && !embedded ? html`<${KT.views.StartOverlay} label="Kitchen" text="Tap Start with sound to hear a chime for every new ticket. The screen stays awake while this page is open." onStart=${start} />` : null}
      <${KT.views.TopBar} title="Kitchen" sub=${waiting ? waiting + ' order' + (waiting > 1 ? 's' : '') + ' waiting at reception' : 'All caught up at reception'} dark=${true}>
        <button class="btn btn-sm" onClick=${() => setStock(true)}><${Icon} name="list" />Stock${soldOut ? html` <span class="badge">${soldOut}</span>` : null}</button>
      </${KT.views.TopBar}>
      <div class="tabs narrow-only" role="tablist">${cols.map((c) => html`<button key=${c.key} role="tab" aria-selected=${tab === c.key ? 'true' : 'false'}
        class=${'chip' + (tab === c.key ? ' on' : '')} onClick=${() => setTab(c.key)}>${c.title} <span class="badge">${c.list.length}</span></button>`)}</div>
      <main class="board cols-3" aria-label="Tickets">
        ${cols.map((c) => html`<section class="col" key=${c.key} data-hidden=${tab !== c.key ? 'true' : 'false'} aria-label=${c.title}>
          <div class="col-head"><span class="dot" style=${'background:' + c.color}></span><h2>${c.title}</h2><span class="count">${c.list.length}</span></div>
          ${!c.list.length ? html`<div class="col-empty">${{ todo: 'No tickets. New orders from reception appear here with a chime.', doing: 'Tap Start on a ticket when you begin.', ready: 'Ready orders wait here until reception serves them.' }[c.key]}</div>` : null}
          ${c.list.map((o) => html`<article class=${'ticket' + (fresh[o.id] ? ' fresh' : '')} data-status=${o.status} key=${o.id}>
            <div class="st-bar"></div>
            <div class="tk-head"><span class="tk-no">#${o.number}</span><span class="tk-table">${S.tableName(o.tableId) || 'Takeaway'}</span>
              <${Elapsed} from=${c.key === 'ready' ? o.statusAt.ready : (o.statusAt.kitchen || o.createdAt)} now=${now} /></div>
            <${Lines} o=${o} prices=${false} />
            <div class="tk-foot">
              ${o.status === 'kitchen' ? html`<button class="btn btn-go" onClick=${() => act(S.setStatus(o.id, 'preparing'))}><${Icon} name="flame" />Start</button>
                <button class="btn btn-done" onClick=${() => act(S.setStatus(o.id, 'ready'))}><${Icon} name="check" />Ready</button>` : null}
              ${o.status === 'preparing' ? html`<button class="btn btn-icon" onClick=${() => act(S.setStatus(o.id, 'kitchen'))} aria-label="Move back to To prepare" title="Back"><${Icon} name="undo-2" /></button>
                <button class="btn btn-done" onClick=${() => act(S.setStatus(o.id, 'ready'))}><${Icon} name="check" />Ready</button>` : null}
              ${o.status === 'ready' ? html`<button class="btn" onClick=${() => act(S.setStatus(o.id, 'preparing'))}><${Icon} name="undo-2" />Not ready yet</button>` : null}
            </div>
          </article>`)}
        </section>`)}
      </main>
      ${stock ? html`<${KT.views.StockSheet} onClose=${() => setStock(false)} />` : null}
    </div>`;
  }

  KT.views.KitchenApp = KitchenApp;
})();
