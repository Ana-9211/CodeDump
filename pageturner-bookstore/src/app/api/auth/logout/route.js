import { api } from '@/lib/http.js';
import { endSession } from '@/lib/auth.js';

export const POST = api(async () => {
  await endSession();
  return { ok: true };
});
