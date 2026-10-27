// Route-handler wrapper: session lookup, role gate, CSRF guard, JSON errors.
import { getSession } from './auth.js';
import { HttpError, toHttpError } from './errors.js';
import { flushOutbox } from './mailer.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function guardAgainstCsrf(request) {
  // 1. cross-site form posts cannot set a JSON content-type without a CORS preflight
  // 2. if the browser sent an Origin header it must be this site
  const origin = request.headers.get('origin');
  if (origin) {
    let host;
    try { host = new URL(origin).host; } catch { throw new HttpError(403, 'Bad origin.'); }
    if (host !== request.headers.get('host')) throw new HttpError(403, 'Cross-site request blocked.');
  }
  const hasBody = request.headers.get('content-length') && request.headers.get('content-length') !== '0';
  if (hasBody && !(request.headers.get('content-type') || '').includes('application/json')) {
    throw new HttpError(415, 'Send JSON (Content-Type: application/json).');
  }
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}

/**
 * api(handler, { roles })
 *   handler({ request, session, params, query }) -> plain object (sent as JSON) or a Response
 *   roles: if given, the caller must be signed in with one of these roles
 */
export function api(handler, { roles } = {}) {
  return async (request, context) => {
    try {
      if (MUTATING.has(request.method)) guardAgainstCsrf(request);
      const session = await getSession();
      if (roles) {
        if (!session) throw new HttpError(401, 'Please sign in to continue.');
        if (!roles.includes(session.role)) throw new HttpError(403, 'Your account type cannot do that.');
      }
      const params = context?.params ? await context.params : {};
      const query = Object.fromEntries(new URL(request.url).searchParams);
      const result = await handler({ request, session, params, query });
      if (MUTATING.has(request.method)) flushOutbox();   // FR-14: queued e-mails leave right away (not awaited)
      if (result instanceof Response) return result;
      return Response.json(result ?? { ok: true });
    } catch (err) {
      const e = toHttpError(err);
      if (e.status >= 500) console.error('[api error]', err);
      return Response.json({ error: e.message }, { status: e.status });
    }
  };
}
