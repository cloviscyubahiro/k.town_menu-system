/* K.Town — data store shared by every screen.
   Demo mode keeps data in this browser (all screens on one computer stay in sync).
   Live mode uses Firebase so phones, kitchen, reception and the owner's phone sync anywhere. */
(function () {
  'use strict';
  const KT = (window.KT = window.KT || {});
  const U = KT.U;

  const COLS = ['settings', 'categories', 'items', 'tables', 'events', 'orders', 'reservations', 'feedback', 'contacts', 'requests', 'staff'];
  const PUBLIC_COLS = ['settings', 'categories', 'items', 'tables', 'events'];

  /* ------------------------------------------------------------------
     Patch helper: supports dotted keys like { 'statusAt.ready': 123 }
     and the special value KT.DELETE to remove a field.
  ------------------------------------------------------------------ */
  const DELETE = (KT.DELETE = { __delete: true });
  function applyPatch(doc, patch) {
    const out = JSON.parse(JSON.stringify(doc || {}));
    Object.keys(patch).forEach((k) => {
      const parts = k.split('.');
      let o = out;
      for (let i = 0; i < parts.length - 1; i++) {
        if (typeof o[parts[i]] !== 'object' || o[parts[i]] === null) o[parts[i]] = {};
        o = o[parts[i]];
      }
      const last = parts[parts.length - 1];
      if (patch[k] === DELETE) delete o[last];
      else o[last] = patch[k];
    });
    return out;
  }
  KT.applyPatch = applyPatch;

  /* ==================================================================
     Local (demo) adapter — one key per document in localStorage
  ================================================================== */
  function LocalAdapter() {
    const PFX = 'kt1:d:';
    const cache = {};
    const raw = {};
    const listeners = new Set();
    let bc = null;
    const mem = {}; // fallback when localStorage is blocked
    let storageOk = true;
    try { localStorage.setItem('kt1:probe', '1'); localStorage.removeItem('kt1:probe'); } catch (e) { storageOk = false; }

    const lsGet = (k) => (storageOk ? localStorage.getItem(k) : (k in mem ? mem[k] : null));
    const lsSet = (k, v) => { if (storageOk) localStorage.setItem(k, v); else mem[k] = v; };
    const lsDel = (k) => { if (storageOk) localStorage.removeItem(k); else delete mem[k]; };
    const keys = () => { if (!storageOk) return Object.keys(mem); const a = []; for (let i = 0; i < localStorage.length; i++) a.push(localStorage.key(i)); return a; };

    function col(c) { return (cache[c] = cache[c] || new Map()); }
    function parseKey(k) { const rest = k.slice(PFX.length); const j = rest.indexOf(':'); return [rest.slice(0, j), rest.slice(j + 1)]; }
    function reread(k) {
      const [c, id] = parseKey(k);
      const v = lsGet(k);
      if (raw[k] === v) return null; // unchanged
      raw[k] = v;
      if (v == null) col(c).delete(id);
      else { try { col(c).set(id, Object.assign(JSON.parse(v), { id })); } catch (e) { return null; } }
      return c;
    }
    function loadAll() {
      COLS.forEach((c) => { cache[c] = new Map(); });
      Object.keys(raw).forEach((k) => delete raw[k]);
      keys().forEach((k) => { if (k && k.startsWith(PFX)) reread(k); });
    }
    function emit(c) { listeners.forEach((f) => { try { f(c); } catch (e) { console.error(e); } }); }

    const A = {
      kind: 'demo',
      async init() {
        loadAll();
        try {
          bc = new BroadcastChannel('kt1');
          bc.onmessage = (e) => {
            const d = e.data || {};
            if (d.t === 'reset') { loadAll(); COLS.forEach(emit); return; }
            if (d.k) { const c = reread(d.k); if (c) emit(c); }
          };
        } catch (e) { bc = null; }
        window.addEventListener('storage', (e) => {
          if (e.key == null) { loadAll(); COLS.forEach(emit); return; }
          if (e.key.startsWith(PFX)) { const c = reread(e.key); if (c) emit(c); }
        });
      },
      onChange(f) { listeners.add(f); return () => listeners.delete(f); },
      watch() { /* everything is loaded in demo mode */ },
      list(c) { return Array.from(col(c).values()); },
      get(c, id) { return col(c).get(id) || null; },
      _write(c, id, doc) {
        const k = PFX + c + ':' + id;
        if (doc == null) { lsDel(k); raw[k] = null; col(c).delete(id); }
        else {
          const clean = Object.assign({}, doc); delete clean.id;
          const v = JSON.stringify(clean);
          try { lsSet(k, v); } catch (e) {
            throw new Error('This browser’s storage is full. Remove some uploaded photos or clear sample data.');
          }
          raw[k] = v; col(c).set(id, Object.assign(clean, { id }));
        }
        if (bc) bc.postMessage({ k });
        emit(c);
      },
      async add(c, data) { const id = data.id || U.uid(); A._write(c, id, Object.assign({}, data, { id })); return id; },
      async set(c, id, data) { A._write(c, id, data); return id; },
      async update(c, id, patch) {
        const cur = A.get(c, id);
        if (!cur) throw new Error('Not found: ' + c + '/' + id);
        A._write(c, id, applyPatch(cur, patch));
      },
      async remove(c, id) { A._write(c, id, null); },
      async batch(ops) { ops.forEach((op) => { if (op.del) A._write(op.col, op.id, null); else A._write(op.col, op.id, op.data); }); },
      async createOrder(order) {
        const counterKey = 'kt1:c:' + order.day;
        const run = () => {
          const n = (parseInt(lsGet(counterKey), 10) || 0) + 1;
          lsSet(counterKey, String(n));
          const id = U.uid();
          A._write('orders', id, Object.assign({}, order, { id, number: n }));
          return { id, number: n };
        };
        if (navigator.locks && navigator.locks.request) return navigator.locks.request('kt1-counter', run);
        return run();
      },
      async resetAll() {
        keys().filter((k) => k && k.startsWith('kt1:') && k !== 'kt1:lang').forEach(lsDel);
        loadAll();
        if (bc) bc.postMessage({ t: 'reset' });
        COLS.forEach(emit);
      },
      isEmpty() { return col('settings').size === 0; },
      async bumpCounter(day, n) { const k = 'kt1:c:' + day; if ((parseInt(lsGet(k), 10) || 0) < n) lsSet(k, String(n)); },
      uid() { let me = U.ls.get('kt1:me', null); if (!me || !me.uid) { me = Object.assign(me || {}, { uid: 'g_' + U.uid(10) }); U.ls.set('kt1:me', me); } return me.uid; },
      online() { return true; }
    };
    return A;
  }

  /* ==================================================================
     The store
  ================================================================== */
  const listeners = new Set();
  const version = {};
  const memo = {};
  COLS.forEach((c) => { version[c] = 0; });

  const S = (KT.store = {
    mode: 'demo',
    adapter: null,
    COLS,
    version,
    ready: null,
    error: null,

    async init() {
      const cfg = window.KT_FIREBASE_CONFIG;
      const wantLive = cfg && cfg.apiKey && cfg.projectId && !/[?&]mode=demo\b/.test(location.search);
      if (wantLive) {
        S.mode = 'live';
        await U.loadScript('assets/js/core/firebase.js');
        S.adapter = await KT.createFirebaseAdapter(cfg);
      } else {
        S.mode = 'demo';
        S.adapter = LocalAdapter();
      }
      S.adapter.onChange((c) => { version[c] = (version[c] || 0) + 1; delete memo[c]; listeners.forEach((f) => f(c)); });
      await S.adapter.init();
      window.addEventListener('storage', (e) => { if (e.key === 'kt1:session') listeners.forEach((f) => f('session')); });
      if (S.mode === 'demo' && S.adapter.isEmpty()) await S.seed();
      S.adapter.watch(S.session() ? S.session().role : 'guest');
    },

    async seed() {
      const ops = [];
      const SEED = KT.SEED;
      Object.keys(SEED.settings).forEach((id) => {
        const data = Object.assign({ seed: KT.SEED_VERSION }, JSON.parse(JSON.stringify(SEED.settings[id])));
        if (S.mode === 'live') delete data.pins; // live mode uses staff accounts, not PINs
        ops.push({ col: 'settings', id, data });
      });
      ['categories', 'items', 'tables', 'events'].forEach((c) => SEED[c].forEach((d) => ops.push({ col: c, id: d.id, data: Object.assign({ available: true, createdAt: Date.now() }, d) })));
      await S.adapter.batch(ops);
    },

    subscribe(f) { listeners.add(f); return () => listeners.delete(f); },

    /* ---------- reading ---------- */
    list(c) {
      if (memo[c]) return memo[c];
      let arr = S.adapter ? S.adapter.list(c) : [];
      if (['categories', 'items', 'tables', 'events'].includes(c)) arr = arr.slice().sort(U.by((d) => (d.sort == null ? 999 : d.sort)));
      else if (['orders', 'feedback', 'contacts', 'requests', 'reservations'].includes(c)) arr = arr.slice().sort(U.by((d) => d.createdAt || 0, 'desc'));
      memo[c] = arr;
      return arr;
    },
    get(c, id) { return S.adapter ? S.adapter.get(c, id) : null; },
    get settings() { return S.get('settings', 'main') || KT.SEED.settings.main; },
    item(id) { return S.get('items', id); },
    table(id) { return S.get('tables', id); },
    tableName(id) {
      if (!id) return '';
      if (id === 'takeaway') return KT.t('takeaway');
      const t = S.get('tables', id); return t ? t.name : id;
    },

    /* ---------- generic writes ---------- */
    add: (c, d) => S.adapter.add(c, Object.assign({ createdAt: Date.now() }, d)),
    set: (c, id, d) => S.adapter.set(c, id, d),
    update: (c, id, p) => S.adapter.update(c, id, Object.assign({ updatedAt: Date.now() }, p)),
    remove: (c, id) => S.adapter.remove(c, id),
    saveSettings: (patch) => S.adapter.update('settings', 'main', Object.assign({ updatedAt: Date.now() }, patch)),

    /* ---------- the guest on this device ---------- */
    me() { return U.ls.get('kt1:me', {}) || {}; },
    saveMe(patch) { const me = Object.assign(S.me(), patch); U.ls.set('kt1:me', me); return me; },
    guestUid() { return S.adapter.uid(); },
    myOrders() {
      const uid = S.guestUid();
      const ids = new Set(S.me().orders || []);
      const since = Date.now() - 14 * 3600e3; // this visit
      return S.list('orders').filter((o) => (o.guestUid === uid || ids.has(o.id)) && (o.createdAt || 0) > since && o.source !== 'staff');
    },
    myBookings() {
      const uid = S.guestUid();
      const ids = new Set(S.me().bookings || []);
      return S.list('reservations').filter((r) => (r.guestUid === uid || ids.has(r.id)) && U.dayFromKey(r.date) >= U.startOfDay());
    },

    /* ---------- staff session (demo mode uses PINs; live mode uses Firebase accounts) ---------- */
    session() {
      if (S.mode === 'live') return S.adapter.staff ? S.adapter.staff() : null;
      return U.ls.get('kt1:session', null);
    },
    async signIn(role, secret, email) {
      if (S.mode === 'live') {
        const s = await S.adapter.signInStaff(email, secret);
        S.adapter.watch(s.role);
        return s;
      }
      const pins = S.settings.pins || {};
      if (!pins[role] || String(secret).trim() !== String(pins[role])) throw new Error('That PIN is not right.');
      const s = { role, at: Date.now(), name: role[0].toUpperCase() + role.slice(1) };
      U.ls.set('kt1:session', s);
      listeners.forEach((f) => f('session'));
      return s;
    },
    async signOut() {
      if (S.mode === 'live') { await S.adapter.signOutStaff(); S.adapter.watch('guest'); return; }
      U.ls.del('kt1:session');
      listeners.forEach((f) => f('session'));
    },
    can(role, screen) {
      const allow = { admin: ['admin'], reception: ['reception', 'admin'], kitchen: ['kitchen', 'reception', 'admin'] };
      return !!role && (allow[screen] || []).includes(role);
    },

    /* ==================================================================
       Orders
    ================================================================== */
    priceLines(lines) {
      const out = [];
      lines.forEach((l) => {
        const it = S.item(l.itemId || l.id);
        if (!it || l.qty < 1) return;
        out.push({ id: it.id, name: it.name, cat: it.cat, price: Math.round(it.price), qty: Math.min(99, Math.round(l.qty)), note: (l.note || '').slice(0, 140) });
      });
      return out;
    },
    total: (lines) => U.sum(lines, (l) => l.price * l.qty),

    async placeOrder({ tableId, lines, guest, source, sample, createdAt }) {
      const st = S.settings;
      const priced = S.priceLines(lines);
      if (!priced.length) throw new Error('Your order is empty.');
      const unavailable = priced.filter((l) => S.item(l.id) && S.item(l.id).available === false);
      if (unavailable.length && !sample) throw new Error(unavailable.map((l) => l.name).join(', ') + ' just sold out. Please remove it and try again.');
      const now = createdAt || Date.now();
      const fromStaff = source === 'staff';
      const status = fromStaff || st.orderFlow === 'direct' ? 'kitchen' : 'new';
      const order = {
        day: U.dayKey(now),
        createdAt: now,
        tableId: tableId || '',
        tableName: S.tableName(tableId),
        lines: priced,
        total: S.total(priced),
        status,
        statusAt: fromStaff || status === 'kitchen' ? { new: now, kitchen: now } : { new: now },
        source: source || 'guest',
        guestUid: fromStaff ? '' : S.guestUid(),
        guestName: (guest && guest.name || '').trim().slice(0, 60),
        guestPhone: guest && guest.phone ? U.normPhone(guest.phone) : '',
        payment: { status: 'unpaid' }
      };
      if (sample) order.sample = true;
      const res = await S.adapter.createOrder(order);
      if (!fromStaff && !sample) {
        const me = S.me();
        S.saveMe({ orders: (me.orders || []).concat(res.id).slice(-30), name: order.guestName || me.name || '', phone: guest && guest.phone ? guest.phone : (me.phone || ''), lastTable: tableId || me.lastTable || '' });
        if (guest && guest.optIn && (order.guestPhone || guest.email)) {
          S.addContact({ name: order.guestName, phone: order.guestPhone, email: guest.email || '', source: 'order' }).catch(() => {});
        }
      }
      return res;
    },

    setStatus(id, status, extra) {
      const p = { status };
      p['statusAt.' + status] = Date.now();
      return S.update('orders', id, Object.assign(p, extra || {}));
    },
    claimPayment(ids, method) {
      return Promise.all(ids.map((id) => S.update('orders', id, { 'payment.status': 'claimed', 'payment.method': method || 'momo', 'payment.claimedAt': Date.now() })));
    },
    confirmPayment(ids, method) {
      return Promise.all(ids.map((id) => S.update('orders', id, { 'payment.status': 'paid', 'payment.method': method, 'payment.paidAt': Date.now() })));
    },
    undoPayment(id) { return S.update('orders', id, { 'payment.status': 'unpaid', 'payment.paidAt': DELETE }); },
    cancelOrder(id, reason, by) { return S.setStatus(id, 'cancelled', { cancelReason: reason || '', cancelledBy: by || 'staff' }); },

    isOpen(o) { return o.status !== 'cancelled' && !(o.status === 'served' && o.payment && o.payment.status === 'paid'); },
    isPaid: (o) => !!(o.payment && o.payment.status === 'paid'),
    amountDue(orders) { return U.sum(orders.filter((o) => o.status !== 'cancelled' && !S.isPaid(o)), (o) => o.total); },

    /* ---------- service requests, bookings, feedback, contacts ---------- */
    addRequest(tableId, type) {
      return S.add('requests', { tableId, tableName: S.tableName(tableId), type, status: 'open', guestUid: S.guestUid() });
    },
    resolveRequest(id) { return S.update('requests', id, { status: 'done', doneAt: Date.now() }); },

    async addReservation(r) {
      const id = await S.add('reservations', Object.assign({ status: 'pending', guestUid: S.guestUid() }, r, { phone: U.normPhone(r.phone) }));
      const me = S.me();
      S.saveMe({ bookings: (me.bookings || []).concat(id).slice(-10), name: r.name || me.name, phone: r.phone || me.phone });
      if (r.optIn) S.addContact({ name: r.name, phone: r.phone, source: 'booking' }).catch(() => {});
      return id;
    },
    async addFeedback(f) {
      const doc = Object.assign({ source: 'digital', guestUid: S.guestUid() }, f);
      if (doc.phone) doc.phone = U.normPhone(doc.phone);
      const id = await S.add('feedback', doc);
      if (f.optIn && (f.phone || f.email)) await S.addContact({ name: f.name, phone: f.phone, email: f.email, source: 'feedback' }).catch(() => {});
      return id;
    },
    addContact(c) {
      return S.add('contacts', { name: (c.name || '').trim(), phone: c.phone ? U.normPhone(c.phone) : '', email: (c.email || '').trim(), optIn: true, source: c.source || '', guestUid: S.guestUid(), sample: c.sample || undefined });
    },
    // One row per person (phone or email), newest details win
    contactsList() {
      const map = new Map();
      S.list('contacts').slice().reverse().forEach((c) => {
        const key = c.phone || (c.email || '').toLowerCase() || c.id;
        const prev = map.get(key);
        map.set(key, Object.assign({}, prev || {}, c, { first: prev ? prev.first : c.createdAt, visits: (prev ? prev.visits : 0) + 1, ids: (prev ? prev.ids : []).concat(c.id) }));
      });
      return Array.from(map.values()).sort(U.by('createdAt', 'desc'));
    },

    /* ---------- reports ---------- */
    ordersBetween(from, to) {
      return S.list('orders').filter((o) => o.createdAt >= from && o.createdAt <= to);
    },
    sales(orders) {
      const valid = orders.filter((o) => o.status !== 'cancelled');
      const paid = valid.filter(S.isPaid);
      return {
        orders: valid.length,
        cancelled: orders.length - valid.length,
        revenue: U.sum(paid, (o) => o.total),       // money confirmed received
        billed: U.sum(valid, (o) => o.total),       // everything ordered
        unpaid: U.sum(valid.filter((o) => !S.isPaid(o)), (o) => o.total),
        avg: valid.length ? Math.round(U.sum(valid, (o) => o.total) / valid.length) : 0,
        items: U.sum(valid, (o) => U.sum(o.lines || [], (l) => l.qty))
      };
    },
    topItems(orders, n) {
      const m = {};
      orders.filter((o) => o.status !== 'cancelled').forEach((o) => (o.lines || []).forEach((l) => {
        const r = (m[l.id] = m[l.id] || { id: l.id, name: l.name, cat: l.cat, qty: 0, revenue: 0 });
        r.qty += l.qty; r.revenue += l.qty * l.price;
      }));
      return Object.values(m).sort(U.by('qty', 'desc')).slice(0, n || 10);
    },

    /* ---------- demo helpers ---------- */
    async loadSampleWeek() {
      if (S.hasSample()) await S.clearSample(); // pressing it again replaces the sample week instead of doubling it
      const items = S.list('items').filter((i) => i.available !== false);
      const tables = S.list('tables').filter((t) => t.active !== false);
      if (!items.length || !tables.length) throw new Error('Add menu items and tables first.');
      const weight = (i) => ({ 'mango-juice': 6, 'ice-latte': 6, 'cappuccino': 5, 'black-tea': 5, 'black-coffee': 4, 'watermelon-juice': 4, 'spice-tea': 4, 'ice-cappuccino': 3, 'pineapple-juice': 3, 'ice-americano': 3, 'cafe-latte': 3, 'lemon-tea': 3, 'mint-tea': 2, 'orange-juice': 2, 'ice-lemonade-coffee': 2 }[i.id] || 2);
      const bag = []; items.forEach((i) => { for (let k = 0; k < weight(i); k++) bag.push(i); });
      const rnd = mulberry(20261020);
      const pick = (a) => a[Math.floor(rnd() * a.length)];
      const names = ['Aline', 'Eric', 'Grace', 'Jean-Paul', 'Sarah', 'Claude', 'Diane', 'Patrick', 'Emma', 'Olivier', 'Ange', 'Kevin', 'Lucie', 'Thomas', 'Divine'];
      const hours = [9, 10, 10, 11, 11, 12, 13, 14, 15, 16, 16, 17, 17, 18, 18, 19, 19, 20, 21, 22];
      const today0 = U.startOfDay();
      const docs = [];
      // from last week's Monday to today, so both "this week" and "last week" reports have data
      const back = 7 + ((U.weekday(today0 + 12 * 3600e3) + 6) % 7);
      for (let d = back; d >= 0; d--) {
        const day0 = today0 - d * U.DAY;
        const wd = U.weekday(day0);
        const weekend = wd === 5 || wd === 6 || wd === 0;
        let count = d === 0 ? 0 : Math.round((weekend ? 17 : 10) + rnd() * 8);
        if (d === 0) { // today: only up to the current hour
          const hNow = U.hour(Date.now());
          count = Math.max(0, Math.round((hNow - 9) * 1.1));
        }
        for (let k = 0; k < count; k++) {
          const h = pick(hours);
          let ts = day0 + h * 3600e3 + Math.floor(rnd() * 3600e3);
          if (d === 0 && ts > Date.now() - 20 * 60e3) continue;
          const nLines = rnd() < 0.55 ? 1 : rnd() < 0.8 ? 2 : 3;
          const lines = [];
          for (let j = 0; j < nLines; j++) { const it = pick(bag); const ex = lines.find((l) => l.id === it.id); if (ex) ex.qty++; else lines.push({ id: it.id, name: it.name, cat: it.cat, price: it.price, qty: rnd() < 0.8 ? 1 : 2, note: '' }); }
          const total = U.sum(lines, (l) => l.price * l.qty);
          const cancelled = rnd() < 0.03;
          const m = rnd();
          const method = m < 0.62 ? 'momo' : m < 0.95 ? 'cash' : 'card';
          const t = pick(tables);
          docs.push({
            day: U.dayKey(ts), createdAt: ts, tableId: t.id, tableName: t.name, lines, total, sample: true,
            status: cancelled ? 'cancelled' : 'served',
            statusAt: { new: ts, kitchen: ts + 60e3, preparing: ts + 2 * 60e3, ready: ts + 9 * 60e3, served: ts + 11 * 60e3 },
            source: rnd() < 0.8 ? 'guest' : 'staff', guestUid: 'sample', guestName: rnd() < 0.5 ? pick(names) : '', guestPhone: '',
            payment: cancelled ? { status: 'unpaid' } : { status: 'paid', method, paidAt: ts + 40 * 60e3 }
          });
        }
      }
      docs.sort(U.by('createdAt'));
      const counters = {};
      const ops = [];
      // number sample orders after any real orders already placed today, and move the counter on
      docs.forEach((o) => {
        if (counters[o.day] == null) counters[o.day] = Math.max(0, ...S.list('orders').filter((x) => x.day === o.day).map((x) => x.number || 0));
        counters[o.day] += 1; o.number = counters[o.day];
        ops.push({ col: 'orders', id: 's_' + U.uid(10), data: o });
      });
      const comments = [
        [5, 'The ice latte with the lake view, perfect afternoon.', 'Sarah'], [5, 'Super accueil, le jus de mangue est excellent.', 'Lucie'],
        [4, 'Lovely terrace. Took a little long on a busy evening.', 'Thomas'], [5, 'Byari byiza cyane, murakoze!', 'Divine'],
        [4, 'Great coffee. Would love some snacks with it.', 'Eric'], [3, 'Good drinks, music was a bit loud.', ''],
        [5, 'Best spice tea in Kibuye.', 'Grace'], [5, 'Ordering from the phone was so easy.', 'Patrick']
      ];
      comments.forEach((c, i) => {
        const ts = today0 - (6 - Math.min(6, i)) * U.DAY + (15 + (i % 5)) * 3600e3;
        ops.push({ col: 'feedback', id: 's_' + U.uid(10), data: { rating: c[0], comment: c[1], name: c[2], createdAt: Math.min(ts, Date.now() - 3600e3), source: i % 3 === 2 ? 'paper' : 'digital', tableId: 'T' + (1 + (i % 4)), sample: true } });
        if (c[2]) ops.push({ col: 'contacts', id: 's_' + U.uid(10), data: { name: c[2], phone: '+25078' + String(8000000 + i * 137211).slice(0, 7), email: '', optIn: true, source: 'feedback', createdAt: Math.min(ts, Date.now() - 3600e3), sample: true } });
      });
      const tomorrow = U.dayKey(today0 + U.DAY + 12 * 3600e3);
      ops.push({ col: 'reservations', id: 's_' + U.uid(10), data: { name: 'Claude M.', phone: '+250788555012', date: tomorrow, time: '19:00', guests: 4, tableId: '', note: 'Birthday, by the view please', status: 'pending', createdAt: Date.now() - 2 * 3600e3, sample: true } });
      await S.adapter.batch(ops);
      if (S.adapter.bumpCounter) await Promise.all(Object.keys(counters).map((d) => S.adapter.bumpCounter(d, counters[d])));
      return docs.length;
    },
    async clearSample() {
      const ops = [];
      ['orders', 'feedback', 'contacts', 'reservations', 'requests'].forEach((c) => S.list(c).filter((d) => d.sample).forEach((d) => ops.push({ col: c, id: d.id, del: true })));
      await S.adapter.batch(ops);
      return ops.length;
    },
    hasSample() { return ['orders', 'feedback', 'contacts', 'reservations'].some((c) => S.list(c).some((d) => d.sample)); },
    async clearOrders() {
      const ops = [];
      ['orders', 'requests'].forEach((c) => S.list(c).forEach((d) => ops.push({ col: c, id: d.id, del: true })));
      await S.adapter.batch(ops);
    },
    async resetEverything() {
      if (S.mode !== 'demo') throw new Error('Reset is only available in demo mode.');
      await S.adapter.resetAll();
      await S.seed();
    },
    exportAll() {
      const out = { app: 'K.Town', version: KT.VERSION, exportedAt: new Date().toISOString(), mode: S.mode, data: {} };
      COLS.forEach((c) => { out.data[c] = S.list(c); });
      return out;
    },
    async importAll(json) {
      if (!json || !json.data) throw new Error('This file is not a K.Town backup.');
      const ops = [];
      ['settings', 'categories', 'items', 'tables', 'events', 'orders', 'reservations', 'feedback', 'contacts'].forEach((c) => (json.data[c] || []).forEach((d) => ops.push({ col: c, id: d.id, data: d })));
      await S.adapter.batch(ops);
      return ops.length;
    },
    online() { return S.adapter && S.adapter.online ? S.adapter.online() : navigator.onLine; }
  });

  function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /* ---------- Preact hooks ---------- */
  const { useState, useEffect, useReducer, useRef } = window.htmPreact;
  KT.useCols = function (cols) {
    const [, force] = useReducer((x) => x + 1, 0);
    const colsRef = useRef(cols); colsRef.current = cols;
    useEffect(() => S.subscribe((c) => { if (c === 'session' || colsRef.current.includes(c)) force(); }), []);
    return S;
  };
  KT.useNow = function (ms) {
    const [now, setNow] = useState(Date.now());
    useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms || 15000); return () => clearInterval(t); }, [ms]);
    return now;
  };
  KT.useLang = function () {
    const [, force] = useReducer((x) => x + 1, 0);
    useEffect(() => KT.i18n.on(() => force()), []);
    return KT.i18n.lang;
  };
  KT.PUBLIC_COLS = PUBLIC_COLS;
})();
