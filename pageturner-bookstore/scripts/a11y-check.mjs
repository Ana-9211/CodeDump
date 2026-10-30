// VFR-11 evidence: runs the axe-core engine (the same rules Lighthouse's accessibility score uses) on the main pages.
// Needs a running production server and Playwright:   npm start  &  npx playwright install chromium  &&  node scripts/a11y-check.mjs
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = await import('playwright');
const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const base = process.argv[2] || 'http://127.0.0.1:3000';
const pages = ['/', '/books', '/books/1', '/login', '/register', '/forgot-password', '/cart', '/verify-email?token=x', '/reset-password?token=x'];

const browser = await chromium.launch();
const page = await browser.newPage();
let total = 0;
for (const p of pages) {
  await page.goto(base + p, { waitUntil: 'networkidle' });
  await page.evaluate(axe);
  const { violations } = await page.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] }));
  total += violations.length;
  console.log(`${violations.length ? 'FAIL' : 'PASS'}  ${p}${violations.map((v) => `\n      ${v.id} (${v.impact}) x${v.nodes.length}: ${v.help}`).join('')}`);
}
await browser.close();
process.exit(total ? 1 : 0);
