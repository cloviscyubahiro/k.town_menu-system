-- =============================================================================
-- K.Town reference data: roles, permissions, the order life cycle, settings,
-- the 4 tables and the menu from the handwritten K.Town menu.
-- Load once, right after schema.sql. It contains no people and no passwords:
-- the owner's account is created on first start-up with their own PIN.
-- =============================================================================

-- ---------- Roles ----------
INSERT INTO roles (id, code, name, description) VALUES
  (1, 'admin',     'Owner',     'Runs the business. Can do everything, from any device.'),
  (2, 'reception', 'Reception', 'Front desk: accepts orders, serves, takes payments, answers tables.'),
  (3, 'kitchen',   'Kitchen',   'Prepares orders and says when something is sold out.');

-- ---------- Permissions (grantable = the owner may give it to one person) ----------
INSERT INTO permissions (code, area, description, grantable) VALUES
  ('orders.view',             'Orders',    'See all orders, their history and whether they are paid', 0),
  ('orders.create',           'Orders',    'Enter an order at the counter for a guest without a phone', 0),
  ('orders.confirm',          'Orders',    'Accept a guest''s order and send it to the kitchen', 0),
  ('orders.prepare',          'Orders',    'See the kitchen queue; start, finish or undo preparing an order', 0),
  ('orders.serve',            'Orders',    'Mark a ready order as served', 0),
  ('orders.cancel',           'Orders',    'Cancel or decline an order, with a reason', 0),
  ('invoices.view',           'Billing',   'See and print invoices', 0),
  ('payments.record',         'Billing',   'Record MoMo, cash and card payments and answer "I''ve paid" claims', 0),
  ('payments.void',           'Billing',   'Undo a wrongly recorded payment', 0),
  ('menu.manage',             'Menu',      'Add, change and remove menu items, sections and prices', 0),
  ('menu.availability',       'Menu',      'Mark menu items sold out or available again', 1),
  ('inventory.view',          'Inventory', 'See stock levels, stock history and stock alerts', 1),
  ('inventory.receive',       'Inventory', 'Record stock coming in (purchases and opening counts)', 1),
  ('inventory.adjust',        'Inventory', 'Correct stock quantities after a count, and record waste', 1),
  ('inventory.manage',        'Inventory', 'Add or remove stock products, set reorder levels and recipes', 1),
  ('employees.manage',        'People',    'Add, change and remove employees, and give or take access', 0),
  ('tables.manage',           'Venue',     'Add, rename and remove tables; print QR codes', 0),
  ('announcements.manage',    'Venue',     'Publish events, promotions and news on the menu', 1),
  ('reservations.manage',     'Venue',     'Confirm, decline and seat table bookings', 1),
  ('service_requests.handle', 'Venue',     'See and answer "call staff" and "bill" requests', 0),
  ('feedback.view',           'Guests',    'Read guest feedback', 1),
  ('feedback.enter',          'Guests',    'Type in paper feedback cards', 0),
  ('customers.view',          'Guests',    'See guests who agreed to hear about events, with their contact details', 0),
  ('reports.view',            'Reports',   'See sales reports and the weekly report', 1),
  ('settings.manage',         'Settings',  'Change business settings: MoMo number, opening hours, languages', 0);

-- The owner (admin) has every permission automatically; no rows needed.
-- Reception: no stock access at all (inventory.* is not here).
INSERT INTO role_permissions (role_id, permission_code) VALUES
  (2, 'orders.view'), (2, 'orders.create'), (2, 'orders.confirm'), (2, 'orders.serve'), (2, 'orders.cancel'),
  (2, 'invoices.view'), (2, 'payments.record'),
  (2, 'service_requests.handle'), (2, 'reservations.manage'), (2, 'feedback.enter'),
  (3, 'orders.prepare'), (3, 'menu.availability');

-- ---------- Order life cycle ----------
-- placed -> confirmed (reception) -> preparing -> ready (kitchen) -> served (reception)
-- Cancelling always needs a reason. A guest may cancel only before reception accepts.
INSERT INTO order_status_transitions (from_status, to_status, permission_code, guest_allowed) VALUES
  ('placed',    'confirmed', 'orders.confirm', 0),
  ('placed',    'cancelled', 'orders.cancel',  1),
  ('confirmed', 'preparing', 'orders.prepare', 0),
  ('confirmed', 'ready',     'orders.prepare', 0),  -- quick items: nothing to cook
  ('confirmed', 'cancelled', 'orders.cancel',  0),  -- stock goes back
  ('preparing', 'confirmed', 'orders.prepare', 0),  -- "started by mistake"
  ('preparing', 'ready',     'orders.prepare', 0),
  ('preparing', 'cancelled', 'orders.cancel',  0),  -- stock stays used
  ('ready',     'preparing', 'orders.prepare', 0),  -- "not ready yet"
  ('ready',     'served',    'orders.serve',   0),
  ('ready',     'cancelled', 'orders.cancel',  0);

-- ---------- Settings (values are JSON) ----------
INSERT INTO settings (key, value, description) VALUES
  ('business.name',                     '"K.Town"',                 'Name shown to guests'),
  ('business.tagline',                  '"Liquor Boutique"',        'Shown under the name'),
  ('business.address',                  '"Gitesi, Karongi (Kibuye), Western Province, Rwanda"', 'Shown on the menu and invoices'),
  ('business.phone',                    '"+250791207272"',          'To confirm with the owner (taken from Google Maps)'),
  ('business.whatsapp',                 '"+250791207272"',          'To confirm with the owner'),
  ('business.opening_hours',            '{"open":"09:00","close":"23:30"}', 'Kigali time; to confirm with the owner'),
  ('business.map_url',                  '"https://www.google.com/maps/search/?api=1&query=K.%20Town%20Liquor%20Boutique%2C%20Karongi&query_place_id=ChIJcY_dJM8p3RkRTlAkl2A_5cw"', 'Find us'),
  ('business.review_url',               '"https://search.google.com/local/writereview?placeid=ChIJcY_dJM8p3RkRTlAkl2A_5cw"', 'Review us on Google'),
  ('payment.momo_number',               '"0783094301"',             'MTN MoMo number guests pay to'),
  ('payment.momo_account_name',         '"K.Town"',                 'Name MoMo shows when paying; to confirm with the owner'),
  ('payment.momo_ussd_pattern',         '"*182*1*1*{number}*{amount}#"', 'One-tap MoMo dial pattern; test on an Android phone'),
  ('payment.methods',                   '["momo","cash"]',          'Accepted ways to pay'),
  ('menu.languages',                    '["en","fr","rw"]',         'Languages guests can choose'),
  ('menu.show_usd',                     'true',                     'Show approximate US dollar prices'),
  ('menu.usd_rate',                     '1475',                     'Rwandan francs per US dollar'),
  ('ordering.guest_orders_enabled',     'true',                     'false = phone ordering paused, menu still visible'),
  ('ordering.service_requests_enabled', 'true',                     '"Call staff" and "Ask for the bill" buttons'),
  ('ordering.reservations_enabled',     'false',                    'Table bookings from the menu (phase 2)'),
  ('guest_wifi.name',                   '""',                       'Optional: shown to guests'),
  ('guest_wifi.password',               '""',                       'Optional: shown to guests');

-- ---------- Tables (codes are printed in the QR codes and never change) ----------
INSERT INTO dining_tables (id, code, name, seats, sort_order) VALUES
  (1, 'T1', 'Table 1', 4, 1),
  (2, 'T2', 'Table 2', 4, 2),
  (3, 'T3', 'Table 3', 4, 3),
  (4, 'T4', 'Table 4', 4, 4);

-- ---------- Menu (prices from the handwritten K.Town menu) ----------
INSERT INTO menu_categories (id, name, description, image_path, sort_order) VALUES
  (1, 'Fresh juice', 'Made fresh and served chilled.',          'assets/img/photos/cat-juice.webp',  1),
  (2, 'Coffee',      'Espresso drinks, hot or over ice.',        'assets/img/photos/cat-coffee.webp', 2),
  (3, 'Tea',         'From classic black tea to warming spice.', 'assets/img/photos/cat-tea.webp',    3);

INSERT INTO menu_category_translations (category_id, lang, name, description) VALUES
  (1, 'fr', 'Jus frais', 'Préparés minute, servis bien frais.'),
  (1, 'rw', 'Imitobe',   'Bikorwa bishya, bitangwa bikonje.'),
  (2, 'fr', 'Cafés',     'Cafés chauds ou glacés.'),
  (2, 'rw', 'Ikawa',     'Ikawa ishyushye cyangwa ikonje.'),
  (3, 'fr', 'Thés',      'Du thé noir classique au thé épicé.'),
  (3, 'rw', 'Icyayi',    'Icyayi gisanzwe n’icy’ibirungo.');

INSERT INTO menu_items (id, category_id, name, description, price_rwf, image_path, tag, sort_order) VALUES
  ( 1, 1, 'Watermelon juice',    'Fresh watermelon, blended and served chilled.',          4000, 'assets/img/photos/item-watermelon.webp',     NULL,            1),
  ( 2, 1, 'Mango juice',         'Ripe mango, blended smooth.',                            5000, 'assets/img/photos/item-mango.webp',          'popular',       2),
  ( 3, 1, 'Pineapple juice',     'Fresh pineapple, sweet and tangy.',                      4000, NULL,                                         NULL,            3),
  ( 4, 1, 'Orange juice',        'Freshly squeezed oranges.',                              6000, NULL,                                         NULL,            4),
  ( 5, 2, 'Black coffee',        'Hot, strong and simple.',                                2000, NULL,                                         NULL,            1),
  ( 6, 2, 'Ice Americano',       'Espresso and cold water over ice.',                      4000, 'assets/img/photos/item-ice-americano.webp',  NULL,            2),
  ( 7, 2, 'Cappuccino',          'Espresso with steamed milk and a thick layer of foam.',  3500, 'assets/img/photos/item-cappuccino.webp',     NULL,            3),
  ( 8, 2, 'Ice cappuccino',      'Espresso, cold milk and foam over ice.',                 5000, 'assets/img/photos/item-ice-cappuccino.webp', NULL,            4),
  ( 9, 2, 'Café latte',          'Espresso with plenty of steamed milk.',                  3000, NULL,                                         NULL,            5),
  (10, 2, 'Ice latte',           'Espresso poured over cold milk and ice.',                4500, 'assets/img/photos/item-ice-latte.webp',      'popular',       6),
  (11, 2, 'Ice lemonade coffee', 'Espresso over lemonade and ice. Bright and refreshing.', 5000, NULL,                                         'house_special', 7),
  (12, 3, 'Black tea',           'Classic black tea.',                                     2000, 'assets/img/photos/item-tea.webp',            NULL,            1),
  (13, 3, 'Lemon tea',           'Black tea with fresh lemon.',                            2500, NULL,                                         NULL,            2),
  (14, 3, 'Mint tea',            'Fresh mint leaves, steeped hot.',                        3000, NULL,                                         NULL,            3),
  (15, 3, 'Spice tea',           'Black tea brewed with warming spices.',                  3500, NULL,                                         NULL,            4);

-- French names and descriptions. Kinyarwanda ones are added by the owner in
-- Menu (until then the menu shows the English text in Kinyarwanda mode).
INSERT INTO menu_item_translations (menu_item_id, lang, name, description) VALUES
  ( 1, 'fr', 'Jus de pastèque',     'Pastèque fraîche, mixée et servie bien fraîche.'),
  ( 2, 'fr', 'Jus de mangue',       'Mangue mûre, mixée onctueuse.'),
  ( 3, 'fr', 'Jus d’ananas',        'Ananas frais, doux et acidulé.'),
  ( 4, 'fr', 'Jus d’orange',        'Oranges fraîchement pressées.'),
  ( 5, 'fr', 'Café noir',           'Chaud, corsé et simple.'),
  ( 6, 'fr', 'Americano glacé',     'Espresso et eau fraîche sur glace.'),
  ( 7, 'fr', 'Cappuccino',          'Espresso, lait chaud et belle couche de mousse.'),
  ( 8, 'fr', 'Cappuccino glacé',    'Espresso, lait froid et mousse sur glace.'),
  ( 9, 'fr', 'Café latte',          'Espresso avec beaucoup de lait chaud.'),
  (10, 'fr', 'Latte glacé',         'Espresso versé sur lait froid et glace.'),
  (11, 'fr', 'Café limonade glacé', 'Espresso sur limonade et glace. Vif et rafraîchissant.'),
  (12, 'fr', 'Thé noir',            'Thé noir classique.'),
  (13, 'fr', 'Thé au citron',       'Thé noir au citron frais.'),
  (14, 'fr', 'Thé à la menthe',     'Feuilles de menthe fraîche infusées.'),
  (15, 'fr', 'Thé aux épices',      'Thé noir infusé aux épices.');
