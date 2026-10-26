import { api } from '@/lib/http.js';
import { parseReviewId, reviewService } from '@/lib/reviews.js';

// Toggle a "helpful" vote on someone else's review
export const POST = api(async ({ session, params }) => {
  return { review: await reviewService.toggleHelpful(parseReviewId(params.reviewId), session.userId) };
}, { roles: ['customer', 'seller', 'admin'] });
