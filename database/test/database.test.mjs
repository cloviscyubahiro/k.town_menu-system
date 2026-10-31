// K.Town database tests. Run from the database folder:  npm test
// Each test starts from a fresh in-memory database (schema + seed + sample data).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  openDb, rejects, one, all, run, tx, itemId, stockOf, orderOf, invoiceOf, nowIso, problems,
  placeOrder, step, recordPayment, receiveStock, updateMenuItem, updateEmployee, acceptedOrder,
  OWNER, RECEPTION, KITCHEN, HEAD_CHEF
} from './helpers.mjs';

const can = (db, employee, permission) =>
  !!one(db, 'SELECT 1 AS ok FROM v_employee_permissions WHERE employee_id = ? AND permission_code = ?', employee, permission);

// ===========================================================================
describe('schema', () => {
  it('loads cleanly with foreign keys on and passes SQLite\'s own checks', () => {
    const db = openDb();
    assert.equal(one(db, 'PRAGMA user_version').user_version, 1);
    assert.equal(one(db, 'PRAGMA foreign_keys').foreign_keys, 1);
    assert.equal(one(db, 'PRAGMA integrity_check').integrity_check, 'ok');
    assert.deepEqual(all(db, 'PRAGMA foreign_key_check'), []);
    assert.deepEqual(problems(db), []);
  });

  it('uses STRICT tables everywhere, so a wrong data type is refused', () => {
    const db = openDb();
    const loose = all(db, "SELECT name FROM sqlite_schema WHERE type = 'table' AND sql NOT LIKE '%STRICT%'");
    assert.deepEqual(loose, []);
    rejects(() => run(db, "UPDATE dining_tables SET seats = 'many' WHERE code = 'T1'"), /cannot store TEXT value in INTEGER column/);
  });

  it('enforces foreign keys', () => {
    const db = openDb();
    rejects(() => run(db, "INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price_rwf, quantity) VALUES (999, 1, 'x', 1, 1)"), /FOREIGN KEY|KT_/);
  });
});

// ===========================================================================
describe('reference data', () => {
  it('has the 15 drinks with the prices of the handwritten menu', () => {
    const db = openDb({ sample: false });
    const expected = {
      'Watermelon juice': 4000, 'Mango juice': 5000, 'Pineapple juice': 4000, 'Orange juice': 6000,
      'Black coffee': 2000, 'Ice Americano': 4000, 'Cappuccino': 3500, 'Ice cappuccino': 5000,
      'Café latte': 3000, 'Ice latte': 4500, 'Ice lemonade coffee': 5000,
      'Black tea': 2000, 'Lemon tea': 2500, 'Mint tea': 3000, 'Spice tea': 3500
    };
    const rows = all(db, 'SELECT name, price_rwf FROM menu_items WHERE is_active = 1');
    assert.equal(rows.length, 15);
    for (const r of rows) assert.equal(r.price_rwf, expected[r.name], r.name);
    assert.deepEqual(all(db, 'SELECT name FROM menu_categories ORDER BY sort_order').map((r) => r.name), ['Fresh juice', 'Coffee', 'Tea']);
  });

  it('has the 4 tables and the MoMo number', () => {
    const db = openDb({ sample: false });
    assert.deepEqual(all(db, 'SELECT code FROM dining_tables ORDER BY sort_order').map((r) => r.code), ['T1', 'T2', 'T3', 'T4']);
    assert.equal(JSON.parse(one(db, "SELECT value FROM settings WHERE key = 'payment.momo_number'").value), '0783094301');
  });

  it('gives reception no stock access, and the kitchen none unless the owner grants it', () => {
    const db = openDb();
    for (const p of ['inventory.view', 'inventory.receive', 'inventory.adjust', 'inventory.manage', 'menu.availability']) {
      assert.equal(can(db, RECEPTION, p), false, 'reception has ' + p);
    }
    assert.equal(can(db, KITCHEN, 'inventory.adjust'), false);
    assert.equal(can(db, HEAD_CHEF, 'inventory.adjust'), true); // granted in sample data
    const total = one(db, 'SELECT count(*) AS n FROM permissions').n;
    assert.equal(one(db, 'SELECT count(*) AS n FROM v_employee_permissions WHERE employee_id = ?', OWNER).n, total);
  });
});

// ===========================================================================
describe('people and access', () => {
  it('makes the first account the owner, and only the owner adds people', () => {
    const db = openDb({ sample: false });
    rejects(() => run(db, "INSERT INTO employees (full_name, phone, role_id, pin_hash) VALUES ('Reception first', '+250788111111', 2, 'hash-hash-hash-hash-hash')"), 'KT_FORBIDDEN');
    run(db, "INSERT INTO employees (full_name, phone, role_id, pin_hash) VALUES ('The owner', '+250788111111', 1, 'hash-hash-hash-hash-hash')");
    rejects(() => run(db, "INSERT INTO employees (full_name, phone, role_id, pin_hash) VALUES ('Sneaky', '+250788222222', 1, 'hash-hash-hash-hash-hash')"), 'KT_FORBIDDEN');
    const db2 = openDb();
    rejects(() => run(db2, "INSERT INTO employees (full_name, phone, role_id, pin_hash, created_by) VALUES ('New', '+250788333333', 2, 'hash-hash-hash-hash-hash', ?)", RECEPTION), 'KT_FORBIDDEN');
    run(db2, "INSERT INTO employees (full_name, phone, role_id, pin_hash, created_by) VALUES ('New', '+250788333333', 2, 'hash-hash-hash-hash-hash', ?)", OWNER);
  });

  it('checks phone numbers', () => {
    const db = openDb();
    rejects(() => run(db, "INSERT INTO employees (full_name, phone, role_id, pin_hash, created_by) VALUES ('Bad', '0788123456', 2, 'hash-hash-hash-hash-hash', 1)"), /CHECK constraint failed/);
  });

  it('never leaves K.Town without an active owner', () => {
    const db = openDb();
    rejects(() => updateEmployee(db, OWNER, { status: 'removed', removed_at: nowIso() }, OWNER), 'KT_LAST_ADMIN');
    rejects(() => updateEmployee(db, OWNER, { role_id: 2 }, OWNER), 'KT_LAST_ADMIN');
    updateEmployee(db, RECEPTION, { role_id: 1 }, OWNER);       // a second owner
    updateEmployee(db, OWNER, { role_id: 2 }, RECEPTION);       // now the first can step down
  });

  it('signs a removed employee out everywhere and takes all access away', () => {
    const db = openDb();
    run(db, "INSERT INTO employee_sessions (employee_id, token_hash, expires_at) VALUES (?, ?, '2999-01-01T00:00:00.000Z')", KITCHEN, 'a'.repeat(64));
    updateEmployee(db, KITCHEN, { status: 'removed', removed_at: nowIso() }, OWNER);
    assert.ok(one(db, 'SELECT revoked_at FROM employee_sessions WHERE employee_id = ?', KITCHEN).revoked_at);
    assert.equal(can(db, KITCHEN, 'orders.prepare'), false);
    assert.equal(one(db, "SELECT count(*) AS n FROM audit_log WHERE action = 'employee.access_changed'").n, 1);
    rejects(() => run(db, 'DELETE FROM employees WHERE id = ?', KITCHEN), 'KT_NO_DELETE');
  });

  it('lets only the owner change employees, and every change names who did it', () => {
    const db = openDb();
    rejects(() => updateEmployee(db, KITCHEN, { job_title: 'Chef' }, RECEPTION), 'KT_FORBIDDEN');
    rejects(() => run(db, "UPDATE employees SET job_title = 'Chef' WHERE id = ?", KITCHEN), 'KT_EDITOR_REQUIRED');
    updateEmployee(db, KITCHEN, { job_title: 'Chef' }, OWNER);
  });

  it('lets people change their own PIN, and the owner reset anyone\'s', () => {
    const db = openDb();
    updateEmployee(db, KITCHEN, { pin_hash: 'new-hash-new-hash-new-hash' }, KITCHEN);
    updateEmployee(db, KITCHEN, { pin_hash: 'reset-hash-reset-hash-reset' }, OWNER);
    rejects(() => updateEmployee(db, KITCHEN, { pin_hash: 'evil-hash-evil-hash-evil' }, RECEPTION), 'KT_FORBIDDEN');
  });

  it('lets the owner give and take stock access, with a history', () => {
    const db = openDb();
    assert.equal(can(db, KITCHEN, 'inventory.adjust'), false);
    run(db, "INSERT INTO employee_permission_grants (employee_id, permission_code, granted_by) VALUES (?, 'inventory.adjust', ?)", KITCHEN, OWNER);
    assert.equal(can(db, KITCHEN, 'inventory.adjust'), true);
    run(db, "UPDATE employee_permission_grants SET revoked_by = ?, revoked_at = ? WHERE employee_id = ? AND permission_code = 'inventory.adjust' AND revoked_at IS NULL", OWNER, nowIso(), KITCHEN);
    assert.equal(can(db, KITCHEN, 'inventory.adjust'), false);
    assert.deepEqual(all(db, "SELECT action FROM audit_log WHERE entity_type = 'employee' AND entity_id = ? ORDER BY id", String(KITCHEN)).map((r) => r.action),
      ['permission.granted', 'permission.revoked']);
    rejects(() => run(db, 'DELETE FROM employee_permission_grants'), 'KT_NO_DELETE');
  });

  it('refuses grants by non-owners and grants of owner-only permissions', () => {
    const db = openDb();
    rejects(() => run(db, "INSERT INTO employee_permission_grants (employee_id, permission_code, granted_by) VALUES (?, 'inventory.view', ?)", KITCHEN, RECEPTION), 'KT_FORBIDDEN');
    rejects(() => run(db, "INSERT INTO employee_permission_grants (employee_id, permission_code, granted_by) VALUES (?, 'employees.manage', ?)", KITCHEN, OWNER), 'KT_NOT_GRANTABLE');
    rejects(() => run(db, "INSERT INTO employee_permission_grants (employee_id, permission_code, granted_by) VALUES (?, 'payments.void', ?)", RECEPTION, OWNER), 'KT_NOT_GRANTABLE');
  });
});

// ===========================================================================
describe('orders: the status moves only when staff act', () => {
  it('numbers orders per day and records who placed them', () => {
    const db = openDb();
    const a = placeOrder(db, { lines: [{ item: 'Mango juice' }] });
    const b = placeOrder(db, { lines: [{ item: 'Black tea' }] });
    assert.equal(orderOf(db, a.orderId).order_number, 1);
    assert.equal(orderOf(db, b.orderId).order_number, 2);
    const ev = one(db, 'SELECT * FROM order_status_events WHERE order_id = ?', a.orderId);
    assert.equal(ev.to_status, 'placed');
    assert.equal(ev.actor_type, 'guest');
    assert.equal(orderOf(db, a.orderId).status, 'placed');
  });

  it('refuses any status change that is not a recorded step (no more "moving by itself")', () => {
    const db = openDb();
    const { orderId } = placeOrder(db, { lines: [{ item: 'Mango juice' }] });
    rejects(() => run(db, "UPDATE orders SET status = 'ready' WHERE id = ?", orderId), 'KT_USE_STATUS_EVENTS');
    rejects(() => run(db, "UPDATE orders SET status = 'ready', last_status_event_id = last_status_event_id + 1000 WHERE id = ?", orderId), 'KT_USE_STATUS_EVENTS');
    assert.equal(orderOf(db, orderId).status, 'placed');
  });

  it('lets only reception (or the owner) accept an order', () => {
    const db = openDb();
    const { orderId } = placeOrder(db, { lines: [{ item: 'Mango juice' }] });
    rejects(() => step(db, orderId, 'confirmed', KITCHEN), 'KT_FORBIDDEN');
    rejects(() => step(db, orderId, 'confirmed', 'guest'), 'KT_FORBIDDEN');
    step(db, orderId, 'confirmed', RECEPTION);
    assert.equal(orderOf(db, orderId).status, 'confirmed');
  });

  it('refuses skipped or backwards steps', () => {
    const db = openDb();
    const { orderId } = placeOrder(db, { lines: [{ item: 'Mango juice' }] });
    rejects(() => step(db, orderId, 'ready', KITCHEN), 'KT_BAD_TRANSITION');
    rejects(() => step(db, orderId, 'served', OWNER), 'KT_BAD_TRANSITION');
    rejects(() => run(db, "INSERT INTO order_status_events (order_id, from_status, to_status, actor_type) VALUES (?, NULL, 'placed', 'guest')", orderId), 'KT_BAD_TRANSITION');
  });

  it('stops two people acting on an old screen', () => {
    const db = openDb();
    const { orderId } = placeOrder(db, { lines: [{ item: 'Mango juice' }] });
    step(db, orderId, 'confirmed', RECEPTION);
    // reception's second tablet still shows "placed" and presses Accept again
    rejects(() => run(db, "INSERT INTO order_status_events (order_id, from_status, to_status, actor_type, actor_employee_id) VALUES (?, 'placed', 'confirmed', 'employee', ?)", orderId, RECEPTION), 'KT_STALE_STATUS');
  });

  it('keeps a full, named history from placed to served', () => {
    const db = openDb();
    const { orderId } = placeOrder(db, { lines: [{ item: 'Mango juice', qty: 2, note: 'less ice' }, { item: 'Ice latte' }], guestName: 'Aline' });
    step(db, orderId, 'confirmed', RECEPTION);
    step(db, orderId, 'preparing', KITCHEN);
    step(db, orderId, 'ready', KITCHEN);
    step(db, orderId, 'served', RECEPTION);
    const timeline = all(db, 'SELECT to_status, actor_type, actor_name FROM v_order_timeline WHERE order_id = ? ORDER BY event_id', orderId);
    assert.deepEqual(timeline.map((t) => t.to_status), ['placed', 'confirmed', 'preparing', 'ready', 'served']);
    assert.deepEqual(timeline.map((t) => t.actor_name), [null, 'Aline Uwase (demo)', 'Eric Habimana (demo)', 'Eric Habimana (demo)', 'Aline Uwase (demo)']);
    rejects(() => step(db, orderId, 'cancelled', OWNER, 'too late'), 'KT_BAD_TRANSITION');
    rejects(() => run(db, 'UPDATE order_status_events SET actor_employee_id = 1'), 'KT_APPEND_ONLY');
    rejects(() => run(db, 'DELETE FROM order_status_events'), 'KT_APPEND_ONLY');
    rejects(() => run(db, 'DELETE FROM orders'), 'KT_NO_DELETE');
    assert.deepEqual(problems(db), []);
  });

  it('lets kitchen undo "start" and "ready"', () => {
    const db = openDb();
    const { orderId } = acceptedOrder(db, [{ item: 'Black tea' }]);
    step(db, orderId, 'preparing', KITCHEN);
    step(db, orderId, 'confirmed', KITCHEN);     // started by mistake
    step(db, orderId, 'ready', KITCHEN);         // quick item, nothing to cook
    step(db, orderId, 'preparing', KITCHEN);     // not ready yet
    assert.equal(orderOf(db, orderId).status, 'preparing');
  });

  it('lets a guest cancel only before reception accepts, and always with a reason', () => {
    const db = openDb();
    const a = placeOrder(db, { lines: [{ item: 'Black coffee' }] });
    rejects(() => step(db, a.orderId, 'cancelled', 'guest', ''), /CHECK constraint failed/);
    step(db, a.orderId, 'cancelled', 'guest', 'Cancelled by guest');
    const b = acceptedOrder(db, [{ item: 'Black coffee' }]);
    rejects(() => step(db, b.orderId, 'cancelled', 'guest', 'changed my mind'), 'KT_FORBIDDEN');
  });

  it('pauses phone ordering without stopping counter orders', () => {
    const db = openDb();
    run(db, "UPDATE settings SET value = 'false', updated_by = ?, version = version + 1 WHERE key = 'ordering.guest_orders_enabled'", OWNER);
    rejects(() => placeOrder(db, { lines: [{ item: 'Black tea' }] }), 'KT_ORDERING_PAUSED');
    const { orderId } = placeOrder(db, { lines: [{ item: 'Black tea' }], channel: 'counter', createdBy: RECEPTION });
    assert.equal(one(db, 'SELECT actor_type FROM order_status_events WHERE order_id = ?', orderId).actor_type, 'employee');
    rejects(() => placeOrder(db, { lines: [{ item: 'Black tea' }], channel: 'counter', createdBy: KITCHEN }), 'KT_FORBIDDEN');
  });

  it('refuses orders for a table that was removed', () => {
    const db = openDb();
    run(db, "UPDATE dining_tables SET is_active = 0 WHERE code = 'T4'");
    rejects(() => placeOrder(db, { table: 'T4', lines: [{ item: 'Black tea' }] }), 'KT_BAD_TABLE');
  });
});

// ===========================================================================
describe('order lines and prices', () => {
  it('takes the price from the menu and refuses a price sent by the phone', () => {
    const db = openDb();
    const { orderId } = placeOrder(db, { lines: [{ item: 'Mango juice', qty: 2 }] });
    assert.equal(one(db, 'SELECT line_total_rwf FROM order_items WHERE order_id = ?', orderId).line_total_rwf, 10000);
    rejects(() => run(db, "INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price_rwf, quantity) VALUES (?, ?, 'Mango juice', 1, 1)", orderId, itemId(db, 'Mango juice')), 'KT_PRICE_MISMATCH');
  });

  it('locks the lines once reception accepts the order', () => {
    const db = openDb();
    const { orderId } = acceptedOrder(db, [{ item: 'Mango juice' }]);
    const line = one(db, 'SELECT id FROM order_items WHERE order_id = ?', orderId).id;
    rejects(() => run(db, 'UPDATE order_items SET quantity = 5 WHERE id = ?', line), 'KT_ORDER_LOCKED');
    rejects(() => run(db, 'DELETE FROM order_items WHERE id = ?', line), 'KT_ORDER_LOCKED');
    rejects(() => run(db, "INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price_rwf, quantity) SELECT ?, id, name, price_rwf, 1 FROM menu_items WHERE name = 'Black tea'", orderId), 'KT_ORDER_LOCKED');
  });

  it('lets the kitchen mark an item sold out (and tells reception), but not reception', () => {
    const db = openDb();
    const mango = itemId(db, 'Mango juice');
    rejects(() => updateMenuItem(db, mango, { is_available: 0 }, RECEPTION), 'KT_FORBIDDEN');
    updateMenuItem(db, mango, { is_available: 0, unavailable_reason: 'no ripe mangoes today' }, KITCHEN);
    rejects(() => placeOrder(db, { lines: [{ item: 'Mango juice' }] }), 'KT_ITEM_UNAVAILABLE');
    const note = one(db, "SELECT * FROM notifications WHERE kind = 'menu_item_sold_out'");
    assert.equal(note.for_permission, 'orders.view');
    assert.match(note.message, /Mango juice is sold out: no ripe mangoes today/);
    rejects(() => updateMenuItem(db, mango, { price_rwf: 100 }, KITCHEN), 'KT_FORBIDDEN');
  });

  it('records every price change, and never changes what was already ordered', () => {
    const db = openDb();
    const mango = itemId(db, 'Mango juice');
    const { orderId, invoice } = acceptedOrder(db, [{ item: 'Mango juice' }]);
    rejects(() => updateMenuItem(db, mango, { price_rwf: 5500 }, RECEPTION), 'KT_FORBIDDEN');
    rejects(() => run(db, 'UPDATE menu_items SET price_rwf = 5500 WHERE id = ?', mango), 'KT_EDITOR_REQUIRED');
    updateMenuItem(db, mango, { price_rwf: 5500 }, OWNER);
    const h = one(db, 'SELECT * FROM menu_item_price_history WHERE menu_item_id = ?', mango);
    assert.deepEqual([h.old_price_rwf, h.new_price_rwf, h.changed_by], [5000, 5500, OWNER]);
    assert.equal(one(db, 'SELECT unit_price_rwf FROM order_items WHERE order_id = ?', orderId).unit_price_rwf, 5000);
    assert.equal(invoiceOf(db, orderId).total_rwf, invoice.total_rwf);
    const next = placeOrder(db, { lines: [{ item: 'Mango juice' }] });
    assert.equal(one(db, 'SELECT unit_price_rwf FROM order_items WHERE order_id = ?', next.orderId).unit_price_rwf, 5500);
  });
});

// ===========================================================================
describe('invoices', () => {
  it('issues an invoice automatically when reception accepts, matching the order exactly', () => {
    const db = openDb();
    const { orderId } = placeOrder(db, { lines: [{ item: 'Mango juice', qty: 2 }, { item: 'Ice latte' }] });
    assert.equal(invoiceOf(db, orderId), undefined);           // not before acceptance
    step(db, orderId, 'confirmed', RECEPTION);
    const inv = invoiceOf(db, orderId);
    assert.equal(inv.invoice_number, 'KT-000001');
    assert.equal(inv.total_rwf, 14500);
    assert.equal(inv.status, 'unpaid');
    assert.equal(inv.issued_by, RECEPTION);
    const lines = all(db, 'SELECT line_no, description, unit_price_rwf, quantity, line_total_rwf FROM invoice_lines WHERE invoice_id = ? ORDER BY line_no', inv.id);
    assert.deepEqual(lines.map((l) => [l.line_no, l.description, l.unit_price_rwf, l.quantity, l.line_total_rwf]),
      [[1, 'Mango juice', 5000, 2, 10000], [2, 'Ice latte', 4500, 1, 4500]]);
  });

  it('numbers invoices without gaps, even when an acceptance fails in between', () => {
    const db = openDb();
    acceptedOrder(db, [{ item: 'Black tea' }]);
    // not enough oranges (30 in stock, 4 per juice): 8 juices need 32
    const big = placeOrder(db, { lines: [{ item: 'Orange juice', qty: 7 }] });
    run(db, "UPDATE order_items SET quantity = 7 WHERE order_id = ?", big.orderId);
    receiveStock(db, { item: 'Oranges', qty: -3, type: 'waste', reason: 'rotten' }); // 27 left: 7 x 4 = 28 is too many
    rejects(() => step(db, big.orderId, 'confirmed', RECEPTION), 'KT_INSUFFICIENT_STOCK');
    const ok = acceptedOrder(db, [{ item: 'Black tea' }]);
    assert.equal(ok.invoice.invoice_number, 'KT-000002');
    assert.deepEqual(all(db, 'SELECT invoice_seq FROM invoices ORDER BY invoice_seq').map((r) => r.invoice_seq), [1, 2]);
  });

  it('cannot be written, edited or deleted by hand', () => {
    const db = openDb();
    const { orderId, invoice } = acceptedOrder(db, [{ item: 'Black tea' }]);
    rejects(() => run(db, 'UPDATE invoices SET total_rwf = 1 WHERE id = ?', invoice.id), 'KT_READ_ONLY');
    rejects(() => run(db, 'UPDATE invoices SET amount_paid_rwf = total_rwf WHERE id = ?', invoice.id), 'KT_USE_PAYMENTS');
    rejects(() => run(db, 'UPDATE invoice_lines SET unit_price_rwf = 1'), 'KT_READ_ONLY');
    rejects(() => run(db, 'DELETE FROM invoices'), 'KT_NO_DELETE');
    rejects(() => run(db, "UPDATE invoices SET voided_at = 'x', voided_by = 1 WHERE id = ?", invoice.id), 'KT_VOID_BY_CANCEL');
    const p = placeOrder(db, { lines: [{ item: 'Black tea' }] });
    rejects(() => run(db, 'INSERT INTO invoices (invoice_seq, order_id, issued_at, issued_by, total_rwf) VALUES (99, ?, ?, 2, 2000)', p.orderId, nowIso()), 'KT_BAD_INVOICE');
    assert.ok(orderId);
  });

  it('voids the invoice when an accepted order is cancelled', () => {
    const db = openDb();
    const { orderId, invoice } = acceptedOrder(db, [{ item: 'Cappuccino' }]);
    step(db, orderId, 'cancelled', RECEPTION, 'Guest left');
    const inv = invoiceOf(db, orderId);
    assert.equal(inv.status, 'void');
    assert.equal(inv.void_reason, 'Guest left');
    assert.equal(one(db, "SELECT count(*) AS n FROM audit_log WHERE action = 'invoice.voided'").n, 1);
    rejects(() => recordPayment(db, { allocations: [[invoice.id, 3500]] }), 'KT_INVOICE_VOID');
  });
});

// ===========================================================================
describe('payments', () => {
  it('tracks unpaid, partly paid and paid', () => {
    const db = openDb();
    const { orderId, invoice } = acceptedOrder(db, [{ item: 'Mango juice', qty: 2 }]);
    recordPayment(db, { method: 'cash', allocations: [[invoice.id, 4000]] });
    assert.equal(invoiceOf(db, orderId).status, 'partially_paid');
    recordPayment(db, { method: 'momo', reference: 'TX1001', allocations: [[invoice.id, 6000]] });
    const s = one(db, 'SELECT payment_status, balance_rwf FROM v_order_summary WHERE order_id = ?', orderId);
    assert.deepEqual([s.payment_status, s.balance_rwf], ['paid', 0]);
    assert.deepEqual(problems(db), []);
  });

  it('pays two orders of one table with one MoMo transfer', () => {
    const db = openDb();
    const a = acceptedOrder(db, [{ item: 'Mango juice' }], 'T3');
    const b = acceptedOrder(db, [{ item: 'Black tea' }], 'T3');
    recordPayment(db, { reference: 'TX2002', allocations: [[a.invoice.id, 5000], [b.invoice.id, 2000]] });
    assert.equal(invoiceOf(db, a.orderId).status, 'paid');
    assert.equal(invoiceOf(db, b.orderId).status, 'paid');
    assert.equal(one(db, 'SELECT count(*) AS n FROM payments').n, 1);
  });

  it('refuses paying too much, or allocating more than was received', () => {
    const db = openDb();
    const { invoice } = acceptedOrder(db, [{ item: 'Black tea' }]);
    rejects(() => recordPayment(db, { method: 'cash', allocations: [[invoice.id, 2500]] }), 'KT_OVERPAYMENT');
    const pid = Number(run(db, "INSERT INTO payments (method, amount_rwf, received_by) VALUES ('cash', 1000, ?)", RECEPTION).lastInsertRowid);
    rejects(() => run(db, 'INSERT INTO payment_allocations (payment_id, invoice_id, amount_rwf) VALUES (?, ?, 2000)', pid, invoice.id), 'KT_OVER_ALLOCATED');
  });

  it('lets reception record payments but not the kitchen', () => {
    const db = openDb();
    const { invoice } = acceptedOrder(db, [{ item: 'Black tea' }]);
    rejects(() => recordPayment(db, { by: KITCHEN, allocations: [[invoice.id, 2000]] }), 'KT_FORBIDDEN');
    recordPayment(db, { by: RECEPTION, method: 'cash', allocations: [[invoice.id, 2000]] });
  });

  it('refuses the same MoMo transaction twice', () => {
    const db = openDb();
    const a = acceptedOrder(db, [{ item: 'Black tea' }]);
    const b = acceptedOrder(db, [{ item: 'Black tea' }]);
    recordPayment(db, { reference: 'TX3003', allocations: [[a.invoice.id, 2000]] });
    rejects(() => recordPayment(db, { reference: 'TX3003', allocations: [[b.invoice.id, 2000]] }), /UNIQUE constraint failed/);
  });

  it('never edits a payment; the owner voids a wrong one and the invoice is owed again', () => {
    const db = openDb();
    const { orderId, invoice } = acceptedOrder(db, [{ item: 'Black tea' }]);
    const pid = recordPayment(db, { reference: 'TX4004', allocations: [[invoice.id, 2000]] });
    rejects(() => run(db, 'UPDATE payments SET amount_rwf = 1 WHERE id = ?', pid), 'KT_APPEND_ONLY');
    rejects(() => run(db, 'DELETE FROM payments'), 'KT_APPEND_ONLY');
    rejects(() => run(db, "UPDATE payments SET voided_at = ?, voided_by = ?, void_reason = 'typo' WHERE id = ?", nowIso(), RECEPTION, pid), 'KT_FORBIDDEN');
    run(db, "UPDATE payments SET voided_at = ?, voided_by = ?, void_reason = 'wrong table' WHERE id = ?", nowIso(), OWNER, pid);
    assert.equal(invoiceOf(db, orderId).status, 'unpaid');
    assert.equal(one(db, "SELECT count(*) AS n FROM audit_log WHERE action = 'payment.voided'").n, 1);
    recordPayment(db, { reference: 'TX4004', allocations: [[invoice.id, 2000]] });   // recorded again, correctly
    assert.equal(invoiceOf(db, orderId).status, 'paid');
  });

  it('refuses to cancel an order that has payments', () => {
    const db = openDb();
    const { orderId, invoice } = acceptedOrder(db, [{ item: 'Black tea' }]);
    recordPayment(db, { method: 'cash', allocations: [[invoice.id, 2000]] });
    rejects(() => step(db, orderId, 'cancelled', OWNER, 'mistake'), 'KT_HAS_PAYMENTS');
  });

  it('turns a guest\'s "I\'ve paid" into a claim that reception confirms', () => {
    const db = openDb();
    const { invoice } = acceptedOrder(db, [{ item: 'Black tea' }]);
    run(db, "INSERT INTO payment_claims (invoice_id, payer_phone, reference) VALUES (?, '+250788123456', 'TX5005')", invoice.id);
    rejects(() => run(db, 'INSERT INTO payment_claims (invoice_id) VALUES (?)', invoice.id), /UNIQUE constraint failed/);
    const pid = recordPayment(db, { reference: 'TX5005', allocations: [[invoice.id, 2000]] });
    rejects(() => run(db, "UPDATE payment_claims SET status = 'confirmed', resolved_by = ?, resolved_at = ?, payment_id = ?", KITCHEN, nowIso(), pid), 'KT_FORBIDDEN');
    run(db, "UPDATE payment_claims SET status = 'confirmed', resolved_by = ?, resolved_at = ?, payment_id = ?", RECEPTION, nowIso(), pid);
  });
});

// ===========================================================================
describe('inventory', () => {
  it('gives reception no way to touch the stock', () => {
    const db = openDb();
    rejects(() => receiveStock(db, { item: 'Mangoes', qty: 1000, by: RECEPTION }), 'KT_FORBIDDEN');
    rejects(() => receiveStock(db, { item: 'Mangoes', qty: -100, by: RECEPTION, type: 'adjustment', reason: 'count' }), 'KT_FORBIDDEN');
    rejects(() => run(db, "INSERT INTO stock_items (name, category, base_unit, created_by, updated_by) VALUES ('Gin', 'spirits', 'ml', ?, ?)", RECEPTION, RECEPTION), 'KT_FORBIDDEN');
  });

  it('lets the head chef (granted by the owner) update stock, but not other kitchen staff', () => {
    const db = openDb();
    rejects(() => receiveStock(db, { item: 'Mangoes', qty: -200, by: KITCHEN, type: 'waste', reason: 'spoiled' }), 'KT_FORBIDDEN');
    receiveStock(db, { item: 'Mangoes', qty: -200, by: HEAD_CHEF, type: 'waste', reason: 'spoiled' });
    receiveStock(db, { item: 'Mangoes', qty: 3000, by: HEAD_CHEF, cost: 4500, reason: 'Kibuye market' });
    assert.equal(stockOf(db, 'Mangoes'), 5000 - 200 + 3000);
  });

  it('lets only stock managers add stock products, starting at zero', () => {
    const db = openDb();
    rejects(() => run(db, "INSERT INTO stock_items (name, category, base_unit, created_by, updated_by) VALUES ('Gin', 'spirits', 'ml', ?, ?)", HEAD_CHEF, HEAD_CHEF), 'KT_FORBIDDEN');
    rejects(() => run(db, "INSERT INTO stock_items (name, category, base_unit, quantity_on_hand, created_by, updated_by) VALUES ('Gin', 'spirits', 'ml', 750, ?, ?)", OWNER, OWNER), 'KT_USE_MOVEMENTS');
    run(db, "INSERT INTO stock_items (name, category, base_unit, pack_name, pack_size, created_by, updated_by) VALUES ('Gin', 'spirits', 'ml', 'bottle', 750, ?, ?)", OWNER, OWNER);
    assert.equal(stockOf(db, 'Gin'), 0);
  });

  it('takes the recipe out of stock when reception accepts, not before', () => {
    const db = openDb();
    const { orderId } = placeOrder(db, { lines: [{ item: 'Cappuccino', qty: 2 }] });
    assert.equal(stockOf(db, 'Coffee beans'), 2000);
    step(db, orderId, 'confirmed', RECEPTION);
    assert.equal(stockOf(db, 'Coffee beans'), 2000 - 36);
    assert.equal(stockOf(db, 'Fresh milk'), 6000 - 300);
    const sales = all(db, "SELECT created_by FROM stock_movements WHERE movement_type = 'sale'");
    assert.equal(sales.length, 2);
    assert.ok(sales.every((m) => m.created_by === RECEPTION));
  });

  it('puts the stock back if an accepted order is cancelled before cooking, not after', () => {
    const db = openDb();
    const a = acceptedOrder(db, [{ item: 'Mango juice' }]);
    step(db, a.orderId, 'cancelled', RECEPTION, 'Guest left');
    assert.equal(stockOf(db, 'Mangoes'), 5000);
    const b = acceptedOrder(db, [{ item: 'Mango juice' }]);
    step(db, b.orderId, 'preparing', KITCHEN);
    step(db, b.orderId, 'cancelled', RECEPTION, 'Guest left');
    assert.equal(stockOf(db, 'Mangoes'), 4700);   // the mango was already used
    assert.deepEqual(problems(db), []);
  });

  it('refuses to accept an order when the stock is short, and changes nothing', () => {
    const db = openDb();
    const { orderId } = placeOrder(db, { lines: [{ item: 'Mint tea', qty: 10 }] });   // 100 g of 300 g
    receiveStock(db, { item: 'Fresh mint', qty: -250, type: 'adjustment', reason: 'recount' }); // 50 g left
    rejects(() => step(db, orderId, 'confirmed', RECEPTION), 'KT_INSUFFICIENT_STOCK');
    assert.equal(orderOf(db, orderId).status, 'placed');
    assert.equal(invoiceOf(db, orderId), undefined);
    assert.equal(stockOf(db, 'Fresh mint'), 50);
  });

  it('never lets stock go below zero', () => {
    const db = openDb();
    rejects(() => receiveStock(db, { item: 'Spice mix', qty: -251, type: 'waste', reason: 'spilled' }), 'KT_INSUFFICIENT_STOCK');
  });

  it('changes quantities only through the ledger, which can never be edited', () => {
    const db = openDb();
    rejects(() => run(db, "UPDATE stock_items SET quantity_on_hand = 99999 WHERE name = 'Mangoes'"), 'KT_USE_MOVEMENTS');
    rejects(() => run(db, 'UPDATE stock_movements SET quantity_delta = 1'), 'KT_APPEND_ONLY');
    rejects(() => run(db, 'DELETE FROM stock_movements'), 'KT_APPEND_ONLY');
    rejects(() => run(db, 'DELETE FROM stock_items'), 'KT_NO_DELETE');
    rejects(() => receiveStock(db, { item: 'Mangoes', qty: 100, type: 'adjustment' }), /CHECK constraint failed/); // a reason is required
  });

  it('warns stock managers when something gets low or runs out', () => {
    const db = openDb();
    receiveStock(db, { item: 'Spice mix', qty: -190, type: 'adjustment', reason: 'recount' });   // 60 g, reorder at 50
    assert.equal(one(db, 'SELECT count(*) AS n FROM notifications').n, 0);
    receiveStock(db, { item: 'Spice mix', qty: -20, type: 'waste', reason: 'spilled' });         // 40 g: low
    receiveStock(db, { item: 'Spice mix', qty: -40, type: 'waste', reason: 'spilled' });         // 0: out
    const notes = all(db, 'SELECT kind, for_permission, message FROM notifications ORDER BY id');
    assert.deepEqual(notes.map((n) => n.kind), ['low_stock', 'out_of_stock']);
    assert.ok(notes.every((n) => n.for_permission === 'inventory.view'));
    assert.match(notes[0].message, /Spice mix is low: 40 g left/);
  });

  it('shows items as out of stock when an ingredient runs out', () => {
    const db = openDb();
    receiveStock(db, { item: 'Oranges', qty: -27, type: 'waste', reason: 'rotten' });   // 3 left, juice needs 4
    const r = one(db, "SELECT availability, portions_left FROM v_menu_availability WHERE name = 'Orange juice'");
    assert.deepEqual([r.availability, r.portions_left], ['out_of_stock', 0]);
    rejects(() => placeOrder(db, { lines: [{ item: 'Orange juice' }] }), 'KT_ITEM_UNAVAILABLE');
    rejects(() => placeOrder(db, { lines: [{ item: 'Mango juice', qty: 17 }] }), 'KT_INSUFFICIENT_STOCK'); // 16 portions left
    assert.equal(one(db, "SELECT portions_left FROM v_menu_availability WHERE name = 'Black coffee'").portions_left, 111);
    assert.equal(one(db, "SELECT portions_left FROM v_menu_availability WHERE name = 'Mango juice'").portions_left, 16);
  });

  it('refuses to remove a stock product that a menu item still uses', () => {
    const db = openDb();
    rejects(() => run(db, "UPDATE stock_items SET is_active = 0, updated_by = ?, version = version + 1 WHERE name = 'Fresh milk'", OWNER), 'KT_IN_USE');
    rejects(() => run(db, "UPDATE stock_items SET reorder_level = 1, updated_by = ?, version = version + 1 WHERE name = 'Fresh milk'", HEAD_CHEF), 'KT_FORBIDDEN');
    run(db, "UPDATE stock_items SET reorder_level = 1000, updated_by = ?, version = version + 1 WHERE name = 'Fresh milk'", OWNER);
  });

  it('keeps every stock balance equal to the sum of its movements after a busy day', () => {
    const db = openDb();
    for (let i = 0; i < 15; i++) {
      const o = acceptedOrder(db, [{ item: 'Cappuccino' }, { item: 'Lemon tea', qty: 2 }, { item: 'Watermelon juice' }], 'T' + (1 + (i % 4)));
      if (i % 5 === 0) step(db, o.orderId, 'cancelled', RECEPTION, 'test');
      else { step(db, o.orderId, 'preparing', KITCHEN); step(db, o.orderId, 'ready', KITCHEN); step(db, o.orderId, 'served', RECEPTION);
             recordPayment(db, { method: i % 2 ? 'cash' : 'momo', reference: i % 2 ? '' : 'TXB' + i, allocations: [[o.invoice.id, o.invoice.total_rwf]] }); }
    }
    receiveStock(db, { item: 'Coffee beans', qty: 1000, cost: 18000 });
    assert.deepEqual(problems(db), []);
  });
});

// ===========================================================================
describe('reports', () => {
  it('adds up the day: billed, paid, unpaid, cancelled, takings by method, items sold', () => {
    const db = openDb();
    const a = acceptedOrder(db, [{ item: 'Mango juice', qty: 2 }]);          // 10,000
    const b = acceptedOrder(db, [{ item: 'Ice latte' }]);                    //  4,500
    const c = acceptedOrder(db, [{ item: 'Black tea' }]);                    //  2,000 -> cancelled
    step(db, c.orderId, 'cancelled', RECEPTION, 'Guest left');
    placeOrder(db, { lines: [{ item: 'Black tea' }] });                      // waiting
    recordPayment(db, { reference: 'TX6006', allocations: [[a.invoice.id, 10000]] });
    recordPayment(db, { method: 'cash', allocations: [[b.invoice.id, 2500]] });
    const day = one(db, 'SELECT * FROM v_daily_sales');
    assert.deepEqual([day.orders, day.waiting_orders, day.cancelled_orders, day.billed_rwf, day.paid_rwf, day.unpaid_rwf],
      [2, 1, 1, 14500, 12500, 2000]);
    const takings = Object.fromEntries(all(db, 'SELECT method, amount_rwf FROM v_daily_takings').map((r) => [r.method, r.amount_rwf]));
    assert.deepEqual(takings, { cash: 2500, momo: 10000 });
    const items = Object.fromEntries(all(db, 'SELECT item_name, quantity FROM v_item_sales').map((r) => [r.item_name, r.quantity]));
    assert.deepEqual(items, { 'Mango juice': 2, 'Ice latte': 1 });
    const week = one(db, 'SELECT * FROM v_weekly_sales');
    assert.equal(week.billed_rwf, 14500);
    assert.equal(new Date(week.week_start + 'T12:00:00Z').getUTCDay(), 1);   // a Monday
  });

  it('counts a 01:30 sale in the night before, and restarts order numbers each business day', () => {
    const db = openDb();
    const late = placeOrder(db, { lines: [{ item: 'Black tea' }], createdAt: '2026-10-31T23:30:00.000Z' });  // 01:30 Nov 1 in Kigali
    const morning = placeOrder(db, { lines: [{ item: 'Black tea' }], createdAt: '2026-11-01T06:00:00.000Z' }); // 08:00 Nov 1
    assert.equal(orderOf(db, late.orderId).business_date, '2026-10-31');
    assert.equal(orderOf(db, morning.orderId).business_date, '2026-11-01');
    assert.equal(orderOf(db, morning.orderId).order_number, 1);
  });
});

// ===========================================================================
describe('tables, settings, feedback and the audit log', () => {
  it('keeps one open "call staff" per table, answered by reception only', () => {
    const db = openDb();
    run(db, "INSERT INTO service_requests (table_id, request_type) VALUES (2, 'call_staff')");
    rejects(() => run(db, "INSERT INTO service_requests (table_id, request_type) VALUES (2, 'call_staff')"), /UNIQUE constraint failed/);
    run(db, "INSERT INTO service_requests (table_id, request_type) VALUES (2, 'bill')");
    rejects(() => run(db, "UPDATE service_requests SET status = 'done', resolved_by = ?, resolved_at = ? WHERE request_type = 'call_staff'", KITCHEN, nowIso()), 'KT_FORBIDDEN');
    run(db, "UPDATE service_requests SET status = 'done', resolved_by = ?, resolved_at = ? WHERE request_type = 'call_staff'", RECEPTION, nowIso());
    run(db, "INSERT INTO service_requests (table_id, request_type) VALUES (2, 'call_staff')");   // a new one is fine now
  });

  it('lets only the owner change settings, and keeps a trail', () => {
    const db = openDb();
    rejects(() => run(db, "UPDATE settings SET value = '\"0788000000\"', updated_by = ?, version = version + 1 WHERE key = 'payment.momo_number'", RECEPTION), 'KT_FORBIDDEN');
    rejects(() => run(db, "UPDATE settings SET value = 'not json', updated_by = ?, version = version + 1 WHERE key = 'payment.momo_number'", OWNER), /CHECK constraint failed/);
    run(db, "UPDATE settings SET value = '\"0788000000\"', updated_by = ?, version = version + 1 WHERE key = 'payment.momo_number'", OWNER);
    const a = one(db, "SELECT * FROM audit_log WHERE action = 'setting.changed'");
    assert.deepEqual(JSON.parse(a.details), { from: '0783094301', to: '0788000000' });
    rejects(() => run(db, 'UPDATE audit_log SET actor_employee_id = 2'), 'KT_APPEND_ONLY');
    rejects(() => run(db, 'DELETE FROM audit_log'), 'KT_APPEND_ONLY');
  });

  it('keeps one rating per order and names who typed paper cards', () => {
    const db = openDb();
    const { orderId } = acceptedOrder(db, [{ item: 'Black tea' }]);
    run(db, "INSERT INTO feedback (source, rating, comment, order_id) VALUES ('digital', 5, 'Lovely view', ?)", orderId);
    rejects(() => run(db, "INSERT INTO feedback (source, rating, order_id) VALUES ('digital', 1, ?)", orderId), /UNIQUE constraint failed/);
    rejects(() => run(db, "INSERT INTO feedback (source, rating) VALUES ('paper', 4)"), /CHECK constraint failed/);
    run(db, "INSERT INTO feedback (source, rating, entered_by) VALUES ('paper', 4, ?)", RECEPTION);
  });

  it('records guests who agree to hear about events, with the date they agreed', () => {
    const db = openDb();
    rejects(() => run(db, "INSERT INTO customers (name, phone, marketing_opt_in) VALUES ('Aline', '+250788123456', 1)"), /CHECK constraint failed/);
    run(db, "INSERT INTO customers (name, phone, marketing_opt_in, opted_in_at) VALUES ('Aline', '+250788123456', 1, ?)", nowIso());
    run(db, "INSERT INTO customers (name, phone) VALUES ('Tourist', '+33612345678')");
    rejects(() => run(db, "INSERT INTO customers (name, phone) VALUES ('Bad', '0788')"), /CHECK constraint failed/);
  });
});
