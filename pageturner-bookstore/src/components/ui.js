'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from './Providers.js';
import { money } from '@/lib/client.js';

/** A real cover_url is shown as an image (lazy-loaded). Without one the book gets a plain text tile that says so:
 *  it is a stand-in, never drawn artwork, and the cover is listed for review (see docs/assets.md). */
export function BookCover({ title, authors, src, size, priority = false }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    return (
      <img className={`cover cover-img ${size ?? ''}`} src={src} alt={`Cover of ${title}`} width="200" height="300"
        loading={priority ? 'eager' : 'lazy'} decoding="async" onError={() => setBroken(true)} />
    );
  }
  return (
    <div className={`cover pending ${size ?? ''}`} role="img" aria-label={`${title} by ${authors || 'unknown author'}. Cover image not added yet.`}>
      <div className="c-title">{title}</div>
      <div className="c-author">{authors}</div>
      <div className="c-note">cover pending</div>
    </div>
  );
}

export function Stars({ value = 0, size = '1rem' }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span className="stars" style={{ fontSize: size }} role="img" aria-label={`${Number(value).toFixed(1)} out of 5 stars`}>
      ★★★★★<span className="fill" style={{ width: `${pct}%` }}>★★★★★</span>
    </span>
  );
}

export function StarPicker({ value, onChange }) {
  return (
    <div className="star-input" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" className={n <= value ? 'on' : ''} onClick={() => onChange(n)} role="radio" aria-checked={n === value} aria-label={`${n} star${n > 1 ? 's' : ''}`}>★</button>
      ))}
    </div>
  );
}

const STATUS_COLORS = {
  approved: 'green', Delivered: 'green', active: 'green', paid: 'green', Paid: 'green',
  pending: 'amber', Placed: 'amber', Packed: 'blue', Shipped: 'blue', InProgress: 'blue', Pending: 'amber',
  rejected: 'red', Cancelled: 'red', suspended: 'red', removed: 'grey', refunded: 'grey', Failed: 'red',
};
export const Status = ({ value }) => <span className={`badge ${STATUS_COLORS[value] ?? 'grey'}`}>{value}</span>;

export const Loading = ({ label = 'Loading' }) => <div className="center" role="status"><span className="spinner" /><span className="sr-only">{label}</span></div>;
export const ErrorBox = ({ error }) => (error ? <div className="alert error" role="alert">{error.message ?? String(error)}</div> : null);
export const Empty = ({ icon = '📭', title, children }) => (
  <div className="empty"><div className="big">{icon}</div><h3>{title}</h3>{children}</div>
);

export function Pagination({ page, pages, onPage }) {
  if (pages <= 1) return null;
  return (
    <div className="row" style={{ justifyContent: 'center', marginTop: 24 }}>
      <button className="btn secondary sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>← Previous</button>
      <span className="muted small">Page {page} of {pages}</span>
      <button className="btn secondary sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next →</button>
    </div>
  );
}

export function BookCard({ book, onAdd }) {
  const { user } = useApp();
  return (
    <article className="book-card">
      <Link href={`/books/${book.book_id}`} className="cover-link" aria-label={`${book.title} by ${book.authors}`}>
        <BookCover title={book.title} authors={book.authors} id={book.book_id} src={book.cover_url} />
      </Link>
      <div className="body">
        <Link href={`/books/${book.book_id}`} className="title" style={{ textDecoration: 'none', color: 'inherit' }}>{book.title}</Link>
        <div className="author">{book.authors}</div>
        <div className="row" style={{ gap: 6 }}>
          <Stars value={book.avg_rating} size=".85rem" />
          <span className="muted small">({book.review_count})</span>
        </div>
        <div className="foot">
          <span className="price">{money(book.price_cents)}</span>
          {book.stock === 0 ? <span className="badge red">Sold out</span>
            : user?.role === 'customer' && onAdd ? <button className="btn sm" onClick={() => onAdd(book)}>Add</button>
            : book.stock !== undefined && book.stock <= 5 ? <span className="badge amber">Only {book.stock} left</span> : null}
        </div>
      </div>
    </article>
  );
}

/** Redirects away unless the signed-in user has one of `roles`. Returns true when the page may render. */
export function useGuard(roles) {
  const { user, ready } = useApp();
  const router = useRouter();
  const allowed = ready && user && roles.includes(user.role);
  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    else if (!roles.includes(user.role)) router.replace('/');
  }, [ready, user, router]); // eslint-disable-line react-hooks/exhaustive-deps
  return allowed;
}

/** Two date inputs + quick presets; calls onChange({from,to}) with ISO dates (FR-23 / FR-28 reports). */
export function DateRange({ value, onChange, presets = [7, 14, 30, 90] }) {
  const iso = (d) => d.toISOString().slice(0, 10);
  const preset = (days) => { const to = new Date(); onChange({ from: iso(new Date(to.getTime() - (days - 1) * 86400000)), to: iso(to) }); };
  return (
    <div className="date-range" role="group" aria-label="Report period">
      <label>From <input type="date" value={value.from} max={value.to || undefined} onChange={(e) => onChange({ ...value, from: e.target.value })} /></label>
      <label>To <input type="date" value={value.to} min={value.from || undefined} onChange={(e) => onChange({ ...value, to: e.target.value })} /></label>
      {presets.map((d) => <button key={d} type="button" className="chip" onClick={() => preset(d)}>Last {d} days</button>)}
    </div>
  );
}
