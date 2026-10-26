// NoSQL layer tests: reviews (CRUD + aggregation) and activity events.
// Uses an in-memory MongoDB-syntax engine (see fake-mongo.mjs) + the REAL PostgreSQL database,
// so the cross-database rating sync is tested for real.
import { test, before, after, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { resetDatabase, adminClient } from './helpers.mjs';
import { FakeCollection } from './fake-mongo.mjs';
import { createReviewService, parseReviewId } from '../src/lib/reviews.js';
import { asApp, pool } from '../src/lib/db.js';
import { reviewValidator } from '../src/lib/mongo.js';

let admin, svc, reviews, views, bookId;
const ana = { bookId: 0, userId: 101, userName: 'Ana' };
const bob = { bookId: 0, userId: 202, userName: 'Bob' };
const cy = { bookId: 0, userId: 303, userName: 'Cy' };

const pgSummary = async () => (await admin.query('SELECT avg_rating, review_count FROM books WHERE book_id=$1', [bookId])).rows[0];

before(async () => {
  resetDatabase();
  admin = await adminClient();
  bookId = (await admin.query("SELECT book_id FROM books WHERE title='Dune'")).rows[0].book_id;
  for (const p of [ana, bob, cy]) p.bookId = bookId;
});
after(async () => { await admin.end(); await pool.end(); });

beforeEach(() => {
  reviews = new FakeCollection({ unique: [['bookId', 'userId']] });
  views = new FakeCollection();
  svc = createReviewService({
    reviews: async () => reviews,
    views: async () => views,
    setSummary: (id, avg, count) => asApp('CALL sp_set_rating_summary($1::bigint, $2::numeric, $3::int)', [id, avg, count]),
  });
});

describe('CREATE + aggregation', () => {
  test('a review is stored and the summary is computed by the pipeline', async () => {
    await svc.create(ana, { rating: 5, title: 'Epic', body: 'A masterpiece.' });
    await svc.create(bob, { rating: 4, body: 'Great but dense.' });
    const out = await svc.create(cy, { rating: 2, body: 'Not for me.' });
    assert.deepEqual(out.summary, { count: 3, average: 3.67, histogram: { 5: 1, 4: 1, 3: 0, 2: 1, 1: 0 } });
    assert.equal(out.review.helpfulCount, 0);
    assert.equal(out.review.mine, true);
  });

  test('the average and count are mirrored into PostgreSQL (books.avg_rating / review_count)', async () => {
    await svc.create(ana, { rating: 5, body: 'Loved it' });
    await svc.create(bob, { rating: 4, body: 'Liked it' });
    assert.deepEqual(await pgSummary(), { avg_rating: 4.5, review_count: 2 });
  });

  test('one review per user per book (unique index -> friendly 409)', async () => {
    await svc.create(ana, { rating: 5, body: 'First' });
    await assert.rejects(svc.create(ana, { rating: 1, body: 'Second' }), (e) => e.status === 409 && /already reviewed/.test(e.message));
  });

  test('input validation', async () => {
    for (const bad of [{ rating: 6, body: 'x' }, { rating: 0, body: 'x' }, { rating: 3.5, body: 'x' }, { rating: 3, body: '   ' }, { rating: 3, body: 'x'.repeat(2001) }, { rating: 3, title: 'x'.repeat(101), body: 'ok' }]) {
      await assert.rejects(svc.create(ana, bad), (e) => e.status === 400);
    }
    assert.equal(reviews.docs.length, 0);
  });
});

describe('READ', () => {
  beforeEach(async () => {
    for (let i = 0; i < 5; i++) {
      await svc.create({ bookId, userId: 1000 + i, userName: `U${i}` }, { rating: 1 + i, body: `review ${i}` });
      reviews.docs[i].createdAt = new Date(2026, 0, 1 + i);          // deterministic ordering
    }
  });
  test('newest first with pagination', async () => {
    const p1 = await svc.list(bookId, { page: 1, limit: 2 });
    assert.deepEqual(p1.items.map((r) => r.body), ['review 4', 'review 3']);
    assert.equal(p1.total, 5);
    const p3 = await svc.list(bookId, { page: 3, limit: 2 });
    assert.deepEqual(p3.items.map((r) => r.body), ['review 0']);
  });
  test('sort by most helpful; viewer flags (mine / votedHelpful)', async () => {
    await svc.toggleHelpful(reviews.docs[1]._id, 7777);
    await svc.toggleHelpful(reviews.docs[1]._id, 8888);
    const out = await svc.list(bookId, { sort: 'helpful', viewerId: 7777 });
    assert.equal(out.items[0].body, 'review 1');
    assert.equal(out.items[0].helpfulCount, 2);
    assert.equal(out.items[0].votedHelpful, true);
    assert.equal((await svc.list(bookId, { viewerId: 1002 })).items.filter((r) => r.mine).length, 1);
  });
  test('mine() returns only the viewer\'s own review', async () => {
    assert.equal((await svc.mine(bookId, 1003)).body, 'review 3');
    assert.equal(await svc.mine(bookId, 5), null);
  });
});

describe('UPDATE', () => {
  test('the author can edit; summary and PostgreSQL follow', async () => {
    const { review } = await svc.create(ana, { rating: 1, title: 'Meh', body: 'Slow start' });
    const out = await svc.update(parseReviewId(review.id), ana.userId, { rating: 5, body: 'Grew on me' });
    assert.equal(out.review.rating, 5);
    assert.equal(out.review.title, 'Meh', 'unspecified fields stay');
    assert.ok(out.review.updatedAt instanceof Date);
    assert.deepEqual(await pgSummary(), { avg_rating: 5, review_count: 1 });
  });
  test('someone else cannot edit it', async () => {
    const { review } = await svc.create(ana, { rating: 3, body: 'ok' });
    await assert.rejects(svc.update(parseReviewId(review.id), bob.userId, { rating: 1 }), (e) => e.status === 404);
    assert.equal(reviews.docs[0].rating, 3);
  });
  test('helpful vote toggles with $addToSet / $pull / $inc, and you cannot vote for yourself', async () => {
    const { review } = await svc.create(ana, { rating: 4, body: 'good' });
    const id = parseReviewId(review.id);
    assert.equal((await svc.toggleHelpful(id, bob.userId)).helpfulCount, 1);
    assert.equal((await svc.toggleHelpful(id, bob.userId)).helpfulCount, 0, 'second click removes the vote');
    assert.deepEqual(reviews.docs[0].helpfulBy, []);
    await assert.rejects(svc.toggleHelpful(id, ana.userId), (e) => e.status === 403);
    await assert.rejects(svc.toggleHelpful(new ObjectId(), bob.userId), (e) => e.status === 404);
  });
});

describe('DELETE', () => {
  test('author deletes own review; the summary drops back to zero', async () => {
    const { review } = await svc.create(ana, { rating: 4, body: 'good' });
    const out = await svc.remove(parseReviewId(review.id), { userId: ana.userId, role: 'customer' });
    assert.deepEqual(out.summary, { count: 0, average: 0, histogram: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } });
    assert.deepEqual(await pgSummary(), { avg_rating: 0, review_count: 0 });
  });
  test('other customers cannot delete it, an admin can (moderation)', async () => {
    const { review } = await svc.create(ana, { rating: 1, body: 'spam spam spam' });
    const id = parseReviewId(review.id);
    await assert.rejects(svc.remove(id, { userId: bob.userId, role: 'customer' }), (e) => e.status === 404);
    await svc.create(bob, { rating: 5, body: 'fine' });
    const out = await svc.remove(id, { userId: 1, role: 'admin' });
    assert.equal(out.summary.count, 1);
    assert.equal(out.summary.average, 5);
    assert.deepEqual(await pgSummary(), { avg_rating: 5, review_count: 1 });
  });
  test('invalid ids are rejected before touching the database', () => {
    for (const bad of ['', 'abc', '123', undefined, '9'.repeat(25)]) assert.throws(() => parseReviewId(bad), (e) => e.status === 400);
  });
});

describe('activity events + trending', () => {
  test('recordView appends events; trending groups the last 7 days, most viewed first', async () => {
    for (const b of [1, 2, 2, 3, 3, 3]) await svc.recordView(b, 42);
    await svc.recordView(1, null);                                   // guest view
    views.docs.push({ bookId: 9, userId: null, at: new Date(Date.now() - 10 * 86400000) });   // too old
    const t = await svc.trending({ days: 7, limit: 5 });
    assert.deepEqual(t, [{ bookId: 3, views: 3 }, { bookId: 1, views: 2 }, { bookId: 2, views: 2 }]);   // ties broken by bookId
    assert.deepEqual(await svc.trending({ days: 7, limit: 1 }), [{ bookId: 3, views: 3 }]);
  });
});

describe('collection design', () => {
  test('validator requires the fields the API always writes', () => {
    const s = reviewValidator.$jsonSchema;
    for (const f of ['bookId', 'userId', 'rating', 'body', 'createdAt']) assert.ok(s.required.includes(f));
    assert.equal(s.properties.rating.minimum, 1);
    assert.equal(s.properties.rating.maximum, 5);
  });
});
