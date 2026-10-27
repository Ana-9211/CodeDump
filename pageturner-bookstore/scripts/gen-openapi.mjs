// VFR-15: builds docs/openapi.yaml from the route handlers, so every endpoint is listed and the spec cannot drift.
// Summary = the comment directly above the exported handler; allowed roles = the `roles: [...]` option of api().
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'src/app/api';
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory()) walk(path.join(d, e.name));
    else if (e.name === 'route.js') files.push(path.join(d, e.name));
  }
})(ROOT);

const routes = files.map((f) => ({
  file: f,
  url: '/' + path.relative('src/app', path.dirname(f)).split(path.sep).map((s) => s.replace(/^\[(.+)\]$/, '{$1}')).join('/'),
})).sort((a, b) => a.url.localeCompare(b.url));

const q = (s) => JSON.stringify(s);
let out = `openapi: 3.0.3
info:
  title: PageTurner Online Bookstore API
  version: 1.0.0
  description: >
    Generated from the route handlers in src/app/api (npm run openapi).
    Authentication is an httpOnly cookie named bk_session. The role listed under each operation is enforced by the
    route AND again by PostgreSQL (GRANTs + row level security). All bodies are JSON.
servers:
  - url: http://localhost:3000
components:
  securitySchemes:
    session: { type: apiKey, in: cookie, name: bk_session }
  responses:
    Error: { description: "{ error: message }" }
paths:
`;
let count = 0;
for (const r of routes) {
  const src = fs.readFileSync(r.file, 'utf8');
  const lines = src.split('\n');
  const ops = [];
  lines.forEach((line, i) => {
    const m = /^export (?:const|async function) (GET|POST|PUT|PATCH|DELETE)\b/.exec(line);
    if (m) ops.push({ method: m[1], i });
  });
  if (!ops.length) continue;
  out += `  ${r.url}:\n`;
  const params = [...r.url.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  if (params.length) out += `    parameters:\n${params.map((p) => `      - { name: ${p}, in: path, required: true, schema: { type: string } }\n`).join('')}`;
  ops.sort((a, b) => METHODS.indexOf(a.method) - METHODS.indexOf(b.method));
  for (const op of ops) {
    const end = lines.findIndex((l, i) => i > op.i && /^export /.test(l));
    const body = lines.slice(op.i, end === -1 ? lines.length : end).join('\n');
    const roles = /roles:\s*\[([^\]]*)\]/.exec(body)?.[1].split(',').map((s) => s.replace(/['"\s]/g, '')).filter(Boolean);
    let k = op.i - 1; const doc = [];
    while (k >= 0 && lines[k].startsWith('//')) doc.unshift(lines[k--].replace(/^\/\/\s?/, ''));
    const summary = doc.length ? doc.join(' ').trim() : `${op.method} ${r.url}`;
    out += `    ${op.method.toLowerCase()}:\n      summary: ${q(summary)}\n`;
    out += roles ? `      description: ${q(`Allowed roles: ${roles.join(', ')}`)}\n      security: [ { session: [] } ]\n`
                 : `      description: "Open to everyone (guests included); data is still filtered by row level security."\n`;
    out += `      responses:\n        '200': { description: OK }\n        '400': { $ref: '#/components/responses/Error' }\n`;
    if (roles) out += `        '401': { $ref: '#/components/responses/Error' }\n        '403': { $ref: '#/components/responses/Error' }\n`;
    count++;
  }
}
fs.writeFileSync('docs/openapi.yaml', out);
console.log(`docs/openapi.yaml: ${routes.length} paths, ${count} operations`);
