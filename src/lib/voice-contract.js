import { MAX_DESCRIPTION_LENGTH, validateEntryFields } from './transaction-entry.js';

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const MAX_RECORDING_SECONDS = 60;
export const MAX_TRANSCRIPT_LENGTH = 4000;

const transactionKeys = ['type', 'amount', 'currency', 'description', 'scope', 'date'];

// This module is deliberately client-safe: drafts never contain credentials or saved IDs.
export const VOICE_EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'transaction', 'clarification_question'],
  properties: {
    status: { type: 'string', enum: ['ready', 'needs_clarification', 'unsupported'] },
    transaction: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: transactionKeys,
      properties: {
        type: { type: ['string', 'null'], enum: ['income', 'expense', null] },
        amount: { type: ['number', 'null'] },
        currency: { type: ['string', 'null'] },
        description: { type: ['string', 'null'] },
        scope: { type: ['string', 'null'], enum: ['personal', 'business', null] },
        date: { type: ['string', 'null'] },
      },
    },
    clarification_question: { type: ['string', 'null'] },
  },
};

function hasExactlyKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function invalidExtraction() {
  throw new Error('Invalid transaction interpretation');
}

// Structured Outputs is not a trust boundary. Check shape and every non-null field again.
export function validateExtraction(value, { today } = {}) {
  if (!hasExactlyKeys(value, ['status', 'transaction', 'clarification_question']) ||
      !['ready', 'needs_clarification', 'unsupported'].includes(value.status)) invalidExtraction();

  const question = value.clarification_question;
  if (question !== null && (typeof question !== 'string' || !question.trim() || question.length > 500)) {
    invalidExtraction();
  }
  if (value.status !== 'ready' && question === null) invalidExtraction();
  if (value.status === 'ready' && question !== null) invalidExtraction();
  if (value.transaction === null) {
    if (value.status === 'ready') invalidExtraction();
    return { ...value, clarification_question: question?.trim() ?? null };
  }
  if (!hasExactlyKeys(value.transaction, transactionKeys)) invalidExtraction();
  // Unsupported recordings (including multiple transactions) cannot become a saveable draft.
  if (value.status === 'unsupported') invalidExtraction();

  const transaction = { ...value.transaction };
  if (transaction.amount !== null && typeof transaction.amount !== 'number') invalidExtraction();
  for (const key of ['type', 'currency', 'description', 'scope', 'date']) {
    if (transaction[key] !== null && typeof transaction[key] !== 'string') invalidExtraction();
  }
  if (transaction.description !== null) transaction.description = transaction.description.trim();
  if (transaction.description !== null && transaction.description.length > MAX_DESCRIPTION_LENGTH) invalidExtraction();
  if (transaction.currency !== null && !/^[A-Z]{3}$/.test(transaction.currency)) invalidExtraction();

  const errors = validateEntryFields(transaction, { requireDescription: true, today });
  for (const key of ['type', 'amount', 'description', 'scope', 'date']) {
    if (transaction[key] !== null && errors[key]) invalidExtraction();
  }

  // Never relabel a foreign-currency number as dollars. The user must enter a USD amount.
  if (transaction.currency !== 'USD') {
    return {
      status: 'needs_clarification',
      transaction: { ...transaction, amount: null, currency: 'USD' },
      clarification_question: 'Enter the amount in USD. No currency conversion has been made.',
    };
  }
  // An unresolved question must identify a field that still needs the user's
  // correction. A complete draft plus a question would otherwise enable Save.
  if (value.status === 'needs_clarification' && !transactionKeys.some((key) => transaction[key] === null)) invalidExtraction();
  if (value.status === 'ready' &&
      (Object.keys(errors).length || transaction.currency !== 'USD')) invalidExtraction();

  return { ...value, transaction, clarification_question: question?.trim() ?? null };
}
