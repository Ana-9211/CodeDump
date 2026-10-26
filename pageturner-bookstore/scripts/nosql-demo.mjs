// Narrated tour of the MongoDB part (rubric: creation + read/update/delete of features).
// Needs MongoDB running:   npm run db:setup && npm run nosql:demo
import { loadEnv } from '../src/lib/env.js';
loadEnv();
const { getMongoDb, closeMongo, setupMongo } = await import('../src/lib/mongo.js');
const { createReviewService } = await import('../src/lib/reviews.js');

const say = (t) => console.log(`\n\x1b[1;36m== ${t}\x1b[0m`);
const show = (label, v) => console.log(`${label}:`, JSON.stringify(v, null, 1));

try {
  const db = await getMongoDb();
  await setupMongo({ log: () => {} });
  const reviews = db.collection('reviews'), views = db.collection('book_views');
  const mirrored = [];
  const svc = createReviewService({ reviews: async () => reviews, views: async () => views, setSummary: async (b, a, n) => mirrored.push({ bookId: b, avg: a, count: n }) });
  const DEMO_BOOK = 999001;
  await reviews.deleteMany({ bookId: DEMO_BOOK });

  say('CREATE  - insert reviews (validator + unique {bookId,userId} index guard them)');
  const a = await svc.create({ bookId: DEMO_BOOK, userId: 1, userName: 'Asha' }, { rating: 5, title: 'Superb', body: 'Could not put it down.' });
  await svc.create({ bookId: DEMO_BOOK, userId: 2, userName: 'Ravi' }, { rating: 3, body: 'Decent.' });
  await svc.create({ bookId: DEMO_BOOK, userId: 3, userName: 'Divya' }, { rating: 4, body: 'Good value.' });
  try { await svc.create({ bookId: DEMO_BOOK, userId: 1, userName: 'Asha' }, { rating: 1, body: 'again' }); }
  catch (e) { console.log('Second review by the same user rejected ->', e.message); }
  try { await reviews.insertOne({ bookId: DEMO_BOOK, userId: 9, rating: 99 }); }
  catch (e) { console.log('Invalid document rejected by $jsonSchema validator ->', e.codeName ?? e.code); }

  say('READ    - find + sort + paginate, and an aggregation pipeline ($group)');
  show('newest first', (await svc.list(DEMO_BOOK, { limit: 2 })).items.map((r) => ({ who: r.userName, rating: r.rating })));
  show('summary (average + histogram)', await svc.summary(DEMO_BOOK));

  say('UPDATE  - $set to edit a review, $addToSet/$inc for a "helpful" vote');
  await svc.update(a.review.id && (await reviews.findOne({ bookId: DEMO_BOOK, userId: 1 }))._id, 1, { rating: 4, body: 'Great, on second thought 4 stars.' });
  const r2 = await reviews.findOne({ bookId: DEMO_BOOK, userId: 2 });
  await svc.toggleHelpful(r2._id, 3);
  show('helpfulCount after vote', (await reviews.findOne({ _id: r2._id })).helpfulCount);
  await svc.toggleHelpful(r2._id, 3);
  show('after un-vote', (await reviews.findOne({ _id: r2._id })).helpfulCount);

  say('DELETE  - remove one review; summary recomputed; TTL index expires old view events by itself');
  await svc.remove(r2._id, { role: 'customer', userId: 2 });
  show('summary now', await svc.summary(DEMO_BOOK));
  show('indexes on book_views', (await views.indexes()).map((i) => ({ name: i.name, expireAfterSeconds: i.expireAfterSeconds })));
  show('values mirrored to PostgreSQL (books.avg_rating, review_count)', mirrored.at(-1));

  await reviews.deleteMany({ bookId: DEMO_BOOK });
  console.log('\nDemo data cleaned up.');
} catch (err) {
  console.error(`\nCould not run the demo: ${err.message}\nIs MongoDB running on ${process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017'}?`);
  process.exitCode = 1;
} finally {
  await closeMongo().catch(() => {});
}
