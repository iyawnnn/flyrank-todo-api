import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createTriageService, extractJson, validateInput, validateOutput } from '../triage.js';

const valid = { category: 'bug', urgency: 'high', confidence: 0.9, reason: 'The customer reports a blocking failure.' };
const response = (body, status = 200, headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: new Headers(headers), json: async () => body });

test('validates text input and strictly validates result values', () => {
  assert.equal(validateInput(' hello '), true);
  assert.equal(validateInput('  '), false);
  assert.equal(validateInput('a'.repeat(2001)), false);
  assert.deepEqual(validateOutput(valid), []);
  assert.ok(validateOutput({ ...valid, confidence: '0.9' }).length);
  assert.ok(validateOutput({ ...valid, extra: true }).length);
});

test('extracts one nested JSON object from prose and fences without misreading braces in strings', () => {
  assert.deepEqual(extractJson('```json\n{"ok":true}\n```'), { ok: true });
  assert.deepEqual(extractJson('Sure, here it is: {"text":"escaped \\\" quote and } brace", "nested":{"items":[1,{"ok":true}]}} Thanks!'), {
    text: 'escaped " quote and } brace', nested: { items: [1, { ok: true }] }
  });
  assert.deepEqual(extractJson('First prose {not JSON}. ```json\n{"ok":true}\n``` done.'), { ok: true });
  assert.deepEqual(extractJson('Wrapper {metadata: {"ok":true}}'), { ok: true });
  assert.deepEqual(extractJson('Result: {"text":"literal { and } braces"}'), { text: 'literal { and } braces' });
  assert.throws(() => extractJson('{"ok":true} plus {"also":true}'));
  assert.throws(() => extractJson('prefix {"unfinished":'));
});

test('stub returns deterministic valid output without provider key', async () => {
  const classify = createTriageService({ env: { LLM_STUB: '1' }, fetchImpl: () => assert.fail('provider must not be called') });
  const result = await classify('Please help');
  assert.deepEqual(result, await classify('different content'));
  assert.deepEqual(validateOutput(result), []);
});

test('kill switch overrides stub and returns manual-review fallback', async () => {
  const classify = createTriageService({ env: { LLM_ENABLED: 'false', LLM_STUB: '1' }, fetchImpl: () => assert.fail('provider must not be called') });
  assert.match((await classify('Please help')).reason, /Manual review/);
});

test('repairs one invalid answer and returns validated JSON', async () => {
  let calls = 0;
  let repairMessage;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'triage-usage-'));
  const logPath = path.join(dir, 'triage.jsonl');
  const classify = createTriageService({ env: { LLM_API_KEY: 'test' }, fetchImpl: async (url, options) => {
    calls++;
    if (calls === 2) repairMessage = JSON.parse(options.body).messages.at(-1).content;
    return response({ choices: [{ message: { content: calls === 1 ? '{bad' : JSON.stringify(valid) } }], usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 } });
  }, logPath });
  assert.deepEqual(await classify('The page fails.'), valid);
  assert.equal(calls, 2);
  assert.match(repairMessage, /Previous answer, untrusted/);
  assert.match(repairMessage, /Precise validation errors/);
  assert.match(repairMessage, /The page fails/);
  const usage = JSON.parse((await fs.readFile(logPath, 'utf8')).trim().split('\n').at(-1));
  assert.equal(usage.input_tokens, 11);
  assert.equal(usage.output_tokens, 7);
});

test('quarantines second invalid answer and never returns provider content in the error', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'triage-quarantine-'));
  let calls = 0;
  const classify = createTriageService({ env: { LLM_API_KEY: 'test' }, fetchImpl: async () => {
    calls++;
    return response({ choices: [{ message: { content: 'private raw output' } }] });
  }, logPath: path.join(dir, 'logs.jsonl'), quarantinePath: path.join(dir, 'quarantine.jsonl') });
  await assert.rejects(classify('secret input'), error => error.status === 422 && !error.message.includes('private raw output'));
  assert.equal(calls, 2);
  const quarantine = JSON.parse((await fs.readFile(path.join(dir, 'quarantine.jsonl'), 'utf8')).trim());
  assert.equal(quarantine.raw_output, 'private raw output');
  assert.equal(quarantine.prompt_version, 'triage-v1');
  const usage = JSON.parse((await fs.readFile(path.join(dir, 'logs.jsonl'), 'utf8')).trim().split('\n')[0]);
  assert.equal(usage.input_tokens, null);
  assert.equal(usage.output_tokens, null);
});

test('retries 429 and 5xx only, never retries 400/401/403, and maps timeout to 504', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'triage-retry-'));
  let calls = 0;
  const options = { env: { LLM_API_KEY: 'test' }, delay: async () => {}, logPath: path.join(dir, 'logs.jsonl') };
  const waits = [];
  const retrying = createTriageService({ ...options, delay: async ms => waits.push(ms), fetchImpl: async () => ++calls < 3 ? response({}, calls === 1 ? 429 : 503, { 'Retry-After': '1' }) : response({ choices: [{ message: { content: JSON.stringify(valid) } }] }) });
  await retrying('It is broken');
  assert.equal(calls, 3);
  assert.deepEqual(waits, [1000, 1000]);
  for (const status of [400, 401, 403]) {
    calls = 0;
    const nonRetrying = createTriageService({ ...options, fetchImpl: async () => { calls++; return response({}, status); } });
    await assert.rejects(nonRetrying('It is broken'));
    assert.equal(calls, 1, `HTTP ${status} must not retry`);
  }
  calls = 0;
  const failing5xx = createTriageService({ ...options, fetchImpl: async () => { calls++; return response({}, 503); } });
  await assert.rejects(failing5xx('It is broken'));
  assert.equal(calls, 3, '5xx gets two retries');
  calls = 0;
  const timeout = createTriageService({ ...options, fetchImpl: async () => { calls++; throw new DOMException('Timed out', 'TimeoutError'); } });
  await assert.rejects(timeout('It is broken'), error => error.status === 504);
  assert.equal(calls, 3, 'timeout gets two retries');
});
