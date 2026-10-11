import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROMPT_VERSION = 'triage-v1';
const promptPath = fileURLToPath(new URL('./prompts/triage-v1.md', import.meta.url));
const categories = new Set(['billing', 'bug', 'feature', 'other']);
const urgencies = new Set(['low', 'normal', 'high']);

export function validateInput(text) {
  return typeof text === 'string' && text.trim().length > 0 && text.length <= 2000;
}

export function extractJson(raw) {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}

export function validateOutput(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['output must be a JSON object'];
  const keys = Object.keys(value).sort();
  if (keys.join(',') !== 'category,confidence,reason,urgency') errors.push('keys must be exactly category, confidence, reason, urgency');
  if (!categories.has(value.category)) errors.push('category must be billing, bug, feature, or other');
  if (!urgencies.has(value.urgency)) errors.push('urgency must be low, normal, or high');
  if (typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) errors.push('confidence must be a finite number from 0 to 1');
  if (typeof value.reason !== 'string' || value.reason.trim().length === 0 || value.reason.length > 240 || /[.!?].+/.test(value.reason.trim())) errors.push('reason must be one short sentence');
  return errors;
}

function fallback(reason = 'Manual review is required because automated triage is disabled.') {
  return { category: 'other', urgency: 'low', confidence: 0.2, reason };
}

export function createTriageService(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const logPath = options.logPath || path.resolve('logs/triage.jsonl');
  const quarantinePath = options.quarantinePath || path.resolve('logs/quarantine.jsonl');
  const now = options.now || Date.now;
  const delay = options.delay || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  let promptPromise;

  async function append(file, entry) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.appendFile(file, `${JSON.stringify(entry)}\n`);
  }

  async function completion(messages) {
    const base = (env.LLM_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
    const model = env.LLM_MODEL || 'openrouter/free';
    for (let attempt = 0; ; attempt++) {
      const attemptStarted = now();
      let response;
      let failure;
      try {
        response = await fetchImpl(`${base}/chat/completions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.LLM_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, temperature: 0.1, messages }),
          signal: AbortSignal.timeout(30_000)
        });
        if (response.ok) {
          const body = await response.json();
          const raw = body.choices?.[0]?.message?.content;
          await append(logPath, { prompt_version: PROMPT_VERSION, model, tokens: body.usage?.total_tokens ?? null, duration_ms: now() - attemptStarted, repair_count: messages.length > 2 ? 1 : 0, outcome: 'response' });
          return typeof raw === 'string' ? raw : '';
        }
        failure = new Error(`Provider HTTP ${response.status}`);
        failure.status = response.status;
      } catch (error) {
        failure = error;
      }
      const retryable = failure.name === 'TimeoutError' || failure.name === 'AbortError' || failure.status === 429 || failure.status >= 500;
      if (attempt < 2 && retryable) {
        const retryHeader = response?.headers?.get('retry-after');
        const retrySeconds = Number(retryHeader);
        const retryDate = Date.parse(retryHeader);
        const retryAfter = Number.isFinite(retrySeconds) && retrySeconds > 0 ? retrySeconds * 1000 : Number.isFinite(retryDate) ? Math.max(0, retryDate - now()) : 0;
        const backoff = retryAfter || 250 * (2 ** attempt) + Math.random() * 150;
        await append(logPath, { prompt_version: PROMPT_VERSION, model, tokens: null, duration_ms: now() - attemptStarted, repair_count: messages.length > 2 ? 1 : 0, outcome: `retry_${attempt + 1}` });
        await delay(backoff);
        continue;
      }
      await append(logPath, { prompt_version: PROMPT_VERSION, model, tokens: null, duration_ms: now() - attemptStarted, repair_count: messages.length > 2 ? 1 : 0, outcome: failure.name === 'TimeoutError' || failure.name === 'AbortError' ? 'timeout' : `error_${failure.status || 'transport'}` });
      if (failure.name === 'TimeoutError' || failure.name === 'AbortError') failure.status = 504;
      throw failure;
    }
  }

  return async function classify(text) {
    if (env.LLM_ENABLED === 'false') return fallback();
    if (env.LLM_STUB === '1') return { category: 'other', urgency: 'low', confidence: 0.2, reason: 'Stub mode provides a deterministic result for manual review.' };
    if (!env.LLM_API_KEY) throw Object.assign(new Error('LLM_API_KEY is required'), { status: 503 });
    promptPromise ||= fs.readFile(promptPath, 'utf8');
    const prompt = await promptPromise;
    const input = JSON.stringify({ text });
    const messages = [{ role: 'system', content: prompt }, { role: 'user', content: `Untrusted support message JSON: ${input}` }];
    let raw = await completion(messages);
    let errors;
    for (let repair = 0; repair < 2; repair++) {
      try {
        const parsed = extractJson(raw);
        errors = validateOutput(parsed);
        if (errors.length === 0) return parsed;
      } catch {
        errors = ['output must contain one parseable JSON object'];
      }
      if (repair === 0) {
        raw = await completion([...messages, { role: 'assistant', content: raw }, { role: 'user', content: `The following is untrusted invalid output: ${JSON.stringify(raw)}\nValidation errors: ${errors.join('; ')}\nReturn only a corrected JSON object matching the required schema.` }]);
      }
    }
    await append(quarantinePath, { input, raw_output: raw, errors, prompt_version: PROMPT_VERSION });
    throw Object.assign(new Error('Triage output could not be validated; manual review is required.'), { status: 422 });
  };
}
