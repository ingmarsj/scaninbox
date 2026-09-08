'use strict';

/** HTTP slāņa testi. Katrs bloks ceļ savu serveri uz brīva porta. */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, validLead } = require('./helpers.js');

const TOKEN = 'test-token-1234567890';
const auth = { Authorization: `Bearer ${TOKEN}` };

describe('POST /api/leads', () => {
  let s;
  beforeEach(async () => { s = await startApp({ rate: { max: 50 } }); });
  afterEach(async () => { await s.stop(); });

  test('derīgs pieteikums atgriež 201 un nonāk datubāzē', async () => {
    const res = await s.post('/api/leads', validLead());
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { ok: true, id: 1, status: 'created' });

    const row = s.store.db.prepare('SELECT * FROM leads').get();
    assert.equal(row.email, 'anna.berzina@inbox.lv');
    assert.equal(row.name, 'Anna Bērziņa');
    assert.equal(row.segment, 'small');
    assert.equal(row.device_band, '2-5');
    assert.equal(row.price_band, '5-10');
    assert.equal(row.wants_beta, 1);
    assert.equal(row.consent, 1);
  });

  test('tas pats e-pasts citā reģistrā atjauno, nevis dublē', async () => {
    await s.post('/api/leads', validLead());
    const res = await s.post('/api/leads', validLead({
      email: 'Anna.Berzina@INBOX.lv', segment: 'large', devices: '20+', priceBand: '10+', name: 'Anna B.',
    }));

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, id: 1, status: 'updated' });

    assert.equal(s.store.q.count.get().n, 1, 'dublikāts izveidots');
    const row = s.store.db.prepare('SELECT * FROM leads').get();
    assert.equal(row.segment, 'large', 'atbilde nav atjaunota');
    assert.equal(row.price_band, '10+');
    assert.equal(row.email, 'Anna.Berzina@INBOX.lv', 'rādām jaunāko rakstību');
  });

  test('katrs iesniegums saglabājas vēsturē', async () => {
    await s.post('/api/leads', validLead({ priceBand: 'lt2' }));
    await s.post('/api/leads', validLead({ priceBand: '10+' }));

    const events = s.store.db.prepare('SELECT kind, payload FROM lead_events ORDER BY id').all();
    assert.equal(events.length, 2);
    assert.deepEqual(events.map((e) => e.kind), ['created', 'updated']);
    /* Vecā atbilde ir atrodama, nevis pārrakstīta. */
    assert.equal(JSON.parse(events[0].payload).priceBand, 'lt2');
    assert.equal(JSON.parse(events[1].payload).priceBand, '10+');
  });

  test('bez piekrišanas — 422 un neviena rinda', async () => {
    const res = await s.post('/api/leads', validLead({ consent: false }));
    assert.equal(res.status, 422);
    assert.deepEqual(await res.json(), { error: 'consent_required', field: 'consent' });
    assert.equal(s.store.q.count.get().n, 0);
  });

  test('nederīgs e-pasts — 422', async () => {
    const res = await s.post('/api/leads', validLead({ email: 'nav-epasta' }));
    assert.equal(res.status, 422);
    assert.equal((await res.json()).error, 'invalid_email');
    assert.equal(s.store.q.count.get().n, 0);
  });

  test('bojāts JSON — 400', async () => {
    const res = await s.post('/api/leads', '{nav derigs json');
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'invalid_json');
  });

  test('tukšs ķermenis — 400', async () => {
    const res = await s.post('/api/leads', '');
    assert.equal(res.status, 400);
  });

  test('ķermenis, kas nav objekts — 422', async () => {
    const res = await s.post('/api/leads', '"virkne"');
    assert.equal(res.status, 422);
    assert.equal((await res.json()).error, 'invalid_body');
  });

  test('diakritika iztur visu ceļu', async () => {
    await s.post('/api/leads', validLead({
      email: 'liga@inbox.lv', name: 'Līga Ozoliņa-Šķēle', model: 'Ricoh IM C3000 ķņūž',
    }));
    const row = s.store.db.prepare('SELECT name, device_model FROM leads').get();
    assert.equal(row.name, 'Līga Ozoliņa-Šķēle');
    assert.equal(row.device_model, 'Ricoh IM C3000 ķņūž');
  });

  test('nezināmi kodi tiek attīrīti, pieteikums paliek', async () => {
    const res = await s.post('/api/leads', validLead({ segment: 'HAKERIS', devices: '999' }));
    assert.equal(res.status, 201);
    const row = s.store.db.prepare('SELECT segment, device_band FROM leads').get();
    assert.equal(row.segment, null);
    assert.equal(row.device_band, null);
  });
});

describe('POST /api/leads — griesti', () => {
  test('pārāk liels ķermenis saņem 413, nevis pārtrauktu savienojumu', async () => {
    const s = await startApp({ maxBody: 1024, rate: { max: 50 } });
    try {
      const res = await s.post('/api/leads', validLead({ name: 'x'.repeat(4000) }));
      assert.equal(res.status, 413);
      assert.equal((await res.json()).error, 'too_large');
      assert.equal(s.store.q.count.get().n, 0);
    } finally {
      await s.stop();
    }
  });

  test('ātruma ierobežojums iestājas pēc noteiktā skaita', async () => {
    const s = await startApp({ rate: { max: 3, windowMs: 60_000 } });
    try {
      const codes = [];
      for (let i = 0; i < 5; i += 1) {
        const res = await s.post('/api/leads', validLead({ email: `n${i}@inbox.lv` }));
        codes.push(res.status);
      }
      assert.deepEqual(codes, [201, 201, 201, 429, 429]);
      assert.equal(s.store.q.count.get().n, 3, 'ierobežotie iesniegumi nedrīkst nonākt datubāzē');
    } finally {
      await s.stop();
    }
  });

  test('nederīgs iesniegums arī tiek ieskaitīts ierobežojumā', async () => {
    const s = await startApp({ rate: { max: 2, windowMs: 60_000 } });
    try {
      await s.post('/api/leads', validLead({ consent: false }));
      await s.post('/api/leads', '{bojats');
      const res = await s.post('/api/leads', validLead());
      assert.equal(res.status, 429, 'citādi limitu var apiet ar bojātiem iesniegumiem');
    } finally {
      await s.stop();
    }
  });
});

describe('lasīšanas galapunkti', () => {
  let s;
  beforeEach(async () => {
    s = await startApp({ adminToken: TOKEN, rate: { max: 50 } });
    await s.post('/api/leads', validLead({ email: 'a@inbox.lv', segment: 'medium', priceBand: '5-10' }));
    await s.post('/api/leads', validLead({ email: 'b@inbox.lv', segment: 'small', priceBand: 'lt2', model: 'HP M428' }));
  });
  afterEach(async () => { await s.stop(); });

  for (const route of ['/api/leads', '/api/leads.csv', '/api/stats']) {
    test(`${route} bez pilnvaras — 401`, async () => {
      const res = await s.get(route);
      assert.equal(res.status, 401);
      assert.equal((await res.json()).error, 'unauthorized');
    });

    test(`${route} ar nepareizu pilnvaru — 401`, async () => {
      const res = await s.get(route, { Authorization: 'Bearer nepareizs' });
      assert.equal(res.status, 401);
    });

    test(`${route} ar pilnvaru tādā pašā garumā — 401`, async () => {
      const res = await s.get(route, { Authorization: `Bearer ${'x'.repeat(TOKEN.length)}` });
      assert.equal(res.status, 401);
    });
  }

  test('/api/leads atgriež pieteikumus', async () => {
    const res = await s.get('/api/leads', auth);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.count, 2);
    assert.equal(body.leads.length, 2);
    assert.deepEqual(body.leads.map((l) => l.email).sort(), ['a@inbox.lv', 'b@inbox.lv']);
    assert.equal(body.leads[0].email_norm, undefined, 'iekšējā atslēga netiek atklāta');
  });

  test('/api/leads ievēro limit parametru', async () => {
    const body = await (await s.get('/api/leads?limit=1', auth)).json();
    assert.equal(body.leads.length, 1);
    assert.equal(body.count, 2, 'kopskaits paliek pilnais');
  });

  test('/api/leads.csv citē vērtības ar komatiem', async () => {
    const res = await s.get('/api/leads.csv', auth);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/csv/);
    assert.match(res.headers.get('content-disposition'), /attachment/);

    const text = await res.text();
    const [header] = text.split('\r\n');
    assert.match(header, /^id,email,name,/);
    assert.match(text, /"Uzņēmums, 10 līdz 100 cilvēku"/, 'komats vērtībā jāieliek pēdiņās');
  });

  test('/api/stats apkopo pieprasījumu', async () => {
    const body = await (await s.get('/api/stats', auth)).json();
    assert.equal(body.total, 2);

    const price = Object.fromEntries(body.price_demand.map((r) => [r.code, r.leads]));
    assert.equal(price['5-10'], 1);
    assert.equal(price['lt2'], 1);

    const segment = Object.fromEntries(body.segment_demand.map((r) => [r.code, r.leads]));
    assert.equal(segment.medium, 1);
    assert.equal(segment.small, 1);
    assert.equal(segment.private, 0);

    /* Vienāda pieminēšanu skaita gadījumā skats kārto pēc nosaukuma. */
    assert.deepEqual(body.device_models.map((m) => m.model), ['Canon MF445dw', 'HP M428']);
    assert.deepEqual(body.device_models.map((m) => m.mentions), [1, 1]);
  });

  test('/api/health ir atvērts un rāda skaitu', async () => {
    const res = await s.get('/api/health');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.leads, 2);
  });
});

describe('lasīšana bez uzstādītas pilnvaras', () => {
  test('paliek slēgta un pasaka, kas jādara', async () => {
    const s = await startApp();
    try {
      const res = await s.get('/api/leads', auth);
      assert.equal(res.status, 401, 'nedrīkst atvērties tikai tāpēc, ka serveris darbojas');
      assert.match((await res.json()).hint, /SCANINBOX_ADMIN_TOKEN/);
    } finally {
      await s.stop();
    }
  });
});

describe('metodes un statiskie faili', () => {
  let s;
  beforeEach(async () => { s = await startApp(); });
  afterEach(async () => { await s.stop(); });

  test('PUT uz /api/leads — 405', async () => {
    const res = await s.request('/api/leads', { method: 'PUT' });
    assert.equal(res.status, 405);
    assert.equal((await res.json()).error, 'method_not_allowed');
  });

  test('GET /api/leads.csv ar POST metodi neatgriež datus', async () => {
    const res = await s.post('/api/leads.csv', {}, auth);
    assert.equal(res.status, 405);
  });

  test('/ pasniedz lapu', async () => {
    const res = await s.get('/');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    const html = await res.text();
    assert.match(html, /<title>ScanInbox<\/title>/);
  });

  test('lapa sūta pieteikumus uz to pašu API un nekur citur', async () => {
    const html = await (await s.get('/')).text();
    assert.match(html, /LEADS_ENDPOINT\s*=\s*"\/api\/leads"/);
    assert.equal(/claude\.use\(/.test(html), false, 'Artifact glabātava ir izņemta');
  });

  for (const route of ['/data/test.db', '/db/schema.sql', '/test/api.test.js', '/.gitignore']) {
    test(`${route} netiek pasniegts`, async () => {
      const res = await s.get(route);
      assert.equal(res.status, 404);
    });
  }

  test('kodēta ceļa iziešana no saknes tiek noraidīta', async () => {
    for (const attempt of ['/%2e%2e%2f%2e%2e%2fWindows/win.ini', '/..%2f..%2fetc/passwd']) {
      const res = await s.get(attempt);
      assert.ok([403, 404].includes(res.status), `${attempt} -> ${res.status}`);
    }
  });

  test('bojāts procentu kodējums — 400, nevis avārija', async () => {
    const res = await s.get('/%zz');
    assert.equal(res.status, 400);
  });

  test('neesošs fails — 404', async () => {
    const res = await s.get('/nav-taada-lapa.html');
    assert.equal(res.status, 404);
  });
});
