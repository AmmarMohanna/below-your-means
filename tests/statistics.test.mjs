import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSavingsProjection, buildStatistics, isValidDate } from '../src/lib/statistics.js';

const expense = (id, date, amount, scope = 'personal') => ({ id, date, amount, scope, type: 'expense', notes: `Expense ${id}` });

test('month and scope totals reconcile with zero-filled bars and the largest three', () => {
  const transactions = [expense(1, '2026-07-01', 10.1), expense(2, '2026-08-02', 20.2), expense(3, '2026-08-03', 5.1), expense(4, '2026-08-04', 30, 'business'), expense(5, '2026-08-05', 8), expense(6, '2026-08-06', 9), expense(7, '2026-10-01', 999), expense(8, '2026-02-30', 999), { ...expense(9, '2026-08-01', 500), type: 'income' }];
  const all = buildStatistics({ transactions, month: '2026-08', today: '2026-09-05' });
  assert.equal(all.total, 72.3);
  assert.equal(all.monthly.find((item) => item.month === '2026-08').total, all.total);
  assert.equal(all.monthly.find((item) => item.month === '2026-02').total, 0);
  assert.equal(all.monthly.length, 9);
  assert.deepEqual(all.largest.map((row) => row.id), [4, 2, 6]);
  const personal = buildStatistics({ transactions, month: '2026-08', scope: 'personal', today: '2026-09-05' });
  const business = buildStatistics({ transactions, month: '2026-08', scope: 'business', today: '2026-09-05' });
  assert.equal(personal.total + business.total, all.total);
  assert.deepEqual(business.largest.map((row) => row.id), [4]);
});

test('current month compares matching elapsed days and excludes future expenses', () => {
  const data = buildStatistics({ today: '2026-09-05', month: '2026-09', transactions: [expense(1, '2026-08-03', 100), expense(2, '2026-08-06', 900), expense(3, '2026-09-01', 150), expense(4, '2026-09-06', 900)] });
  assert.equal(data.total, 150);
  assert.equal(data.comparison.total, 100);
  assert.equal(data.comparison.percent, 50);
  assert.equal(data.comparison.end, '2026-08-05');
  assert.equal(data.period.end, '2026-09-05');
});

test('comparison clamps shorter prior months and crosses year boundaries', () => {
  const march = buildStatistics({ today: '2026-03-31', month: '2026-03', transactions: [expense(1, '2026-02-28', 200), expense(2, '2026-03-31', 100)] });
  assert.equal(march.comparison.end, '2026-02-28');
  assert.equal(march.comparison.percent, -50);
  const january = buildStatistics({ today: '2026-02-05', month: '2026-01', transactions: [expense(1, '2025-12-31', 40), expense(2, '2026-01-31', 20), expense(3, '2025-01-01', 999)] });
  assert.equal(january.comparison.month, '2025-12');
  assert.equal(january.comparison.total, 40);
  assert.equal(january.monthly.find((row) => row.month === '2026-01').total, 20);
});

test('empty data and zero comparisons stay finite; default is latest completed recorded month', () => {
  const empty = buildStatistics({ today: '2026-09-05' });
  assert.equal(empty.month, '2026-09');
  assert.equal(empty.total, 0);
  assert.equal(empty.comparison.percent, null);
  assert.equal(empty.largest.length, 0);
  assert.ok(empty.monthly.every((row) => row.total === 0));
  const latest = buildStatistics({ today: '2026-09-05', transactions: [expense(1, '2026-06-01', 10), expense(2, '2026-09-01', 20)] });
  assert.equal(latest.month, '2026-06');
  assert.equal(latest.comparison.percent, null);
  assert.throws(() => buildStatistics({ today: '2026-09-05', month: '2026-10' }), RangeError);
  assert.throws(() => buildStatistics({ today: '2026-09-05', scope: 'unknown' }), RangeError);
  assert.equal(isValidDate('2024-02-29'), true);
  assert.equal(isValidDate('2026-02-29'), false);
});

test('year-end savings uses all current assets and independent dated future plans once', () => {
  const input = { today: '2026-09-05', savings: { cash_savings_amount: 1000, aub_pension_amount: 2500 }, metals: { gold_24k_grams: 2, gold_24k_price_per_gram: 100, gold_21k_grams: 1, gold_21k_price_per_gram: 80, silver_kg: 1, silver_price_per_kg: 900 }, planItems: [{ amount: 300, planned_date: '2026-09-05', expected_money_id: 1 }, { amount: 700, planned_date: '2026-12-31', expected_money_id: null }, { amount: 900, planned_date: '2026-09-04' }, { amount: 900, planned_date: null }, { amount: 900, planned_date: '2027-01-01' }, { amount: 900, planned_date: '2026-11-31' }] };
  const projection = buildSavingsProjection(input);
  assert.equal(projection.current, 4680);
  assert.equal(projection.additions, 1000);
  assert.equal(projection.expected, 5680);
  assert.equal(projection.excludedPlans, true);
  const all = buildStatistics({ ...input, month: '2026-08', scope: 'all' });
  const business = buildStatistics({ ...input, month: '2026-07', scope: 'business' });
  assert.deepEqual(all.savings, business.savings);
});

test('savings reproduces zero-price fallbacks in the metals API and an empty plan', () => {
  const result = buildSavingsProjection({ today: '2026-12-31', savings: null, metals: { gold_24k_grams: 1, gold_24k_price_per_gram: 0, gold_21k_grams: 1, silver_kg: 1 } });
  assert.equal(result.metals, 1109.4);
  assert.equal(result.expected, 1109.4);
  assert.equal(result.additions, 0);
  assert.equal(result.yearEnd, '2026-12-31');
});
