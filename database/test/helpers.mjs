// Test helpers. The small functions at the bottom do exactly what the Node API
// will do for each action, so they double as a reference for the backend.
import { readFileSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';

const dir = new URL('..', import.meta.url);
const sql = (name) => readFileSync(new URL(name, dir), 'utf8');

// Staff in sample-data.sql
export const OWNER = 1, RECEPTION = 2, KITCHEN = 3, HEAD_CHEF = 4;

export function openDb({ sample = true } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(sql('schema.sql'));
  db.exec(sql('seed.sql'));
  if (sample) db.exec(sql('sample-data.sql'));
  return db;
}

// Assert that fn fails with a K.Town rule (message starts with the code) or any text.
export function rejects(fn, expected) {
  assert.throws(fn, (err) => {
    const msg = String(err && err.message);
    if (expected instanceof RegExp ? expected.test(msg) : msg.startsWith(expected)) return true;
    throw new assert.AssertionError({ message: `expected "${expected}" but got "${msg}"` });
  });
}

export const one = (db, query, ...params) => db.prepare(query).get(...params);
export const all = (db, query, ...params) => db.prepare(query).all(...params);
export const run = (db, query, ...params) => db.prepare(query).run(...params);

export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

export const itemId = (db, name) => one(db, 'SELECT id FROM menu_items WHERE name = ?', name).id;
export const stockOf = (db, name) => one(db, 'SELECT quantity_on_hand AS q FROM stock_items WHERE name = ?', name).q;
export const orderOf = (db, id) => one(db, 'SELECT * FROM orders WHERE id = ?', id);
export const invoiceOf = (db, orderId) => one(db, 'SELECT * FROM invoices WHERE order_id = ?', orderId);
export const nowIso = () => new Date().toISOString();
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// ---------------------------------------------------------------------------
// Reference operations (what the API does)
// ---------------------------------------------------------------------------

// A guest orders from their phone (channel 'qr'), or reception types an order in
// (channel 'counter', createdBy = employee). Prices always come from the menu.
export function placeOrder(db, { table = 'T2', lines, guestName = '', channel = 'qr', createdBy = null, createdAt = null }) {
  return tx(db, () => {
    const token = randomBytes(24).toString('base64url');   // goes to the guest's phone
    const tableRow = table ? one(db, 'SELECT id FROM dining_tables WHERE code = ?', table) : null;
    const o = run(db,
      `INSERT INTO orders (tracking_token_hash, channel, table_id, guest_name, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, coalesce(?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))`,
      sha256(token), channel, tableRow ? tableRow.id : null, guestName, createdBy, createdAt);
    const orderId = Number(o.lastInsertRowid);
    for (const l of lines) {
      const r = run(db,
        `INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price_rwf, quantity, note)
         SELECT ?, id, name, price_rwf, ?, ? FROM menu_items WHERE id = ?`,
        orderId, l.qty || 1, l.note || '', typeof l.item === 'number' ? l.item : itemId(db, l.item));
      if (r.changes !== 1) throw new Error('KT_ITEM_UNAVAILABLE: unknown item');
    }
    return { orderId, token };
  });
}

// Move an order one step. actor = employee id, or 'guest'.
export function step(db, orderId, to, actor, reason = '') {
  const from = orderOf(db, orderId).status;
  return run(db,
    `INSERT INTO order_status_events (order_id, from_status, to_status, actor_type, actor_employee_id, reason)
     VALUES (?, ?, ?, ?, ?, ?)`,
    orderId, from, to, actor === 'guest' ? 'guest' : 'employee', actor === 'guest' ? null : actor, reason);
}

// Record money received and say which invoices it pays: [[invoiceId, amount], ...]
export function recordPayment(db, { method = 'momo', reference = '', by = RECEPTION, allocations }) {
  return tx(db, () => {
    const amount = allocations.reduce((s, [, a]) => s + a, 0);
    const p = run(db, 'INSERT INTO payments (method, amount_rwf, reference, received_by) VALUES (?, ?, ?, ?)', method, amount, reference, by);
    const paymentId = Number(p.lastInsertRowid);
    for (const [invoiceId, a] of allocations) {
      run(db, 'INSERT INTO payment_allocations (payment_id, invoice_id, amount_rwf) VALUES (?, ?, ?)', paymentId, invoiceId, a);
    }
    return paymentId;
  });
}

export function receiveStock(db, { item, qty, by = HEAD_CHEF, type = 'purchase', reason = '', cost = null }) {
  const id = one(db, 'SELECT id FROM stock_items WHERE name = ?', item).id;
  return run(db,
    'INSERT INTO stock_movements (stock_item_id, movement_type, quantity_delta, total_cost_rwf, reason, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    id, type, qty, type === 'purchase' ? cost : null, reason, by);
}

// Change a menu item the way the API does: always with who and when.
export function updateMenuItem(db, id, fields, by) {
  const sets = Object.keys(fields).map((k) => `${k} = ?`).join(', ');
  return run(db, `UPDATE menu_items SET ${sets}, updated_by = ?, updated_at = ?, version = version + 1 WHERE id = ?`,
    ...Object.values(fields), by, nowIso(), id);
}

// Change an employee the way the API does.
export function updateEmployee(db, id, fields, by) {
  const sets = Object.keys(fields).map((k) => `${k} = ?`).join(', ');
  return run(db, `UPDATE employees SET ${sets}, updated_by = ?, updated_at = ?, version = version + 1 WHERE id = ?`,
    ...Object.values(fields), by, nowIso(), id);
}

// An order accepted by reception: returns { orderId, invoice }.
export function acceptedOrder(db, lines, table = 'T2') {
  const { orderId } = placeOrder(db, { table, lines });
  step(db, orderId, 'confirmed', RECEPTION);
  return { orderId, invoice: invoiceOf(db, orderId) };
}

export const problems = (db) => all(db, 'SELECT * FROM v_integrity_problems');
