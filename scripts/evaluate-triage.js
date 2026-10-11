import fs from 'node:fs/promises';
import { PROMPT_VERSION } from '../triage.js';

const endpoint = process.env.TRIAGE_URL || 'http://localhost:3000/triage';
const cases = JSON.parse(await fs.readFile(new URL('../evals/cases.json', import.meta.url), 'utf8'));
let correct = 0;
let successful = 0;
const failures = [];

for (const item of cases) {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: item.text })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${result.error || 'request failed'}`);
    successful++;
    if (result.category === item.expected) correct++;
    else failures.push({ id: item.id, expected: item.expected, actual: result.category });
  } catch (error) {
    failures.push({ id: item.id, expected: item.expected, error: error.message });
  }
}

const report = {
  date: new Date().toISOString().slice(0, 10),
  prompt_version: PROMPT_VERSION,
  endpoint,
  status: successful === cases.length ? 'completed' : successful ? 'partial' : 'blocked',
  cases: cases.length,
  successful_cases: successful,
  category_accuracy: successful ? correct / cases.length : null,
  failures
};
await fs.mkdir(new URL('../evals/results/', import.meta.url), { recursive: true });
const resultPath = new URL(`../evals/results/${report.date}.json`, import.meta.url);
await fs.writeFile(resultPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
