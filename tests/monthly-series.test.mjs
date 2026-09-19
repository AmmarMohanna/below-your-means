import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthlyDates, isValidCalendarDate, MAX_MONTHLY_ENTRIES } from '../src/lib/monthly-series.js';

test('ordinary add and a one-month schedule include exactly the original date', () => {
  assert.deepEqual(buildMonthlyDates('2026-09-19'), ['2026-09-19']);
  assert.deepEqual(buildMonthlyDates('2026-09-19', null), ['2026-09-19']);
  assert.deepEqual(buildMonthlyDates('2026-09-19', { end_type: 'count', count: 1 }), ['2026-09-19']);
});

test('month-end schedules anchor the first day instead of drifting after February', () => {
  assert.deepEqual(buildMonthlyDates('2026-01-31', { end_type: 'count', count: 4 }), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  assert.deepEqual(buildMonthlyDates('2028-01-30', { end_type: 'count', count: 3 }), ['2028-01-30', '2028-02-29', '2028-03-30']);
});

test('leap years, December rollover, and Beirut DST dates use calendar months', () => {
  assert.deepEqual(buildMonthlyDates('2027-12-29', { end_type: 'count', count: 4 }), ['2027-12-29', '2028-01-29', '2028-02-29', '2028-03-29']);
  assert.deepEqual(buildMonthlyDates('2026-03-29', { end_type: 'count', count: 2 }), ['2026-03-29', '2026-04-29']);
  assert.deepEqual(buildMonthlyDates('2099-12-31', { end_type: 'count', count: 3 }), ['2099-12-31', '2100-01-31', '2100-02-28']);
});

test('end date is inclusive and does not force an entry on a nonmatching day', () => {
  assert.deepEqual(buildMonthlyDates('2026-01-31', { end_type: 'date', end_date: '2026-03-31' }), ['2026-01-31', '2026-02-28', '2026-03-31']);
  assert.deepEqual(buildMonthlyDates('2026-01-31', { end_type: 'date', end_date: '2026-03-30' }), ['2026-01-31', '2026-02-28']);
  assert.deepEqual(buildMonthlyDates('2026-01-31', { end_type: 'date', end_date: '2026-01-31' }), ['2026-01-31']);
});

test('both repeat modes enforce 120 entries, including the first', () => {
  assert.equal(MAX_MONTHLY_ENTRIES, 120);
  const maximum = buildMonthlyDates('2026-01-31', { end_type: 'count', count: 120 });
  assert.equal(maximum.length, 120);
  assert.equal(maximum.at(-1), '2035-12-31');
  assert.equal(buildMonthlyDates('2026-01-31', { end_type: 'date', end_date: '2036-01-30' }).length, 120);
  assert.throws(() => buildMonthlyDates('2026-01-31', { end_type: 'date', end_date: '2036-01-31' }), /120/);
  assert.throws(() => buildMonthlyDates('2026-01-31', { end_type: 'date', end_date: '9999-12-31' }), /120/);
});

test('invalid counts, missing configuration, extra keys and invalid dates are rejected', () => {
  const configurations = [
    false, true, 3, 'monthly', [], {},
    { end_type: 'count' }, { end_type: 'count', count: 0 }, { end_type: 'count', count: -1 },
    { end_type: 'count', count: 121 }, { end_type: 'count', count: 1.5 }, { end_type: 'count', count: '6' },
    { end_type: 'count', count: Infinity }, { end_type: 'count', count: NaN },
    { end_type: 'count', count: 6, end_date: '2026-12-31' },
    { end_type: 'date' }, { end_type: 'date', end_date: '2026-09-18' },
    { end_type: 'date', end_date: '2026-02-30' }, { end_type: 'date', end_date: '2026-10-01', count: 6 },
    { end_type: 'weekly', count: 6 },
  ];
  for (const repeat of configurations) assert.throws(() => buildMonthlyDates('2026-09-19', repeat));
  for (const date of ['', 'bad', '2026-02-30', '2026-2-03', '0000-01-01', null, 1]) {
    assert.equal(isValidCalendarDate(date), false);
    assert.throws(() => buildMonthlyDates(date, { end_type: 'count', count: 2 }));
  }
});

test('calendar bounds do not wrap four-digit years or map years 1-99 to 1900', () => {
  assert.deepEqual(buildMonthlyDates('0001-01-31', { end_type: 'count', count: 2 }), ['0001-01-31', '0001-02-28']);
  assert.deepEqual(buildMonthlyDates('9999-12-31', { end_type: 'date', end_date: '9999-12-31' }), ['9999-12-31']);
  assert.throws(() => buildMonthlyDates('9999-12-31', { end_type: 'count', count: 2 }), /date range/);
});
