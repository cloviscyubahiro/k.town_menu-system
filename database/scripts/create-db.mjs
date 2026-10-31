// Creates a K.Town database file you can open in "DB Browser for SQLite".
//   npm run db:create          -> ktown.db      (empty business: menu, tables, settings; no staff yet)
//   npm run db:create:sample   -> ktown-dev.db  (plus demo staff, stock and recipes, for development)
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const sample = process.argv.includes('--sample');
const target = fileURLToPath(new URL(sample ? '../ktown-dev.db' : '../ktown.db', import.meta.url));
if (existsSync(target)) {
  console.error(`${target} already exists. Delete it first if you want a fresh one.`);
  process.exit(1);
}

const sql = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const db = new DatabaseSync(target);
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA journal_mode = WAL');
db.exec('BEGIN');
try {
  db.exec(sql('schema.sql'));
  db.exec(sql('seed.sql'));
  if (sample) db.exec(sql('sample-data.sql'));
  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  console.error('Could not create the database:', err.message);
  process.exit(1);
}

const problems = db.prepare('SELECT * FROM v_integrity_problems').all();
const count = (t) => db.prepare(`SELECT count(*) AS n FROM ${t}`).get().n;
console.log(`Created ${target}`);
console.log(`  schema version ${db.prepare('PRAGMA user_version').get().user_version}, ` +
  `${count('menu_items')} menu items, ${count('dining_tables')} tables, ${count('employees')} staff, ${count('stock_items')} stock products`);
console.log(problems.length ? `  PROBLEMS: ${JSON.stringify(problems)}` : '  integrity check: OK');
if (!sample) console.log('  No staff yet: the first account created will be the owner.');
db.close();
