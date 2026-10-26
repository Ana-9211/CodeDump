import { api, readJson } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';
import { objectBody, str } from '@/lib/validate.js';

export const GET = api(async ({ session }) => {
  const rows = await withRole(session, async (c) =>
    (await c.query(
      `SELECT address_id, label, full_name, line1, line2, city, state, postal_code, country, phone, is_default
         FROM addresses ORDER BY is_default DESC, address_id`)).rows);
  return { items: rows };
}, { roles: ['customer'] });

export const POST = api(async ({ request, session }) => {
  const b = objectBody(await readJson(request));
  const a = {
    label: str(b.label, 'Label', { max: 30, optional: true }) ?? 'Home',
    fullName: str(b.fullName, 'Full name', { max: 100 }),
    line1: str(b.line1, 'Address line 1', { max: 150 }),
    line2: str(b.line2, 'Address line 2', { max: 150, optional: true }) ?? null,
    city: str(b.city, 'City', { max: 80 }),
    state: str(b.state, 'State', { max: 80 }),
    postalCode: str(b.postalCode, 'Postal code', { min: 3, max: 12 }),
    country: str(b.country, 'Country', { max: 60, optional: true }) ?? 'India',
    phone: str(b.phone, 'Phone', { min: 7, max: 15 }),
  };
  const created = await withRole(session, async (c) => {
    // first address becomes the default; otherwise only when asked
    const { rows: [{ n }] } = await c.query('SELECT count(*)::int AS n FROM addresses');
    const makeDefault = n === 0 || b.isDefault === true;
    if (makeDefault) await c.query('UPDATE addresses SET is_default = false WHERE is_default');
    return (await c.query(
      `INSERT INTO addresses (user_id, label, full_name, line1, line2, city, state, postal_code, country, phone, is_default)
       VALUES (app_user_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING address_id`,
      [a.label, a.fullName, a.line1, a.line2, a.city, a.state, a.postalCode, a.country, a.phone, makeDefault])).rows[0];
  });
  return { addressId: created.address_id };
}, { roles: ['customer'] });
