import { api } from '@/lib/http.js';
import { sendVerification } from '@/lib/verify.js';

export const POST = api(async ({ session }) => {
  const devLink = await sendVerification(session.userId);
  return { message: 'If your address is not verified yet, a new link has been sent.', ...(devLink ? { devLink } : {}) };
}, { roles: ['customer', 'seller', 'admin'] });
