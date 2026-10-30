// Payment gateway adapter (FR-13). A real provider (Razorpay, Stripe, ...) would be called from charge()
// and refund(); this project ships a TEST gateway with the same shape so the rest of the code does not change.
//
// Rules the app follows (SRS security requirements):
//   * the full card number, expiry and CVV are validated here and then dropped - they are never stored or logged
//   * the database only receives the gateway's reference and a masked label ("Card ending 4242")
//   * the order is created only after a successful charge; if order creation fails afterwards the charge is refunded
//
// Test cards:  4242 4242 4242 4242 -> approved      4000 0000 0000 0002 -> declined      4000 0000 0000 9995 -> insufficient funds
// Test UPI:    any  name@bank -> approved           fail@upi -> declined
import crypto from 'node:crypto';
import { HttpError } from './errors.js';

const refs = new Map();   // reference -> { amount, refunded }  (the gateway's own books; lost on restart, like any sandbox)

const luhn = (digits) => {
  let sum = 0, dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d; dbl = !dbl;
  }
  return sum % 10 === 0;
};
const bad = (m) => new HttpError(400, m);
const declined = (m) => new HttpError(402, `Payment declined: ${m}`);

function checkCard(card) {
  if (!card || typeof card !== 'object') throw bad('Enter your card details.');
  const number = String(card.number ?? '').replace(/[\s-]/g, '');
  if (!/^\d{13,19}$/.test(number) || !luhn(number)) throw bad('That card number is not valid.');
  const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(String(card.expiry ?? '').trim());
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) throw bad('Enter the expiry date as MM/YY.');
  const now = new Date();
  const expired = 2000 + Number(m[2]) < now.getFullYear() || (2000 + Number(m[2]) === now.getFullYear() && Number(m[1]) < now.getMonth() + 1);
  if (expired) throw bad('That card has expired.');
  if (!/^\d{3,4}$/.test(String(card.cvv ?? ''))) throw bad('Enter the 3 or 4 digit security code.');
  return number;
}

export async function charge({ method, amountCents, card, upi }) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw bad('Nothing to pay.');
  let detail;
  if (method === 'card') {
    const number = checkCard(card);
    if (number === '4000000000000002') throw declined('the card was refused by the bank.');
    if (number === '4000000000009995') throw declined('insufficient funds.');
    detail = `Card ending ${number.slice(-4)}`;
  } else if (method === 'upi') {
    const id = String(upi ?? '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{2,40}@[a-z]{2,20}$/.test(id)) throw bad('Enter a valid UPI ID such as name@bank.');
    if (id === 'fail@upi') throw declined('the UPI request was rejected.');
    detail = `UPI ${id[0]}***@${id.split('@')[1]}`;
  } else {
    throw bad('This payment method does not use the gateway.');
  }
  const ref = `GW${crypto.randomBytes(7).toString('hex').toUpperCase()}`;
  refs.set(ref, { amountCents, refunded: false });
  return { ref, detail };
}

export async function refund(ref) {
  const t = refs.get(ref);
  if (t && !t.refunded) t.refunded = true;       // unknown refs (e.g. after a restart) are treated as already settled
  return { ref, refunded: true };
}
export const wasRefunded = (ref) => refs.get(ref)?.refunded === true;
