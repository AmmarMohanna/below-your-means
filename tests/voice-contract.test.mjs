import test from 'node:test';
import assert from 'node:assert/strict';
import { VOICE_EXTRACTION_SCHEMA, validateExtraction } from '../src/lib/voice-contract.js';
import { buildTransactionPayload } from '../src/lib/transaction-entry.js';

const today = '2026-09-19';
const ready = (overrides = {}) => ({
  status: 'ready',
  transaction: { type: 'expense', amount: 45, currency: 'USD', description: 'Supermarket', scope: 'personal', date: today, ...overrides },
  clarification_question: null,
});

test('strict schema requires every property and disallows extra properties at each object level', () => {
  for (const schema of [VOICE_EXTRACTION_SCHEMA, VOICE_EXTRACTION_SCHEMA.properties.transaction]) {
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort());
  }
});

test('expense and consulting draft fixtures validate and map into the existing save payload', () => {
  const supermarket = validateExtraction(ready(), { today });
  const payload = buildTransactionPayload(supermarket.transaction, { today });
  assert.equal(payload.amount, 45);
  assert.equal(payload.notes, 'Supermarket');
  assert.equal(payload.category, 'Other');
  const consulting = validateExtraction(ready({ type: 'income', amount: 500, description: 'Consulting', scope: 'business' }), { today });
  assert.equal(buildTransactionPayload(consulting.transaction, { today }).category, 'Income');
  assert.equal(buildTransactionPayload({ ...consulting.transaction, type: 'expense' }, { today }).category, 'Business');
});

test('missing amount remains nullable and can be corrected directly without interpretation', () => {
  const draft = { ...ready({ amount: null, description: 'Groceries' }), status: 'needs_clarification', clarification_question: 'How much did you pay in USD?' };
  assert.equal(validateExtraction(draft, { today }).transaction.amount, null);
  assert.throws(() => buildTransactionPayload(draft.transaction, { today }));
  assert.equal(buildTransactionPayload({ ...draft.transaction, amount: '32.50' }, { today }).amount, 32.5);
});

test('unknown direction is nullable and direct correction resolves it', () => {
  const draft = { ...ready({ type: null }), status: 'needs_clarification', clarification_question: 'Was this money received or paid?' };
  assert.equal(validateExtraction(draft, { today }).transaction.type, null);
  assert.equal(buildTransactionPayload({ ...draft.transaction, type: 'income' }, { today }).type, 'income');
});

test('a foreign-currency number is cleared instead of relabeled or converted', () => {
  const draft = validateExtraction(ready({ amount: 900000, currency: 'LBP' }), { today });
  assert.equal(draft.status, 'needs_clarification');
  assert.equal(draft.transaction.amount, null);
  assert.equal(draft.transaction.currency, 'USD');
  assert.match(draft.clarification_question, /USD.*No currency conversion/);
});

test('unknown currency cannot silently turn a supplied amount into USD', () => {
  const draft = validateExtraction({ ...ready({ amount: 500, currency: null }), status: 'needs_clarification', clarification_question: 'Which currency?' }, { today });
  assert.equal(draft.transaction.amount, null);
  assert.equal(draft.transaction.currency, 'USD');
});

test('multiple entries and transfers are unsupported with no saveable transaction', () => {
  const multiple = { status: 'unsupported', transaction: null, clarification_question: 'Please record one transaction at a time.' };
  assert.deepEqual(validateExtraction(multiple, { today }), multiple);
  assert.throws(() => validateExtraction({ ...multiple, transaction: ready().transaction }, { today }));
});

test('silence/no transaction can be represented without an invented draft', () => {
  const empty = { status: 'unsupported', transaction: null, clarification_question: 'Please record one completed transaction.' };
  assert.equal(validateExtraction(empty, { today }).transaction, null);
});

test('server rejects malformed shape, nonfinite/nonpositive/overprecision amounts and invalid fields', () => {
  const invalid = [
    null, [], {}, { ...ready(), extra: true }, { ...ready(), status: 'saved' },
    { ...ready(), transaction: null }, { ...ready(), clarification_question: 'Unexpected' },
    { ...ready(), status: 'needs_clarification' },
    { ...ready(), status: 'needs_clarification', clarification_question: 'An unresolved question without a missing field?' },
    ready({ amount: NaN }), ready({ amount: Infinity }), ready({ amount: -1 }), ready({ amount: 0 }),
    ready({ amount: 1.001 }), ready({ amount: '45' }), ready({ type: 'transfer' }),
    ready({ scope: 'work' }), ready({ date: '2026-02-30' }), ready({ date: '2026-09-20' }),
    ready({ description: '' }), ready({ description: 'a'.repeat(501) }), ready({ currency: 'dollars' }),
    ready({ amount: null }), ready({ date: null }), ready({ description: null }),
    { ...ready(), transaction: { ...ready().transaction, category: 'Food' } },
  ];
  for (const value of invalid) assert.throws(() => validateExtraction(value, { today }));
});

test('valid Arabic descriptions and Beirut-relative yesterday dates survive unchanged', () => {
  const draft = ready({ amount: 20, description: 'مشتريات', date: '2026-09-18' });
  assert.deepEqual(validateExtraction(draft, { today }), draft);
});
