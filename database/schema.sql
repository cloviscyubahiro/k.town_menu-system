-- =============================================================================
-- K.Town database schema (SQLite)
--
-- Schema version 1. Needs SQLite 3.37 or newer (STRICT tables, generated columns).
-- Read docs/database-design.md first: it explains every table and rule below.
--
-- The app must run these on EVERY new connection (SQLite does not remember them):
--   PRAGMA foreign_keys = ON;     -- without it, foreign keys are not checked at all
--   PRAGMA journal_mode = WAL;    -- readers never wait for the writer
--   PRAGMA busy_timeout = 5000;   -- wait up to 5 s for a lock instead of failing
--   PRAGMA synchronous = NORMAL;  -- safe with WAL, much faster than FULL
--
-- Conventions
--   * ids are INTEGER PRIMARY KEY; money is whole Rwandan francs in *_rwf columns;
--     stock quantities are whole numbers of the item's base unit (piece, g or ml).
--   * times are UTC text 'YYYY-MM-DDTHH:MM:SS.SSSZ'. A "business date" is the
--     Kigali date (UTC+2, no daylight saving) with the day starting at 05:00, so a
--     sale at 01:30 belongs to the night before: date(t, '+2 hours', '-5 hours').
--   * nothing that money, stock or history depends on is ever deleted: rows are
--     switched off (is_active = 0, status = 'removed') or corrected with a new row.
--   * every rule the database enforces raises an error starting with a code such
--     as 'KT_FORBIDDEN:'. The API turns these codes into clear messages.
-- =============================================================================

PRAGMA user_version = 1;

-- =============================================================================
-- 1. PEOPLE AND ACCESS
-- =============================================================================

-- A role is a job: owner (admin), reception, kitchen. More can be added as rows.
CREATE TABLE roles (
  id          INTEGER PRIMARY KEY,
  code        TEXT    NOT NULL UNIQUE CHECK (code GLOB '[a-z]*' AND code NOT GLOB '*[^a-z_]*'),
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT ''
) STRICT;

-- Every action that needs permission. 'grantable' = the owner may give it to one
-- employee on top of their role (for example inventory access for the head chef).
CREATE TABLE permissions (
  code        TEXT    PRIMARY KEY CHECK (code GLOB '[a-z]*.[a-z]*'),
  area        TEXT    NOT NULL,
  description TEXT    NOT NULL,
  grantable   INTEGER NOT NULL DEFAULT 0 CHECK (grantable IN (0, 1))
) STRICT, WITHOUT ROWID;

-- Permissions each role has by default. The admin role is not listed here: it
-- always has every permission (see v_employee_permissions).
CREATE TABLE role_permissions (
  role_id         INTEGER NOT NULL REFERENCES roles (id),
  permission_code TEXT    NOT NULL REFERENCES permissions (code),
  PRIMARY KEY (role_id, permission_code)
) STRICT, WITHOUT ROWID;

CREATE TABLE employees (
  id              INTEGER PRIMARY KEY,
  full_name       TEXT    NOT NULL CHECK (length(trim(full_name)) BETWEEN 2 AND 80),
  -- Rwandan mobile number in international form, e.g. +250788123456
  phone           TEXT    NOT NULL UNIQUE CHECK (phone GLOB '+2507[2389][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
  email           TEXT    COLLATE NOCASE UNIQUE CHECK (email IS NULL OR email GLOB '?*@?*.?*'),
  role_id         INTEGER NOT NULL REFERENCES roles (id),
  -- shown on screens only (e.g. 'Head chef'); access comes from the role and grants
  job_title       TEXT    NOT NULL DEFAULT '' CHECK (length(job_title) <= 40),
  -- hash of the PIN or password (argon2id or bcrypt). The PIN itself is never stored.
  pin_hash        TEXT    NOT NULL CHECK (length(pin_hash) >= 20),
  must_change_pin INTEGER NOT NULL DEFAULT 1 CHECK (must_change_pin IN (0, 1)),
  failed_logins   INTEGER NOT NULL DEFAULT 0 CHECK (failed_logins >= 0),
  locked_until    TEXT,
  status          TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'removed')),
  removed_at      TEXT,
  version         INTEGER NOT NULL DEFAULT 1,  -- for "someone else changed this" checks
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by      INTEGER REFERENCES employees (id),   -- NULL only for the very first (owner) account
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by      INTEGER REFERENCES employees (id),
  CHECK ((status = 'removed') = (removed_at IS NOT NULL))
) STRICT;
CREATE INDEX employees_by_role ON employees (role_id);

-- Extra permissions given to one employee. Never deleted: revoking fills revoked_*.
CREATE TABLE employee_permission_grants (
  id              INTEGER PRIMARY KEY,
  employee_id     INTEGER NOT NULL REFERENCES employees (id),
  permission_code TEXT    NOT NULL REFERENCES permissions (code),
  granted_by      INTEGER NOT NULL REFERENCES employees (id),
  granted_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  revoked_by      INTEGER REFERENCES employees (id),
  revoked_at      TEXT,
  CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
) STRICT;
CREATE UNIQUE INDEX employee_grants_one_active ON employee_permission_grants (employee_id, permission_code) WHERE revoked_at IS NULL;

-- Signed-in devices. The token lives only in the device's cookie; we keep its SHA-256.
CREATE TABLE employee_sessions (
  id           INTEGER PRIMARY KEY,
  employee_id  INTEGER NOT NULL REFERENCES employees (id),
  token_hash   TEXT    NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  device_label TEXT    NOT NULL DEFAULT '' CHECK (length(device_label) <= 60),
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at   TEXT    NOT NULL,
  revoked_at   TEXT,
  CHECK (expires_at > created_at)
) STRICT;
CREATE INDEX employee_sessions_active ON employee_sessions (employee_id) WHERE revoked_at IS NULL;

-- =============================================================================
-- 2. VENUE AND MENU
-- =============================================================================

-- 'code' is printed inside the table's QR code and never changes; 'name' can.
CREATE TABLE dining_tables (
  id         INTEGER PRIMARY KEY,
  code       TEXT    NOT NULL UNIQUE CHECK (length(code) BETWEEN 1 AND 12 AND code NOT GLOB '*[^A-Z0-9-]*'),
  name       TEXT    NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
  seats      INTEGER NOT NULL DEFAULT 4 CHECK (seats BETWEEN 1 AND 50),
  is_active  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE UNIQUE INDEX dining_tables_active_name ON dining_tables (name COLLATE NOCASE) WHERE is_active = 1;

CREATE TABLE menu_categories (
  id          INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
  description TEXT    NOT NULL DEFAULT '' CHECK (length(description) <= 200),
  image_path  TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE UNIQUE INDEX menu_categories_active_name ON menu_categories (name COLLATE NOCASE) WHERE is_active = 1;

-- English lives in the main table; French and Kinyarwanda here.
CREATE TABLE menu_category_translations (
  category_id INTEGER NOT NULL REFERENCES menu_categories (id) ON DELETE CASCADE,
  lang        TEXT    NOT NULL CHECK (lang IN ('fr', 'rw')),
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  PRIMARY KEY (category_id, lang)
) STRICT, WITHOUT ROWID;

CREATE TABLE menu_items (
  id                 INTEGER PRIMARY KEY,
  category_id        INTEGER NOT NULL REFERENCES menu_categories (id),
  name               TEXT    NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
  description        TEXT    NOT NULL DEFAULT '' CHECK (length(description) <= 300),
  price_rwf          INTEGER NOT NULL CHECK (price_rwf BETWEEN 1 AND 10000000),
  image_path         TEXT,
  tag                TEXT    CHECK (tag IN ('popular', 'new', 'house_special')),
  -- manual "sold out" switch (kitchen or owner). Stock can also make an item unavailable.
  is_available       INTEGER NOT NULL DEFAULT 1 CHECK (is_available IN (0, 1)),
  unavailable_reason TEXT    NOT NULL DEFAULT '' CHECK (length(unavailable_reason) <= 120),
  -- 0 = taken off the menu. The row stays because old orders point to it.
  is_active          INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order         INTEGER NOT NULL DEFAULT 0,
  version            INTEGER NOT NULL DEFAULT 1,
  created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by         INTEGER REFERENCES employees (id),
  updated_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by         INTEGER REFERENCES employees (id)
) STRICT;
CREATE UNIQUE INDEX menu_items_active_name ON menu_items (name COLLATE NOCASE) WHERE is_active = 1;
CREATE INDEX menu_items_by_category ON menu_items (category_id, sort_order);

CREATE TABLE menu_item_translations (
  menu_item_id INTEGER NOT NULL REFERENCES menu_items (id) ON DELETE CASCADE,
  lang         TEXT    NOT NULL CHECK (lang IN ('fr', 'rw')),
  name         TEXT    NOT NULL,
  description  TEXT    NOT NULL DEFAULT '',
  PRIMARY KEY (menu_item_id, lang)
) STRICT, WITHOUT ROWID;

-- Written by a trigger every time a price changes: who changed it, from what, to what.
CREATE TABLE menu_item_price_history (
  id            INTEGER PRIMARY KEY,
  menu_item_id  INTEGER NOT NULL REFERENCES menu_items (id),
  old_price_rwf INTEGER NOT NULL,
  new_price_rwf INTEGER NOT NULL,
  changed_by    INTEGER NOT NULL REFERENCES employees (id),
  changed_at    TEXT    NOT NULL
) STRICT;
CREATE INDEX menu_item_price_history_by_item ON menu_item_price_history (menu_item_id, changed_at);

-- =============================================================================
-- 3. INVENTORY
-- =============================================================================

-- Something K.Town buys and keeps: a bottle, a crate of beer, mangoes, milk.
-- quantity_on_hand is changed ONLY by stock_movements (a trigger keeps it in step).
CREATE TABLE stock_items (
  id               INTEGER PRIMARY KEY,
  name             TEXT    NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 60),
  sku              TEXT    UNIQUE CHECK (sku IS NULL OR length(sku) BETWEEN 1 AND 40),  -- barcode or short code
  category         TEXT    NOT NULL CHECK (category IN ('spirits', 'wine', 'beer', 'soft_drinks', 'fruit', 'dairy', 'coffee_tea', 'dry_goods', 'other')),
  base_unit        TEXT    NOT NULL CHECK (base_unit IN ('piece', 'g', 'ml')),
  pack_name        TEXT    CHECK (pack_name IS NULL OR length(pack_name) BETWEEN 1 AND 20), -- how it is bought: 'crate', 'bottle', 'kg'
  pack_size        INTEGER CHECK (pack_size > 0),                                          -- base units in one pack: 24, 750, 1000
  quantity_on_hand INTEGER NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  reorder_level    INTEGER NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  last_movement_id INTEGER,
  is_active        INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  version          INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by       INTEGER NOT NULL REFERENCES employees (id),
  updated_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by       INTEGER NOT NULL REFERENCES employees (id),
  CHECK ((pack_name IS NULL) = (pack_size IS NULL))
) STRICT;
CREATE UNIQUE INDEX stock_items_active_name ON stock_items (name COLLATE NOCASE) WHERE is_active = 1;

-- The stock ledger. Every change of stock is one row; rows are never edited or
-- deleted (a mistake is fixed with an 'adjustment' row), so the history always adds up.
CREATE TABLE stock_movements (
  id             INTEGER PRIMARY KEY,
  stock_item_id  INTEGER NOT NULL REFERENCES stock_items (id),
  movement_type  TEXT    NOT NULL CHECK (movement_type IN ('opening', 'purchase', 'adjustment', 'waste', 'sale', 'sale_reversal')),
  quantity_delta INTEGER NOT NULL CHECK (quantity_delta <> 0),  -- + in, - out, in base units
  total_cost_rwf INTEGER CHECK (total_cost_rwf >= 0),           -- what the purchase cost in total
  order_item_id  INTEGER REFERENCES order_items (id),           -- the order line that used it (sales)
  reason         TEXT    NOT NULL DEFAULT '' CHECK (length(reason) <= 200),
  reference      TEXT    NOT NULL DEFAULT '' CHECK (length(reference) <= 60), -- e.g. supplier receipt number
  created_by     INTEGER NOT NULL REFERENCES employees (id),
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (CASE movement_type
           WHEN 'opening'       THEN quantity_delta > 0
           WHEN 'purchase'      THEN quantity_delta > 0
           WHEN 'waste'         THEN quantity_delta < 0
           WHEN 'sale'          THEN quantity_delta < 0
           WHEN 'sale_reversal' THEN quantity_delta > 0
           ELSE 1 END),
  CHECK ((movement_type IN ('sale', 'sale_reversal')) = (order_item_id IS NOT NULL)),
  CHECK (movement_type = 'purchase' OR total_cost_rwf IS NULL),
  CHECK (movement_type NOT IN ('adjustment', 'waste') OR length(trim(reason)) > 0)
) STRICT;
CREATE INDEX stock_movements_by_item ON stock_movements (stock_item_id, id);
CREATE INDEX stock_movements_by_time ON stock_movements (created_at);
CREATE UNIQUE INDEX stock_movements_one_opening ON stock_movements (stock_item_id) WHERE movement_type = 'opening';
CREATE UNIQUE INDEX stock_movements_once_per_line ON stock_movements (order_item_id, stock_item_id, movement_type) WHERE order_item_id IS NOT NULL;

-- Recipe: what one portion of a menu item takes out of stock. Bottled drinks have
-- one component (1 bottle); a mango juice might take 300 g of mangoes.
-- Menu items with no components are not stock-tracked.
CREATE TABLE menu_item_components (
  menu_item_id      INTEGER NOT NULL REFERENCES menu_items (id),
  stock_item_id     INTEGER NOT NULL REFERENCES stock_items (id),
  quantity_per_item INTEGER NOT NULL CHECK (quantity_per_item > 0),
  PRIMARY KEY (menu_item_id, stock_item_id)
) STRICT, WITHOUT ROWID;
CREATE INDEX menu_item_components_by_stock ON menu_item_components (stock_item_id);

-- Alerts for staff. Low/out of stock are raised by the database itself; "sold out"
-- is raised when the kitchen switches a menu item off.
CREATE TABLE notifications (
  id             INTEGER PRIMARY KEY,
  kind           TEXT    NOT NULL CHECK (kind IN ('low_stock', 'out_of_stock', 'menu_item_sold_out')),
  stock_item_id  INTEGER REFERENCES stock_items (id),
  menu_item_id   INTEGER REFERENCES menu_items (id),
  message        TEXT    NOT NULL,
  for_permission TEXT    NOT NULL REFERENCES permissions (code), -- everyone with this permission sees it
  created_by     INTEGER REFERENCES employees (id),              -- NULL = raised by the database
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_by    INTEGER REFERENCES employees (id),
  resolved_at    TEXT,
  CHECK ((resolved_at IS NULL) = (resolved_by IS NULL)),
  CHECK (stock_item_id IS NOT NULL OR menu_item_id IS NOT NULL)
) STRICT;
CREATE INDEX notifications_open ON notifications (for_permission, created_at) WHERE resolved_at IS NULL;

-- =============================================================================
-- 4. GUESTS
-- =============================================================================

-- Guests who left a phone number or email (to hear about events, or with a booking).
CREATE TABLE customers (
  id               INTEGER PRIMARY KEY,
  name             TEXT    NOT NULL DEFAULT '' CHECK (length(name) <= 60),
  -- international form; tourists can have foreign numbers
  phone            TEXT    UNIQUE CHECK (phone IS NULL OR (phone GLOB '+[1-9]*' AND length(phone) BETWEEN 8 AND 16 AND substr(phone, 2) NOT GLOB '*[^0-9]*')),
  email            TEXT    COLLATE NOCASE UNIQUE CHECK (email IS NULL OR email GLOB '?*@?*.?*'),
  marketing_opt_in INTEGER NOT NULL DEFAULT 0 CHECK (marketing_opt_in IN (0, 1)),
  opted_in_at      TEXT,
  opted_out_at     TEXT,
  created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (phone IS NOT NULL OR email IS NOT NULL),
  CHECK (marketing_opt_in = 0 OR opted_in_at IS NOT NULL)
) STRICT;

-- =============================================================================
-- 5. ORDERS
-- =============================================================================

CREATE TABLE orders (
  id                   INTEGER PRIMARY KEY,
  created_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  business_date        TEXT    NOT NULL GENERATED ALWAYS AS (date(created_at, '+2 hours', '-5 hours')) STORED,
  order_number         INTEGER,   -- ticket number of the day (#1, #2 ...), set by a trigger
  -- the guest's phone keeps a random token to follow the order; we keep its SHA-256
  tracking_token_hash  TEXT    NOT NULL UNIQUE CHECK (length(tracking_token_hash) = 64),
  channel              TEXT    NOT NULL CHECK (channel IN ('qr', 'counter')),  -- guest's phone, or typed in by staff
  table_id             INTEGER REFERENCES dining_tables (id),                  -- NULL = takeaway
  customer_id          INTEGER REFERENCES customers (id),
  guest_name           TEXT    NOT NULL DEFAULT '' CHECK (length(guest_name) <= 60),
  created_by           INTEGER REFERENCES employees (id),                      -- counter orders only
  -- current status. Changed ONLY by inserting into order_status_events.
  status               TEXT    NOT NULL DEFAULT 'placed' CHECK (status IN ('placed', 'confirmed', 'preparing', 'ready', 'served', 'cancelled')),
  status_changed_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_status_event_id INTEGER,
  UNIQUE (business_date, order_number),
  CHECK ((channel = 'counter') = (created_by IS NOT NULL))
) STRICT;
CREATE INDEX orders_by_date ON orders (business_date);
CREATE INDEX orders_active ON orders (status) WHERE status NOT IN ('served', 'cancelled');
CREATE INDEX orders_by_table ON orders (table_id, business_date);

-- Order lines. Name and price are copied from the menu when the guest orders,
-- so a later price change never changes an order or its invoice.
CREATE TABLE order_items (
  id             INTEGER PRIMARY KEY,
  order_id       INTEGER NOT NULL REFERENCES orders (id),
  menu_item_id   INTEGER NOT NULL REFERENCES menu_items (id),
  item_name      TEXT    NOT NULL,
  unit_price_rwf INTEGER NOT NULL CHECK (unit_price_rwf > 0),
  quantity       INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  line_total_rwf INTEGER NOT NULL GENERATED ALWAYS AS (unit_price_rwf * quantity) STORED,
  note           TEXT    NOT NULL DEFAULT '' CHECK (length(note) <= 140)
) STRICT;
CREATE INDEX order_items_by_order ON order_items (order_id);
CREATE INDEX order_items_by_menu_item ON order_items (menu_item_id);

-- The order life cycle: which status may follow which, and the permission it needs.
CREATE TABLE order_status_transitions (
  from_status     TEXT    NOT NULL,
  to_status       TEXT    NOT NULL,
  permission_code TEXT    NOT NULL REFERENCES permissions (code),
  guest_allowed   INTEGER NOT NULL DEFAULT 0 CHECK (guest_allowed IN (0, 1)),
  PRIMARY KEY (from_status, to_status)
) STRICT, WITHOUT ROWID;

-- The history of every order: one row per step, with who did it and when.
-- This is also how a status changes: insert a row here; triggers check it and
-- update orders.status. There is no other way to move an order forward.
CREATE TABLE order_status_events (
  id                INTEGER PRIMARY KEY,
  order_id          INTEGER NOT NULL REFERENCES orders (id),
  from_status       TEXT,
  to_status         TEXT    NOT NULL,
  actor_type        TEXT    NOT NULL CHECK (actor_type IN ('guest', 'employee')),
  actor_employee_id INTEGER REFERENCES employees (id),
  reason            TEXT    NOT NULL DEFAULT '' CHECK (length(reason) <= 200),
  created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((actor_type = 'employee') = (actor_employee_id IS NOT NULL)),
  CHECK ((from_status IS NULL) = (to_status = 'placed')),
  CHECK (to_status <> 'cancelled' OR length(trim(reason)) > 0)
) STRICT;
CREATE INDEX order_status_events_by_order ON order_status_events (order_id, id);
CREATE INDEX order_status_events_by_time ON order_status_events (created_at);

-- "Call staff" and "Ask for the bill" from a table. One open request per table and kind.
CREATE TABLE service_requests (
  id           INTEGER PRIMARY KEY,
  table_id     INTEGER NOT NULL REFERENCES dining_tables (id),
  request_type TEXT    NOT NULL CHECK (request_type IN ('call_staff', 'bill')),
  status       TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_by  INTEGER REFERENCES employees (id),
  resolved_at  TEXT,
  CHECK ((status = 'done') = (resolved_at IS NOT NULL)),
  CHECK ((status = 'done') = (resolved_by IS NOT NULL))
) STRICT;
CREATE UNIQUE INDEX service_requests_one_open ON service_requests (table_id, request_type) WHERE status = 'open';

-- =============================================================================
-- 6. INVOICES AND PAYMENTS
-- =============================================================================

-- One invoice per order, issued by the database the moment reception accepts the
-- order. Its lines are copied from the order, so it always matches what was ordered.
CREATE TABLE invoices (
  id              INTEGER PRIMARY KEY,
  invoice_seq     INTEGER NOT NULL UNIQUE CHECK (invoice_seq > 0),  -- 1, 2, 3 ... no gaps, never reused
  invoice_number  TEXT    NOT NULL GENERATED ALWAYS AS ('KT-' || printf('%06d', invoice_seq)) STORED,
  order_id        INTEGER NOT NULL UNIQUE REFERENCES orders (id),
  issued_at       TEXT    NOT NULL,
  issued_by       INTEGER NOT NULL REFERENCES employees (id),
  total_rwf       INTEGER NOT NULL CHECK (total_rwf > 0),
  amount_paid_rwf INTEGER NOT NULL DEFAULT 0,  -- always the sum of its payment allocations (trigger-checked)
  voided_at       TEXT,
  voided_by       INTEGER REFERENCES employees (id),
  void_reason     TEXT    NOT NULL DEFAULT '',
  status          TEXT    NOT NULL GENERATED ALWAYS AS (
                    CASE WHEN voided_at IS NOT NULL THEN 'void'
                         WHEN amount_paid_rwf = 0 THEN 'unpaid'
                         WHEN amount_paid_rwf < total_rwf THEN 'partially_paid'
                         ELSE 'paid' END) STORED,
  CHECK (amount_paid_rwf BETWEEN 0 AND total_rwf),
  CHECK ((voided_at IS NULL) = (voided_by IS NULL)),
  CHECK (voided_at IS NULL OR amount_paid_rwf = 0)
) STRICT;
CREATE INDEX invoices_open ON invoices (status) WHERE status IN ('unpaid', 'partially_paid');
CREATE INDEX invoices_by_time ON invoices (issued_at);

CREATE TABLE invoice_lines (
  id             INTEGER PRIMARY KEY,
  invoice_id     INTEGER NOT NULL REFERENCES invoices (id),
  line_no        INTEGER NOT NULL CHECK (line_no > 0),
  order_item_id  INTEGER NOT NULL UNIQUE REFERENCES order_items (id),
  description    TEXT    NOT NULL,
  unit_price_rwf INTEGER NOT NULL CHECK (unit_price_rwf > 0),
  quantity       INTEGER NOT NULL CHECK (quantity > 0),
  line_total_rwf INTEGER NOT NULL GENERATED ALWAYS AS (unit_price_rwf * quantity) STORED,
  UNIQUE (invoice_id, line_no)
) STRICT;

-- Money actually received (checked by staff). One MoMo transfer or cash hand-over
-- is one payment, even when it settles several orders of the same table.
CREATE TABLE payments (
  id          INTEGER PRIMARY KEY,
  method      TEXT    NOT NULL CHECK (method IN ('momo', 'cash', 'card')),
  amount_rwf  INTEGER NOT NULL CHECK (amount_rwf > 0),
  reference   TEXT    NOT NULL DEFAULT '' CHECK (length(reference) <= 60), -- MoMo transaction id from the SMS
  received_by INTEGER NOT NULL REFERENCES employees (id),
  received_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  voided_at   TEXT,
  voided_by   INTEGER REFERENCES employees (id),
  void_reason TEXT    NOT NULL DEFAULT '' CHECK (length(void_reason) <= 200),
  CHECK ((voided_at IS NULL) = (voided_by IS NULL)),
  CHECK (voided_at IS NULL OR length(trim(void_reason)) > 0)
) STRICT;
CREATE INDEX payments_by_time ON payments (received_at);
CREATE UNIQUE INDEX payments_momo_reference_once ON payments (reference) WHERE method = 'momo' AND reference <> '' AND voided_at IS NULL;

-- Which invoices a payment paid, and how much of each.
CREATE TABLE payment_allocations (
  id         INTEGER PRIMARY KEY,
  payment_id INTEGER NOT NULL REFERENCES payments (id),
  invoice_id INTEGER NOT NULL REFERENCES invoices (id),
  amount_rwf INTEGER NOT NULL CHECK (amount_rwf > 0),
  UNIQUE (payment_id, invoice_id)
) STRICT;
CREATE INDEX payment_allocations_by_invoice ON payment_allocations (invoice_id);

-- A guest pressing "I've paid" on their phone. It is a claim, not money: reception
-- checks the MoMo message and records the real payment.
CREATE TABLE payment_claims (
  id          INTEGER PRIMARY KEY,
  invoice_id  INTEGER NOT NULL REFERENCES invoices (id),
  method      TEXT    NOT NULL DEFAULT 'momo' CHECK (method IN ('momo')),
  payer_phone TEXT    CHECK (payer_phone IS NULL OR length(payer_phone) BETWEEN 8 AND 16),
  reference   TEXT    NOT NULL DEFAULT '' CHECK (length(reference) <= 60),
  status      TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_by INTEGER REFERENCES employees (id),
  resolved_at TEXT,
  payment_id  INTEGER REFERENCES payments (id),
  CHECK ((status = 'pending') = (resolved_at IS NULL)),
  CHECK ((status = 'pending') = (resolved_by IS NULL)),
  CHECK (status <> 'confirmed' OR payment_id IS NOT NULL)
) STRICT;
CREATE UNIQUE INDEX payment_claims_one_pending ON payment_claims (invoice_id) WHERE status = 'pending';

-- =============================================================================
-- 7. BOOKINGS, ANNOUNCEMENTS, FEEDBACK, SETTINGS, AUDIT
-- =============================================================================

-- Table bookings (phase 2 in the build plan; designed now so nothing changes later).
CREATE TABLE reservations (
  id           INTEGER PRIMARY KEY,
  guest_name   TEXT    NOT NULL CHECK (length(trim(guest_name)) BETWEEN 2 AND 60),
  phone        TEXT    NOT NULL CHECK (phone GLOB '+[1-9]*' AND length(phone) BETWEEN 8 AND 16 AND substr(phone, 2) NOT GLOB '*[^0-9]*'),
  customer_id  INTEGER REFERENCES customers (id),
  party_size   INTEGER NOT NULL CHECK (party_size BETWEEN 1 AND 50),
  reserved_for TEXT    NOT NULL,                       -- UTC time of the booking
  table_id     INTEGER REFERENCES dining_tables (id),  -- NULL = any table
  note         TEXT    NOT NULL DEFAULT '' CHECK (length(note) <= 200),
  status       TEXT    NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'confirmed', 'declined', 'cancelled', 'seated', 'no_show')),
  handled_by   INTEGER REFERENCES employees (id),
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (status = 'requested' OR handled_by IS NOT NULL)
) STRICT;
CREATE INDEX reservations_upcoming ON reservations (reserved_for) WHERE status IN ('requested', 'confirmed');

-- Headlines at the top of the guest menu: events, promotions, new dishes, news.
CREATE TABLE announcements (
  id            INTEGER PRIMARY KEY,
  kind          TEXT    NOT NULL CHECK (kind IN ('event', 'promotion', 'new_item', 'news')),
  title         TEXT    NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 80),
  body          TEXT    NOT NULL DEFAULT '' CHECK (length(body) <= 400),
  image_path    TEXT,
  event_at      TEXT,     -- when it happens (UTC); NULL for news without a date
  visible_until TEXT,     -- hide after this time; NULL = until switched off
  is_published  INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0, 1)),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_by    INTEGER NOT NULL REFERENCES employees (id),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (visible_until IS NULL OR event_at IS NULL OR visible_until >= event_at)
) STRICT;
CREATE INDEX announcements_published ON announcements (sort_order) WHERE is_published = 1;

CREATE TABLE announcement_translations (
  announcement_id INTEGER NOT NULL REFERENCES announcements (id) ON DELETE CASCADE,
  lang            TEXT    NOT NULL CHECK (lang IN ('fr', 'rw')),
  title           TEXT    NOT NULL,
  body            TEXT    NOT NULL DEFAULT '',
  PRIMARY KEY (announcement_id, lang)
) STRICT, WITHOUT ROWID;

CREATE TABLE feedback (
  id          INTEGER PRIMARY KEY,
  source      TEXT    NOT NULL CHECK (source IN ('digital', 'paper')),
  rating      INTEGER CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT    NOT NULL DEFAULT '' CHECK (length(comment) <= 800),
  order_id    INTEGER REFERENCES orders (id),
  table_id    INTEGER REFERENCES dining_tables (id),
  customer_id INTEGER REFERENCES customers (id),
  entered_by  INTEGER REFERENCES employees (id),   -- who typed in a paper card
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (rating IS NOT NULL OR length(trim(comment)) > 0),
  CHECK ((source = 'paper') = (entered_by IS NOT NULL))
) STRICT;
CREATE INDEX feedback_by_time ON feedback (created_at);
CREATE UNIQUE INDEX feedback_one_per_order ON feedback (order_id) WHERE order_id IS NOT NULL;

-- Business settings as JSON values: MoMo number, opening hours, languages ...
CREATE TABLE settings (
  key         TEXT PRIMARY KEY CHECK (key GLOB '[a-z]*.[a-z_]*'),
  value       TEXT NOT NULL CHECK (json_valid(value)),
  description TEXT NOT NULL DEFAULT '',
  version     INTEGER NOT NULL DEFAULT 1,
  updated_by  INTEGER REFERENCES employees (id),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT, WITHOUT ROWID;

-- Who changed access, settings or money records. Append-only.
CREATE TABLE audit_log (
  id                INTEGER PRIMARY KEY,
  actor_employee_id INTEGER REFERENCES employees (id),
  action            TEXT    NOT NULL CHECK (action GLOB '[a-z]*.[a-z]*'),
  entity_type       TEXT    NOT NULL,
  entity_id         TEXT,
  details           TEXT    NOT NULL DEFAULT '{}' CHECK (json_valid(details)),
  created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX audit_log_by_entity ON audit_log (entity_type, entity_id);
CREATE INDEX audit_log_by_time ON audit_log (created_at);

-- =============================================================================
-- VIEWS
-- =============================================================================

-- What each active employee is allowed to do: role defaults + personal grants.
-- The owner (admin role) can do everything. Suspended or removed people: nothing.
CREATE VIEW v_employee_permissions AS
  SELECT e.id AS employee_id, p.code AS permission_code, 'role' AS source
    FROM employees e JOIN roles r ON r.id = e.role_id JOIN permissions p
   WHERE e.status = 'active' AND r.code = 'admin'
  UNION
  SELECT e.id, rp.permission_code, 'role'
    FROM employees e JOIN role_permissions rp ON rp.role_id = e.role_id
   WHERE e.status = 'active'
  UNION
  SELECT g.employee_id, g.permission_code, 'grant'
    FROM employee_permission_grants g JOIN employees e ON e.id = g.employee_id
   WHERE g.revoked_at IS NULL AND e.status = 'active';

-- Can a guest order this item right now, and how many portions are left in stock?
CREATE VIEW v_menu_availability AS
  SELECT m.id AS menu_item_id,
         m.name,
         m.price_rwf,
         CASE WHEN m.is_active = 0 THEN 'removed'
              WHEN m.is_available = 0 THEN 'sold_out'
              WHEN EXISTS (SELECT 1 FROM menu_item_components c JOIN stock_items s ON s.id = c.stock_item_id
                            WHERE c.menu_item_id = m.id AND (s.is_active = 0 OR s.quantity_on_hand < c.quantity_per_item))
                   THEN 'out_of_stock'
              ELSE 'available' END AS availability,
         (SELECT min(s.quantity_on_hand / c.quantity_per_item)
            FROM menu_item_components c JOIN stock_items s ON s.id = c.stock_item_id
           WHERE c.menu_item_id = m.id) AS portions_left   -- NULL = not stock-tracked
    FROM menu_items m;

-- Orders as reception and the owner see them: table, total, invoice, paid or not.
CREATE VIEW v_order_summary AS
  SELECT o.id AS order_id, o.business_date, o.order_number, o.channel, o.status,
         o.created_at, o.status_changed_at,
         t.code AS table_code, t.name AS table_name, o.guest_name,
         (SELECT count(*) FROM order_items oi WHERE oi.order_id = o.id) AS line_count,
         (SELECT coalesce(sum(oi.line_total_rwf), 0) FROM order_items oi WHERE oi.order_id = o.id) AS total_rwf,
         i.invoice_number,
         coalesce(i.status, CASE WHEN o.status = 'cancelled' THEN 'none' ELSE 'not_issued' END) AS payment_status,
         coalesce(i.amount_paid_rwf, 0) AS amount_paid_rwf,
         coalesce(i.total_rwf - i.amount_paid_rwf, 0) AS balance_rwf
    FROM orders o
    LEFT JOIN dining_tables t ON t.id = o.table_id
    LEFT JOIN invoices i ON i.order_id = o.id AND i.voided_at IS NULL;

-- The step-by-step history of each order, with staff names (for reception/owner).
CREATE VIEW v_order_timeline AS
  SELECT ev.order_id, ev.id AS event_id, ev.from_status, ev.to_status, ev.created_at,
         ev.actor_type, e.full_name AS actor_name, ev.reason
    FROM order_status_events ev LEFT JOIN employees e ON e.id = ev.actor_employee_id;

-- Daily sales by business date. "orders" = accepted orders (they have an invoice);
-- "waiting" = placed but not yet accepted by reception.
CREATE VIEW v_daily_sales AS
  SELECT o.business_date,
         sum(o.status IN ('confirmed', 'preparing', 'ready', 'served')) AS orders,
         sum(o.status = 'placed') AS waiting_orders,
         sum(o.status = 'cancelled') AS cancelled_orders,
         coalesce(sum(i.total_rwf), 0) AS billed_rwf,
         coalesce(sum(i.amount_paid_rwf), 0) AS paid_rwf,
         coalesce(sum(i.total_rwf - i.amount_paid_rwf), 0) AS unpaid_rwf
    FROM orders o LEFT JOIN invoices i ON i.order_id = o.id AND i.voided_at IS NULL
   GROUP BY o.business_date;

-- Weekly report (weeks start on Monday).
CREATE VIEW v_weekly_sales AS
  SELECT date(business_date, '-' || ((cast(strftime('%w', business_date) AS INTEGER) + 6) % 7) || ' days') AS week_start,
         sum(orders) AS orders, sum(waiting_orders) AS waiting_orders, sum(cancelled_orders) AS cancelled_orders,
         sum(billed_rwf) AS billed_rwf, sum(paid_rwf) AS paid_rwf, sum(unpaid_rwf) AS unpaid_rwf
    FROM v_daily_sales
   GROUP BY week_start;

-- Money received per day and method (what should be in the till and on MoMo).
CREATE VIEW v_daily_takings AS
  SELECT date(p.received_at, '+2 hours', '-5 hours') AS business_date, p.method,
         count(*) AS payments, sum(p.amount_rwf) AS amount_rwf
    FROM payments p
   WHERE p.voided_at IS NULL
   GROUP BY 1, 2;

-- What sold, per day and menu item (accepted orders only).
CREATE VIEW v_item_sales AS
  SELECT o.business_date, oi.menu_item_id, oi.item_name,
         sum(oi.quantity) AS quantity, sum(oi.line_total_rwf) AS revenue_rwf
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
   WHERE o.status NOT IN ('placed', 'cancelled')
   GROUP BY o.business_date, oi.menu_item_id, oi.item_name;

CREATE VIEW v_stock_levels AS
  SELECT s.id AS stock_item_id, s.name, s.category, s.base_unit, s.pack_name, s.pack_size,
         s.quantity_on_hand, s.reorder_level,
         CASE WHEN s.quantity_on_hand = 0 THEN 'out'
              WHEN s.quantity_on_hand <= s.reorder_level THEN 'low'
              ELSE 'ok' END AS level,
         (SELECT max(created_at) FROM stock_movements m WHERE m.stock_item_id = s.id) AS last_movement_at
    FROM stock_items s
   WHERE s.is_active = 1;

-- Health check: every row here is a bug. The app runs it at start-up and daily.
CREATE VIEW v_integrity_problems AS
  SELECT 'stock balance differs from its movements' AS problem, s.id AS row_id
    FROM stock_items s
   WHERE s.quantity_on_hand <> (SELECT coalesce(sum(quantity_delta), 0) FROM stock_movements m WHERE m.stock_item_id = s.id)
  UNION ALL
  SELECT 'invoice total differs from its lines', i.id
    FROM invoices i
   WHERE i.total_rwf <> (SELECT coalesce(sum(line_total_rwf), 0) FROM invoice_lines l WHERE l.invoice_id = i.id)
  UNION ALL
  SELECT 'invoice total differs from its order', i.id
    FROM invoices i
   WHERE i.total_rwf <> (SELECT coalesce(sum(line_total_rwf), 0) FROM order_items oi WHERE oi.order_id = i.order_id)
  UNION ALL
  SELECT 'invoice paid amount differs from its payments', i.id
    FROM invoices i
   WHERE i.amount_paid_rwf <> (SELECT coalesce(sum(a.amount_rwf), 0) FROM payment_allocations a JOIN payments p ON p.id = a.payment_id
                                WHERE a.invoice_id = i.id AND p.voided_at IS NULL)
  UNION ALL
  SELECT 'payment not fully allocated to invoices', p.id
    FROM payments p
   WHERE p.voided_at IS NULL
     AND p.amount_rwf <> (SELECT coalesce(sum(a.amount_rwf), 0) FROM payment_allocations a WHERE a.payment_id = p.id)
  UNION ALL
  SELECT 'accepted order without an invoice', o.id
    FROM orders o
   WHERE o.status IN ('confirmed', 'preparing', 'ready', 'served')
     AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.order_id = o.id AND i.voided_at IS NULL)
  UNION ALL
  SELECT 'order status differs from its history', o.id
    FROM orders o
   WHERE o.status IS NOT (SELECT to_status FROM order_status_events ev WHERE ev.order_id = o.id ORDER BY ev.id DESC LIMIT 1);

-- =============================================================================
-- RULES THE DATABASE ENFORCES (triggers)
-- Each trigger is one rule. Errors start with a KT_ code (see the design doc).
-- =============================================================================

-- ---------- People and access ----------

-- The first account ever created is the owner; after that only the owner adds people.
CREATE TRIGGER employees_check_insert BEFORE INSERT ON employees
BEGIN
  SELECT RAISE(ABORT, 'KT_FORBIDDEN: the first account must be the owner (admin)')
   WHERE NEW.created_by IS NULL
     AND (EXISTS (SELECT 1 FROM employees) OR NEW.role_id IS NOT (SELECT id FROM roles WHERE code = 'admin'));
  SELECT RAISE(ABORT, 'KT_FORBIDDEN: only the owner can add employees')
   WHERE NEW.created_by IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM v_employee_permissions WHERE employee_id = NEW.created_by AND permission_code = 'employees.manage');
  SELECT RAISE(ABORT, 'KT_BAD_STATUS: a new employee starts active')
   WHERE NEW.status <> 'active';
END;

-- Changing someone's details, role or status needs the owner. Every change names
-- who made it (updated_by) and adds 1 to version, so the audit trail is right and
-- two people editing the same record cannot overwrite each other unknowingly.
CREATE TRIGGER employees_check_update BEFORE UPDATE OF full_name, phone, email, role_id, job_title, status, removed_at ON employees
BEGIN
  SELECT RAISE(ABORT, 'KT_EDITOR_REQUIRED: every change sets updated_by and adds 1 to version')
   WHERE NEW.version IS NOT OLD.version + 1 OR NEW.updated_by IS NULL;
  SELECT RAISE(ABORT, 'KT_FORBIDDEN: only the owner can change employees')
   WHERE NOT EXISTS (SELECT 1 FROM v_employee_permissions WHERE employee_id = NEW.updated_by AND permission_code = 'employees.manage');
  SELECT RAISE(ABORT, 'KT_LAST_ADMIN: K.Town must always keep one active owner account')
   WHERE OLD.status = 'active' AND OLD.role_id = (SELECT id FROM roles WHERE code = 'admin')
     AND (NEW.status <> 'active' OR NEW.role_id <> OLD.role_id)
     AND (SELECT count(*) FROM employees e JOIN roles r ON r.id = e.role_id WHERE r.code = 'admin' AND e.status = 'active') = 1;
END;

-- A PIN can be changed by its owner, or reset by the owner of the business.
CREATE TRIGGER employees_check_pin BEFORE UPDATE OF pin_hash ON employees
BEGIN
  SELECT RAISE(ABORT, 'KT_EDITOR_REQUIRED: every change sets updated_by and adds 1 to version')
   WHERE NEW.version IS NOT OLD.version + 1 OR NEW.updated_by IS NULL;
  SELECT RAISE(ABORT, 'KT_FORBIDDEN: only the employee or the owner can change this PIN')
   WHERE NEW.updated_by <> NEW.id
     AND NOT EXISTS (SELECT 1 FROM v_employee_permissions WHERE employee_id = NEW.updated_by AND permission_code = 'employees.manage');
END;

-- Suspending or removing someone signs them out everywhere, at once.
CREATE TRIGGER employees_sign_out_when_blocked AFTER UPDATE OF status ON employees
WHEN NEW.status <> 'active'
BEGIN
  UPDATE employee_sessions SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
   WHERE employee_id = NEW.id AND revoked_at IS NULL;
END;

CREATE TRIGGER employees_audit_access AFTER UPDATE OF role_id, status ON employees
WHEN NEW.role_id IS NOT OLD.role_id OR NEW.status IS NOT OLD.status
BEGIN
  INSERT INTO audit_log (actor_employee_id, action, entity_type, entity_id, details)
  VALUES (NEW.updated_by, 'employee.access_changed', 'employee', NEW.id,
          json_object('role_from', (SELECT code FROM roles WHERE id = OLD.role_id),
                      'role_to',   (SELECT code FROM roles WHERE id = NEW.role_id),
                      'status_from', OLD.status, 'status_to', NEW.status));
END;

CREATE TRIGGER employees_never_deleted BEFORE DELETE ON employees
BEGIN
  SELECT RAISE(ABORT, 'KT_NO_DELETE: employees are kept for history; set status to removed');
END;

-- Only the owner grants, only grantable permissions, only to active people.
CREATE TRIGGER grants_check_insert BEFORE INSERT ON employee_permission_grants
BEGIN
  SELECT RAISE(ABORT, 'KT_FORBIDDEN: only the owner can give access')
   WHERE NOT EXISTS (SELECT 1 FROM v_employee_permissions WHERE employee_id = NEW.granted_by AND permission_code = 'employees.manage');
  SELECT RAISE(ABORT, 'KT_NOT_GRANTABLE: this permission comes only with a role')
   WHERE (SELECT grantable FROM permissions WHERE code = NEW.permission_code) IS NOT 1;
  SELECT RAISE(ABORT, 'KT_BAD_STATUS: this employee is not active')
   WHERE (SELECT status FROM employees WHERE id = NEW.employee_id) IS NOT 'active';
  SELECT RAISE(ABORT, 'KT_BAD_GRANT: a new grant cannot start revoked')
   WHERE NEW.revoked_at IS NOT NULL;
END;

-- A grant can only be revoked (once, by the owner); nothing else changes.
CREATE TRIGGER grants_only_revoke BEFORE UPDATE ON employee_permission_grants
BEGIN
  SELECT RAISE(ABORT, 'KT_APPEND_ONLY: grants cannot be edited; revoke and grant again')
   WHERE NEW.employee_id IS NOT OLD.employee_id OR NEW.permission_code IS NOT OLD.permission_code
      OR NEW.granted_by IS NOT OLD.granted_by OR NEW.granted_at IS NOT OLD.granted_at
      OR OLD.revoked_at IS NOT NULL;
  SELECT RAISE(ABORT, 'KT_FORBIDDEN: only the owner can take access away')
   WHERE NOT EXISTS (SELECT 1 FROM v_employee_permissions WHERE employee_id = NEW.revoked_by AND permission_code = 'employees.manage');
END;

CREATE TRIGGER grants_audit_insert AFTER INSERT ON employee_permission_grants
BEGIN
  INSERT INTO audit_log (actor_employee_id, action, entity_type, entity_id, details)
  VALUES (NEW.granted_by, 'permission.granted', 'employee', NEW.employee_id, json_object('permission', NEW.permission_code));
END;

CREATE TRIGGER grants_audit_revoke AFTER UPDATE OF revoked_at ON employee_permission_grants
BEGIN
  INSERT INTO audit_log (actor_employee_id, action, entity_type, entity_id, details)
  VALUES (NEW.revoked_by, 'permission.revoked', 'employee', NEW.employee_id, json_object('permission', NEW.permission_code));
END;

CREATE TRIGGER grants_never_deleted BEFORE DELETE ON employee_permission_grants
BEGIN
  SELECT RAISE(ABORT, 'KT_NO_DELETE: revoke a grant instead of deleting it');
END;

-- ---------- Menu ----------

-- Menu changes need menu.manage; switching an item sold out/available needs menu.availability.
-- created_by may be empty only while the database has no employees (the starting menu).
CREATE TRIGGER menu_items_check_insert BEFORE INSERT ON menu_items
BEGIN
  SELECT RAISE(ABORT, 'KT_EDITOR_REQUIRED: say who adds the item (created_by)')
   WHERE NEW.created_by IS NULL AND EXISTS (SELECT 1 FROM employees);
  SELECT RAISE(ABORT, 'KT_FORBIDDEN: only the owner can add menu items')
   WHERE NEW.created_by IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM v_employee_permissions WHERE employee_id = NEW.created_by AND permission_code = 'menu.manage');
END;

CREATE TRIGGER menu_items_check_update BEFORE UPDATE ON menu_items
BEGIN
  SELECT RAISE(ABORT, 'KT_EDITOR_REQUIRED: every change sets updated_by and adds 1 to version')
   WHERE NEW.version IS NOT OLD.version + 1 OR NEW.updated_by IS NULL;
  SELECT RAISE(ABORT, 'KT_FORBIDDEN: only the owner can change menu items and prices')
   WHERE (NEW.name IS NOT OLD.name OR NEW.description IS NOT OLD.description OR NEW.price_rwf IS NOT OLD.price_rwf
          OR NEW.category_id IS NOT OLD.category_id OR NEW.image_path IS NOT OLD.image_path OR NEW.tag IS NOT OLD.tag
          OR NEW.is_active IS NOT OLD.is_active OR NEW.sort_order IS NOT OLD.sort_order)
     AND NOT EXISTS (SELECT 1 FROM v_employee_permissions WHERE employee_id = NEW.updated_by AND permission_code = 'menu.manage');
  SELECT RAISE(ABORT, 'KT_FORBIDDEN: this employee may not mark items sold out')
   WHERE (NEW.is_available IS NOT OLD.is_available OR NEW.unavailable_reason IS NOT OLD.unavailable_reason)
     AND NOT EXISTS (SELECT 1 FROM v_employee_permissions WHERE employee_id = NEW.updated_by
                       AND permission_code IN ('menu.availability', 'menu.manage'));
END;

CREATE TRIGGER menu_items_price_history AFTER UPDATE OF price_rwf ON menu_items
WHEN NEW.price_rwf <> OLD.price_rwf
BEGIN
  INSERT INTO menu_item_price_history (menu_item_id, old_price_rwf, new_price_rwf, changed_by, changed_at)
  VALUES (NEW.id, OLD.price_rwf, NEW.price_rwf, NEW.updated_by, NEW.updated_at);
END;

-- When the kitchen switches an item off, reception and the owner are told.
CREATE TRIGGER menu_items_sold_out_notice AFTER UPDATE OF is_available ON menu_items
WHEN OLD.is_available = 1 AND NEW.is_available = 0
BEGIN
  INSERT INTO notifications (kind, menu_item_id, message, for_permission, created_by)
  VALUES ('menu_item_sold_out', NEW.id,
          NEW.name || ' is sold out' || CASE WHEN NEW.unavailable_reason <> '' THEN ': ' || NEW.unavailable_reason ELSE '' END,
          'orders.view', NEW.updated_by);
END;

-- ---------- Inventory ----------

CREATE TRIGGER stock_items_check_insert BEFORE INSERT ON stock_items
BEGIN
  SELECT RAISE(ABORT, 'KT_FORBIDDEN: this employee may not add stock products')
   WHERE NOT EXISTS (SELECT 1 FROM v_employee_permissions WHERE employee_id = NEW.created_by AND permission_code = 'inventory.manage');
  SELECT RAISE(ABORT, 'KT_USE_MOVEMENTS: a new product starts at 0; record an opening or purchase movement')
   WHERE NEW.quantity_on_hand <> 0 OR NEW.last_movement_id IS NOT NULL;
END;

CREATE TRIGGER stock_items_check_update BEFORE UPDATE OF name, sku, category, base_unit, pack_name, pack_size, reorder_level, is_active ON stock_items
BEGIN
  SELECT RAISE(ABORT, 'KT_EDITOR_REQUIRED: every change sets updated_by and adds 1 to version')
   WHERE NEW.version IS NOT OLD.version + 1;
  SELECT RAISE(ABORT, 'KT_FORBIDDEN: this employee may not change stock products')
   WHERE NOT EXISTS (SELECT 1 FROM v_employee_permissions WHERE employee_id = NEW.updated_by AND permission_code = 'inventory.manage');
  SELECT RAISE(ABORT, 'KT_UNIT_LOCKED: the unit cannot change once stock has moved; create a new product')
   WHERE NEW.base_unit IS NOT OLD.base_unit AND EXISTS (SELECT 1 FROM stock_movements WHERE stock_item_id = NEW.id);
  SELECT RAISE(ABORT, 'KT_IN_USE: take this product out of the menu recipes before removing it')
   WHERE OLD.is_active = 1 AND NEW.is_active = 0
     AND EXISTS (SELECT 1 FROM menu_item_components c JOIN menu_items m ON m.id = c.menu_item_id
                  WHERE c.stock_item_id = NEW.id AND m.is_active = 1);
END;

-- quantity_on_hand moves only together with a new stock movement.
CREATE TRIGGER stock_items_quantity_only_by_movements BEFORE UPDATE OF quantity_on_hand, last_movement_id ON stock_items
WHEN NEW.last_movement_id IS OLD.last_movement_id
  OR NOT EXISTS (SELECT 1 FROM stock_movements m WHERE m.id = NEW.last_movement_id AND m.stock_item_id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'KT_USE_MOVEMENTS: change stock by recording a stock movement');
END;

CREATE TRIGGER stock_items_never_deleted BEFORE DELETE ON stock_items
BEGIN
  SELECT RAISE(ABORT, 'KT_NO_DELETE: stock products are kept for history; set is_active = 0');
END;

-- Who may move stock: receiving needs inventory.receive, corrections and waste need
-- inventory.adjust. Sales are written by the order triggers. Stock never goes below 0.
CREATE TRIGGER stock_movements_check BEFORE INSERT ON stock_movements
BEGIN
  SELECT RAISE(ABORT, 'KT_FORBIDDEN: this employee has no access to receive stock')
   WHERE NEW.movement_type IN ('opening', 'purchase')
     AND NOT EXISTS (SELECT 1 FROM v_employee_permissions WHERE employee_id = NEW.created_by AND permission_code = 'inventory.receive');
  SELECT RAISE(ABORT, 'KT_FORBIDDEN: this employee has no access to correct stock')
   WHERE NEW.movement_type IN ('adjustment', 'waste')
     AND NOT EXISTS (SELECT 1 FROM v_employee_permissions WHERE employee_id = NEW.created_by AND permission_code = 'inventory.adjust');
  SELECT RAISE(ABORT, 'KT_BAD_SALE_MOVEMENT: sales are recorded only when an order is accepted')
   WHERE NEW.movement_type = 'sale'
     AND (SELECT o.status FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.id = NEW.order_item_id) IS NOT 'confirmed';
  SELECT RAISE(ABORT, 'KT_BAD_SALE_MOVEMENT: stock is returned only when an accepted order is cancelled')
   WHERE NEW.movement_type = 'sale_reversal'
     AND (SELECT o.status FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.id = NEW.order_item_id) IS NOT 'cancelled';
  SELECT RAISE(ABORT, 'KT_INACTIVE_ITEM: this stock product is no longer used')
   WHERE NEW.quantity_delta > 0 AND NEW.movement_type IN ('opening', 'purchase')
     AND (SELECT is_active FROM stock_items WHERE id = NEW.stock_item_id) = 0;
  SELECT RAISE(ABORT, 'KT_INSUFFICIENT_STOCK: not enough in stock')
   WHERE (SELECT quantity_on_hand FROM stock_items WHERE id = NEW.stock_item_id) + NEW.quantity_delta < 0;
END;

CREATE TRIGGER stock_movements_apply AFTER INSERT ON stock_movements
BEGIN
  UPDATE stock_items
     SET quantity_on_hand = quantity_on_hand + NEW.quantity_delta, last_movement_id = NEW.id
   WHERE id = NEW.stock_item_id;
END;

CREATE TRIGGER stock_movements_never_changed BEFORE UPDATE ON stock_movements
BEGIN
  SELECT RAISE(ABORT, 'KT_APPEND_ONLY: stock movements are permanent; record a correcting adjustment');
END;

CREATE TRIGGER stock_movements_never_deleted BEFORE DELETE ON stock_movements
BEGIN
  SELECT RAISE(ABORT, 'KT_APPEND_ONLY: stock movements are permanent; record a correcting adjustment');
END;

-- Tell the people with stock access when something gets low or runs out.
CREATE TRIGGER stock_items_low_stock_notice AFTER UPDATE OF quantity_on_hand ON stock_items
WHEN (NEW.quantity_on_hand <= NEW.reorder_level AND OLD.quantity_on_hand > OLD.reorder_level)
  OR (NEW.quantity_on_hand = 0 AND OLD.quantity_on_hand > 0)
BEGIN
  INSERT INTO notifications (kind, stock_item_id, message, for_permission)
  VALUES (CASE WHEN NEW.quantity_on_hand = 0 THEN 'out_of_stock' ELSE 'low_stock' END, NEW.id,
          CASE WHEN NEW.quantity_on_hand = 0 THEN NEW.name || ' is out of stock'
               ELSE NEW.name || ' is low: ' || NEW.quantity_on_hand || ' ' || NEW.base_unit || ' left' END,
          'inventory.view');
END;

-- ---------- Orders ----------

CREATE TRIGGER orders_check_insert BEFORE INSERT ON orders
BEGIN
  SELECT RAISE(ABORT, 'KT_BAD_STATUS: an order starts as placed')
   WHERE NEW.status <> 'placed' OR NEW.last_status_event_id IS NOT NULL OR NEW.order_number IS NOT NULL;
  SELECT RAISE(ABORT, 'KT_ORDERING_PAUSED: phone ordering is paused; please order at the counter')
   WHERE NEW.channel = 'qr' AND (SELECT value FROM settings WHERE key = 'ordering.guest_orders_enabled') = 'false';
  SELECT RAISE(ABORT, 'KT_BAD_TABLE: this table is not in use')
   WHERE NEW.table_id IS NOT NULL AND (SELECT is_active FROM dining_tables WHERE id = NEW.table_id) IS NOT 1;
END;

-- Give the order its number for the day and write the first line of its history.
CREATE TRIGGER orders_after_insert AFTER INSERT ON orders
BEGIN
  UPDATE orders
     SET order_number = (SELECT coalesce(max(order_number), 0) + 1 FROM orders WHERE business_date = NEW.business_date)
   WHERE id = NEW.id;
  INSERT INTO order_status_events (order_id, from_status, to_status, actor_type, actor_employee_id, created_at)
  VALUES (NEW.id, NULL, 'placed', CASE WHEN NEW.created_by IS NULL THEN 'guest' ELSE 'employee' END, NEW.created_by, NEW.created_at);
END;

-- THE fix for "the tracker moves by itself": orders.status can only follow the
-- newest row of order_status_events. A direct UPDATE of the status is refused.
CREATE TRIGGER orders_status_only_by_events BEFORE UPDATE OF status, last_status_event_id ON orders
WHEN NEW.last_status_event_id IS OLD.last_status_event_id
  OR NOT EXISTS (SELECT 1 FROM order_status_events ev
                  WHERE ev.id = NEW.last_status_event_id AND ev.order_id = NEW.id AND ev.to_status = NEW.status
                    AND ev.id = (SELECT max(id) FROM order_status_events WHERE order_id = NEW.id))
BEGIN
  SELECT RAISE(ABORT, 'KT_USE_STATUS_EVENTS: change an order by recording a step in order_status_events');
END;

CREATE TRIGGER orders_fixed_fields BEFORE UPDATE OF created_at, tracking_token_hash, channel, created_by ON orders
BEGIN
  SELECT RAISE(ABORT, 'KT_READ_ONLY: these order details cannot change')
   WHERE NEW.created_at IS NOT OLD.created_at OR NEW.tracking_token_hash IS NOT OLD.tracking_token_hash
      OR NEW.channel IS NOT OLD.channel OR NEW.created_by IS NOT OLD.created_by;
END;

CREATE TRIGGER orders_number_set_once BEFORE UPDATE OF order_number ON orders
WHEN OLD.order_number IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'KT_READ_ONLY: the order number cannot change');
END;

CREATE TRIGGER orders_never_deleted BEFORE DELETE ON orders
BEGIN
  SELECT RAISE(ABORT, 'KT_NO_DELETE: orders are kept for history; cancel instead');
END;

-- Lines can be added or changed only while the order is still 'placed', at the
-- menu's current price, and only for items that can be ordered right now.
CREATE TRIGGER order_items_check_insert BEFORE INSERT ON order_items
BEGIN
  SELECT RAISE(ABORT, 'KT_ORDER_LOCKED: this order was already accepted; place a new order')
   WHERE (SELECT status FROM orders WHERE id = NEW.order_id) IS NOT 'placed';
  SELECT RAISE(ABORT, 'KT_ITEM_UNAVAILABLE: this item cannot be ordered right now')
   WHERE (SELECT availability FROM v_menu_availability WHERE menu_item_id = NEW.menu_item_id) IS NOT 'available';
  SELECT RAISE(ABORT, 'KT_INSUFFICIENT_STOCK: not enough left for that quantity')
   WHERE (SELECT portions_left FROM v_menu_availability WHERE menu_item_id = NEW.menu_item_id) < NEW.quantity;
  SELECT RAISE(ABORT, 'KT_PRICE_MISMATCH: name and price must come from the menu')
   WHERE NOT EXISTS (SELECT 1 FROM menu_items m WHERE m.id = NEW.menu_item_id
                       AND m.price_rwf = NEW.unit_price_rwf AND m.name = NEW.item_name);
END;

CREATE TRIGGER order_items_check_update BEFORE UPDATE ON order_items
BEGIN
  SELECT RAISE(ABORT, 'KT_ORDER_LOCKED: this order was already accepted; place a new order')
   WHERE (SELECT status FROM orders WHERE id = OLD.order_id) IS NOT 'placed';
  SELECT RAISE(ABORT, 'KT_READ_ONLY: only the quantity and the note of a line can change')
   WHERE NEW.order_id IS NOT OLD.order_id OR NEW.menu_item_id IS NOT OLD.menu_item_id
      OR NEW.item_name IS NOT OLD.item_name OR NEW.unit_price_rwf IS NOT OLD.unit_price_rwf;
  SELECT RAISE(ABORT, 'KT_INSUFFICIENT_STOCK: not enough left for that quantity')
   WHERE NEW.quantity > OLD.quantity
     AND (SELECT portions_left FROM v_menu_availability WHERE menu_item_id = NEW.menu_item_id) < NEW.quantity;
END;

CREATE TRIGGER order_items_check_delete BEFORE DELETE ON order_items
BEGIN
  SELECT RAISE(ABORT, 'KT_ORDER_LOCKED: this order was already accepted; place a new order')
   WHERE (SELECT status FROM orders WHERE id = OLD.order_id) IS NOT 'placed';
END;

-- Every step of an order is checked here before it is written.
CREATE TRIGGER order_status_events_check BEFORE INSERT ON order_status_events
BEGIN
  SELECT RAISE(ABORT, 'KT_BAD_TRANSITION: an order is placed only once')
   WHERE NEW.from_status IS NULL AND EXISTS (SELECT 1 FROM order_status_events WHERE order_id = NEW.order_id);
  SELECT RAISE(ABORT, 'KT_STALE_STATUS: the order changed in the meantime; refresh and try again')
   WHERE NEW.from_status IS NOT NULL AND NEW.from_status IS NOT (SELECT status FROM orders WHERE id = NEW.order_id);
  SELECT RAISE(ABORT, 'KT_BAD_TRANSITION: an order cannot move to that status from where it is')
   WHERE NEW.from_status IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM order_status_transitions WHERE from_status = NEW.from_status AND to_status = NEW.to_status);
  SELECT RAISE(ABORT, 'KT_FORBIDDEN: a guest can only cancel an order before reception accepts it')
   WHERE NEW.actor_type = 'guest' AND NEW.from_status IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM order_status_transitions
                      WHERE from_status = NEW.from_status AND to_status = NEW.to_status AND guest_allowed = 1);
  SELECT RAISE(ABORT, 'KT_FORBIDDEN: this employee may not make that change')
   WHERE NEW.actor_type = 'employee'
     AND NOT EXISTS (SELECT 1 FROM v_employee_permissions ep
                      WHERE ep.employee_id = NEW.actor_employee_id
                        AND ep.permission_code = CASE WHEN NEW.from_status IS NULL THEN 'orders.create'
                              ELSE (SELECT permission_code FROM order_status_transitions
                                     WHERE from_status = NEW.from_status AND to_status = NEW.to_status) END);
  SELECT RAISE(ABORT, 'KT_EMPTY_ORDER: an order needs at least one item')
   WHERE NEW.from_status = 'placed' AND NEW.to_status = 'confirmed'
     AND NOT EXISTS (SELECT 1 FROM order_items WHERE order_id = NEW.order_id);
  SELECT RAISE(ABORT, 'KT_HAS_PAYMENTS: undo the payments before cancelling this order')
   WHERE NEW.to_status = 'cancelled'
     AND EXISTS (SELECT 1 FROM invoices WHERE order_id = NEW.order_id AND amount_paid_rwf > 0);
END;

-- Apply a step, and what comes with it:
--   placed -> confirmed : take the recipe out of stock, issue the invoice
--   confirmed -> cancelled : put that stock back (nothing was cooked yet)
--   any -> cancelled : void the invoice
CREATE TRIGGER order_status_events_apply AFTER INSERT ON order_status_events
BEGIN
  UPDATE orders SET status = NEW.to_status, status_changed_at = NEW.created_at, last_status_event_id = NEW.id
   WHERE id = NEW.order_id;

  INSERT INTO stock_movements (stock_item_id, movement_type, quantity_delta, order_item_id, reason, created_by, created_at)
  SELECT c.stock_item_id, 'sale', -(oi.quantity * c.quantity_per_item), oi.id,
         'Order #' || o.order_number || ', ' || oi.quantity || ' x ' || oi.item_name, NEW.actor_employee_id, NEW.created_at
    FROM order_items oi
    JOIN menu_item_components c ON c.menu_item_id = oi.menu_item_id
    JOIN orders o ON o.id = oi.order_id
   WHERE NEW.from_status = 'placed' AND NEW.to_status = 'confirmed' AND oi.order_id = NEW.order_id
   ORDER BY oi.id, c.stock_item_id;

  INSERT INTO invoices (invoice_seq, order_id, issued_at, issued_by, total_rwf)
  SELECT (SELECT coalesce(max(invoice_seq), 0) + 1 FROM invoices), NEW.order_id, NEW.created_at, NEW.actor_employee_id,
         (SELECT sum(line_total_rwf) FROM order_items WHERE order_id = NEW.order_id)
   WHERE NEW.from_status = 'placed' AND NEW.to_status = 'confirmed';

  INSERT INTO invoice_lines (invoice_id, line_no, order_item_id, description, unit_price_rwf, quantity)
  SELECT i.id, row_number() OVER (ORDER BY oi.id), oi.id, oi.item_name, oi.unit_price_rwf, oi.quantity
    FROM invoices i JOIN order_items oi ON oi.order_id = i.order_id
   WHERE NEW.from_status = 'placed' AND NEW.to_status = 'confirmed' AND i.order_id = NEW.order_id;

  INSERT INTO stock_movements (stock_item_id, movement_type, quantity_delta, order_item_id, reason, created_by, created_at)
  SELECT m.stock_item_id, 'sale_reversal', -m.quantity_delta, m.order_item_id,
         'Order #' || o.order_number || ' cancelled: ' || NEW.reason, NEW.actor_employee_id, NEW.created_at
    FROM stock_movements m
    JOIN order_items oi ON oi.id = m.order_item_id
    JOIN orders o ON o.id = oi.order_id
   WHERE NEW.from_status = 'confirmed' AND NEW.to_status = 'cancelled'
     AND oi.order_id = NEW.order_id AND m.movement_type = 'sale';

  UPDATE invoices SET voided_at = NEW.created_at, voided_by = NEW.actor_employee_id, void_reason = NEW.reason
   WHERE NEW.to_status = 'cancelled' AND order_id = NEW.order_id AND voided_at IS NULL;
END;

CREATE TRIGGER order_status_events_never_changed BEFORE UPDATE ON order_status_events
BEGIN
  SELECT RAISE(ABORT, 'KT_APPEND_ONLY: order history cannot be changed');
END;

CREATE TRIGGER order_status_events_never_deleted BEFORE DELETE ON order_status_events
BEGIN
  SELECT RAISE(ABORT, 'KT_APPEND_ONLY: order history cannot be changed');
END;

CREATE TRIGGER order_status_transitions_check BEFORE INSERT ON order_status_transitions
BEGIN
  SELECT RAISE(ABORT, 'KT_BAD_TRANSITION: unknown status')
   WHERE NEW.from_status NOT IN ('placed', 'confirmed', 'preparing', 'ready', 'served', 'cancelled')
      OR NEW.to_status NOT IN ('confirmed', 'preparing', 'ready', 'served', 'cancelled');
END;

CREATE TRIGGER service_requests_check_resolve BEFORE UPDATE OF status ON service_requests
BEGIN
  SELECT RAISE(ABORT, 'KT_BAD_STATUS: a request is closed only once')
   WHERE OLD.status = 'done';
  SELECT RAISE(ABORT, 'KT_FORBIDDEN: this employee may not answer table requests')
   WHERE NOT EXISTS (SELECT 1 FROM v_employee_permissions WHERE employee_id = NEW.resolved_by AND permission_code = 'service_requests.handle');
END;

-- ---------- Invoices and payments ----------

CREATE TRIGGER invoices_check_insert BEFORE INSERT ON invoices
BEGIN
  SELECT RAISE(ABORT, 'KT_BAD_INVOICE: invoices are issued by accepting an order')
   WHERE (SELECT status FROM orders WHERE id = NEW.order_id) IS NOT 'confirmed'
      OR NEW.amount_paid_rwf <> 0 OR NEW.voided_at IS NOT NULL
      OR NEW.invoice_seq <> (SELECT coalesce(max(invoice_seq), 0) + 1 FROM invoices);
END;

-- An invoice never changes, except: its paid amount follows its payments, and it is
-- voided (once) when its order is cancelled.
CREATE TRIGGER invoices_check_update BEFORE UPDATE ON invoices
BEGIN
  SELECT RAISE(ABORT, 'KT_READ_ONLY: an issued invoice cannot be edited')
   WHERE NEW.invoice_seq IS NOT OLD.invoice_seq OR NEW.order_id IS NOT OLD.order_id OR NEW.issued_at IS NOT OLD.issued_at
      OR NEW.issued_by IS NOT OLD.issued_by OR NEW.total_rwf IS NOT OLD.total_rwf
      OR (OLD.voided_at IS NOT NULL AND (NEW.voided_at IS NOT OLD.voided_at OR NEW.voided_by IS NOT OLD.voided_by OR NEW.void_reason IS NOT OLD.void_reason));
  SELECT RAISE(ABORT, 'KT_USE_PAYMENTS: the paid amount always equals the payments recorded')
   WHERE NEW.amount_paid_rwf IS NOT OLD.amount_paid_rwf
     AND NEW.amount_paid_rwf <> (SELECT coalesce(sum(a.amount_rwf), 0) FROM payment_allocations a JOIN payments p ON p.id = a.payment_id
                                  WHERE a.invoice_id = NEW.id AND p.voided_at IS NULL);
  SELECT RAISE(ABORT, 'KT_VOID_BY_CANCEL: an invoice is voided by cancelling its order')
   WHERE OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL
     AND (SELECT status FROM orders WHERE id = NEW.order_id) IS NOT 'cancelled';
END;

CREATE TRIGGER invoices_audit_void AFTER UPDATE OF voided_at ON invoices
WHEN OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL
BEGIN
  INSERT INTO audit_log (actor_employee_id, action, entity_type, entity_id, details)
  VALUES (NEW.voided_by, 'invoice.voided', 'invoice', NEW.id,
          json_object('invoice_number', NEW.invoice_number, 'total_rwf', NEW.total_rwf, 'reason', NEW.void_reason));
END;

CREATE TRIGGER invoices_never_deleted BEFORE DELETE ON invoices
BEGIN
  SELECT RAISE(ABORT, 'KT_NO_DELETE: invoices are kept; cancelling the order voids it');
END;

CREATE TRIGGER invoice_lines_check_insert BEFORE INSERT ON invoice_lines
BEGIN
  SELECT RAISE(ABORT, 'KT_BAD_INVOICE: an invoice line must copy a line of the same order')
   WHERE NOT EXISTS (SELECT 1 FROM order_items oi JOIN invoices i ON i.order_id = oi.order_id
                      WHERE oi.id = NEW.order_item_id AND i.id = NEW.invoice_id
                        AND oi.item_name = NEW.description AND oi.unit_price_rwf = NEW.unit_price_rwf
                        AND oi.quantity = NEW.quantity);
END;

CREATE TRIGGER invoice_lines_never_changed BEFORE UPDATE ON invoice_lines
BEGIN
  SELECT RAISE(ABORT, 'KT_READ_ONLY: an issued invoice cannot be edited');
END;

CREATE TRIGGER invoice_lines_never_deleted BEFORE DELETE ON invoice_lines
BEGIN
  SELECT RAISE(ABORT, 'KT_READ_ONLY: an issued invoice cannot be edited');
END;

CREATE TRIGGER payments_check_insert BEFORE INSERT ON payments
BEGIN
  SELECT RAISE(ABORT, 'KT_FORBIDDEN: this employee may not record payments')
   WHERE NOT EXISTS (SELECT 1 FROM v_employee_permissions WHERE employee_id = NEW.received_by AND permission_code = 'payments.record');
  SELECT RAISE(ABORT, 'KT_BAD_PAYMENT: a new payment cannot start voided')
   WHERE NEW.voided_at IS NOT NULL;
END;

-- A payment is never edited. A wrong one is voided (owner only) and recorded again.
CREATE TRIGGER payments_only_void BEFORE UPDATE ON payments
BEGIN
  SELECT RAISE(ABORT, 'KT_APPEND_ONLY: payments cannot be edited; void it and record it again')
   WHERE NEW.method IS NOT OLD.method OR NEW.amount_rwf IS NOT OLD.amount_rwf OR NEW.reference IS NOT OLD.reference
      OR NEW.received_by IS NOT OLD.received_by OR NEW.received_at IS NOT OLD.received_at
      OR OLD.voided_at IS NOT NULL;
  SELECT RAISE(ABORT, 'KT_FORBIDDEN: only the owner can void a payment')
   WHERE NOT EXISTS (SELECT 1 FROM v_employee_permissions WHERE employee_id = NEW.voided_by AND permission_code = 'payments.void');
END;

CREATE TRIGGER payments_after_void AFTER UPDATE OF voided_at ON payments
WHEN OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL
BEGIN
  UPDATE invoices
     SET amount_paid_rwf = (SELECT coalesce(sum(a.amount_rwf), 0) FROM payment_allocations a JOIN payments p ON p.id = a.payment_id
                             WHERE a.invoice_id = invoices.id AND p.voided_at IS NULL)
   WHERE id IN (SELECT invoice_id FROM payment_allocations WHERE payment_id = NEW.id);
  INSERT INTO audit_log (actor_employee_id, action, entity_type, entity_id, details)
  VALUES (NEW.voided_by, 'payment.voided', 'payment', NEW.id,
          json_object('amount_rwf', NEW.amount_rwf, 'method', NEW.method, 'reference', NEW.reference, 'reason', NEW.void_reason));
END;

CREATE TRIGGER payments_never_deleted BEFORE DELETE ON payments
BEGIN
  SELECT RAISE(ABORT, 'KT_APPEND_ONLY: payments are kept; void a wrong payment instead');
END;

CREATE TRIGGER payment_allocations_check BEFORE INSERT ON payment_allocations
BEGIN
  SELECT RAISE(ABORT, 'KT_BAD_PAYMENT: this payment was voided')
   WHERE (SELECT voided_at FROM payments WHERE id = NEW.payment_id) IS NOT NULL;
  SELECT RAISE(ABORT, 'KT_INVOICE_VOID: this invoice was cancelled')
   WHERE (SELECT voided_at FROM invoices WHERE id = NEW.invoice_id) IS NOT NULL;
  SELECT RAISE(ABORT, 'KT_OVERPAYMENT: more than what is still owed on this invoice')
   WHERE NEW.amount_rwf > (SELECT total_rwf - amount_paid_rwf FROM invoices WHERE id = NEW.invoice_id);
  SELECT RAISE(ABORT, 'KT_OVER_ALLOCATED: more than the payment received')
   WHERE NEW.amount_rwf + (SELECT coalesce(sum(amount_rwf), 0) FROM payment_allocations WHERE payment_id = NEW.payment_id)
         > (SELECT amount_rwf FROM payments WHERE id = NEW.payment_id);
END;

CREATE TRIGGER payment_allocations_apply AFTER INSERT ON payment_allocations
BEGIN
  UPDATE invoices
     SET amount_paid_rwf = (SELECT coalesce(sum(a.amount_rwf), 0) FROM payment_allocations a JOIN payments p ON p.id = a.payment_id
                             WHERE a.invoice_id = NEW.invoice_id AND p.voided_at IS NULL)
   WHERE id = NEW.invoice_id;
END;

CREATE TRIGGER payment_allocations_never_changed BEFORE UPDATE ON payment_allocations
BEGIN
  SELECT RAISE(ABORT, 'KT_APPEND_ONLY: void the payment and record it again');
END;

CREATE TRIGGER payment_allocations_never_deleted BEFORE DELETE ON payment_allocations
BEGIN
  SELECT RAISE(ABORT, 'KT_APPEND_ONLY: void the payment and record it again');
END;

CREATE TRIGGER payment_claims_check_resolve BEFORE UPDATE OF status ON payment_claims
BEGIN
  SELECT RAISE(ABORT, 'KT_BAD_STATUS: a claim is answered only once')
   WHERE OLD.status <> 'pending';
  SELECT RAISE(ABORT, 'KT_FORBIDDEN: this employee may not confirm payments')
   WHERE NOT EXISTS (SELECT 1 FROM v_employee_permissions WHERE employee_id = NEW.resolved_by AND permission_code = 'payments.record');
END;

-- ---------- Settings and audit ----------

CREATE TRIGGER settings_check_update BEFORE UPDATE ON settings
BEGIN
  SELECT RAISE(ABORT, 'KT_EDITOR_REQUIRED: every change sets updated_by and adds 1 to version')
   WHERE NEW.version IS NOT OLD.version + 1 OR NEW.updated_by IS NULL;
  SELECT RAISE(ABORT, 'KT_FORBIDDEN: only the owner can change settings')
   WHERE NOT EXISTS (SELECT 1 FROM v_employee_permissions WHERE employee_id = NEW.updated_by AND permission_code = 'settings.manage');
END;

CREATE TRIGGER settings_audit AFTER UPDATE OF value ON settings
WHEN NEW.value IS NOT OLD.value
BEGIN
  INSERT INTO audit_log (actor_employee_id, action, entity_type, entity_id, details)
  VALUES (NEW.updated_by, 'setting.changed', 'setting', NEW.key, json_object('from', json(OLD.value), 'to', json(NEW.value)));
END;

CREATE TRIGGER audit_log_never_changed BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'KT_APPEND_ONLY: the audit log cannot be changed');
END;

CREATE TRIGGER audit_log_never_deleted BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'KT_APPEND_ONLY: the audit log cannot be changed');
END;
