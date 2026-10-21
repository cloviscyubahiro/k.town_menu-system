# K.Town digital system

Digital menu, table ordering, reception, kitchen and owner dashboards, branded QR codes and print designs for **K.Town Liquor Boutique**, Gitesi, Karongi (Lake Kivu, Rwanda).

Open **START-HERE.html** first.

## Run it

- **Quickest:** double-click `index.html` (Chrome or Edge). Demo mode: data stays in that browser, and every screen opened in it stays in sync.
- **Presenting:** `index.html#/demo` shows the guest phone, reception, kitchen and owner dashboard side by side.
- **Live (all devices):** follow `docs/GO-LIVE.html` (free Firebase project + Netlify or Firebase Hosting).

| Screen | Address | Demo PIN |
|---|---|---|
| Guest menu | `index.html?t=T1` (table code from the QR) | – |
| Reception | `index.html#/reception` | 1111 |
| Kitchen | `index.html#/kitchen` | 2222 |
| Owner dashboard | `index.html#/admin` | 1234 |
| Demo wall | `index.html#/demo` | – (demo mode only) |
| Print designs | `index.html#/print/tables`, `/poster`, `/menu`, `/feedback` | owner |

## How the code is organised

Plain HTML, CSS and JavaScript. No build step, no install. Preact + htm (vendored) for the screens.

```
index.html                 the whole app (hash routes for staff screens)
firebase-config.js         live-mode switch (null = demo mode)
firestore.rules            security rules for live mode
assets/css/                base.css (tokens), guest.css, staff.css, print.css
assets/js/core/            util, i18n (EN/FR/RW), seed (starting menu), store (data + demo adapter),
                           firebase (live adapter), qr (branded QR), ui (shared components), brand, icons
assets/js/views/           guest, staff (sign-in, shared), reception, kitchen, admin, print, demo
assets/img/                brand (logo files), photos (menu), print (print photos), icons
print-kit/                 ready-to-print PDFs
docs/                      GO-LIVE.html, BRAND-GUIDE.html (+ PDF)
```

- Change the starting menu in `assets/js/core/seed.js` (only used the first time; afterwards use Owner dashboard → Menu).
- Change guest texts in `assets/js/core/i18n.js`.
- Colours and fonts are tokens at the top of `assets/css/base.css`.
- After changing files on a live site, bump the version (now `1.0.1`) in `index.html`, `sw.js` and `assets/js/app.js` so phones refresh.

## Changes in 1.0.1 (21 Oct 2026, tested before the presentation)

- Demo wall scales itself to the screen, so the guest phone, reception, kitchen and owner all show on 1280 to 1600 px laptops (before, the owner panel was hidden below about 1700 px).
- Reception on phones and on the demo wall: the four totals and the order tabs wrap instead of being cut off.
- Owner menu editor on the phone: one tidy line per item (name, price, order arrows, on/off).
- Settings: the Ordering box no longer stretches with big gaps. Phone notices wrap their button underneath.
- Menu search matches the start of words and ignores accents ("ice" finds iced drinks, not every juice; "cafe" finds "Café latte").
- Sample week covers last week and this week, so both weekly reports are full; pressing it again replaces it instead of doubling it.
- Small fixes: "Just now" instead of "just now ago" on reception alerts; the owner's "money received" note no longer says "first sales" after sales; links that would leave the demo wall are hidden inside it; QR address examples now match the printed cards (ktown-karongi.netlify.app).

## Credits

Fonts: Jost and Cormorant Garamond (SIL Open Font License). Icons: Lucide (ISC). Preact (MIT) and htm (Apache 2.0). QR encoder: qrcode-generator by Kazuhiko Arase (MIT). Photos: K.Town.
