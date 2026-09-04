const SCOPES = new Set(['all', 'personal', 'business']);

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isValidMonth(value) {
  return typeof value === 'string' && /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value);
}

export function isValidDate(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

function previousMonth(month) {
  const [year, number] = month.split('-').map(Number);
  return number === 1 ? `${year - 1}-12` : `${year}-${String(number - 1).padStart(2, '0')}`;
}

function lastDate(month) {
  const [year, number] = month.split('-').map(Number);
  return `${month}-${daysInMonth(year, number)}`;
}

function cents(amount) {
  return Math.round(Number(amount) * 100);
}

function sumAmounts(rows) {
  return rows.reduce((sum, row) => sum + cents(row.amount), 0) / 100;
}

function nonnegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function rounded(value) {
  return Math.round(value * 100) / 100;
}

export function buildSavingsProjection({ today, savings = {}, metals = {}, planItems = [] }) {
  if (!isValidDate(today)) throw new RangeError('A valid current date is required');
  const yearEnd = `${today.slice(0, 4)}-12-31`;
  const cash = nonnegative(savings?.cash_savings_amount);
  const pension = nonnegative(savings?.aub_pension_amount);
  // Match /api/metals: a zero or missing stored price uses its existing fallback.
  const metalValue =
    nonnegative(metals?.gold_24k_grams) * nonnegative(metals?.gold_24k_price_per_gram || 85) +
    nonnegative(metals?.gold_21k_grams) * nonnegative(metals?.gold_21k_price_per_gram || 74.4) +
    nonnegative(metals?.silver_kg) * nonnegative(metals?.silver_price_per_kg || 950);
  const current = rounded(cash + pension + metalValue);
  const eligible = [];
  let excludedPlans = false;

  for (const item of planItems) {
    if (!Number.isFinite(Number(item.amount)) || Number(item.amount) <= 0) continue;
    // Plans have no completion flag. Their dates, not receipt links, define this scenario.
    if (!isValidDate(item.planned_date) || item.planned_date < today || item.planned_date > yearEnd) {
      excludedPlans = true;
      continue;
    }
    eligible.push(item);
  }

  const additions = sumAmounts(eligible);
  return {
    yearEnd,
    current,
    additions,
    expected: rounded(current + additions),
    cash: rounded(cash),
    pension: rounded(pension),
    metals: rounded(metalValue),
    metalPricesAt: metals?.prices_fetched_at || metals?.updated_at || null,
    excludedPlans,
  };
}

export function buildStatistics({ transactions = [], month, scope = 'all', today, savings, metals, planItems }) {
  if (!isValidDate(today)) throw new RangeError('A valid current date is required');
  if (!SCOPES.has(scope)) throw new RangeError('Invalid scope');
  const currentMonth = today.slice(0, 7);
  if (month && (!isValidMonth(month) || month > currentMonth)) throw new RangeError('Invalid month');

  const recorded = transactions.filter((row) =>
    isValidDate(row.date) && row.date <= today &&
    Number.isFinite(Number(row.amount)) && Number(row.amount) > 0 &&
    (row.type === 'expense' || row.type === 'income')
  );
  const recordedMonths = [...new Set(recorded.map((row) => row.date.slice(0, 7)))].sort();
  const lastCompleteRecordedMonth = recordedMonths.filter((value) => value < currentMonth).at(-1);
  const selectedMonth = month || lastCompleteRecordedMonth || currentMonth;
  const year = Number(selectedMonth.slice(0, 4));
  const monthCount = year === Number(today.slice(0, 4)) ? Number(today.slice(5, 7)) : 12;
  const chartMonths = Array.from({ length: monthCount }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`);
  const currentYearMonths = Array.from({ length: Number(today.slice(5, 7)) }, (_, index) => `${today.slice(0, 4)}-${String(index + 1).padStart(2, '0')}`);
  const availableMonths = [...new Set([...recordedMonths, ...currentYearMonths, ...chartMonths])].sort().reverse();
  const expenses = recorded.filter((row) => row.type === 'expense' &&
    (scope === 'all' || (row.scope === 'business' ? 'business' : 'personal') === scope)
  );
  const selected = expenses.filter((row) => row.date.slice(0, 7) === selectedMonth);
  const isPartial = selectedMonth === currentMonth;
  const priorMonth = previousMonth(selectedMonth);
  const priorMonthEnd = lastDate(priorMonth);
  const priorEnd = isPartial
    ? `${priorMonth}-${String(Math.min(Number(today.slice(8, 10)), Number(priorMonthEnd.slice(8, 10)))).padStart(2, '0')}`
    : priorMonthEnd;
  const prior = expenses.filter((row) => row.date >= `${priorMonth}-01` && row.date <= priorEnd);
  const total = sumAmounts(selected);
  const priorTotal = sumAmounts(prior);
  const monthlyTotals = new Map();
  for (const row of expenses) {
    const key = row.date.slice(0, 7);
    monthlyTotals.set(key, (monthlyTotals.get(key) || 0) + cents(row.amount));
  }

  return {
    asOf: today,
    month: selectedMonth,
    scope,
    year,
    availableMonths,
    period: { start: `${selectedMonth}-01`, end: isPartial ? today : lastDate(selectedMonth), isPartial },
    total,
    comparison: {
      month: priorMonth,
      start: `${priorMonth}-01`,
      end: priorEnd,
      total: priorTotal,
      difference: rounded(total - priorTotal),
      percent: priorTotal > 0 ? (total - priorTotal) / priorTotal * 100 : null,
    },
    monthly: chartMonths.map((value) => ({ month: value, total: (monthlyTotals.get(value) || 0) / 100, isPartial: value === currentMonth })),
    largest: [...selected]
      .sort((left, right) => Number(right.amount) - Number(left.amount) || right.date.localeCompare(left.date) || Number(right.id || 0) - Number(left.id || 0))
      .slice(0, 3)
      .map((row) => ({ id: row.id, date: row.date, label: row.notes?.trim() || row.category || 'Expense', amount: rounded(Number(row.amount)), scope: row.scope === 'business' ? 'business' : 'personal' })),
    savings: buildSavingsProjection({ today, savings, metals, planItems }),
  };
}
