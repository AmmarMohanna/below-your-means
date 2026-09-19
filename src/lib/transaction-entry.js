import { getTodayBeirut } from './date.js';

export const MAX_DESCRIPTION_LENGTH = 500;

export function capitalizeDescription(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/^(\s*)(\p{L})/u, (_, spacing, letter) => spacing + letter.toUpperCase());
}

export function getDefaultCategory(type, scope) {
  if (type === 'income') return 'Income';
  return scope === 'business' ? 'Business' : 'Other';
}

export function isValidEntryDate(value, today = getTodayBeirut()) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01' || value > today) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateEntryFields(draft, { requireDescription = true, today = getTodayBeirut() } = {}) {
  const errors = {};
  const value = draft || {};
  if (!['income', 'expense'].includes(value.type)) errors.type = 'Choose Income or Expense.';
  if (!['personal', 'business'].includes(value.scope)) errors.scope = 'Choose Personal or Business.';
  const numeric = typeof value.amount === 'number' || (typeof value.amount === 'string' && /^\d+(?:\.\d+)?$/.test(value.amount.trim()));
  const amount = numeric ? Number(value.amount) : NaN;
  if (!Number.isFinite(amount) || amount < 0.01 || amount > Number.MAX_SAFE_INTEGER / 100 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
    errors.amount = 'Enter a positive USD amount with up to 2 decimal places.';
  }
  if (value.currency !== undefined && value.currency !== 'USD') errors.currency = 'Enter the amount in USD; currencies are not converted.';
  if (typeof value.description !== 'string' || (requireDescription && !value.description.trim()) || value.description.length > MAX_DESCRIPTION_LENGTH) {
    errors.description = `Enter ${requireDescription ? 'a description of ' : ''}up to ${MAX_DESCRIPTION_LENGTH} characters.`;
  }
  if (!isValidEntryDate(value.date, today)) errors.date = 'Choose a valid date on or before today in Beirut.';
  return errors;
}

export function buildTransactionPayload(draft, options = {}) {
  const description = capitalizeDescription(draft?.description);
  const errors = validateEntryFields({ ...draft, description }, options);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  return {
    amount: Number(draft.amount),
    category: getDefaultCategory(draft.type, draft.scope),
    type: draft.type,
    scope: draft.scope,
    notes: description.trim(),
    date: draft.date,
    created_at: new Date().toISOString().replace('T', ' ').replace('Z', ''),
  };
}
