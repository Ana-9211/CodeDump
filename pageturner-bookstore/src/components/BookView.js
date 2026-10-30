'use client';
// One book, shown as an open book: cover, synopsis, author and reviews on the left page; price, format, stock,
// quantity and add-to-cart on the right. The same component is used for the pop-up opened from the shelf (`modal`)
// and for the direct address /books/<id>. All data and actions use the existing book, review, cart and wishlist APIs.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFetch, post, patch, del, dateOnly, money } from '@/lib/client.js';
import { useApp } from '@/components/Providers.js';
import { BookCover, Empty, ErrorBox, Loading, Status, StarPicker, Stars } from '@/components/ui.js';

function ReviewForm({ bookId, mine, onDone }) {
  const { toast } = useApp();
  const [rating, setRating] = useState(mine?.rating ?? 0);
  const [title, setTitle] = useState(mine?.title ?? '');
  const [body, setBody] = useState(mine?.body ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      if (mine) await patch(`/api/reviews/${mine.id}`, { rating, title, body });
      else await post(`/api/books/${bookId}/reviews`, { rating, title, body });
      toast(mine ? 'Review updated' : 'Thanks for your review!');
      onDone();
    } catch (e2) { setErr(e2); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="card tight review-form">
      <h3>{mine ? 'Edit your review' : 'Write a review'}</h3>
      <ErrorBox error={err} />
      <div className="field"><label>Your rating</label><StarPicker value={rating} onChange={setRating} /></div>
      <div className="field"><label htmlFor="rt">Headline (optional)</label><input id="rt" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} /></div>
      <div className="field"><label htmlFor="rb">Your thoughts</label><textarea id="rb" required value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} /></div>
      <button className="btn" disabled={busy || !rating || !body.trim()}>{busy ? 'Saving…' : mine ? 'Save changes' : 'Post review'}</button>
    </form>
  );
}

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function BookView({ id, modal = false }) {
  const router = useRouter();
  const { user, toast, setCartCount } = useApp();
  const [qty, setQty] = useState(1);
  const [sort, setSort] = useState('newest');
  const [editing, setEditing] = useState(false);
  const [flip, setFlip] = useState(false);
  useEffect(() => { setFlip(!reduced()); }, []);
  const book = useFetch(`/api/books/${id}`);
  const rev = useFetch(`/api/books/${id}/reviews?sort=${sort}`);
  const b = book.data?.book;
  const wish = useFetch(user?.role === 'customer' ? '/api/wishlist' : null);
  const saved = wish.data?.items.some((w) => String(w.book_id) === String(id));
  const dialog = useRef(null);

  const close = useCallback(() => router.back(), [router]);

  // pop-up behaviour: Escape closes, focus moves in and returns to the book that was tapped, the page behind stays put
  useEffect(() => {
    if (!modal) return undefined;
    const back = document.activeElement;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab' || !dialog.current) return;
      const f = [...dialog.current.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      if (back && document.contains(back)) back.focus?.();
    };
  }, [modal, close]);

  // the opening animation is decoration only: it can never stay in the way
  useEffect(() => {
    if (!flip) return undefined;
    const t = setTimeout(() => setFlip(false), 1400);
    return () => clearTimeout(t);
  }, [flip]);

  async function toggleWish() {
    try {
      if (saved) await del(`/api/wishlist/${id}`); else await post('/api/wishlist', { bookId: Number(id) });
      toast(saved ? 'Removed from wishlist' : 'Saved to wishlist'); wish.reload();
    } catch (e) { toast(e.message, 'err'); }
  }
  async function add() {
    try {
      const r = await post('/api/cart', { bookId: Number(id), quantity: qty });
      setCartCount(r.totals.item_count);
      toast('Added to your cart');
    } catch (e) { toast(e.message, 'err'); }
  }
  async function helpful(r) {
    try { await post(`/api/reviews/${r.id}/helpful`); rev.reload(); } catch (e) { toast(e.message, 'err'); }
  }
  async function remove(r) {
    if (!confirm('Delete this review?')) return;
    try { await del(`/api/reviews/${r.id}`); toast('Review deleted'); rev.reload(); book.reload(); } catch (e) { toast(e.message, 'err'); }
  }

  const r = rev.data;
  const maxBar = r ? Math.max(1, ...Object.values(r.summary.histogram)) : 1;

  const sheet = (
    <div className={`bk-book ${flip ? 'opening' : ''}`}>
      {flip && b && (
        <div className="bk-lid" aria-hidden="true" onAnimationEnd={() => setFlip(false)}>
          <BookCover title={b.title} authors={b.authors} id={b.book_id} src={b.cover_url} priority />
        </div>
      )}
      {book.loading && <Loading label="Opening the book" />}
      {book.error && <div className="bk-pad"><ErrorBox error={book.error} /><Link href="/">Back to the shelves</Link></div>}
      {b && (
        <div className="bk-spread">
          <header className="bk-head">
            <div className="bk-cover"><BookCover title={b.title} authors={b.authors} id={b.book_id} src={b.cover_url} size="large" priority /></div>
            <div className="bk-titles">
              <p className="small crumbs"><Link href={`/?category=${b.category_id}`}>{b.category_name}</Link></p>
              <h1 id="bk-title">{b.title}</h1>
              <p className="by">by {b.authors}</p>
              <div className="row" style={{ gap: 8 }}><Stars value={b.avg_rating} size="1.1rem" /><span>{Number(b.avg_rating).toFixed(1)}</span><span className="muted small">({b.review_count} reviews)</span></div>
            </div>
          </header>

          <section className="bk-buy" aria-label="Buy this book">
            {b.status !== 'approved' && <div className="alert warn">This listing is <Status value={b.status} /> and not visible to shoppers.</div>}
            <div className="price big">{money(b.price_cents)}</div>
            <dl className="buy-facts">
              <dt>Format</dt><dd>Print book, shipped to your address</dd>
              <dt>Stock</dt>
              <dd>{b.stock === 0 ? <span className="badge red">Out of stock</span>
                : <span className={`badge ${b.stock <= 5 ? 'amber' : 'green'}`}>{b.stock <= 5 ? `Only ${b.stock} left` : `In stock (${b.stock})`}</span>}</dd>
              <dt>Product ID</dt><dd>{b.book_id}</dd>
              <dt>ISBN</dt><dd>{b.isbn}</dd>
              <dt>Sold by</dt><dd>{b.store_name ?? '-'}</dd>
            </dl>
            {user?.role === 'customer' && b.stock > 0 && b.status === 'approved' && (
              <div className="buy-controls">
                <label htmlFor="qty">Quantity</label>
                <select id="qty" value={qty} onChange={(e) => setQty(Number(e.target.value))}>
                  {Array.from({ length: Math.min(10, b.stock) }, (_, i) => <option key={i + 1}>{i + 1}</option>)}
                </select>
                <button className="btn amber block" onClick={add}>Add to cart</button>
                <button className="btn secondary block" onClick={toggleWish} aria-pressed={Boolean(saved)}>{saved ? 'Saved to wishlist' : 'Save to wishlist'}</button>
                <Link className="btn secondary block" href="/cart">Go to cart</Link>
              </div>
            )}
            {!user && <p><Link href={`/login?next=/books/${id}`} className="btn amber block">Sign in to buy</Link></p>}
            {user && user.role !== 'customer' && <p className="muted small">Signed in as {user.role}. Only customers can buy.</p>}
            <p className="hint">Free shipping on orders above ₹499.</p>
          </section>

          <section className="bk-story" aria-label="About this book">
            <h2>The story</h2>
            <p>{b.description}</p>
            <h3>About the author{b.authors.includes(', ') ? 's' : ''}</h3>
            <p>{b.authors}. Language: {b.language}.</p>
          </section>

          <section className="bk-reviews" aria-labelledby="rv">
            <div className="row between"><h2 id="rv">Reader reviews</h2>
              <select aria-label="Sort reviews" value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: 'auto' }}>
                <option value="newest">Newest</option><option value="helpful">Most helpful</option>
              </select>
            </div>
            {rev.loading && !r && <Loading />}
            {rev.error && <div className="alert warn">Reviews are temporarily unavailable (the review database could not be reached). Everything else still works.</div>}
            {r && (
              <>
                <div className="rating-sum">
                  <div><div className="price big">{r.summary.average.toFixed(1)}</div><Stars value={r.summary.average} /><div className="muted small">{r.summary.count} review{r.summary.count === 1 ? '' : 's'}</div></div>
                  <div className="bars">{[5, 4, 3, 2, 1].map((n) => (
                    <div className="bar-row" key={n}><span>{n} ★</span><div className="bar"><i style={{ width: `${(r.summary.histogram[n] / maxBar) * 100}%` }} /></div><span className="right">{r.summary.histogram[n]}</span></div>
                  ))}</div>
                </div>
                {r.canReview && !editing && <ReviewForm bookId={id} onDone={() => { rev.reload(); book.reload(); }} />}
                {user?.role === 'customer' && !r.canReview && !r.mine && <p className="muted small">Only customers who bought this book can review it.</p>}
                {r.items.length === 0 && <Empty icon="" title="No reviews yet" />}
                {r.items.map((x) => (
                  editing && x.mine ? <ReviewForm key={x.id} bookId={id} mine={x} onDone={() => { setEditing(false); rev.reload(); book.reload(); }} /> : (
                    <article key={x.id} className={`review ${x.mine ? 'mine' : ''}`}>
                      <div className="row" style={{ gap: 10 }}><Stars value={x.rating} /><strong>{x.title}</strong></div>
                      <div className="meta">{x.userName} · {dateOnly(x.createdAt)}{x.updatedAt ? ' (edited)' : ''} · <span className="badge green">Verified purchase</span></div>
                      <p style={{ margin: '8px 0' }}>{x.body}</p>
                      <div className="actions">
                        {user && !x.mine && <button className="btn secondary sm" onClick={() => helpful(x)}>{x.votedHelpful ? '✓ ' : ''}Helpful ({x.helpfulCount})</button>}
                        {!user && <span className="muted small">{x.helpfulCount} found this helpful</span>}
                        {x.mine && <button className="btn secondary sm" onClick={() => setEditing(true)}>Edit</button>}
                        {(x.mine || user?.role === 'admin') && <button className="btn danger secondary sm" onClick={() => remove(x)}>Delete</button>}
                      </div>
                    </article>
                  )
                ))}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );

  if (!modal) return <div className="bk-page"><p className="small back"><Link href="/">← Back to the shelves</Link></p>{sheet}</div>;
  return (
    <div className="bk-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="bk-dialog" role="dialog" aria-modal="true" aria-labelledby="bk-title" aria-label={b ? undefined : 'Book details'} tabIndex={-1} ref={dialog}>
        <button className="bk-close" onClick={close} aria-label="Close book">Close</button>
        {sheet}
      </div>
    </div>
  );
}
