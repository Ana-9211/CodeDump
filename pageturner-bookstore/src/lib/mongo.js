// MongoDB (NoSQL) access layer + schema bootstrap.
//
// Why MongoDB here?  Reviews and click-stream events are
//   * document-shaped (a review is one self-contained object),
//   * write-heavy and append-mostly,
//   * never joined with other tables in a transaction,
// so they do not need the strict relational model that orders and stock do.
import { MongoClient } from 'mongodb';

const g = globalThis;

function client() {
  if (!g.__bookstoreMongo) {
    g.__bookstoreMongo = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017', {
      serverSelectionTimeoutMS: 4000,
    }).connect();
  }
  return g.__bookstoreMongo;
}

export async function getMongoDb() {
  return (await client()).db(process.env.MONGODB_DB || 'bookstore_nosql');
}

export async function closeMongo() {
  if (g.__bookstoreMongo) {
    const c = await g.__bookstoreMongo;
    await c.close();
    g.__bookstoreMongo = undefined;
  }
}

/** 'up' | 'down' for the health probe. A failed connection attempt is forgotten so MongoDB can come back later. */
export async function mongoStatus() {
  try {
    const db = await Promise.race([getMongoDb().then((d) => d.command({ ping: 1 })), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 500))]);
    return db ? 'up' : 'down';
  } catch {
    g.__bookstoreMongo = undefined;
    return 'down';
  }
}

export const reviewsCollection = async () => (await getMongoDb()).collection('reviews');
export const viewsCollection = async () => (await getMongoDb()).collection('book_views');

// ---------------------------------------------------------------------------
// Schema bootstrap (idempotent): collections, validators, indexes
// ---------------------------------------------------------------------------
const VIEW_TTL_SECONDS = 60 * 60 * 24 * 30; // keep click events for 30 days

export const reviewValidator = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['bookId', 'userId', 'userName', 'rating', 'body', 'helpfulBy', 'helpfulCount', 'createdAt'],
    properties: {
      bookId:       { bsonType: 'number', description: 'book_id from PostgreSQL' },
      userId:       { bsonType: 'number', description: 'user_id from PostgreSQL' },
      userName:     { bsonType: 'string', minLength: 1, maxLength: 100 },
      rating:       { bsonType: 'number', minimum: 1, maximum: 5 },
      title:        { bsonType: 'string', maxLength: 100 },
      body:         { bsonType: 'string', minLength: 1, maxLength: 2000 },
      helpfulBy:    { bsonType: 'array', items: { bsonType: 'number' } },
      helpfulCount: { bsonType: 'number', minimum: 0 },
      createdAt:    { bsonType: 'date' },
      updatedAt:    { bsonType: 'date' },
    },
  },
};

export const viewValidator = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['bookId', 'at'],
    properties: {
      bookId: { bsonType: 'number' },
      userId: { bsonType: ['number', 'null'] },
      at:     { bsonType: 'date' },
    },
  },
};

async function ensureCollection(db, name, validator, notes) {
  const exists = (await db.listCollections({ name }).toArray()).length > 0;
  try {
    if (!exists) await db.createCollection(name, { validator, validationLevel: 'strict', validationAction: 'error' });
    else await db.command({ collMod: name, validator, validationLevel: 'strict', validationAction: 'error' });
  } catch (err) {
    // Some MongoDB-compatible servers do not implement schema validators. The API validates
    // every document itself as well, so we continue (and say so) instead of failing setup.
    notes.push(`validator for "${name}" not applied: ${err.message}`);
    if (!exists) await db.createCollection(name);
  }
}

export async function setupMongo({ log = () => {}, reset = false } = {}) {
  const db = await getMongoDb();
  const notes = [];

  // A PostgreSQL reset restarts every book_id/user_id at 1. Reviews and views that still point at the OLD ids
  // would be attached to the wrong books (and could break the unique index), so they are cleared together.
  if (reset) {
    for (const name of ['reviews', 'book_views']) {
      await db.collection(name).drop().catch((err) => { if (err.codeName !== 'NamespaceNotFound') throw err; });
    }
    log('  MongoDB collections reviews and book_views cleared (ids restart after a PostgreSQL reset)');
  }

  await ensureCollection(db, 'reviews', reviewValidator, notes);
  await ensureCollection(db, 'book_views', viewValidator, notes);

  const reviews = db.collection('reviews');
  await reviews.createIndex({ bookId: 1, userId: 1 }, { unique: true, name: 'uq_review_per_user_per_book' });
  await reviews.createIndex({ bookId: 1, createdAt: -1 }, { name: 'ix_reviews_book_newest' });
  await reviews.createIndex({ userId: 1 }, { name: 'ix_reviews_user' });

  const views = db.collection('book_views');
  await views.createIndex({ bookId: 1, at: -1 }, { name: 'ix_views_book_time' });
  try {
    await views.createIndex({ at: 1 }, { expireAfterSeconds: VIEW_TTL_SECONDS, name: 'ttl_views_30d' });
  } catch (err) {
    notes.push(`TTL index not created: ${err.message}`);
  }

  notes.forEach((n) => log(`  note: ${n}`));
  return notes;
}
