// Pure-logic unit tests (no server, no database): validators, error mapping, gateway rules, book form parsing.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { str, int, id, oneOf, email, password, objectBody, rupeesToPaise } from '../src/lib/validate.js';
import { toHttpError, HttpError } from '../src/lib/errors.js';
import { charge, refund, wasRefunded } from '../src/lib/gateway.js';
import { parseBookInput, dateRange, upsertParams } from '../src/lib/bookInput.js';
import { sha256 } from '../src/lib/verify.js';

const status = (fn) => { try { fn(); } catch (e) { return e.status; } return 'no error'; };
const rejects = async (p) => { try { await p; } catch (e) { return e.status; } return 'no error'; };

describe('validators', () => {
  test('str trims, enforces length, optional', () => {
    assert.equal(str('  hi  ', 'X'), 'hi');
    assert.equal(status(() => str('', 'X')), 400);
    assert.equal(status(() => str(5, 'X')), 400);
    assert.equal(status(() => str('a'.repeat(300), 'X')), 400);
    assert.equal(status(() => str('a', 'X', { min: 2 })), 400);
    assert.equal(str(undefined, 'X', { optional: true }), undefined);
  });
  test('int and id', () => {
    assert.equal(int('7', 'N'), 7);
    assert.equal(status(() => int('7.5', 'N')), 400);
    assert.equal(status(() => int(-1, 'N', { min: 0 })), 400);
    assert.equal(status(() => int(11, 'N', { max: 10 })), 400);
    assert.equal(int('', 'N', { optional: true }), undefined);
    assert.equal(status(() => int(undefined, 'N')), 400);
    assert.equal(id('12'), 12);
    assert.equal(status(() => id('0')), 400);
  });
  test('oneOf, email, password, objectBody', () => {
    assert.equal(oneOf('a', 'X', ['a', 'b']), 'a');
    assert.equal(status(() => oneOf('c', 'X', ['a', 'b'])), 400);
    assert.equal(oneOf(undefined, 'X', ['a'], { optional: true }), undefined);
    assert.equal(email(' A@B.CO '), 'a@b.co');
    assert.equal(status(() => email('nope')), 400);
    assert.equal(password('abcdefg1'), 'abcdefg1');
    for (const bad of ['short1', 'allletters', '12345678', 'a1'.repeat(40), 5]) assert.equal(status(() => password(bad)), 400);
    assert.deepEqual(objectBody({ a: 1 }), { a: 1 });
    for (const bad of [null, [], 'x']) assert.equal(status(() => objectBody(bad)), 400);
  });
  test('rupeesToPaise avoids float surprises', () => {
    assert.equal(rupeesToPaise('599.50'), 59950);
    assert.equal(rupeesToPaise(349), 34900);
    assert.equal(rupeesToPaise(0.29), 29);
    for (const bad of [0, -1, 'abc', NaN, 1e9]) assert.equal(status(() => rupeesToPaise(bad)), 400);
  });
});

describe('error mapping never leaks SQL', () => {
  test('known database codes become friendly HTTP errors', () => {
    assert.equal(toHttpError(new HttpError(418, 'x')).status, 418);
    assert.equal(toHttpError({ code: '23505', constraint: 'users_email_key' }).message, 'An account with this e-mail already exists.');
    assert.equal(toHttpError({ code: '23514', constraint: 'ck_book_price' }).status, 400);
    assert.match(toHttpError({ code: '23514', constraint: 'ck_unknown' }).message, /data rule/);
    assert.equal(toHttpError({ code: '42501', message: 'permission denied for table users' }).message, 'You do not have permission to do that.');
    assert.equal(toHttpError({ code: '23503', message: 'insert or update on table "books" violates foreign key' }).message, 'The submitted data was not valid.');
    assert.equal(toHttpError({ code: '55000', routine: 'exec_stmt_raise', message: 'only 1 copy of "Dune" left in stock' }).message, 'only 1 copy of "Dune" left in stock');
    assert.equal(toHttpError({ code: 'P0002', message: 'address 5 not found' }).status, 404);
  });
  test('unknown errors are generic 500s; MongoDB outages are 503', () => {
    const e = toHttpError(new Error('select * from secrets; password=hunter2'));
    assert.equal(e.status, 500); assert.ok(!/secrets|hunter2/.test(e.message));
    assert.equal(toHttpError({ name: 'MongoServerSelectionError' }).status, 503);
    assert.equal(toHttpError({ code: 11000 }).status, 409);
  });
});

describe('payment gateway (test adapter)', () => {
  const good = { number: '4242 4242 4242 4242', expiry: '12/39', cvv: '123' };
  test('approves a valid card and keeps only the last four digits', async () => {
    const r = await charge({ method: 'card', amountCents: 1000, card: good });
    assert.match(r.ref, /^GW[0-9A-F]{14}$/); assert.equal(r.detail, 'Card ending 4242');
    assert.ok(!JSON.stringify(r).includes('4242 4242'));
  });
  test('declines, validates and refunds', async () => {
    assert.equal(await rejects(charge({ method: 'card', amountCents: 1000, card: { ...good, number: '4000000000000002' } })), 402);
    assert.equal(await rejects(charge({ method: 'card', amountCents: 1000, card: { ...good, number: '4000000000009995' } })), 402);
    assert.equal(await rejects(charge({ method: 'card', amountCents: 1000, card: { ...good, number: '1234' } })), 400);
    assert.equal(await rejects(charge({ method: 'card', amountCents: 1000, card: { ...good, expiry: '13/30' } })), 400);
    assert.equal(await rejects(charge({ method: 'card', amountCents: 1000, card: { ...good, expiry: '01/21' } })), 400);
    assert.equal(await rejects(charge({ method: 'card', amountCents: 1000, card: { ...good, cvv: '1' } })), 400);
    assert.equal(await rejects(charge({ method: 'card', amountCents: 0, card: good })), 400);
    assert.equal(await rejects(charge({ method: 'cod', amountCents: 1000 })), 400);
    const u = await charge({ method: 'upi', amountCents: 500, upi: 'Reader@Bank' });
    assert.equal(u.detail, 'UPI r***@bank');
    assert.equal(await rejects(charge({ method: 'upi', amountCents: 500, upi: 'fail@upi' })), 402);
    assert.equal(await rejects(charge({ method: 'upi', amountCents: 500, upi: 'bad id' })), 400);
    const r = await charge({ method: 'card', amountCents: 1000, card: good });
    assert.equal(wasRefunded(r.ref), false);
    await refund(r.ref); await refund(r.ref);
    assert.equal(wasRefunded(r.ref), true);
  });
});

describe('book form parsing and report dates', () => {
  const form = { title: 'T', isbn: '9780306406157', categoryId: 1, price: '99.5', stock: 3, authors: 'A, B' };
  test('valid input becomes SQL parameters', () => {
    const p = parseBookInput({ ...form, coverUrl: 'https://x.test/c.png', lowStock: '4' });
    assert.deepEqual(p.authors, ['A', 'B']); assert.equal(p.pricePaise, 9950); assert.equal(p.lowStock, 4);
    assert.equal(upsertParams(null, p).length, 11);
    assert.equal(parseBookInput(form).coverUrl, null);
  });
  test('bad input is refused', () => {
    for (const bad of [{ authors: [] }, { authors: 'A, a' }, { authors: Array(7).fill('x').map((x, i) => x + i) }, { authors: 5 },
      { coverUrl: 'javascript:alert(1)' }, { coverUrl: 'not a url' }, { lowStock: -1 }]) {
      assert.equal(status(() => parseBookInput({ ...form, ...bad })), 400, JSON.stringify(bad));
    }
  });
  test('dateRange defaults and limits', () => {
    const d = dateRange({});
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(d.from) && d.from <= d.to);
    assert.deepEqual(dateRange({ from: '2026-01-01', to: '2026-01-31' }), { from: '2026-01-01', to: '2026-01-31' });
    for (const q of [{ from: '2026-1-1' }, { from: '2026-02-02', to: '2026-02-01' }, { from: '2020-01-01', to: '2026-01-01' }]) assert.equal(status(() => dateRange(q)), 400);
  });
});

test('verification tokens are hashed with SHA-256', () => {
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('VFR-15 docs/openapi.yaml lists every route handler and method', async () => {
  const fs = await import('node:fs'); const path = await import('node:path');
  const yaml = fs.readFileSync('docs/openapi.yaml', 'utf8');
  const routes = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(d, e.name));
      else if (e.name === 'route.js') routes.push(path.join(d, e.name));
    }
  })('src/app/api');
  assert.ok(routes.length > 40);
  for (const f of routes) {
    const url = '/' + path.relative('src/app', path.dirname(f)).split(path.sep).map((s) => s.replace(/^\[(.+)\]$/, '{$1}')).join('/');
    const block = yaml.split(/^  (?=\/api)/m).find((b) => b.startsWith(url + ':\n'));
    assert.ok(block, `${url} missing from openapi.yaml - run npm run openapi`);
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/^export (?:const|async function) (GET|POST|PUT|PATCH|DELETE)\b/gm)) {
      assert.ok(block.includes(`    ${m[1].toLowerCase()}:\n`), `${m[1]} ${url} missing from openapi.yaml`);
    }
  }
});
