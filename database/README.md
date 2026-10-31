# K.Town database

SQLite schema, reference data and tests for the rebuilt K.Town system (React + Node.js + SQLite).
Read [`../docs/database-design.md`](../docs/database-design.md) first: it explains every table and rule.

| File | What it is |
|---|---|
| `schema.sql` | Tables, views and the rules the database enforces (triggers) |
| `seed.sql` | Roles, permissions, order life cycle, settings, the 4 tables and the menu |
| `sample-data.sql` | **Development only**: demo staff, stock and example recipes |
| `test/database.test.mjs` | 58 tests, one or more for every rule |
| `test/helpers.mjs` | How the API performs each action (place an order, move it, pay, receive stock) |
| `scripts/create-db.mjs` | Creates a database file to explore |

Needs Node.js 22.13 or newer (it includes SQLite). No `npm install` needed.

```bash
npm test                    # run the tests
npm run db:create:sample    # ktown-dev.db with demo data
npm run db:create           # ktown.db with the menu, tables and settings only
```

Open a `.db` file with [DB Browser for SQLite](https://sqlitebrowser.org/) to look inside. Database files are not committed (see `.gitignore`).

Every connection must run `PRAGMA foreign_keys = ON` (and `journal_mode = WAL`, `busy_timeout = 5000`, `synchronous = NORMAL`): SQLite does not remember these settings.
