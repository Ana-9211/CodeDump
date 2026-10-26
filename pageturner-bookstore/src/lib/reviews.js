// Review + activity service backed by MongoDB (the NoSQL half of the project).
//
//   Create : insertOne            (unique index => one review per user per book)
//   Read   : find/sort/skip/limit + aggregate ($group => average and star histogram)
//   Update : findOneAndUpdate ($set) and updateOne ($addToSet/$pull/$inc for helpful votes)
//   Delete : findOneAndDelete     (author, or an admin moderating)
//
// The collections are INJECTED (createReviewService) so the exact same logic can run against
// the real MongoDB in production and against an in-memory engine in tests.
import { ObjectId } from 'mongodb';
import { HttpError } from './errors.js';
import { str, int } from './validate.js';
import { reviewsCollection, viewsCollection } from './mongo.js';
import { asApp } from './db.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export function parseReviewId(value) {
  if (typeof value !== 'string' || !ObjectId.isValid(value) || value.length !== 24) throw new HttpError(400, 'Invalid review id.');
  return new ObjectId(value);
}

const publicShape = (d, viewerId) => ({
  id: d._id.toString(),
  bookId: d.bookId,
  userId: d.userId,
  userName: d.userName,
  rating: d.rating,
  title: d.title ?? '',
  body: d.body,
  helpfulCount: d.helpfulCount ?? 0,
  votedHelpful: viewerId ? (d.helpfulBy ?? []).includes(viewerId) : false,
  mine: viewerId ? d.userId === viewerId : false,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt ?? null,
});

export function createReviewService({ reviews, views, setSummary }) {
  /** Average + star histogram computed inside the database with the aggregation pipeline. */
  async function summary(bookId) {
    const col = await reviews();
    const [totals] = await col
      .aggregate([{ $match: { bookId } }, { $group: { _id: null, count: { $sum: 1 }, avg: { $avg: '$rating' } } }])
      .toArray();
    const buckets = await col
      .aggregate([{ $match: { bookId } }, { $group: { _id: '$rating', n: { $sum: 1 } } }, { $sort: { _id: -1 } }])
      .toArray();
    const histogram = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const b of buckets) histogram[b._id] = b.n;
    return {
      count: totals?.count ?? 0,
      average: totals ? Math.round(totals.avg * 100) / 100 : 0,
      histogram,
    };
  }

  /** Keep the PostgreSQL summary columns (shown in the catalogue) in step with MongoDB. */
  async function syncSummary(bookId) {
    const s = await summary(bookId);
    await setSummary(bookId, s.average, s.count);
    return s;
  }

  function validate({ rating, title, body }, { partial = false } = {}) {
    const out = {};
    if (!partial || rating !== undefined) out.rating = int(rating, 'Rating', { min: 1, max: 5 });
    if (!partial || title !== undefined) out.title = str(title, 'Title', { max: 100, optional: true }) ?? '';
    if (!partial || body !== undefined) out.body = str(body, 'Review text', { max: 2000 });
    return out;
  }

  return {
    summary,
    syncSummary,

    async list(bookId, { page = 1, limit = 10, sort = 'newest', viewerId = null } = {}) {
      const col = await reviews();
      const order = sort === 'helpful' ? { helpfulCount: -1, createdAt: -1 } : { createdAt: -1 };
      const safeLimit = Math.min(Math.max(limit, 1), 50);
      const skip = (Math.max(page, 1) - 1) * safeLimit;
      const [docs, total] = await Promise.all([
        col.find({ bookId }).sort(order).skip(skip).limit(safeLimit).toArray(),
        col.countDocuments({ bookId }),
      ]);
      return { items: docs.map((d) => publicShape(d, viewerId)), total, page: Math.max(page, 1), limit: safeLimit };
    },

    async mine(bookId, userId) {
      const doc = await (await reviews()).findOne({ bookId, userId });
      return doc ? publicShape(doc, userId) : null;
    },

    /** CREATE */
    async create({ bookId, userId, userName }, input) {
      const fields = validate(input);
      const now = new Date();
      const doc = { bookId, userId, userName, ...fields, helpfulBy: [], helpfulCount: 0, createdAt: now };
      try {
        const { insertedId } = await (await reviews()).insertOne(doc);
        doc._id = insertedId;
      } catch (err) {
        if (err?.code === 11000) throw new HttpError(409, 'You have already reviewed this book. Edit your review instead.');
        throw err;
      }
      const s = await syncSummary(bookId);
      return { review: publicShape(doc, userId), summary: s };
    },

    /** UPDATE (author only) */
    async update(reviewId, userId, input) {
      const fields = validate(input, { partial: true });
      if (Object.keys(fields).length === 0) throw new HttpError(400, 'Nothing to update.');
      const updated = await (await reviews()).findOneAndUpdate(
        { _id: reviewId, userId },
        { $set: { ...fields, updatedAt: new Date() } },
        { returnDocument: 'after' },
      );
      if (!updated) throw new HttpError(404, 'Review not found, or it is not yours to edit.');
      const s = await syncSummary(updated.bookId);
      return { review: publicShape(updated, userId), summary: s };
    },

    /** DELETE (author, or an admin moderating) */
    async remove(reviewId, actor) {
      const filter = actor.role === 'admin' ? { _id: reviewId } : { _id: reviewId, userId: actor.userId };
      const deleted = await (await reviews()).findOneAndDelete(filter);
      if (!deleted) throw new HttpError(404, 'Review not found, or it is not yours to delete.');
      const s = await syncSummary(deleted.bookId);
      return { deleted: true, summary: s };
    },

    /** UPDATE with array operators: toggle a "helpful" vote */
    async toggleHelpful(reviewId, userId) {
      const col = await reviews();
      const doc = await col.findOne({ _id: reviewId });
      if (!doc) throw new HttpError(404, 'Review not found.');
      if (doc.userId === userId) throw new HttpError(403, 'You cannot vote on your own review.');
      const added = await col.updateOne(
        { _id: reviewId, helpfulBy: { $ne: userId } },
        { $addToSet: { helpfulBy: userId }, $inc: { helpfulCount: 1 } },
      );
      if (added.modifiedCount === 0) {
        await col.updateOne({ _id: reviewId, helpfulBy: userId }, { $pull: { helpfulBy: userId }, $inc: { helpfulCount: -1 } });
      }
      const fresh = await col.findOne({ _id: reviewId });
      return publicShape(fresh, userId);
    },

    /** Click-stream event (CREATE only; old events expire via a TTL index) */
    async recordView(bookId, userId = null) {
      await (await views()).insertOne({ bookId, userId, at: new Date() });
    },

    /** Most-viewed books in the last N days - aggregation pipeline */
    async trending({ days = 7, limit = 6 } = {}) {
      const since = new Date(Date.now() - days * DAY_MS);
      return (await views())
        .aggregate([
          { $match: { at: { $gte: since } } },
          { $group: { _id: '$bookId', views: { $sum: 1 } } },
          { $sort: { views: -1, _id: 1 } },
          { $limit: limit },
        ])
        .toArray()
        .then((rows) => rows.map((r) => ({ bookId: r._id, views: r.views })));
    },
  };
}

// Production wiring: real MongoDB + real PostgreSQL bridge procedure.
export const reviewService = createReviewService({
  reviews: reviewsCollection,
  views: viewsCollection,
  setSummary: (bookId, avg, count) => asApp('CALL sp_set_rating_summary($1::bigint, $2::numeric, $3::int)', [bookId, avg, count]),
});
