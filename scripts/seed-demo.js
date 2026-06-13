#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const AUTOINCREMENT_TABLES = [
  'transactions',
  'budgets',
  'categories',
  'current_money',
  'expected_money',
  'payables',
  'recurring',
  'held_money',
  'gym_payments',
  'gym_sessions',
  'reminders',
  'audit_log',
];

function resolveFixturePath(inputPath) {
  if (inputPath) {
    return path.resolve(process.cwd(), inputPath);
  }

  return path.resolve(process.cwd(), 'mock-data', 'demo-data.json');
}

function resolveOutputPath(inputPath) {
  if (inputPath) {
    return path.resolve(process.cwd(), inputPath);
  }

  return path.resolve(process.cwd(), 'data', 'd1-demo-seed.sql');
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

function shiftDateTime(baseDate, offset, unit) {
  const value = new Date(baseDate.getTime());
  const multipliers = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  value.setTime(value.getTime() + offset * multipliers[unit]);
  return value.toISOString();
}

function resolveDateToken(value, today) {
  if (!value || typeof value !== 'string') return value;
  if (value === 'today') return today;

  const match = value.match(/^today([+-]\d+)$/);
  if (!match) return value;
  return shiftDate(today, Number(match[1]));
}

function resolveDateTimeToken(value, now) {
  if (!value || typeof value !== 'string') return value;
  if (value === 'now') return now.toISOString();

  const match = value.match(/^now([+-]\d+)([mhd])$/);
  if (!match) return value;
  return shiftDateTime(now, Number(match[1]), match[2]);
}

function resolveTokensInObject(value, today, now) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, fieldValue]) => {
      const resolvedDateTime = resolveDateTimeToken(fieldValue, now);
      const resolvedValue =
        resolvedDateTime === fieldValue ? resolveDateToken(fieldValue, today) : resolvedDateTime;
      return [key, resolvedValue];
    })
  );
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

function normalizeDateTimeFields(items = [], fields = [], now) {
  return items.map((item) => {
    const nextItem = { ...item };
    for (const field of fields) {
      nextItem[field] = resolveDateTimeToken(item[field], now);
    }
    return nextItem;
  });
}

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function insertStatement(tableName, data) {
  const columns = Object.keys(data);
  const values = columns.map((column) => sqlValue(data[column]));
  return `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')});`;
}

function updateStatement(tableName, data, whereClause) {
  const assignments = Object.entries(data)
    .map(([column, value]) => `${column} = ${sqlValue(value)}`)
    .join(', ');
  return `UPDATE ${tableName} SET ${assignments} ${whereClause};`;
}

function indexById(rows) {
  return Object.fromEntries(rows.map((row) => [row.id, row]));
}

function normalizeRowJson(row) {
  return row ? JSON.stringify(row) : null;
}

function resolveAuditPayload(rowsByTable, item, key, today, now) {
  const ref = item[`${key}Ref`];
  if (ref) {
    return rowsByTable[ref.table]?.[ref.id] || null;
  }

  return resolveTokensInObject(item[key], today, now);
}

function parseArgs() {
  const args = process.argv.slice(2);
  let fixturePath = null;
  let outputPath = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--out') {
      outputPath = args[index + 1];
      index += 1;
      continue;
    }

    fixturePath = arg;
  }

  return {
    fixturePath: resolveFixturePath(fixturePath),
    outputPath: resolveOutputPath(outputPath),
  };
}

function main() {
  const { fixturePath, outputPath } = parseArgs();
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const today = getBeirutToday();
  const now = new Date();
  const createdAt = now.toISOString();

  const transactions = normalizeDateFields(fixture.transactions, ['date'], today).map(
    (item, index) => ({
      id: index + 1,
      amount: item.amount,
      category: item.category,
      type: item.type,
      scope: item.scope || 'personal',
      notes: item.notes || null,
      date: item.date,
      created_at: item.created_at || createdAt,
    })
  );

  const categories = (fixture.categories || []).map((name, index) => ({
    id: index + 1,
    name,
    created_at: createdAt,
  }));

  const currentMoney = (fixture.currentMoney || []).map((item, index) => ({
    id: index + 1,
    location: item.location,
    amount: item.amount,
    notes: item.notes || null,
    created_at: item.created_at || createdAt,
  }));

  const expectedMoney = normalizeDateFields(fixture.expectedMoney, ['expected_date'], today).map(
    (item, index) => ({
      id: index + 1,
      source: item.source,
      expected_date: item.expected_date,
      amount: item.amount,
      notes: item.notes || null,
      created_at: item.created_at || createdAt,
    })
  );

  const payables = normalizeDateFields(fixture.payables, ['pay_date'], today).map(
    (item, index) => ({
      id: index + 1,
      source: item.source,
      pay_date: item.pay_date,
      amount: item.amount,
      notes: item.notes || null,
      created_at: item.created_at || createdAt,
    })
  );

  const recurring = (fixture.recurring || []).map((item, index) => ({
    id: index + 1,
    target: item.target,
    type: item.type,
    amount: item.amount,
    created_at: item.created_at || createdAt,
  }));

  const heldMoney = (fixture.heldMoney || []).map((item, index) => ({
    id: index + 1,
    person: item.person,
    amount: item.amount,
    notes: item.notes || null,
    created_at: item.created_at || createdAt,
  }));

  const metalsFixture = fixture.metals || {};
  const metals = {
    id: 1,
    gold_24k_grams: metalsFixture.gold_24k_grams || 0,
    gold_21k_grams: metalsFixture.gold_21k_grams || 0,
    silver_kg: metalsFixture.silver_kg || 0,
    gold_24k_price_per_gram: metalsFixture.gold_24k_price_per_gram || 85,
    gold_21k_price_per_gram: metalsFixture.gold_21k_price_per_gram || 74.4,
    silver_price_per_kg: metalsFixture.silver_price_per_kg || 950,
    prices_fetched_at: metalsFixture.prices_fetched_at || null,
    updated_at: createdAt,
  };

  const prayersFixture = fixture.prayers || {};
  const prayers = {
    id: 1,
    soboh: prayersFixture.soboh || 0,
    dohor: prayersFixture.dohor || 0,
    aaser: prayersFixture.aaser || 0,
    maghreb: prayersFixture.maghreb || 0,
    ishaa: prayersFixture.ishaa || 0,
    ayaat: prayersFixture.ayaat || 0,
    fasting: prayersFixture.fasting || 0,
    updated_at: createdAt,
  };

  const gymPayments = normalizeDateFields(fixture.gymPayments, ['date'], today).map(
    (item, index) => ({
      id: index + 1,
      date: item.date,
      sessions: item.sessions,
      notes: item.notes || null,
      created_at: item.created_at || createdAt,
    })
  );

  const gymSessions = normalizeDateFields(fixture.gymSessions, ['date'], today).map(
    (item, index) => ({
      id: index + 1,
      date: item.date,
      notes: item.notes || null,
      created_at: item.created_at || createdAt,
    })
  );

  const reminders = normalizeDateTimeFields(
    fixture.reminders,
    ['next_due_at', 'last_done_at', 'created_at', 'updated_at'],
    now
  ).map((item, index) => ({
    id: index + 1,
    title: item.title,
    interval_hours: item.interval_hours,
    next_due_at: item.next_due_at,
    last_done_at: item.last_done_at || null,
    is_active: item.is_active === 0 ? 0 : 1,
    created_at: item.created_at || createdAt,
    updated_at: item.updated_at || createdAt,
  }));

  const rowsByTable = {
    transactions: indexById(transactions),
    categories: indexById(categories),
    current_money: indexById(currentMoney),
    expected_money: indexById(expectedMoney),
    payables: indexById(payables),
    recurring: indexById(recurring),
    held_money: indexById(heldMoney),
    metals: { 1: metals },
    prayers: { 1: prayers },
    gym_payments: indexById(gymPayments),
    gym_sessions: indexById(gymSessions),
    reminders: indexById(reminders),
  };

  const auditLog = normalizeDateTimeFields(fixture.auditLog, ['created_at'], now).map(
    (item, index) => {
      const before = resolveAuditPayload(rowsByTable, item, 'before', today, now);
      const after = resolveAuditPayload(rowsByTable, item, 'after', today, now);

      return {
        id: index + 1,
        table_name: item.table_name,
        entity_id: item.entity_id || null,
        action: item.action,
        before_json: normalizeRowJson(before),
        after_json: normalizeRowJson(after),
        source: item.source || 'demo',
        created_at: item.created_at || createdAt,
      };
    }
  );

  const statements = [
    '-- Generated by scripts/seed-demo.js. Safe to recreate.',
    'DELETE FROM audit_log;',
    'DELETE FROM budgets;',
    'DELETE FROM categories;',
    'DELETE FROM current_money;',
    'DELETE FROM expected_money;',
    'DELETE FROM payables;',
    'DELETE FROM recurring;',
    'DELETE FROM held_money;',
    'DELETE FROM gym_payments;',
    'DELETE FROM gym_sessions;',
    'DELETE FROM reminders;',
    'DELETE FROM transactions;',
    'DELETE FROM metals;',
    'DELETE FROM prayers;',
    `DELETE FROM sqlite_sequence WHERE name IN (${AUTOINCREMENT_TABLES.map(sqlValue).join(', ')});`,
    insertStatement('metals', {
      id: 1,
      gold_24k_grams: 0,
      gold_21k_grams: 0,
      silver_kg: 0,
      gold_24k_price_per_gram: 85,
      gold_21k_price_per_gram: 74.4,
      silver_price_per_kg: 950,
      prices_fetched_at: null,
      updated_at: createdAt,
    }),
    insertStatement('prayers', {
      id: 1,
      soboh: 0,
      dohor: 0,
      aaser: 0,
      maghreb: 0,
      ishaa: 0,
      ayaat: 0,
      fasting: 0,
      updated_at: createdAt,
    }),
  ];

  statements.push(...categories.map((row) => insertStatement('categories', row)));
  statements.push(...transactions.map((row) => insertStatement('transactions', row)));
  statements.push(...currentMoney.map((row) => insertStatement('current_money', row)));
  statements.push(...expectedMoney.map((row) => insertStatement('expected_money', row)));
  statements.push(...payables.map((row) => insertStatement('payables', row)));
  statements.push(...recurring.map((row) => insertStatement('recurring', row)));
  statements.push(...heldMoney.map((row) => insertStatement('held_money', row)));
  statements.push(updateStatement('metals', metals, 'WHERE id = 1'));
  statements.push(updateStatement('prayers', prayers, 'WHERE id = 1'));
  statements.push(...gymPayments.map((row) => insertStatement('gym_payments', row)));
  statements.push(...gymSessions.map((row) => insertStatement('gym_sessions', row)));
  statements.push(...reminders.map((row) => insertStatement('reminders', row)));
  statements.push(...auditLog.map((row) => insertStatement('audit_log', row)));

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${statements.join('\n')}\n`);

  const counts = {
    transactions: transactions.length,
    currentMoney: currentMoney.length,
    expectedMoney: expectedMoney.length,
    payables: payables.length,
    recurring: recurring.length,
    heldMoney: heldMoney.length,
    gymPayments: gymPayments.length,
    gymSessions: gymSessions.length,
    reminders: reminders.length,
    auditLog: auditLog.length,
  };

  console.log(`Wrote D1 demo seed SQL to ${outputPath}`);
  console.log(JSON.stringify(counts, null, 2));
}

main();
