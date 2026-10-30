import { asApp } from '@/lib/db.js';
import { mongoStatus } from '@/lib/mongo.js';

// VFR-09: a cheap probe for uptime monitors. 200 = the shop works, 503 = PostgreSQL is unreachable.
// MongoDB is optional (reviews degrade gracefully), so it is reported but never makes the probe fail.
export const dynamic = 'force-dynamic';
export async function GET() {
  const started = Date.now();
  let postgres = 'up';
  try { await asApp('SELECT 1'); } catch { postgres = 'down'; }
  const mongo = await mongoStatus();
  return Response.json(
    { status: postgres === 'up' ? 'ok' : 'down', postgres, mongo, uptimeSeconds: Math.round(process.uptime()), responseMs: Date.now() - started },
    { status: postgres === 'up' ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
