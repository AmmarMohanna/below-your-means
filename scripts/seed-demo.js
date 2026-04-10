#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

function resolveFixturePath(inputPath) {
  if (inputPath) {
    return path.resolve(process.cwd(), inputPath);
  }

  return path.resolve(process.cwd(), 'mock-data', 'demo-data.json');
}

function getBeirutToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Beirut' });
}

function shiftDate(baseDate, offsetDays) {
  const [year, month, day] = baseDate.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day, 12));
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

function resolveDateToken(value, today) {
  if (!value || typeof value !== 'string') return value;
  if (value === 'today') return today;

  const match = value.match(/^today([+-]\d+)$/);
  if (!match) return value;
  return shiftDate(today, Number(match[1]));
}

function normalizeDateFields(items = [], fields = [], today) {
  return items.map((item) => {
    const nextItem = { ...item };
    for (const field of fields) {
      nextItem[field] = resolveDateToken(item[field], today);
    }
    return nextItem;
  });
}

async function main() {
  const fixturePath = resolveFixturePath(process.argv[2]);
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const today = getBeirutToday();

  const modulePath = pathToFileURL(path.resolve(process.cwd(), 'src/lib/db.js')).href;
  const { getDb, runWithoutAudit } = await import(modulePath);
  const db = getDb();

  const transactions = normalizeDateFields(fixture.transactions, ['date'], today);
  const expectedMoney = normalizeDateFields(fixture.expectedMoney, ['expected_date'], today);
  const payables = normalizeDateFields(fixture.payables, ['pay_date'], today);
  const gymPayments = normalizeDateFields(fixture.gymPayments, ['date'], today);
  const gymSessions = normalizeDateFields(fixture.gymSessions, ['date'], today);

  const seed = db.transaction(() => {
    db.exec(`
      DELETE FROM audit_log;
      DELETE FROM categories;
      DELETE FROM current_money;
      DELETE FROM expected_money;
      DELETE FROM payables;
      DELETE FROM recurring;
      DELETE FROM held_money;
      DELETE FROM gym_payments;
      DELETE FROM gym_sessions;
      DELETE FROM transactions;
      DELETE FROM metals;
      DELETE FROM prayers;

      INSERT OR REPLACE INTO metals (
        id,
        gold_24k_grams,
        gold_21k_grams,
        silver_kg,
        gold_24k_price_per_gram,
        gold_21k_price_per_gram,
        silver_price_per_kg,
        prices_fetched_at,
        updated_at
      )
      VALUES (1, 0, 0, 0, 85, 74.4, 950, NULL, CURRENT_TIMESTAMP);

      INSERT OR REPLACE INTO prayers (
        id,
        soboh,
        dohor,
        aaser,
        maghreb,
        ishaa,
        ayaat,
        fasting,
        updated_at
      )
      VALUES (1, 0, 0, 0, 0, 0, 0, 0, CURRENT_TIMESTAMP);

      DELETE FROM sqlite_sequence
      WHERE name IN (
        'transactions',
        'categories',
        'current_money',
        'expected_money',
        'payables',
        'recurring',
        'held_money',
        'gym_payments',
        'gym_sessions',
        'audit_log'
      );
    `);

    const insertTransaction = db.prepare(`
      INSERT INTO transactions (amount, category, type, scope, notes, date)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const item of transactions) {
      insertTransaction.run(
        item.amount,
        item.category,
        item.type,
        item.scope || 'personal',
        item.notes || null,
        item.date
      );
    }

    const insertCurrentMoney = db.prepare(`
      INSERT INTO current_money (location, amount, notes)
      VALUES (?, ?, ?)
    `);
    for (const item of fixture.currentMoney || []) {
      insertCurrentMoney.run(item.location, item.amount, item.notes || null);
    }

    const insertExpectedMoney = db.prepare(`
      INSERT INTO expected_money (source, expected_date, amount, notes)
      VALUES (?, ?, ?, ?)
    `);
    for (const item of expectedMoney) {
      insertExpectedMoney.run(item.source, item.expected_date, item.amount, item.notes || null);
    }

    const insertPayable = db.prepare(`
      INSERT INTO payables (source, pay_date, amount, notes)
      VALUES (?, ?, ?, ?)
    `);
    for (const item of payables) {
      insertPayable.run(item.source, item.pay_date, item.amount, item.notes || null);
    }

    const insertRecurring = db.prepare(`
      INSERT INTO recurring (target, type, amount)
      VALUES (?, ?, ?)
    `);
    for (const item of fixture.recurring || []) {
      insertRecurring.run(item.target, item.type, item.amount);
    }

    const insertHeldMoney = db.prepare(`
      INSERT INTO held_money (person, amount, notes)
      VALUES (?, ?, ?)
    `);
    for (const item of fixture.heldMoney || []) {
      insertHeldMoney.run(item.person, item.amount, item.notes || null);
    }

    const metals = fixture.metals || {};
    db.prepare(`
      UPDATE metals
      SET gold_24k_grams = ?,
          gold_21k_grams = ?,
          silver_kg = ?,
          gold_24k_price_per_gram = ?,
          gold_21k_price_per_gram = ?,
          silver_price_per_kg = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(
      metals.gold_24k_grams || 0,
      metals.gold_21k_grams || 0,
      metals.silver_kg || 0,
      metals.gold_24k_price_per_gram || 85,
      metals.gold_21k_price_per_gram || 74.4,
      metals.silver_price_per_kg || 950
    );

    const prayers = fixture.prayers || {};
    db.prepare(`
      UPDATE prayers
      SET soboh = ?,
          dohor = ?,
          aaser = ?,
          maghreb = ?,
          ishaa = ?,
          ayaat = ?,
          fasting = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(
      prayers.soboh || 0,
      prayers.dohor || 0,
      prayers.aaser || 0,
      prayers.maghreb || 0,
      prayers.ishaa || 0,
      prayers.ayaat || 0,
      prayers.fasting || 0
    );

    const insertGymPayment = db.prepare(`
      INSERT INTO gym_payments (date, sessions, notes)
      VALUES (?, ?, ?)
    `);
    for (const item of gymPayments) {
      insertGymPayment.run(item.date, item.sessions, item.notes || null);
    }

    const insertGymSession = db.prepare(`
      INSERT INTO gym_sessions (date, notes)
      VALUES (?, ?)
    `);
    for (const item of gymSessions) {
      insertGymSession.run(item.date, item.notes || null);
    }
  });

  runWithoutAudit(() => seed());

  const counts = {
    transactions: db.prepare('SELECT count(*) AS count FROM transactions').get().count,
    currentMoney: db.prepare('SELECT count(*) AS count FROM current_money').get().count,
    expectedMoney: db.prepare('SELECT count(*) AS count FROM expected_money').get().count,
    payables: db.prepare('SELECT count(*) AS count FROM payables').get().count,
    recurring: db.prepare('SELECT count(*) AS count FROM recurring').get().count,
    heldMoney: db.prepare('SELECT count(*) AS count FROM held_money').get().count,
    gymPayments: db.prepare('SELECT count(*) AS count FROM gym_payments').get().count,
    gymSessions: db.prepare('SELECT count(*) AS count FROM gym_sessions').get().count,
  };

  console.log(`Seeded demo data into ${process.env.DATABASE_PATH}`);
  console.log(JSON.stringify(counts, null, 2));
}

main().catch((error) => {
  console.error('Failed to seed demo data:', error);
  process.exit(1);
});
