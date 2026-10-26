// A tiny in-memory stand-in for a MongoDB collection, used ONLY by the test-suite.
// It evaluates real MongoDB query / update-operator / aggregation-pipeline syntax with
// the `mingo` library, so the pipelines and operators in src/lib/reviews.js are genuinely
// exercised. It cannot prove behaviour of a live server (indexes, validators, TTL) -
// that is what `npm run nosql:demo` is for when MongoDB is running.
import { Query, Aggregator } from 'mingo';
import { updateOne as applyUpdate } from 'mingo/updater';
import { ObjectId } from 'mongodb';

export class FakeCollection {
  constructor({ unique = [] } = {}) {
    this.docs = [];
    this.unique = unique; // e.g. [['bookId', 'userId']] emulates a unique compound index
  }

  async insertOne(doc) {
    const d = { ...doc };
    d._id ??= new ObjectId();
    for (const keys of this.unique) {
      if (this.docs.some((x) => keys.every((k) => x[k] === d[k]))) {
        const err = new Error('E11000 duplicate key error');
        err.code = 11000;
        throw err;
      }
    }
    this.docs.push(d);
    return { acknowledged: true, insertedId: d._id };
  }

  find(filter = {}) {
    let cursor = new Query(filter).find(this.docs);
    const api = {
      sort(spec) { cursor = cursor.sort(spec); return api; },
      skip(n) { cursor = cursor.skip(n); return api; },
      limit(n) { cursor = cursor.limit(n); return api; },
      async toArray() { return cursor.all().map((d) => ({ ...d })); },
    };
    return api;
  }

  async findOne(filter = {}) {
    const hit = new Query(filter).find(this.docs).all()[0];
    return hit ? { ...hit } : null;
  }

  async countDocuments(filter = {}) {
    return new Query(filter).find(this.docs).all().length;
  }

  async updateOne(filter, update) {
    const matched = new Query(filter).find(this.docs).all();
    if (matched.length === 0) return { matchedCount: 0, modifiedCount: 0 };
    const target = matched[0];
    const { matchedCount, modifiedCount } = applyUpdate([target], { _id: target._id }, update);
    return { matchedCount, modifiedCount };
  }

  async findOneAndUpdate(filter, update, { returnDocument = 'before' } = {}) {
    const hit = new Query(filter).find(this.docs).all()[0];
    if (!hit) return null;
    const before = { ...hit };
    applyUpdate([hit], { _id: hit._id }, update);
    return returnDocument === 'after' ? { ...hit } : before;
  }

  async findOneAndDelete(filter) {
    const hit = new Query(filter).find(this.docs).all()[0];
    if (!hit) return null;
    this.docs.splice(this.docs.indexOf(hit), 1);
    return { ...hit };
  }

  aggregate(pipeline) {
    return { toArray: async () => new Aggregator(pipeline).run(this.docs) };
  }
}
