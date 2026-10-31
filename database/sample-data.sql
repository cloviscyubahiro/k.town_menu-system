-- =============================================================================
-- DEVELOPMENT AND TEST DATA ONLY. Never load this into the real K.Town database.
-- Four staff accounts, stock for the current menu and example recipes, so the
-- app and the tests have something to work with.
-- The PIN hashes are placeholders: the real app stores argon2id/bcrypt hashes.
-- The recipes are EXAMPLES: K.Town's real quantities come from the kitchen.
-- =============================================================================

-- ---------- Staff (the first account is the owner) ----------
INSERT INTO employees (id, full_name, phone, role_id, job_title, pin_hash, must_change_pin, created_by) VALUES
  (1, 'Owner (demo)',          '+250788000001', 1, 'Owner',     'DEV-ONLY-not-a-real-hash-0001', 0, NULL),
  (2, 'Aline Uwase (demo)',    '+250788000002', 2, 'Reception', 'DEV-ONLY-not-a-real-hash-0002', 0, 1),
  (3, 'Eric Habimana (demo)',  '+250788000003', 3, 'Kitchen',   'DEV-ONLY-not-a-real-hash-0003', 0, 1),
  (4, 'Grace Mukamana (demo)', '+250788000004', 3, 'Head chef', 'DEV-ONLY-not-a-real-hash-0004', 0, 1);

-- The owner gives the head chef access to the stock (the kitchen role alone has none).
INSERT INTO employee_permission_grants (employee_id, permission_code, granted_by) VALUES
  (4, 'inventory.view', 1), (4, 'inventory.receive', 1), (4, 'inventory.adjust', 1);

-- ---------- Stock products (quantities are whole grams, millilitres or pieces) ----------
INSERT INTO stock_items (id, name, category, base_unit, pack_name, pack_size, reorder_level, created_by, updated_by) VALUES
  ( 1, 'Mangoes',        'fruit',      'g',     'kg',    1000, 2000, 1, 1),
  ( 2, 'Watermelon',     'fruit',      'g',     'kg',    1000, 3000, 1, 1),
  ( 3, 'Pineapple',      'fruit',      'g',     'kg',    1000, 2000, 1, 1),
  ( 4, 'Oranges',        'fruit',      'piece', 'bag',     20,   12, 1, 1),
  ( 5, 'Fresh milk',     'dairy',      'ml',    'litre', 1000, 2000, 1, 1),
  ( 6, 'Coffee beans',   'coffee_tea', 'g',     'bag',   1000,  300, 1, 1),
  ( 7, 'Black tea bags', 'coffee_tea', 'piece', 'box',    100,   20, 1, 1),
  ( 8, 'Lemons',         'fruit',      'g',     'kg',    1000,  200, 1, 1),
  ( 9, 'Fresh mint',     'other',      'g',     NULL,    NULL,   50, 1, 1),
  (10, 'Spice mix',      'dry_goods',  'g',     'jar',    250,   50, 1, 1);

-- Opening count, recorded by the head chef (she has inventory.receive).
INSERT INTO stock_movements (stock_item_id, movement_type, quantity_delta, reason, created_by) VALUES
  ( 1, 'opening', 5000, 'First stock count', 4),
  ( 2, 'opening', 8000, 'First stock count', 4),
  ( 3, 'opening', 4000, 'First stock count', 4),
  ( 4, 'opening',   30, 'First stock count', 4),
  ( 5, 'opening', 6000, 'First stock count', 4),
  ( 6, 'opening', 2000, 'First stock count', 4),
  ( 7, 'opening',  100, 'First stock count', 4),
  ( 8, 'opening', 1000, 'First stock count', 4),
  ( 9, 'opening',  300, 'First stock count', 4),
  (10, 'opening',  250, 'First stock count', 4);

-- ---------- Example recipes: what one portion takes out of stock ----------
INSERT INTO menu_item_components (menu_item_id, stock_item_id, quantity_per_item) VALUES
  ( 1,  2, 400),             -- Watermelon juice: 400 g watermelon
  ( 2,  1, 300),             -- Mango juice: 300 g mangoes
  ( 3,  3, 350),             -- Pineapple juice: 350 g pineapple
  ( 4,  4,   4),             -- Orange juice: 4 oranges
  ( 5,  6,  18),             -- Black coffee: 18 g coffee
  ( 6,  6,  18),             -- Ice Americano
  ( 7,  6,  18), ( 7, 5, 150), -- Cappuccino: coffee + 150 ml milk
  ( 8,  6,  18), ( 8, 5, 150), -- Ice cappuccino
  ( 9,  6,  18), ( 9, 5, 200), -- Café latte: coffee + 200 ml milk
  (10,  6,  18), (10, 5, 200), -- Ice latte
  (11,  6,  18), (11, 8,  40), -- Ice lemonade coffee: coffee + 40 g lemon
  (12,  7,   1),             -- Black tea: 1 tea bag
  (13,  7,   1), (13, 8,  20), -- Lemon tea: tea bag + 20 g lemon
  (14,  9,  10),             -- Mint tea: 10 g mint
  (15,  7,   1), (15, 10,  5); -- Spice tea: tea bag + 5 g spices

-- ---------- The first headline on the menu ----------
INSERT INTO announcements (id, kind, title, body, created_by) VALUES
  (1, 'news', 'Order from your table', 'Scan, choose, and we bring it to you. Pay with MoMo when you''re done.', 1);
INSERT INTO announcement_translations (announcement_id, lang, title, body) VALUES
  (1, 'fr', 'Commandez depuis votre table', 'Scannez, choisissez, nous vous servons. Payez avec MoMo à la fin.'),
  (1, 'rw', 'Tumiza wicaye ku meza yawe',  'Sikana, uhitemo, tukuzanire. Wishyure na MoMo urangije.');
