/**
 * Date utilities - all dates in Beirut timezone
 */

const BEIRUT_TIMEZONE = 'Asia/Beirut';

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

