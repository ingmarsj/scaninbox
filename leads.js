'use strict';

/**
 * ScanInbox — pieteikumu atskaite terminālī. Lasa datubāzi tieši, tāpēc
 * serverim nav jādarbojas un pilnvara nav vajadzīga.
 *
 *   node leads.js            → kopsavilkums: cenu joslas, segmenti, iekārtas
 *   node leads.js --list     → visi pieteikumi
 *   node leads.js --csv      → CSV uz stdout (pārvirzi uz failu)
 */

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.SCANINBOX_DB || path.join(__dirname, 'data', 'scaninbox.db');

if (!fs.existsSync(DB_PATH)) {
  console.error(`Datubāze nav atrasta: ${DB_PATH}`);
  console.error('Palaid serveri vismaz vienu reizi: node server.js');
  process.exit(1);
}

const db = new DatabaseSync(DB_PATH, { readOnly: true });
const total = db.prepare('SELECT COUNT(*) AS n FROM leads').get().n;

/** Vienkārša teksta tabula ar līdzināšanu pēc platākās vērtības. */
function table(rows, cols) {
  if (!rows.length) return '  (nav datu)';
  const head = cols.map((c) => c.title);
  const body = rows.map((r) => cols.map((c) => (c.get(r) ?? '').toString()));
  const width = head.map((h, i) => Math.max(h.length, ...body.map((b) => b[i].length)));
  const line = (cells) => '  ' + cells.map((c, i) => (cols[i].right ? c.padStart(width[i]) : c.padEnd(width[i]))).join('  ');
  return [line(head), '  ' + width.map((w) => '-'.repeat(w)).join('  '), ...body.map(line)].join('\n');
}

if (process.argv.includes('--csv')) {
  const rows = db.prepare('SELECT * FROM v_leads ORDER BY created_at').all();
  if (rows.length) {
    const cols = Object.keys(rows[0]);
    const cell = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    console.log(cols.join(','));
    for (const r of rows) console.log(cols.map((c) => cell(r[c])).join(','));
  }
  db.close();
  process.exit(0);
}

console.log(`\nScanInbox — ${total} pieteikumi   (${DB_PATH})`);

if (total === 0) {
  console.log('\nVēl neviens nav pieteicies.\n');
  db.close();
  process.exit(0);
}

if (process.argv.includes('--list')) {
  console.log('\nPIETEIKUMI\n');
  console.log(table(db.prepare('SELECT * FROM v_leads ORDER BY created_at DESC').all(), [
    { title: 'DATUMS', get: (r) => r.created_at.slice(0, 10) },
    { title: 'E-PASTS', get: (r) => r.email },
    { title: 'VĀRDS', get: (r) => r.name || '—' },
    { title: 'SEGMENTS', get: (r) => r.segment_lv || '—' },
    { title: 'IERĪCES', get: (r) => r.device_band_lv || '—', right: true },
    { title: 'MODELIS', get: (r) => r.device_model || '—' },
    { title: 'CENA', get: (r) => r.price_band_lv || '—' },
    { title: 'BETA', get: (r) => (r.wants_beta ? 'jā' : '') },
  ]));
  console.log('');
  db.close();
  process.exit(0);
}

const priced = db.prepare('SELECT COUNT(*) AS n FROM leads WHERE price_band IS NOT NULL').get().n;

console.log('\nGATAVĪBA MAKSĀT\n');
console.log(table(db.prepare('SELECT * FROM v_price_demand').all(), [
  { title: 'JOSLA', get: (r) => r.label_lv },
  { title: 'CILVĒKI', get: (r) => r.leads, right: true },
  { title: '%', get: (r) => (r.pct === null ? '—' : r.pct), right: true },
]));

if (priced) {
  const arpu = db.prepare(`
    SELECT ROUND(SUM(p.eur_midpoint) / COUNT(*), 2) AS avg_eur, COUNT(*) AS n
    FROM leads l JOIN price_bands p ON p.code = l.price_band
    WHERE p.eur_midpoint IS NOT NULL`).get();
  if (arpu.n) {
    console.log(`\n  Vidējā norādītā vērtība: ${arpu.avg_eur} EUR par ierīci mēnesī (${arpu.n} atbildes)`);
  }
}

console.log('\nSEGMENTI\n');
console.log(table(db.prepare('SELECT * FROM v_segment_demand').all(), [
  { title: 'SEGMENTS', get: (r) => r.label_lv },
  { title: 'CILVĒKI', get: (r) => r.leads, right: true },
  { title: 'BETA', get: (r) => r.beta_volunteers, right: true },
  { title: 'IERĪCES (MIN)', get: (r) => r.min_devices, right: true },
]));

const models = db.prepare('SELECT * FROM v_device_models LIMIT 12').all();
console.log('\nIEKĀRTAS, KO MINĒJUŠI\n');
console.log(table(models, [
  { title: 'MODELIS', get: (r) => r.model },
  { title: 'REIZES', get: (r) => r.mentions, right: true },
]));

console.log('\n  node leads.js --list   visi pieteikumi');
console.log('  node leads.js --csv    eksports\n');

db.close();
