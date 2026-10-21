/* K.Town — print designs made from the live data: table QR cards, poster, printed menu, feedback cards.
   Open, then print at 100% ("Actual size") on A4. Or "Save as PDF" to send to a print shop. */
(function () {
  'use strict';
  const KT = (window.KT = window.KT || {});
  const { html, useEffect, useRef, useState } = window.htmPreact;
  const { Icon, Raw } = KT.ui;
  const U = KT.U, S = KT.store;
  const PIMG = 'assets/img/print/';
  const CARD_PHOTOS = ['print-ice-latte.jpg', 'print-mango.jpg', 'print-watermelon.jpg', 'print-ice-americano.jpg'];
  const RATE_GLASS = '<svg viewBox="0 0 40 52" aria-hidden="true"><path d="M6 4 H34 Q35 22 28 28 Q24 32 21 32.6 V46 H28 V49 H12 V46 H19 V32.6 Q16 32 12 28 Q5 22 6 4 Z" fill="none" stroke="#751228" stroke-width="1.6" stroke-linejoin="round"/></svg>';

  function PrintApp({ route }) {
    KT.useCols(['settings', 'tables', 'items', 'categories']);
    useEffect(() => { U.loadCss('assets/css/print.css'); }, []);
    const kind = route.parts[1] || 'tables';
    const p = route.params;
    const st = S.settings;
    const base = U.publicBase(st);
    const local = U.isLocalAddress(base);
    const titles = { tables: 'Table QR cards', poster: 'Menu poster', menu: 'Printed menu', feedback: 'Feedback cards' };
    let pages;
    if (kind === 'poster') pages = [html`<${Poster} st=${st} />`];
    else if (kind === 'menu') pages = [html`<${PrintedMenu} st=${st} lang=${p.get('lang') || 'en'} />`];
    else if (kind === 'feedback') pages = [html`<div class="cards4">${[0, 1, 2, 3].map((i) => html`<${FeedbackCard} key=${i} st=${st} />`)}</div>`];
    else {
      let tables = S.list('tables').filter((t) => t.active !== false);
      if (p.get('only')) tables = tables.filter((t) => t.id === p.get('only'));
      const chunks = [];
      for (let i = 0; i < tables.length; i += 4) chunks.push(tables.slice(i, i + 4));
      if (!chunks.length) chunks.push([]);
      pages = chunks.map((list, ci) => html`<div class="cards4">${list.map((t, i) => html`<${TableCard} key=${t.id} st=${st} t=${t} photo=${CARD_PHOTOS[(ci * 4 + i) % CARD_PHOTOS.length]} />`)}</div>`);
    }
    return html`<div class="print-root">
      <div class="print-bar">
        <h1>${titles[kind] || 'Print'}</h1>
        ${kind === 'menu' ? html`<div class="seg">${[['en', 'English'], ['fr', 'Français'], ['both', 'Both']].map(([l, n]) => html`<button key=${l} aria-pressed=${(p.get('lang') || 'en') === l ? 'true' : 'false'} onClick=${() => KT.go('print/menu?lang=' + l)}>${n}</button>`)}</div>` : null}
        <span class="muted">A4, print at 100% (actual size)${kind === 'tables' || kind === 'feedback' ? ', then cut along the dashed lines' : ''}.</span>
        <span class="grow"></span>
        ${local && kind !== 'feedback' ? html`<span class="notice" style="padding:6px 10px"><${Icon} name="circle-alert" />QR codes point to ${location.protocol === 'file:' ? 'a file on this computer' : base}. Set the web address in Admin, Tables, before printing for guests.</span>` : null}
        <button class="btn btn-primary" onClick=${() => window.print()}><${Icon} name="printer" />Print or save PDF</button>
        <a class="btn" href="#/admin/tables">Back to admin</a>
      </div>
      ${pages.map((pg, i) => html`<div class="a4" key=${i}>${pg}${kind === 'tables' || kind === 'feedback' ? html`<div class="cut v"></div><div class="cut h"></div>` : null}</div>`)}
    </div>`;
  }

  function Lock({ white, cls }) {
    return html`<div class=${'lock ' + (cls || '')}>
      <${Raw} cls="m" svg=${KT.BRAND.mark({ black: white ? '#fff' : '#000', wine: white ? '#d68a97' : '#751228' })} />
      <${Raw} cls="w" svg=${KT.BRAND.wordmark({ color: white ? '#fff' : '#751228' })} />
    </div>`;
  }
  const pour = (amp) => html`<svg class="pour" viewBox="0 0 1000 60" preserveAspectRatio="none" aria-hidden="true"><path d=${KT.BRAND.pourPath(amp)} /></svg>`;

  function TableCard({ st, t, photo }) {
    const momo = st.momo || {};
    return html`<div class="tcard">
      <div class="tcard-photo"><img src=${PIMG + photo} alt="" /><${Lock} white=${true} />${pour(30)}</div>
      <div class="tcard-body">
        <div class="tcard-qr"><${Raw} svg=${KT.qr.svg(U.menuUrl(st, t.id), { margin: 1, title: 'Menu QR code for ' + t.name })} /></div>
        <div class="tcard-table">${t.name}</div>
        <div class="tcard-cta">Scan to see the menu and order from your table</div>
        <div class="tcard-langs"><i>Scannez pour voir la carte et commander</i><br /><i>Sikana urebe menu, utumize wicaye</i></div>
      </div>
      <div class="tcard-foot">
        ${momo.number ? html`<span class="momo-chip"><span class="y">MoMo</span>Pay with MoMo <b>${U.prettyMomo(momo.number)}</b></span>` : null}
        ${st.wifi && st.wifi.name ? html`<span>Wi-Fi <b>${st.wifi.name}</b>${st.wifi.password ? ', ' + st.wifi.password : ''}</span>` : null}
      </div>
    </div>`;
  }

  function Poster({ st }) {
    const momo = st.momo || {};
    return html`<div class="poster">
      <div class="poster-photo"><img src=${PIMG + 'print-sunset.jpg'} alt="" /><${Lock} white=${true} />
        <div class="sub">${st.tagline}, Karongi on Lake Kivu</div>${pour(34)}</div>
      <div class="poster-body">
        <div>
          <h2>Our menu is on your phone</h2>
          <p class="fr">La carte sur votre téléphone. Menu iri kuri telefoni yawe.</p>
          <ol class="poster-steps">
            <li><span>Scan the code with your phone camera<small>No app needed</small></span></li>
            <li><span>Choose your drinks and your table<small>We bring your order to you</small></span></li>
            <li><span>Pay with MoMo when it arrives<small>${momo.number ? U.prettyMomo(momo.number) + ', ' + (momo.name || st.name) : 'Or pay at the counter'}</small></span></li>
          </ol>
        </div>
        <div><div class="poster-qr"><${Raw} svg=${KT.qr.svg(U.menuUrl(st, ''), { margin: 1, title: 'K.Town menu QR code' })} /></div>
          <p class="poster-qr-cap">Point your camera here</p></div>
      </div>
      <div class="poster-foot">
        <span><b>Open daily</b> ${st.hours ? st.hours.open + '–' + st.hours.close : ''}</span>
        <span>${st.phone ? U.prettyPhone(st.phone) : ''}</span>
        <span>${(st.address || '').split(',').slice(0, 2).join(',')}</span>
      </div>
    </div>`;
  }

  function PrintedMenu({ st, lang }) {
    const cats = S.list('categories').filter((c) => c.active !== false);
    const items = S.list('items').filter((i) => i.hidden !== true);
    const momo = st.momo || {};
    const nm = (r, f) => (lang === 'fr' ? (r[f + '_fr'] || r[f]) : r[f]);
    const ruleD = 'M0,30 C120,10 240,8 330,26 C460,52 600,54 1000,40';
    // Two balanced columns, sections kept whole: biggest sections first, each to the shorter column
    const sized = cats.map((c, i) => ({ c, i, h: 3 + items.filter((x) => x.cat === c.id).length * (lang === 'both' ? 2.6 : 2) })).filter((x) => x.h > 3);
    const cols = [[], []], heights = [0, 0];
    sized.slice().sort((a, b) => b.h - a.h).forEach((x) => { const k = heights[0] <= heights[1] ? 0 : 1; cols[k].push(x); heights[k] += x.h; });
    cols.forEach((c) => c.sort((a, b) => a.i - b.i));
    if (cols[1].length && (!cols[0].length || cols[1][0].i < cols[0][0].i)) cols.reverse();
    const columns = cols.map((c) => c.map((x) => x.c));
    // Shrink a little if a long menu would not fit on one page
    const colsRef = useRef();
    const [zoom, setZoom] = useState(1);
    useEffect(() => {
      const el = colsRef.current; if (!el) return;
      const t = setTimeout(() => { if (el.scrollHeight > el.clientHeight + 2 && zoom > 0.66) setZoom(Math.max(0.66, +(zoom - 0.04).toFixed(2))); }, 60);
      return () => clearTimeout(t);
    });
    return html`<div class="pmenu">
      <header class="pmenu-head">
        <${Raw} cls="logo" svg=${KT.BRAND.logo()} />
        <div class="pm-tag">${st.tagline}</div>
        <div class="place">${lang === 'fr' ? 'Karongi, au bord du lac Kivu' : 'Karongi, on Lake Kivu'}</div>
      </header>
      <svg class="pmenu-rule" viewBox="0 0 1000 60" preserveAspectRatio="none" aria-hidden="true"><path d=${ruleD} /></svg>
      <div class="pmenu-cols" ref=${colsRef} style=${'zoom:' + zoom}>
        ${columns.map((colCats, ci) => html`<div class="pmenu-col" key=${ci}>${colCats.map((c) => {
          const list = items.filter((i) => i.cat === c.id);
          return html`<section class="pmenu-sec" key=${c.id}>
            <h2>${nm(c, 'name')}${lang === 'both' && c.name_fr && c.name_fr !== c.name ? html` <span class="alt">/ ${c.name_fr}</span>` : null}</h2>
            ${nm(c, 'desc') ? html`<p class="sd">${nm(c, 'desc')}</p>` : null}
            ${list.map((it) => html`<div class="pmenu-it" key=${it.id}>
              <div class="pmenu-row"><span class="n">${nm(it, 'name')}</span><span class="dots"></span><span class="p">${U.money(it.price, lang === 'fr' ? 'fr' : 'en')}</span></div>
              ${lang === 'both' && it.name_fr && it.name_fr !== it.name ? html`<div class="alt">${it.name_fr}</div>` : null}
              ${nm(it, 'desc') ? html`<div class="d">${nm(it, 'desc')}</div>` : null}
            </div>`)}
          </section>`;
        })}</div>`)}
      </div>
      <footer class="pmenu-foot">
        <div class="qr"><${Raw} svg=${KT.qr.svg(U.menuUrl(st, ''), { margin: 1, title: 'Menu QR code' })} /></div>
        <div class="t"><b>${lang === 'fr' ? 'Commandez depuis votre téléphone' : 'Order from your phone'}</b><br />
          ${lang === 'fr' ? 'Scannez le code : la carte, les nouveautés et les événements.' : 'Scan the code for the menu, what’s new and upcoming events.'}<br />
          ${st.hours ? (lang === 'fr' ? 'Ouvert tous les jours ' : 'Open daily ') + st.hours.open + '–' + st.hours.close : ''}${st.phone ? ', ' + U.prettyPhone(st.phone) : ''}</div>
        ${momo.number ? html`<div class="pay">${lang === 'fr' ? 'Payer avec MTN MoMo' : 'Pay with MTN MoMo'}<b>${U.prettyMomo(momo.number)}</b>${momo.name || st.name}</div>` : null}
      </footer>
      <p class="pmenu-note">${lang === 'fr' ? 'Prix en francs rwandais (RWF), service compris.' : 'Prices in Rwandan francs (RWF).'}</p>
    </div>`;
  }

  function FeedbackCard({ st }) {
    return html`<div class="fcard">
      <div class="top"><${Raw} cls="m" svg=${KT.BRAND.mark()} /><${Raw} cls="w" svg=${KT.BRAND.wordmark({ color: '#751228' })} /></div>
      <h2>How was your visit?</h2>
      <p class="sub">Comment était votre visite ? Mwakiriwe mute?</p>
      <div class="rate">${[1, 2, 3, 4, 5].map((n) => html`<span key=${n}><${Raw} svg=${RATE_GLASS} />${n}</span>`)}</div>
      <p class="sub" style="text-align:center">Circle a glass: 1 = poor, 5 = excellent</p>
      <p class="q">What did you enjoy?</p><div class="lines"><div></div><div></div></div>
      <p class="q">What could we do better?</p><div class="lines"><div></div><div></div></div>
      <div class="contact"><div>Name</div><div>Phone</div></div>
      <div class="tick"><i></i>Tell me about ${st.name} events and offers</div>
      <p class="thanks">Thank you. Merci. Murakoze.</p>
    </div>`;
  }

  KT.views.PrintApp = PrintApp;
})();
