const express = require('express');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// DATA_DIR should point at a Railway volume mount (e.g. /data) so the
// database survives redeploys. Falls back to a local folder for dev.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'storage.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS storage (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

// One-time, idempotent fix for 2006-2010: those years' net monthly income
// figures didn't originally include the extra paychecks that landed in
// those calendar years, distributed evenly across the 12 months.
function migrateExtraPaycheckYears() {
  const updates = {
    '2006': { val: 3634, extra: 250 },
    '2007': { val: 3825, extra: 265 },
    '2008': { val: 3995, extra: 265 },
    '2009': { val: 4470, extra: 320 },
    '2010': { val: 4945, extra: 325 },
  };
  for (const year of Object.keys(updates)) {
    const { val, extra } = updates[year];
    const key = 'budget-sheet-' + year;
    const row = db.prepare('SELECT value FROM storage WHERE key = ?').get(key);
    if (!row) continue;
    const state = JSON.parse(row.value);
    if (state.extraMonthly === extra) continue; // already migrated
    const item = state.income && state.income.find(
      i => i.kind === 'other' && /net.*monthly/i.test(i.label)
    );
    if (!item) continue;
    item.label = 'Net Monthly Income*';
    item.val = val;
    item.note = `Includes $${extra}/mo distributed from extra paychecks`;
    state.extraMonthly = extra;
    db.prepare(`
      INSERT INTO storage (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, JSON.stringify(state));
  }
}
migrateExtraPaycheckYears();

// One-time, idempotent fix: standardize every IDC income line item's label
// to "IDC Annual Income" (was "IDC Income / year", "IDC Monthly Income", or
// "IDC Income" depending on the year), and add the missing 2009/2010 IDC
// income lines that were never recorded for those years.
function migrateIdcLabels() {
  function saveState(key, state) {
    db.prepare(`
      INSERT INTO storage (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, JSON.stringify(state));
  }
  function loadState(key) {
    const row = db.prepare('SELECT value FROM storage WHERE key = ?').get(key);
    return row ? JSON.parse(row.value) : null;
  }

  for (const key of ['jordan-budget-2026-v1', ...Array.from({ length: 15 }, (_, i) => 'budget-sheet-' + (2011 + i))]) {
    const state = loadState(key);
    if (!state || !Array.isArray(state.income)) continue;
    const item = state.income.find(i => i.kind === 'idc' || /^IDC (Income( \/ year)?|Monthly Income)$/.test(i.label));
    if (!item || item.label === 'IDC Annual Income') continue;
    item.label = 'IDC Annual Income';
    item.kind = 'idc';
    saveState(key, state);
  }

  const newIdc = { '2009': 2728, '2010': 3884 };
  for (const year of Object.keys(newIdc)) {
    const key = 'budget-sheet-' + year;
    const state = loadState(key);
    if (!state || !Array.isArray(state.income)) continue;
    if (state.income.some(i => i.kind === 'idc')) continue;
    const idx = state.income.findIndex(i => i.label === 'Gross Monthly Payment');
    const newItem = { label: 'IDC Annual Income', val: newIdc[year], kind: 'idc' };
    if (idx === -1) state.income.push(newItem);
    else state.income.splice(idx + 1, 0, newItem);
    saveState(key, state);
  }
}
migrateIdcLabels();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/storage/:key', (req, res) => {
  const row = db.prepare('SELECT value FROM storage WHERE key = ?').get(req.params.key);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json({ key: req.params.key, value: row.value });
});

app.put('/api/storage/:key', (req, res) => {
  const value = req.body && req.body.value;
  if (typeof value !== 'string') {
    return res.status(400).json({ error: 'value must be a string' });
  }
  db.prepare(`
    INSERT INTO storage (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(req.params.key, value);
  res.json({ key: req.params.key, value });
});

app.delete('/api/storage/:key', (req, res) => {
  db.prepare('DELETE FROM storage WHERE key = ?').run(req.params.key);
  res.json({ key: req.params.key, deleted: true });
});

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Budget app listening on port ${PORT}`));
