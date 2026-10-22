export const MAX_MONTHLY_ENTRIES = 120;

export function isValidCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function anchoredMonth(startDate, offset) {
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const monthIndex = startYear * 12 + startMonth - 1 + offset;
  const year = Math.floor(monthIndex / 12);
  const month = monthIndex % 12 + 1;
  if (year > 9999) throw new Error('The monthly schedule goes beyond the supported date range.');
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(Math.min(startDay, daysInMonth)).padStart(2, '0')}`;
}

// Count includes the original entry; the end date includes occurrences on that day.
// Every occurrence uses the original day (Jan 31 -> Feb 28 -> Mar 31), not the
// previous occurrence's clamped day. This is calendar arithmetic, independent of DST.
export function buildMonthlyDates(startDate, monthlyRepeat) {
  if (!isValidCalendarDate(startDate)) throw new Error('Choose a valid first payment date.');
  if (monthlyRepeat === null || monthlyRepeat === undefined) return [startDate];
  if (typeof monthlyRepeat !== 'object' || Array.isArray(monthlyRepeat)) throw new Error('Choose a valid monthly repeat option.');
  const keys = Object.keys(monthlyRepeat);
  if (monthlyRepeat.end_type === 'count') {
    if (keys.length !== 2 || !keys.includes('count') || !Number.isInteger(monthlyRepeat.count) || monthlyRepeat.count < 1 || monthlyRepeat.count > MAX_MONTHLY_ENTRIES) {
      throw new Error(`Enter a number of months from 1 to ${MAX_MONTHLY_ENTRIES}.`);
    }
    return Array.from({ length: monthlyRepeat.count }, (_, offset) => anchoredMonth(startDate, offset));
  }
  if (monthlyRepeat.end_type === 'date') {
    if (keys.length !== 2 || !keys.includes('end_date') || !isValidCalendarDate(monthlyRepeat.end_date) || monthlyRepeat.end_date < startDate) {
      throw new Error('Choose an end date on or after the first payment date.');
    }
    const [startYear, startMonth] = startDate.split('-').map(Number);
    const [endYear, endMonth] = monthlyRepeat.end_date.split('-').map(Number);
    const monthsBetween = (endYear - startYear) * 12 + endMonth - startMonth;
    if (monthsBetween > MAX_MONTHLY_ENTRIES) throw new Error(`A monthly schedule can contain at most ${MAX_MONTHLY_ENTRIES} entries.`);
    const dates = [];
    for (let offset = 0; offset <= monthsBetween; offset++) {
      const date = anchoredMonth(startDate, offset);
      if (date <= monthlyRepeat.end_date) dates.push(date);
    }
    if (dates.length > MAX_MONTHLY_ENTRIES) throw new Error(`A monthly schedule can contain at most ${MAX_MONTHLY_ENTRIES} entries.`);
    return dates;
  }
  throw new Error('Choose a number of months or an end date.');
}
