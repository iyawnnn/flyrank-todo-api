const baseUrl = process.env.LLM_BASE_URL || 'https://openrouter.ai/api/v1';
const apiKey = process.env.LLM_API_KEY;
const model = process.env.LLM_MODEL || 'openrouter/free';

if (!apiKey) {
  console.error('LLM_API_KEY is required.');
  process.exit(1);
}

const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model,
    temperature: 0,
    messages: [{ role: 'user', content: 'Reply with exactly: provider smoke test passed' }]
  }),
  signal: AbortSignal.timeout(30_000)
});

if (!response.ok) {
  console.error(`Provider smoke test failed with HTTP ${response.status}.`);
  process.exit(1);
}

const result = await response.json();
console.log(`Provider reachable; model=${result.model || model}; response_received=${Boolean(result.choices?.[0]?.message?.content)}`);
