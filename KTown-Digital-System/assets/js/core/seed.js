/* K.Town — starting data. Used the first time the system opens.
   After that, change everything from Admin → Menu, Tables, Events and Settings. */
(function () {
  'use strict';
  const KT = (window.KT = window.KT || {});
  const IMG = 'assets/img/photos/';

  KT.SEED_VERSION = 1;

  KT.SEED = {
    settings: {
      main: {
        name: 'K.Town',
        tagline: 'Liquor Boutique',
        address: 'Gitesi, Karongi (Kibuye), Western Province, Rwanda',
        phone: '+250791207272',           // from the Google Maps listing; change in Settings
        whatsapp: '+250791207272',
        mapUrl: 'https://www.google.com/maps/search/?api=1&query=K.%20Town%20Liquor%20Boutique%2C%20Karongi&query_place_id=ChIJcY_dJM8p3RkRTlAkl2A_5cw',
        reviewUrl: 'https://search.google.com/local/writereview?placeid=ChIJcY_dJM8p3RkRTlAkl2A_5cw',
        hours: { open: '09:00', close: '23:30' },
        momo: { number: '0783094301', name: 'K.Town', quickDial: true, ussd: '*182*1*1*{number}*{amount}#' },
        payCash: true,
        payCard: false,
        currencyNote: true,
        showUsd: true,
        usdRate: 1475,
        wifi: { name: '', password: '' },
        orderFlow: 'reception',          // 'reception' = reception confirms first, 'direct' = straight to kitchen
        ordering: true,                  // false pauses phone ordering (menu stays visible)
        serviceRequests: true,           // guests can call staff / ask for the bill
        reservations: true,
        cover: IMG + 'cover-sunset.webp',
        publicUrl: '',                   // the web address printed in QR codes, e.g. https://ktown-karongi.netlify.app
        pins: { admin: '1234', reception: '1111', kitchen: '2222' }, // demo mode only
        languages: ['en', 'fr', 'rw']
      }
    },

    categories: [
      { id: 'fresh-juice', name: 'Fresh juice', name_fr: 'Jus frais', name_rw: 'Imitobe',
        desc: 'Made fresh and served chilled.', desc_fr: 'Préparés minute, servis bien frais.', desc_rw: 'Bikorwa bishya, bitangwa bikonje.',
        image: IMG + 'cat-juice.webp', sort: 1 },
      { id: 'coffee', name: 'Coffee', name_fr: 'Cafés', name_rw: 'Ikawa',
        desc: 'Espresso drinks, hot or over ice.', desc_fr: 'Cafés chauds ou glacés.', desc_rw: 'Ikawa ishyushye cyangwa ikonje.',
        image: IMG + 'cat-coffee.webp', sort: 2 },
      { id: 'tea', name: 'Tea', name_fr: 'Thés', name_rw: 'Icyayi',
        desc: 'From classic black tea to warming spice.', desc_fr: 'Du thé noir classique au thé épicé.', desc_rw: 'Icyayi gisanzwe n’icy’ibirungo.',
        image: IMG + 'cat-tea.webp', sort: 3 }
    ],

    items: [
      // Fresh juice — prices from the K.Town handwritten menu
      { id: 'watermelon-juice', cat: 'fresh-juice', sort: 1, price: 4000, name: 'Watermelon juice', name_fr: 'Jus de pastèque',
        desc: 'Fresh watermelon, blended and served chilled.', desc_fr: 'Pastèque fraîche, mixée et servie bien fraîche.', image: IMG + 'item-watermelon.webp' },
      { id: 'mango-juice', cat: 'fresh-juice', sort: 2, price: 5000, name: 'Mango juice', name_fr: 'Jus de mangue',
        desc: 'Ripe mango, blended smooth.', desc_fr: 'Mangue mûre, mixée onctueuse.', image: IMG + 'item-mango.webp', tag: 'popular' },
      { id: 'pineapple-juice', cat: 'fresh-juice', sort: 3, price: 4000, name: 'Pineapple juice', name_fr: 'Jus d’ananas',
        desc: 'Fresh pineapple, sweet and tangy.', desc_fr: 'Ananas frais, doux et acidulé.' },
      { id: 'orange-juice', cat: 'fresh-juice', sort: 4, price: 6000, name: 'Orange juice', name_fr: 'Jus d’orange',
        desc: 'Freshly squeezed oranges.', desc_fr: 'Oranges fraîchement pressées.' },

      // Coffee
      { id: 'black-coffee', cat: 'coffee', sort: 1, price: 2000, name: 'Black coffee', name_fr: 'Café noir',
        desc: 'Hot, strong and simple.', desc_fr: 'Chaud, corsé et simple.' },
      { id: 'ice-americano', cat: 'coffee', sort: 2, price: 4000, name: 'Ice Americano', name_fr: 'Americano glacé',
        desc: 'Espresso and cold water over ice.', desc_fr: 'Espresso et eau fraîche sur glace.', image: IMG + 'item-ice-americano.webp' },
      { id: 'cappuccino', cat: 'coffee', sort: 3, price: 3500, name: 'Cappuccino', name_fr: 'Cappuccino',
        desc: 'Espresso with steamed milk and a thick layer of foam.', desc_fr: 'Espresso, lait chaud et belle couche de mousse.', image: IMG + 'item-cappuccino.webp' },
      { id: 'ice-cappuccino', cat: 'coffee', sort: 4, price: 5000, name: 'Ice cappuccino', name_fr: 'Cappuccino glacé',
        desc: 'Espresso, cold milk and foam over ice.', desc_fr: 'Espresso, lait froid et mousse sur glace.', image: IMG + 'item-ice-cappuccino.webp' },
      { id: 'cafe-latte', cat: 'coffee', sort: 5, price: 3000, name: 'Café latte', name_fr: 'Café latte',
        desc: 'Espresso with plenty of steamed milk.', desc_fr: 'Espresso avec beaucoup de lait chaud.' },
      { id: 'ice-latte', cat: 'coffee', sort: 6, price: 4500, name: 'Ice latte', name_fr: 'Latte glacé',
        desc: 'Espresso poured over cold milk and ice.', desc_fr: 'Espresso versé sur lait froid et glace.', image: IMG + 'item-ice-latte.webp', tag: 'popular' },
      { id: 'ice-lemonade-coffee', cat: 'coffee', sort: 7, price: 5000, name: 'Ice lemonade coffee', name_fr: 'Café limonade glacé',
        desc: 'Espresso over lemonade and ice. Bright and refreshing.', desc_fr: 'Espresso sur limonade et glace. Vif et rafraîchissant.', tag: 'house' },

      // Tea
      { id: 'black-tea', cat: 'tea', sort: 1, price: 2000, name: 'Black tea', name_fr: 'Thé noir',
        desc: 'Classic black tea.', desc_fr: 'Thé noir classique.', image: IMG + 'item-tea.webp' },
      { id: 'lemon-tea', cat: 'tea', sort: 2, price: 2500, name: 'Lemon tea', name_fr: 'Thé au citron',
        desc: 'Black tea with fresh lemon.', desc_fr: 'Thé noir au citron frais.' },
      { id: 'mint-tea', cat: 'tea', sort: 3, price: 3000, name: 'Mint tea', name_fr: 'Thé à la menthe',
        desc: 'Fresh mint leaves, steeped hot.', desc_fr: 'Feuilles de menthe fraîche infusées.' },
      { id: 'spice-tea', cat: 'tea', sort: 4, price: 3500, name: 'Spice tea', name_fr: 'Thé aux épices',
        desc: 'Black tea brewed with warming spices.', desc_fr: 'Thé noir infusé aux épices.' }
    ],

    tables: [
      { id: 'T1', name: 'Table 1', seats: 4, sort: 1, active: true },
      { id: 'T2', name: 'Table 2', seats: 4, sort: 2, active: true },
      { id: 'T3', name: 'Table 3', seats: 4, sort: 3, active: true },
      { id: 'T4', name: 'Table 4', seats: 4, sort: 4, active: true }
    ],

    events: [
      { id: 'welcome-digital', type: 'news', active: true, sort: 1,
        title: 'Order from your table', title_fr: 'Commandez depuis votre table', title_rw: 'Tumiza wicaye ku meza yawe',
        body: 'Scan, choose, and we bring it to you. Pay with MoMo when you’re done.',
        body_fr: 'Scannez, choisissez, nous vous servons. Payez avec MoMo à la fin.',
        body_rw: 'Sikana, uhitemo, tukuzanire. Wishyure na MoMo urangije.' }
    ]
  };
})();
