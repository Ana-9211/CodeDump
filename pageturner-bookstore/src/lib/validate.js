// Small input validators. The database re-checks everything with constraints;
// these exist to return clear messages quickly and to reject junk before it reaches SQL.
import { HttpError } from './errors.js';

const bad = (msg) => new HttpError(400, msg);

export function str(value, name, { min = 1, max = 255, optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return undefined;
    throw bad(`${name} is required.`);
  }
  if (typeof value !== 'string') throw bad(`${name} must be text.`);
  const v = value.trim();
  if (v.length < min) throw bad(`${name} must be at least ${min} character${min === 1 ? '' : 's'}.`);
  if (v.length > max) throw bad(`${name} must be at most ${max} characters.`);
  return v;
}

export function int(value, name, { min = -Infinity, max = Infinity, optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return undefined;
    throw bad(`${name} is required.`);
  }
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isInteger(n)) throw bad(`${name} must be a whole number.`);
  if (n < min) throw bad(`${name} must be at least ${min}.`);
  if (n > max) throw bad(`${name} must be at most ${max}.`);
  return n;
}

export const id = (value, name = 'id') => int(value, name, { min: 1, max: 2147483647 * 1000 });

export function oneOf(value, name, allowed, { optional = false } = {}) {
  if ((value === undefined || value === null || value === '') && optional) return undefined;
  if (!allowed.includes(value)) throw bad(`${name} must be one of: ${allowed.join(', ')}.`);
  return value;
}

export function email(value) {
  const v = str(value, 'E-mail', { max: 254 }).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) throw bad('Enter a valid e-mail address.');
  return v;
}

export function password(value) {
  if (typeof value !== 'string') throw bad('Password is required.');
  if (value.length < 8) throw bad('Password must be at least 8 characters.');
  if (value.length > 72) throw bad('Password must be at most 72 characters.');
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) throw bad('Password must contain at least one letter and one digit.');
  return value;
}

export function objectBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw bad('A JSON object body is required.');
  return body;
}

/** Whole rupees/decimal string -> integer paise. Accepts 349, "349", "349.50". */
export function rupeesToPaise(value, name = 'Price') {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) throw bad(`${name} must be greater than zero.`);
  const paise = Math.round(n * 100);
  if (paise > 100000000) throw bad(`${name} is too large.`);
  return paise;
}
