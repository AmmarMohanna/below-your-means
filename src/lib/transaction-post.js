import { buildTransactionPayload } from './transaction-entry.js';

const MAX_BODY_BYTES = 8192;

function json(body, status) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

// Dependencies are supplied by the route; tests exercise the same authenticated write boundary.
export function createTransactionPost({ isAuthenticated, addTransaction }) {
  return async function POST(request) {
    if (!(await isAuthenticated())) return json({ error: 'Unauthorized' }, 401);
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return json({ error: 'Expected a JSON entry.' }, 415);
    }
    if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) return json({ error: 'Entry is too large.' }, 413);
    let data;
    try {
      const reader = request.body?.getReader();
      if (!reader) return json({ error: 'Entry is required.' }, 400);
      const chunks = [];
      let length = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > MAX_BODY_BYTES) {
            await reader.cancel();
            return json({ error: 'Entry is too large.' }, 413);
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      data = JSON.parse(await new Blob(chunks).text());
    } catch {
      return json({ error: 'Entry must contain valid JSON.' }, 400);
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return json({ error: 'Invalid entry.' }, 400);
    let payload;
    try {
      payload = buildTransactionPayload({
        amount: data.amount,
        type: data.type,
        scope: data.scope,
        description: data.notes === undefined ? '' : data.notes,
        currency: data.currency,
        date: data.date,
      }, { requireDescription: false });
    } catch (error) {
      return json({ error: error.message }, 400);
    }
    try {
      const result = await addTransaction(payload);
      return json({ success: true, id: result.lastInsertRowid }, 200);
    } catch {
      // An insert may have succeeded before a later audit operation failed.
      // Do not log financial data or tell clients it is safe to retry this write.
      return json({ error: 'The save could not be confirmed. Check your entries before adding it again.', uncertain: true }, 500);
    }
  };
}
