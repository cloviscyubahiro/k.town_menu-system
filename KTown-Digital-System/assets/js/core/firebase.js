/* K.Town — Live mode: Firebase (Cloud Firestore + Authentication).
   Turned on by filling in firebase-config.js. See docs/GO-LIVE.html. */
(function () {
  'use strict';
  const KT = (window.KT = window.KT || {});
  const U = KT.U;

  const COLS = ['settings', 'categories', 'items', 'tables', 'events', 'orders', 'reservations', 'feedback', 'contacts', 'requests', 'staff'];
  const PUBLIC = ['settings', 'categories', 'items', 'tables', 'events'];
  const TIMED = ['orders', 'requests', 'reservations', 'feedback', 'contacts'];

  KT.createFirebaseAdapter = async function (cfg) {
    const v = cfg.sdkVersion || '13.0.0';
    const base = 'https://www.gstatic.com/firebasejs/' + v + '/';
    const [appM, fsM, authM] = await Promise.all([
      import(base + 'firebase-app.js'),
      import(base + 'firebase-firestore.js'),
      import(base + 'firebase-auth.js')
    ]);
    return KT.makeFirebaseAdapter({ appM, fsM, authM }, cfg);
  };

  // Separate from loading so tests can pass in the SDK directly.
  KT.makeFirebaseAdapter = function (sdk, cfg) {
    const F = sdk.fsM, Au = sdk.authM;
    const app = sdk.appM.initializeApp(cfg, cfg.appName || '[DEFAULT]');
    let db;
    try {
      const opts = { ignoreUndefinedProperties: true };
      if (!cfg.memoryCache && F.persistentLocalCache) opts.localCache = F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() });
      db = F.initializeFirestore(app, opts);
    } catch (e) {
      console.warn('[K.Town] offline cache unavailable, using memory', e);
      db = F.getFirestore(app);
    }
    if (cfg.emulator) F.connectFirestoreEmulator(db, cfg.emulator.host, cfg.emulator.port);
    const auth = Au.getAuth(app);
    if (cfg.authEmulator) Au.connectAuthEmulator(auth, cfg.authEmulator, { disableWarnings: true });

    const cache = {}; COLS.forEach((c) => { cache[c] = new Map(); });
    const listeners = new Set();
    const emit = (c) => listeners.forEach((f) => { try { f(c); } catch (e) { console.error(e); } });
    let unsubs = [];
    let watchKey = null;
    let user = null;
    let staffInfo = null;
    let firstPublic = new Set();
    let resolveAuth;
    const authReady = new Promise((r) => { resolveAuth = r; });

    /* ----- conversions ----- */
    function toApp(v) {
      if (v && typeof v.toMillis === 'function') return v.toMillis();
      if (Array.isArray(v)) return v.map(toApp);
      if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach((k) => { o[k] = toApp(v[k]); }); return o; }
      return v;
    }
    function strip(data) { const d = Object.assign({}, data); delete d.id; return d; }
    function forCreate(col, data, fresh) {
      const d = strip(data);
      if (TIMED.includes(col)) {
        // Guests use the server clock (phones can be wrong); staff devices use their own clock so the
        // new record shows in their lists at once, even before the server confirms.
        if (fresh) d.createdAt = staffInfo && staffInfo.role ? F.Timestamp.fromMillis(Date.now()) : F.serverTimestamp();
        else if (typeof d.createdAt === 'number') d.createdAt = F.Timestamp.fromMillis(d.createdAt);
        else if (!d.createdAt) d.createdAt = F.serverTimestamp();
      }
      return d;
    }
    function forPatch(patch) {
      const p = {};
      Object.keys(patch).forEach((k) => { p[k] = patch[k] === KT.DELETE ? F.deleteField() : patch[k]; });
      return p;
    }
    const ts = (ms) => F.Timestamp.fromMillis(ms);

    /* ----- listening ----- */
    function listen(col, q) {
      const u = F.onSnapshot(q, (snap) => {
        snap.docChanges().forEach((ch) => {
          if (ch.type === 'removed') cache[col].delete(ch.doc.id);
          else cache[col].set(ch.doc.id, Object.assign(toApp(ch.doc.data({ serverTimestamps: 'estimate' })), { id: ch.doc.id }));
        });
        firstPublic.add(col);
        emit(col);
      }, (err) => {
        console.warn('[K.Town] live sync error on', col, err && err.code, err && err.message);
        A.lastError = { col, code: err && err.code, message: err && err.message };
        emit('error');
      });
      unsubs.push(u);
    }
    function watch(role) {
      const key = (role || 'guest') + ':' + (user ? user.uid : '');
      if (key === watchKey) return;
      watchKey = key;
      unsubs.forEach((u) => { try { u(); } catch (e) { /* ignore */ } });
      unsubs = [];
      COLS.forEach((c) => { if (!PUBLIC.includes(c)) cache[c].clear(); });
      PUBLIC.forEach((c) => listen(c, F.collection(db, c)));
      const day0 = U.startOfDay();
      if (role && role !== 'guest') {
        listen('orders', F.query(F.collection(db, 'orders'), F.where('createdAt', '>=', ts(day0 - 8 * U.DAY))));
        listen('requests', F.query(F.collection(db, 'requests'), F.where('createdAt', '>=', ts(day0 - U.DAY))));
        listen('reservations', F.query(F.collection(db, 'reservations'), F.where('createdAt', '>=', ts(day0 - 60 * U.DAY))));
        listen('feedback', F.query(F.collection(db, 'feedback'), F.where('createdAt', '>=', ts(day0 - 120 * U.DAY))));
        if (role === 'admin') {
          listen('contacts', F.collection(db, 'contacts'));
          listen('staff', F.collection(db, 'staff'));
        }
      } else if (user) {
        ['orders', 'reservations', 'requests'].forEach((c) => listen(c, F.query(F.collection(db, c), F.where('guestUid', '==', user.uid))));
      }
      COLS.forEach(emit);
      emit('session');
    }

    async function loadStaff(u) {
      const email = String(u.email || '').toLowerCase();
      if (!email) return { email: '', role: null };
      const ref = F.doc(db, 'staff', email);
      try {
        const snap = await F.getDoc(ref);
        if (snap.exists()) { const d = snap.data(); return { email, role: d.role || null, name: d.name || email }; }
      } catch (e) { /* fall through */ }
      // First sign-in of an owner email listed in the security rules creates its own admin record.
      try {
        await withTimeout(F.setDoc(ref, { role: 'admin', name: email.split('@')[0], createdAt: F.serverTimestamp() }), 15000);
        return { email, role: 'admin', name: email.split('@')[0] };
      } catch (e) {
        return { email, role: null, name: email };
      }
    }

    let authGen = 0; // each sign-in or sign-out bumps this, so a slow staff lookup can't undo a later sign-out
    Au.onAuthStateChanged(auth, async (u) => {
      const gen = ++authGen;
      if (!u) {
        user = null; staffInfo = null;
        try { await Au.signInAnonymously(auth); } catch (e) {
          console.warn('[K.Town] guest sign-in failed', e && e.code);
          A.lastError = { code: e.code, message: authMessage(e) };
          watch('guest'); resolveAuth();
        }
        return;
      }
      user = u;
      const info = u.isAnonymous ? null : await loadStaff(u);
      if (gen !== authGen) return;
      staffInfo = info;
      watch(staffInfo && staffInfo.role ? staffInfo.role : 'guest');
      resolveAuth();
    });

    function authMessage(e) {
      const c = (e && e.code) || '';
      if (/network-request-failed/.test(c)) return 'No internet connection. Check the connection and try again.';
      if (/invalid-credential|wrong-password|user-not-found|invalid-email|invalid-login/.test(c)) return 'Email or password is not right.';
      if (/too-many-requests/.test(c)) return 'Too many attempts. Wait a minute, then try again.';
      if (/operation-not-allowed|admin-restricted/.test(c)) return 'This sign-in method is not turned on in Firebase Authentication (see docs/GO-LIVE.html, step 3).';
      if (/user-disabled/.test(c)) return 'This account has been disabled in Firebase.';
      return (e && e.message) || String(e);
    }
    function withTimeout(p, ms, msg) {
      return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg || 'No connection. Please try again.')), ms))]);
    }
    // Writes show on screen at once (Firestore keeps them locally and syncs when online).
    // Resolve when the server confirms, or after a short wait if the connection is slow (the write stays queued).
    // A refusal that arrives later is reported through onChange('error').
    function settle(p, ms) {
      return new Promise((resolve, reject) => {
        let done = false;
        const t = setTimeout(() => { if (!done) { done = true; resolve({ queued: true }); } }, ms || 2500);
        p.then((v) => { if (!done) { done = true; clearTimeout(t); resolve(v); } }, (e) => {
          if (!done) { done = true; clearTimeout(t); reject(friendly(e)); }
          else { A.lastError = { code: e && e.code, message: friendly(e).message }; emit('error'); }
        });
      });
    }
    function friendly(e) {
      const code = (e && e.code) || '';
      if (/permission-denied/.test(code)) return Object.assign(new Error('The live database refused this change. Check the security rules and that this account has the right staff role.'), { code });
      if (/unavailable|deadline/.test(code)) return Object.assign(new Error('No connection to the live database. Please try again.'), { code });
      return e instanceof Error ? e : new Error(String(e));
    }
    // Fresh documents get the server's clock; older dates (paper feedback, imports) keep their own.
    const isFresh = (data) => typeof data.createdAt !== 'number' || Math.abs(Date.now() - data.createdAt) < 5 * 60e3;

    const A = {
      kind: 'live',
      lastError: null,
      async init() { await withTimeout(authReady, 12000).catch(() => { watch('guest'); }); },
      onChange(f) { listeners.add(f); return () => listeners.delete(f); },
      watch,
      list: (c) => Array.from(cache[c].values()),
      get: (c, id) => cache[c].get(id) || null,
      async add(c, data) {
        const ref = data.id ? F.doc(db, c, data.id) : F.doc(F.collection(db, c));
        await settle(F.setDoc(ref, forCreate(c, data, isFresh(data))));
        return ref.id;
      },
      async set(c, id, data) { await settle(F.setDoc(F.doc(db, c, id), forCreate(c, data, false))); return id; },
      async update(c, id, patch) { await settle(F.updateDoc(F.doc(db, c, id), forPatch(patch))); },
      async remove(c, id) { await settle(F.deleteDoc(F.doc(db, c, id))); },
      async batch(ops) {
        const commits = [];
        for (let i = 0; i < ops.length; i += 400) {
          const b = F.writeBatch(db);
          ops.slice(i, i + 400).forEach((op) => {
            const ref = F.doc(db, op.col, op.id);
            if (op.del) b.delete(ref); else b.set(ref, forCreate(op.col, op.data, false));
          });
          commits.push(b.commit());
        }
        await settle(Promise.all(commits), 6000);
      },
      async createOrder(order) {
        const counterRef = F.doc(db, 'counters', order.day);
        const orderRef = F.doc(F.collection(db, 'orders'));
        const data = forCreate('orders', order, !order.sample);
        const number = await withTimeout(F.runTransaction(db, async (tx) => {
          const c = await tx.get(counterRef);
          const n = (c.exists() ? (c.data().n || 0) : 0) + 1;
          if (c.exists()) tx.update(counterRef, { n }); else tx.set(counterRef, { n });
          tx.set(orderRef, Object.assign({}, data, { number: n }));
          return n;
        }), cfg.orderTimeout || 20000, 'Your order didn’t go through. Check your connection and try again.').catch((e) => { throw friendly(e); });
        return { id: orderRef.id, number };
      },
      async resetAll() { throw new Error('Reset is not available in live mode.'); },
      async bumpCounter(day, n) {
        const ref = F.doc(db, 'counters', day);
        await F.runTransaction(db, async (tx) => { const c = await tx.get(ref); const cur = c.exists() ? (c.data().n || 0) : 0; if (cur < n) { if (c.exists()) tx.update(ref, { n }); else tx.set(ref, { n }); } });
      },
      isEmpty: () => firstPublic.has('settings') && cache.settings.size === 0,
      uid: () => (user ? user.uid : ''),
      staff: () => (staffInfo && staffInfo.role ? { role: staffInfo.role, email: staffInfo.email, name: staffInfo.name } : null),
      staffProblem: () => (staffInfo && !staffInfo.role ? staffInfo.email : null),
      async signInStaff(email, password) {
        let cred;
        try { cred = await Au.signInWithEmailAndPassword(auth, String(email || '').trim(), String(password || '')); }
        catch (e) { throw Object.assign(new Error(authMessage(e)), { code: e && e.code }); }
        user = cred.user;
        const info = await loadStaff(cred.user);
        if (!user || user.uid !== cred.user.uid) throw new Error('Signed out. Please sign in again.');
        staffInfo = info;
        if (!staffInfo.role) {
          const e = new Error('This account is signed in but is not set up as staff. Ask the owner to add ' + staffInfo.email + ' in Admin → Settings → Staff.');
          throw e;
        }
        watch(staffInfo.role);
        return { role: staffInfo.role, email: staffInfo.email, name: staffInfo.name };
      },
      async signOutStaff() { staffInfo = null; await Au.signOut(auth); },
      online: () => navigator.onLine,
      _db: db, _auth: auth
    };
    return A;
  };
})();
