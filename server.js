'use strict';

/**
 * ScanInbox — statiskā lapa + pieteikumu API uz SQLite.
 *
 *   node server.js                 → http://localhost:8123
 *   node server.js --port 9000
 *
 * Nulle npm atkarību: SQLite nāk no Node iebūvētā `node:sqlite` (Node 22.5+).
 *
 * Vides mainīgie:
 *   SCANINBOX_DB            datubāzes fails (noklusējums ./data/scaninbox.db)
 *   SCANINBOX_ADMIN_TOKEN   nepieciešams, lai lasītu pieteikumus caur API.
 *                           Ja nav uzstādīts, lasīšanas galapunkti ir slēgti.
 *   SCANINBOX_ALLOW_ORIGIN  CORS izcelsme, ja lapa tiek hostēta atsevišķi
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const PORT = Number(argv('--port')) || Number(process.env.PORT) || 8123;
const DB_PATH = process.env.SCANINBOX_DB || path.join(ROOT, 'data', 'scaninbox.db');
const ADMIN_TOKEN = process.env.SCANINBOX_ADMIN_TOKEN || '';
const ALLOW_ORIGIN = process.env.SCANINBOX_ALLOW_ORIGIN || '';

const MAX_BODY = 8 * 1024;            // pieteikums nekad nav lielāks
const RATE_MAX = 5;                   // iesniegumi uz IP
const RATE_WINDOW_MS = 10 * 60 * 1000;

/* Ceļi, ko nekad nepasniedz, arī ja kāds tos pieprasa tieši. */
const BLOCKED = new Set(['data', '.git', 'node_modules', 'db']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8',
};

function argv(flag) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : undefined;
}

// ---------------------------------------------------------------- datubāze ---

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');   // vairāki lasītāji netraucē rakstītāju
db.exec('PRAGMA foreign_keys = ON');    // jāieslēdz katram savienojumam
db.exec('PRAGMA busy_timeout = 5000');
db.exec(fs.readFileSync(path.join(ROOT, 'db', 'schema.sql'), 'utf8'));

/* Derīgās koda vērtības nāk no datubāzes, nevis no otras kopijas JS pusē. */
const codes = {
  segment: new Set(db.prepare('SELECT code FROM segments').all().map((r) => r.code)),
  device_band: new Set(db.prepare('SELECT code FROM device_bands').all().map((r) => r.code)),
  price_band: new Set(db.prepare('SELECT code FROM price_bands').all().map((r) => r.code)),
};

const q = {
  findByEmail: db.prepare('SELECT id FROM leads WHERE email_norm = ?'),
  insert: db.prepare(`
    INSERT INTO leads (email, email_norm, name, segment, device_band, device_model,
                       price_band, wants_beta, consent, lang)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`),
  update: db.prepare(`
    UPDATE leads SET email = ?, name = ?, segment = ?, device_band = ?, device_model = ?,
                     price_band = ?, wants_beta = ?, lang = ?,
                     updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE id = ?`),
  event: db.prepare('INSERT INTO lead_events (lead_id, kind, payload) VALUES (?, ?, ?)'),
  list: db.prepare('SELECT * FROM v_leads ORDER BY created_at DESC LIMIT ?'),
  count: db.prepare('SELECT COUNT(*) AS n FROM leads'),
  priceDemand: db.prepare('SELECT * FROM v_price_demand'),
  segmentDemand: db.prepare('SELECT * FROM v_segment_demand'),
  models: db.prepare('SELECT * FROM v_device_models LIMIT 25'),
};

// ------------------------------------------------------------- validācija ---

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function clean(value, max) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function code(value, kind) {
  const v = clean(value, 40);
  if (!v) return null;
  return codes[kind].has(v) ? v : null;   // nezināmu kodu klusi izmet
}

/** Atgriež {lead} vai {error, field}. */
function validate(body) {
  if (!body || typeof body !== 'object') return { error: 'invalid_body' };

  const email = clean(body.email, 254);
  if (!email || !EMAIL_RE.test(email)) return { error: 'invalid_email', field: 'email' };
  if (body.consent !== true) return { error: 'consent_required', field: 'consent' };

  return {
    lead: {
      email,
      email_norm: email.toLowerCase(),
      name: clean(body.name, 120),
      segment: code(body.segment, 'segment'),
      device_band: code(body.devices, 'device_band'),
      device_model: clean(body.model, 120),
      price_band: code(body.priceBand, 'price_band'),
      wants_beta: body.wantsBeta === true ? 1 : 0,
      lang: body.lang === 'en' ? 'en' : 'lv',
    },
  };
}

function saveLead(lead, raw) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = q.findByEmail.get(lead.email_norm);
    let id;
    let kind;

    if (existing) {
      q.update.run(lead.email, lead.name, lead.segment, lead.device_band, lead.device_model,
        lead.price_band, lead.wants_beta, lead.lang, existing.id);
      id = existing.id;
      kind = 'updated';
    } else {
      const res = q.insert.run(lead.email, lead.email_norm, lead.name, lead.segment,
        lead.device_band, lead.device_model, lead.price_band, lead.wants_beta, lead.lang);
      id = Number(res.lastInsertRowid);
      kind = 'created';
    }

    q.event.run(id, kind, raw);
    db.exec('COMMIT');
    return { id, status: kind };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// ---------------------------------------------------- ātruma ierobežojums ---
/* IP tikai atmiņā un tikai šim nolūkam — datubāzē tas nenonāk. */
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }
  const seen = hits.get(ip);
  if (!seen || seen.reset < now) {
    hits.set(ip, { n: 1, reset: now + RATE_WINDOW_MS });
    return false;
  }
  seen.n += 1;
  return seen.n > RATE_MAX;
}

// ------------------------------------------------------------------ HTTP ---

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...(ALLOW_ORIGIN ? { 'Access-Control-Allow-Origin': ALLOW_ORIGIN } : {}),
    ...headers,
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Salīdzina bez laika noplūdes, lai pilnvaru nevar uzminēt pa baitam. */
function authorized(req) {
  if (!ADMIN_TOKEN) return false;
  const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given);
  const b = Buffer.from(ADMIN_TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function csv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const cell = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n');
}

function serveStatic(req, res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath).replace(/^\/+/, '');
  const first = rel.split(/[\\/]/)[0];
  if (BLOCKED.has(first) || first.startsWith('.')) return send(res, 404, { error: 'not_found' });

  const full = path.resolve(ROOT, rel);
  if (!full.startsWith(ROOT + path.sep) && full !== ROOT) return send(res, 403, { error: 'forbidden' });

  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, { error: 'not_found' });
    send(res, 200, fs.readFileSync(full), {
      'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const route = url.pathname;

  if (req.method === 'OPTIONS' && ALLOW_ORIGIN) {
    return send(res, 204, '', {
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
  }

  if (route === '/api/health') {
    return send(res, 200, { ok: true, leads: q.count.get().n, db: path.basename(DB_PATH) });
  }

  if (route === '/api/leads' && req.method === 'POST') {
    const ip = req.socket.remoteAddress || 'unknown';
    if (rateLimited(ip)) return send(res, 429, { error: 'rate_limited' });

    let raw;
    try {
      raw = await readBody(req);
    } catch {
      return send(res, 413, { error: 'too_large' });
    }

    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return send(res, 400, { error: 'invalid_json' });
    }

    const { lead, error, field } = validate(body);
    if (error) return send(res, 422, { error, field });

    try {
      const saved = saveLead(lead, raw);
      console.log(`[lead] ${saved.status} #${saved.id} ${lead.email}`);
      return send(res, saved.status === 'created' ? 201 : 200, { ok: true, ...saved });
    } catch (err) {
      console.error('[lead] save failed:', err.message);
      return send(res, 500, { error: 'save_failed' });
    }
  }

  /* Lasīšana ir aizvērta, kamēr nav uzstādīts SCANINBOX_ADMIN_TOKEN. */
  const reads = ['/api/leads', '/api/leads.csv', '/api/stats'];
  if (reads.includes(route) && req.method === 'GET') {
    if (!authorized(req)) {
      return send(res, 401, {
        error: 'unauthorized',
        hint: ADMIN_TOKEN ? 'Authorization: Bearer <token>' : 'SCANINBOX_ADMIN_TOKEN nav uzstādīts',
      });
    }

    const limit = Math.min(Number(url.searchParams.get('limit')) || 500, 5000);

    if (route === '/api/leads') return send(res, 200, { count: q.count.get().n, leads: q.list.all(limit) });
    if (route === '/api/leads.csv') {
      return send(res, 200, csv(q.list.all(limit)), {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="scaninbox-leads.csv"',
      });
    }
    return send(res, 200, {
      total: q.count.get().n,
      price_demand: q.priceDemand.all(),
      segment_demand: q.segmentDemand.all(),
      device_models: q.models.all(),
    });
  }

  if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
  return serveStatic(req, res, route);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`ScanInbox  http://localhost:${PORT}`);
  console.log(`Datubāze   ${DB_PATH}  (${q.count.get().n} pieteikumi)`);
  console.log(ADMIN_TOKEN
    ? 'Lasīšana   ieslēgta ar SCANINBOX_ADMIN_TOKEN'
    : 'Lasīšana   slēgta — uzstādi SCANINBOX_ADMIN_TOKEN, lai lasītu caur API');
  console.log('Ctrl+C, lai apturētu');
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close();
    db.close();
    process.exit(0);
  });
}
