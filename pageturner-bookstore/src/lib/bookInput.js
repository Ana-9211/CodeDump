// Shared parsing of the "create / edit book" form for the seller routes.
import { HttpError } from './errors.js';
import { int, objectBody, rupeesToPaise, str } from './validate.js';

function parseCoverUrl(value) {
  const v = str(value, 'Cover image URL', { max: 300, optional: true });
  if (!v) return null;
  let u;
  try { u = new URL(v); } catch { throw new HttpError(400, 'Cover image must be a full web address (https://...).'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new HttpError(400, 'Cover image must start with http:// or https://.');
  return v;
}

export function parseBookInput(raw) {
  const b = objectBody(raw);
  let authors = b.authors;
  if (typeof authors === 'string') authors = authors.split(',');
  if (!Array.isArray(authors)) throw new HttpError(400, 'Authors are required.');
  authors = authors.map((a) => String(a).trim()).filter(Boolean);
  if (authors.length === 0) throw new HttpError(400, 'Add at least one author.');
  if (authors.length > 6) throw new HttpError(400, 'A book can have at most 6 authors.');
  if (authors.some((a) => a.length > 150)) throw new HttpError(400, 'Author names must be at most 150 characters.');
  if (new Set(authors.map((a) => a.toLowerCase())).size !== authors.length) throw new HttpError(400, 'Duplicate author in the list.');

  return {
    title: str(b.title, 'Title', { max: 200 }),
    isbn: str(b.isbn, 'ISBN', { min: 10, max: 17 }),
    categoryId: int(b.categoryId, 'Category', { min: 1 }),
    pricePaise: rupeesToPaise(b.price, 'Price'),
    stock: int(b.stock, 'Stock', { min: 0, max: 100000 }),
    description: str(b.description, 'Description', { max: 5000, optional: true }) ?? '',
    language: str(b.language, 'Language', { max: 30, optional: true }) ?? 'English',
    coverUrl: parseCoverUrl(b.coverUrl),
    lowStock: b.lowStock === undefined || b.lowStock === '' ? null : int(b.lowStock, 'Low-stock alert level', { min: 0, max: 100000 }),
    authors,
  };
}

export const UPSERT_SQL = 'SELECT fn_upsert_book($1::bigint, $2, $3, $4::int, $5::int, $6::int, $7, $8, $9::text[], $10, $11::int) AS id';
export const upsertParams = (id, p) => [id, p.title, p.isbn, p.categoryId, p.pricePaise, p.stock, p.description, p.language, p.authors, p.coverUrl, p.lowStock];

/** YYYY-MM-DD range for reports; defaults to the last N days. */
export function dateRange(query, defaultDays = 14) {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const today = new Date();
  const to = query.to ?? today.toISOString().slice(0, 10);
  const from = query.from ?? new Date(today.getTime() - (defaultDays - 1) * 86400000).toISOString().slice(0, 10);
  if (!iso.test(from) || !iso.test(to)) throw new HttpError(400, 'Dates must look like 2026-10-31.');
  const span = (new Date(to) - new Date(from)) / 86400000;
  if (!(span >= 0)) throw new HttpError(400, 'The start date must not be after the end date.');
  if (span > 365) throw new HttpError(400, 'Choose a range of at most one year.');
  return { from, to };
}
