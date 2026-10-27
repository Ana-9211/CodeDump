// VFR-01/02/03 load test: 100 concurrent users against a production build.
//   page load  p95 <= 3000 ms   (VFR-01)       API p95 <= 500 ms  (VFR-02)       error rate < 1%  (VFR-03)
// Starts its own `next start` on port 3112 (run `npm run build` first). Results are written to docs/load-test-results.json.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import autocannon from 'autocannon';

const PORT = 3112, BASE = `http://127.0.0.1:${PORT}`, SECONDS = Number(process.argv[2] || 15), CONNECTIONS = 100;
const server = spawn('node', ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT), '-H', '127.0.0.1'],
  { stdio: 'ignore', env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'load-test-secret' } });
const stop = () => server.kill('SIGTERM');
process.on('exit', stop);

for (let i = 0; i < 120; i++) {
  try { if ((await fetch(`${BASE}/api/health`)).status === 200) break; } catch { /* starting */ }
  await new Promise((r) => setTimeout(r, 500));
}

const run = (title, path) => new Promise((resolve, reject) =>
  autocannon({ url: BASE + path, connections: CONNECTIONS, duration: SECONDS, title }, (err, r) => (err ? reject(err) : resolve(r))));

const targets = [
  ['Home page (VFR-01)', '/', 3000],
  ['Catalogue page (VFR-01)', '/books', 3000],
  ['Browse API (VFR-02)', '/api/books?limit=20', 500],
  ['Search API (VFR-02)', '/api/books?q=physics', 500],
  ['Book detail API (VFR-02)', '/api/books/1', 500],
];
const rows = [];
for (const [title, path, limit] of targets) {
  const r = await run(title, path);
  const total = r.requests.total + r.errors + r.timeouts;
  const bad = r.non2xx + r.errors + r.timeouts;
  rows.push({ title, path, p95_ms: r.latency.p97_5,   // autocannon reports p97.5, which is never lower than p95 - the check is slightly stricter than asked p99_ms: r.latency.p99, avg_ms: r.latency.average,
    req_per_sec: Math.round(r.requests.average), error_rate_pct: +(100 * bad / Math.max(total, 1)).toFixed(3), limit_ms: limit });
}
stop();

let ok = true;
console.log(`\n${CONNECTIONS} concurrent users, ${SECONDS}s per endpoint\n`);
for (const r of rows) {
  const pass = r.p95_ms <= r.limit_ms && r.error_rate_pct < 1;
  ok &&= pass;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${r.title.padEnd(26)} p95 ${String(r.p95_ms).padStart(5)} ms (limit ${r.limit_ms})  avg ${Math.round(r.avg_ms)} ms  ${String(r.req_per_sec).padStart(5)} req/s  errors ${r.error_rate_pct}%`);
}
fs.writeFileSync('docs/load-test-results.json', JSON.stringify({ when: new Date().toISOString(), connections: CONNECTIONS, seconds: SECONDS, rows }, null, 2));
process.exit(ok ? 0 : 1);
