import { api, readJson } from '@/lib/http.js';
import { objectBody } from '@/lib/validate.js';
import { parseReviewId, reviewService } from '@/lib/reviews.js';

// UPDATE: only the author edits a review
export const PATCH = api(async ({ request, session, params }) => {
  const body = objectBody(await readJson(request));
  return reviewService.update(parseReviewId(params.reviewId), session.userId, body);
}, { roles: ['customer'] });

// DELETE: the author, or an administrator moderating
export const DELETE = api(async ({ session, params }) => {
  return reviewService.remove(parseReviewId(params.reviewId), session);
}, { roles: ['customer', 'admin'] });
