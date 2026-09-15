'use strict';

/**
 * ScanInbox — pieteikumu atskaite terminālī. Lasa datubāzi tieši, tāpēc
 * serverim nav jādarbojas un pilnvara nav vajadzīga.
 *
 *   node leads.js            → kopsavilkums: valodas, segmenti, zīmoli, iekārtas
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
    { title: 'ZĪMOLI', get: (r) => r.brands || '—' },
    { title: 'MODELIS', get: (r) => r.device_model || '—' },
    { title: 'VAL.', get: (r) => r.lang.toUpperCase() },
  ]));
  console.log('');
  db.close();
  process.exit(0);
}

/* Lapas valoda ir tuvākais, kas mums ir, tirgum: reklāmas kampaņa katrā valstī
   ved uz savu valodu, tāpēc šī tabula atbild «kur pieprasījums vispār ir». */
console.log('\nVALODAS\n');
console.log(table(db.prepare(`
  SELECT lang, COUNT(*) AS leads,
         ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM leads), 1) AS pct
  FROM leads GROUP BY lang ORDER BY leads DESC`).all(), [
  { title: 'VALODA', get: (r) => r.lang.toUpperCase() },
  { title: 'CILVĒKI', get: (r) => r.leads, right: true },
  { title: '%', get: (r) => r.pct, right: true },
]));

console.log('\nSEGMENTI\n');
console.log(table(db.prepare('SELECT * FROM v_segment_demand').all(), [
  { title: 'SEGMENTS', get: (r) => r.label_lv },
  { title: 'CILVĒKI', get: (r) => r.leads, right: true },
  { title: 'BETA', get: (r) => r.beta_volunteers, right: true },
  { title: 'IERĪCES (MIN)', get: (r) => r.min_devices, right: true },
]));

/* Kuru ražotāju izvēlnes jāapraksta vispirms. Viens cilvēks var atzīmēt
   vairākus zīmolus, tāpēc procenti ir no tiem, kas uz šo vispār atbildēja. */
const answeredBrands = db.prepare('SELECT COUNT(DISTINCT lead_id) AS n FROM lead_brands').get().n;
console.log(`\nZĪMOLI   (${answeredBrands} atbildes)\n`);
console.log(table(db.prepare('SELECT * FROM v_brand_demand WHERE leads > 0').all(), [
  { title: 'ZĪMOLS', get: (r) => r.label_lv },
  { title: 'CILVĒKI', get: (r) => r.leads, right: true },
  { title: '%', get: (r) => (r.pct === null ? '—' : r.pct), right: true },
]));

/* Cenu jautājumu forma vairs neuzdod — tabula paliek vecajiem pieteikumiem. */
const priced = db.prepare('SELECT COUNT(*) AS n FROM leads WHERE price_band IS NOT NULL').get().n;
if (priced) {
  console.log('\nGATAVĪBA MAKSĀT   (vecie pieteikumi)\n');
  console.log(table(db.prepare('SELECT * FROM v_price_demand WHERE leads > 0').all(), [
    { title: 'JOSLA', get: (r) => r.label_lv },
    { title: 'CILVĒKI', get: (r) => r.leads, right: true },
    { title: '%', get: (r) => (r.pct === null ? '—' : r.pct), right: true },
  ]));
}

const models = db.prepare('SELECT * FROM v_device_models LIMIT 12').all();
if (models.length) {
  console.log('\nIEKĀRTAS, KO MINĒJUŠI\n');
  console.log(table(models, [
    { title: 'MODELIS', get: (r) => r.model },
    { title: 'REIZES', get: (r) => r.mentions, right: true },
  ]));
}

console.log('\n  node leads.js --list   visi pieteikumi');
console.log('  node leads.js --csv    eksports\n');

db.close();
