import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceHandlers, VOICE_EXTRACTION_INSTRUCTIONS } from '../src/lib/voice-server.js';
import { MAX_AUDIO_BYTES, MAX_TRANSCRIPT_LENGTH } from '../src/lib/voice-contract.js';

const origin = 'https://budget.example';
const fixture = {
  status: 'ready',
  transaction: { type: 'expense', amount: 45, currency: 'USD', description: 'Supermarket', scope: 'personal', date: '2026-09-19' },
  clarification_question: null,
};
function completed(value = fixture) {
  return { status: 'completed', output: [{ type: 'message', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] };
}
function parseRequest(data = {}, headers = {}) {
  return new Request(`${origin}/api/transactions/parse`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...headers },
    body: JSON.stringify({ transcript: 'Paid 45 dollars at the supermarket', selectedDate: '2026-09-19', scope: 'personal', ...data }),
  });
}
function audioRequest({ type = 'audio/webm;codecs=opus', name = 'voice.webm', bytes = new Uint8Array([1, 2, 3]), extra = false } = {}) {
  const body = new FormData();
  body.set('file', new Blob([bytes], { type }), name);
  if (extra) body.set('another', 'not needed');
  return new Request(`${origin}/api/transactions/transcribe`, { method: 'POST', headers: { Origin: origin }, body });
}
function setup({ authenticated = true, env = {}, fetchImpl, timeoutMs } = {}) {
  const calls = [];
  const rateCalls = [];
  let environments = 0;
  const handlers = createVoiceHandlers({
    isAuthenticated: async () => authenticated,
    getEnvironment: async () => {
      environments++;
      return { OPENAI_API_KEY: 'test-secret-never-return', VOICE_RATE_LIMITER: { limit: async (input) => { rateCalls.push(input); return { success: true }; } }, ...env };
    },
    fetchImpl: async (...args) => { calls.push(args); return fetchImpl ? fetchImpl(...args) : Response.json(completed()); },
    today: () => '2026-09-19', timeoutMs,
  });
  return { ...handlers, calls, rateCalls, environments: () => environments };
}

test('both endpoints authenticate before environment, body or provider access', async () => {
  const server = setup({ authenticated: false });
  assert.equal((await server.parse(parseRequest())).status, 401);
  assert.equal((await server.transcribe(audioRequest())).status, 401);
  assert.equal(server.environments(), 0);
  assert.equal(server.calls.length, 0);
});

test('cross-origin requests are rejected before the rate limiter or provider', async () => {
  const server = setup();
  assert.equal((await server.parse(parseRequest({}, { Origin: 'https://other.example' }))).status, 403);
  assert.equal(server.environments(), 0);
  assert.equal(server.calls.length, 0);
});

test('missing credentials or rate limiter fails closed without a provider call', async () => {
  for (const env of [{ OPENAI_API_KEY: undefined }, { VOICE_RATE_LIMITER: undefined }, { VOICE_RATE_LIMITER: { limit: async () => { throw new Error('binding unavailable'); } } }]) {
    const server = setup({ env });
    const response = await server.parse(parseRequest());
    assert.equal(response.status, 503);
    assert.equal(server.calls.length, 0);
    assert.doesNotMatch(await response.text(), /test-secret|binding unavailable/);
  }
});

test('rate limiting returns a retry interval and never calls the provider', async () => {
  const server = setup({ env: { VOICE_RATE_LIMITER: { limit: async () => ({ success: false }) } } });
  for (const method of ['parse', 'transcribe']) {
    const response = await server[method](method === 'parse' ? parseRequest() : audioRequest());
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '60');
  }
  assert.equal(server.calls.length, 0);
});

test('both endpoints consume the same account quota', async () => {
  const server = setup({ fetchImpl: async (url) => Response.json(url.endsWith('/responses') ? completed() : { text: 'Paid 45 dollars' }) });
  await server.transcribe(audioRequest());
  await server.parse(parseRequest());
  assert.equal(server.rateCalls.length, 2);
  assert.equal(server.rateCalls[0].key, server.rateCalls[1].key);
});

test('Responses request has strict schema, store:false, only transcript and necessary captured context', async () => {
  const server = setup();
  const response = await server.parse(parseRequest({ selectedDate: '2026-09-10', transcript: 'Spent 20 yesterday', balance: 1000, history: ['private'] }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), fixture);
  const [url, init] = server.calls[0];
  assert.equal(url, 'https://api.openai.com/v1/responses');
  const body = JSON.parse(init.body);
  assert.equal(body.model, 'gpt-4.1-mini');
  assert.equal(body.store, false);
  assert.equal(body.text.format.strict, true);
  assert.equal(body.text.format.type, 'json_schema');
  assert.deepEqual(JSON.parse(body.input[0].content[0].text), {
    transcript: 'Spent 20 yesterday', current_beirut_date: '2026-09-19', selected_entry_date: '2026-09-10', selected_scope: 'personal',
  });
  assert.equal(body.instructions, VOICE_EXTRACTION_INSTRUCTIONS);
  assert.match(body.instructions, /untrusted data/);
  assert.match(body.instructions, /yesterday.*current_beirut_date/);
  assert.match(body.instructions, /Multiple purchases/);
  assert.doesNotMatch(init.body, /private|balance|test-secret/);
});

test('API model overrides are server-side only', async () => {
  const server = setup({ env: { OPENAI_PARSE_MODEL: 'configured-extractor', OPENAI_TRANSCRIBE_MODEL: 'configured-transcriber' }, fetchImpl: async (url) => Response.json(url.endsWith('/responses') ? completed() : { text: 'Paid 45 dollars' }) });
  await server.parse(parseRequest({ model: 'client-model' }));
  await server.transcribe(audioRequest());
  assert.equal(JSON.parse(server.calls[0][1].body).model, 'configured-extractor');
  assert.equal(server.calls[1][1].body.get('model'), 'configured-transcriber');
});

test('mocked example extractions cross the API boundary as unsaved drafts or questions', async () => {
  // These fixtures verify API validation/transport, not live model accuracy.
  const examples = [
    ['Paid 45 dollars at the supermarket', fixture],
    ['Received 500 dollars for consulting', { ...fixture, transaction: { ...fixture.transaction, amount: 500, type: 'income', description: 'Consulting', scope: 'business' } }],
    ['Paid for groceries', { status: 'needs_clarification', transaction: { ...fixture.transaction, amount: null, description: 'Groceries' }, clarification_question: 'How much did you pay in USD?' }],
    ['Spent 20 yesterday', { status: 'needs_clarification', transaction: { ...fixture.transaction, amount: 20, description: null, date: '2026-09-18' }, clarification_question: 'What was it for?' }],
    ['Paid 900000 Lebanese pounds', { status: 'needs_clarification', transaction: { ...fixture.transaction, amount: null, description: null }, clarification_question: 'What was it for, and what was the amount in USD?' }],
    ['Paid 20 for lunch and 40 for gas', { status: 'unsupported', transaction: null, clarification_question: 'Record one transaction at a time.' }],
    ['دفعت 45 dollars بالسوبرماركت', { ...fixture, transaction: { ...fixture.transaction, description: 'السوبرماركت' } }],
  ];
  for (const [transcript, result] of examples) {
    const server = setup({ fetchImpl: async () => Response.json(completed(result)) });
    const response = await server.parse(parseRequest({ transcript }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), result);
    assert.equal(server.calls.length, 1);
    assert.equal(server.calls[0][0], 'https://api.openai.com/v1/responses');
  }
});

test('transcription preserves supported WebM and Safari MP4 files and uses no English restriction', async () => {
  for (const audio of [{}, { type: 'audio/mp4;codecs=mp4a.40.2', name: 'voice.mp4' }, { type: 'audio/x-m4a', name: 'voice.m4a' }, { type: 'audio/wav', name: 'voice.wav' }, { type: 'audio/mpga', name: 'voice.mp3' }]) {
    const server = setup({ fetchImpl: async () => Response.json({ text: ' دفعت 45 دولار ' }) });
    const response = await server.transcribe(audioRequest(audio));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { transcript: 'دفعت 45 دولار' });
    const [url, init] = server.calls[0];
    assert.equal(url, 'https://api.openai.com/v1/audio/transcriptions');
    assert.equal(init.body.get('model'), 'gpt-4o-mini-transcribe');
    assert.equal(init.body.has('language'), false);
    assert.equal(init.body.get('file').type, audio.type || 'audio/webm;codecs=opus');
    assert.equal(init.body.get('file').name, (audio.name || 'voice.webm').replace('voice', 'recording'));
  }
});

test('empty, unsupported, mismatched, duplicate and oversized audio never reaches provider', async () => {
  const cases = [
    [{ bytes: new Uint8Array() }, 400], [{ type: 'audio/ogg', name: 'voice.ogg' }, 415],
    [{ type: 'audio/mp4', name: 'voice.webm' }, 415], [{ extra: true }, 400],
    [{ bytes: new Uint8Array(MAX_AUDIO_BYTES + 1) }, 413],
  ];
  for (const [audio, status] of cases) {
    const server = setup();
    assert.equal((await server.transcribe(audioRequest(audio))).status, status);
    assert.equal(server.calls.length, 0);
  }
});

test('empty and silence transcription is a recoverable error without a draft', async () => {
  for (const text of ['', '   ', '[silence]', '[BLANK_AUDIO]', '(no speech)']) {
    const server = setup({ fetchImpl: async () => Response.json({ text }) });
    assert.equal((await server.transcribe(audioRequest())).status, 422);
  }
});

test('invalid transcripts, context, content type and JSON bodies are rejected before provider', async () => {
  const cases = [
    parseRequest({ transcript: '' }), parseRequest({ transcript: 'x'.repeat(MAX_TRANSCRIPT_LENGTH + 1) }),
    parseRequest({ selectedDate: '2026-02-30' }), parseRequest({ selectedDate: '2026-09-20' }),
    parseRequest({ scope: 'all' }), parseRequest({ transcript: 23 }),
    new Request(`${origin}/api/transactions/parse`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' }),
  ];
  for (const request of cases) {
    const server = setup();
    assert.equal((await server.parse(request)).status, 400);
    assert.equal(server.calls.length, 0);
  }
  assert.equal((await setup().parse(parseRequest({}, { 'Content-Type': 'text/plain' }))).status, 415);
});

test('chunked requests are bounded even without Content-Length', async () => {
  const server = setup();
  const request = new Request(`${origin}/api/transactions/parse`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, duplex: 'half',
    body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(33 * 1024)); controller.close(); } }),
  });
  assert.equal((await server.parse(request)).status, 413);
  assert.equal(server.calls.length, 0);
});

test('refused, incomplete, malformed and invalid provider results cannot produce a draft', async () => {
  const cases = [
    [{ status: 'completed', output: [{ type: 'message', status: 'completed', content: [{ type: 'refusal', refusal: 'private provider text' }] }] }, 422],
    [{ ...completed(), status: 'incomplete' }, 502],
    [{ status: 'completed', output: [] }, 502],
    [{ status: 'completed', output: [{ type: 'message', status: 'incomplete', content: [] }] }, 502],
    [{ status: 'completed', output: [{ type: 'message', status: 'completed', content: [{ type: 'output_text', text: '{bad' }] }] }, 502],
    [completed({ ...fixture, transaction: { ...fixture.transaction, amount: -45 } }), 502],
  ];
  for (const [result, status] of cases) {
    const server = setup({ fetchImpl: async () => Response.json(result) });
    const response = await server.parse(parseRequest());
    assert.equal(response.status, status);
    assert.doesNotMatch(await response.text(), /private provider|test-secret/);
  }
});

test('provider HTTP/network errors are recoverable and do not expose response bodies or secrets', async () => {
  for (const fetchImpl of [async () => new Response('private provider error', { status: 500 }), async () => { throw new Error('test-secret-never-return'); }]) {
    const response = await setup({ fetchImpl }).parse(parseRequest());
    assert.equal(response.status, 502);
    assert.doesNotMatch(await response.text(), /private provider|test-secret/);
  }
  assert.equal((await setup({ fetchImpl: async () => new Response('', { status: 429 }) }).parse(parseRequest())).status, 429);
});

test('provider response bodies are bounded', async () => {
  const response = await setup({ fetchImpl: async () => new Response('x'.repeat(65 * 1024)) }).parse(parseRequest());
  assert.equal(response.status, 502);
});

test('provider timeout aborts the call without retries', async () => {
  let aborted = false;
  const server = setup({ timeoutMs: 5, fetchImpl: async (_url, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  }) });
  const response = await server.parse(parseRequest());
  assert.equal(response.status, 504);
  assert.equal(aborted, true);
  assert.equal(server.calls.length, 1);
});

test('canceling an in-flight request aborts provider work', async () => {
  const controller = new AbortController();
  let started;
  const began = new Promise((resolve) => { started = resolve; });
  const server = setup({ fetchImpl: async (_url, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    started();
  }) });
  const response = server.parse(new Request(parseRequest(), { signal: controller.signal }));
  await began;
  controller.abort();
  assert.equal((await response).status, 408);
  assert.equal(server.calls.length, 1);
});
