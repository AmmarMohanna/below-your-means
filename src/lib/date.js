/**
 * Date utilities - all dates in Beirut timezone
 */

const BEIRUT_TIMEZONE = 'Asia/Beirut';

export function isValidDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** One calendar month later, clamped to the last day of a shorter month. */
export function getNextMonthlyPaymentDate(paidDate) {
  if (!isValidDateOnly(paidDate)) return null;
  const date = new Date(`${paidDate}T12:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const monthEnd = new Date(date);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
  monthEnd.setUTCDate(0);
  date.setUTCDate(Math.min(day, monthEnd.getUTCDate()));
  return date.toISOString().slice(0, 10);
}

/**
 * Get current date in Beirut timezone as YYYY-MM-DD string
 */
export function getTodayBeirut() {
  return new Date().toLocaleDateString('en-CA', { timeZone: BEIRUT_TIMEZONE });
}

/**
 * Get current Date object adjusted for Beirut timezone
 */
export function getNowBeirut() {
  const now = new Date();
  const beirutStr = now.toLocaleString('en-US', { timeZone: BEIRUT_TIMEZONE });
  return new Date(beirutStr);
}

/**
 * Format a date string to display format
 */
export function formatDisplayDate(dateStr, options = {}) {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', {
    timeZone: BEIRUT_TIMEZONE,
    ...options
  });
}

/**
 * Format a Date object to YYYY-MM-DD in Beirut timezone
 */
export function formatDateBeirut(date) {
  return date.toLocaleDateString('en-CA', { timeZone: BEIRUT_TIMEZONE });
}

/**
 * Check if a date is today in Beirut timezone
 */
export function isTodayBeirut(date) {
  const today = getTodayBeirut();
  const dateStr = typeof date === 'string' ? date : formatDateBeirut(date);
  return dateStr === today;
}
