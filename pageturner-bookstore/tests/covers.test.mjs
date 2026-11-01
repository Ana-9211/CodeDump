// scripts/apply-covers.mjs: matches images to approved books in shelf order, and refuses to guess.
// Only the --dry-run path is exercised here, so no files are copied and the database is not touched.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adminClient, resetDatabase } from './helpers.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (...args) => spawnSync('node', ['scripts/apply-covers.mjs', ...args], { cwd: root, encoding: 'utf8' });
const folderWith = (names) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'covers-'));
  for (const n of names) fs.writeFileSync(path.join(dir, n), 'x');
  return dir;
};
let approved;
before(async () => {
  resetDatabase();
  const db = await adminClient();
  approved = (await db.query("SELECT book_id, title FROM books WHERE status = 'approved' ORDER BY book_id")).rows;
  await db.end();
});

test('shelf order is book_id ascending for approved books, and the first one is Winnie-the-Pooh', () => {
  assert.equal(approved.length, 51);
  assert.equal(approved[0].title, 'Winnie-the-Pooh');
});

test('a folder with the wrong number of images is refused and nothing is changed', () => {
  const dir = folderWith(['1.jpg', '2.jpg', '3.jpg']);
  const r = run(dir, '--dry-run');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /3 images and 51 books cannot be matched one to one/);
  assert.match(r.stderr, /Nothing was changed/);
});

test('images are matched in natural file-name order (cover2 before cover10); non-images are ignored', () => {
  const names = Array.from({ length: 51 }, (_, i) => `cover${i + 1}.${['jpg', 'jpeg', 'png', 'webp'][i % 4]}`);
  const dir = folderWith([...names, 'notes.txt']);
  const r = run(dir, '--dry-run');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Ignoring 1 file/);
  const lines = r.stdout.split('\n').filter((l) => /<-\s+cover\d+/.test(l));
  assert.equal(lines.length, 51);
  assert.match(lines[0], /^\s+1\s+Winnie-the-Pooh.*<-\s+cover1\.jpg$/);
  assert.match(lines[1], /<-\s+cover2\.jpeg$/);
  assert.match(lines[9], /<-\s+cover10\.jpeg$/, 'cover10 comes after cover9, not after cover1');
});

test('a missing folder is a clear error', () => {
  const r = run(path.join(os.tmpdir(), 'no-such-folder-xyz'), '--dry-run');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /is not a folder/);
});

test('the content security policy lets the app show its own /covers images', () => {
  const cfg = fs.readFileSync(path.join(root, 'next.config.mjs'), 'utf8');
  assert.match(cfg, /img-src 'self'/);
});

test('books.cover_url accepts https links and our own /covers files, and nothing else', async () => {
  const db = await adminClient();
  const ok = async (url) => { await db.query('BEGIN'); try { await db.query('UPDATE books SET cover_url = $1 WHERE book_id = 1', [url]); return true; } catch { return false; } finally { await db.query('ROLLBACK'); } };
  assert.ok(await ok('https://example.com/c.jpg'));
  assert.ok(await ok('/covers/1.jpg'));
  assert.ok(await ok('/covers/12.webp'));
  assert.ok(!(await ok('/covers/../secret.png')));
  assert.ok(!(await ok('/etc/passwd')));
  assert.ok(!(await ok('javascript:alert(1)')));
  assert.ok(!(await ok('/covers/1.svg')));
  await db.end();
});
