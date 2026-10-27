'use client';
import { use, useState } from 'react';
import Link from 'next/link';
import { useFetch, post, put, del, dateOnly, money } from '@/lib/client.js';
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
      if (mine) await call2('PATCH', `/api/reviews/${mine.id}`, { rating, title, body });
      else await post(`/api/books/${bookId}/reviews`, { rating, title, body });
      toast(mine ? 'Review updated' : 'Thanks for your review!');
      onDone();
    } catch (e2) { setErr(e2); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="card tight" style={{ background: 'var(--amber-tint)' }}>
      <h3>{mine ? 'Edit your review' : 'Write a review'}</h3>
      <ErrorBox error={err} />
      <div className="field"><label>Your rating</label><StarPicker value={rating} onChange={setRating} /></div>
      <div className="field"><label htmlFor="rt">Headline (optional)</label><input id="rt" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} /></div>
      <div className="field"><label htmlFor="rb">Your thoughts</label><textarea id="rb" required value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} /></div>
      <button className="btn" disabled={busy || !rating || !body.trim()}>{busy ? 'Saving…' : mine ? 'Save changes' : 'Post review'}</button>
    </form>
  );
}
import { patch as call2m } from '@/lib/client.js';
const call2 = (m, u, b) => (m === 'PATCH' ? call2m(u, b) : put(u, b));

export default function BookPage({ params }) {
  const { id } = use(params);
  const { user, toast, setCartCount } = useApp();
  const [qty, setQty] = useState(1);
  const [sort, setSort] = useState('newest');
  const [editing, setEditing] = useState(false);
  const book = useFetch(`/api/books/${id}`);
  const rev = useFetch(`/api/books/${id}/reviews?sort=${sort}`);
  const b = book.data?.book;
  const wish = useFetch(user?.role === 'customer' ? '/api/wishlist' : null);
  const saved = wish.data?.items.some((w) => String(w.book_id) === String(id));
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

  if (book.loading) return <Loading />;
  if (book.error) return <><ErrorBox error={book.error} /><Link href="/books">← Back to books</Link></>;
  const r = rev.data;
  const maxBar = r ? Math.max(1, ...Object.values(r.summary.histogram)) : 1;

  return (
    <>
      <p className="small"><Link href="/books">← All books</Link> / <Link href={`/books?category=${b.category_id}`}>{b.category_name}</Link></p>
      <div className="grid-2" style={{ gridTemplateColumns: 'minmax(220px,300px) 1fr', alignItems: 'start' }}>
        <BookCover title={b.title} authors={b.authors} id={b.book_id} src={b.cover_url} size="large" />
        <div className="stack">
          <div>
            <h1>{b.title}</h1>
            <p className="muted" style={{ fontSize: '1.1rem' }}>by {b.authors}</p>
            <div className="row" style={{ gap: 8 }}><Stars value={b.avg_rating} size="1.2rem" /><span>{Number(b.avg_rating).toFixed(1)}</span><span className="muted small">({b.review_count} reviews)</span></div>
          </div>
          {b.status !== 'approved' && <div className="alert warn">This listing is <Status value={b.status} /> and not visible to shoppers.</div>}
          <div className="price" style={{ fontSize: '1.8rem' }}>{money(b.price_cents)}</div>
          {b.stock === 0 ? <span className="badge red">Out of stock</span>
            : <span className={`badge ${b.stock <= 5 ? 'amber' : 'green'}`}>{b.stock <= 5 ? `Only ${b.stock} left` : 'In stock'}</span>}
          {user?.role === 'customer' && b.stock > 0 && b.status === 'approved' && (
            <div className="row">
              <label htmlFor="qty" className="sr-only">Quantity</label>
              <select id="qty" style={{ width: 80 }} value={qty} onChange={(e) => setQty(Number(e.target.value))}>
                {Array.from({ length: Math.min(10, b.stock) }, (_, i) => <option key={i + 1}>{i + 1}</option>)}
              </select>
              <button className="btn amber" onClick={add}>Add to cart</button>
              <button className="btn secondary" onClick={toggleWish} aria-pressed={Boolean(saved)}>{saved ? '♥ Saved' : '♡ Wishlist'}</button>
            </div>
          )}
          {!user && <p><Link href={`/login?next=/books/${id}`} className="btn secondary">Sign in to buy</Link></p>}
          {user && user.role !== 'customer' && <p className="muted small">Signed in as {user.role}. Only customers can buy.</p>}
          <p>{b.description}</p>
          <dl className="small muted" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 14px', margin: 0 }}>
            <dt>ISBN</dt><dd style={{ margin: 0 }}>{b.isbn}</dd>
            <dt>Language</dt><dd style={{ margin: 0 }}>{b.language}</dd>
            <dt>Sold by</dt><dd style={{ margin: 0 }}>{b.store_name ?? '-'}</dd>
          </dl>
        </div>
      </div>

      <section className="card" style={{ marginTop: 32 }} aria-labelledby="rv">
        <div className="row between"><h2 id="rv">Reader reviews</h2>
          <select aria-label="Sort reviews" value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: 'auto' }}>
            <option value="newest">Newest</option><option value="helpful">Most helpful</option>
          </select>
        </div>
        {rev.loading && !r && <Loading />}
        {rev.error && <div className="alert warn">Reviews are temporarily unavailable (the review database could not be reached). Everything else still works.</div>}
        {r && (
          <>
            <div className="grid-2" style={{ gridTemplateColumns: '180px 1fr', marginBottom: 16 }}>
              <div><div className="price" style={{ fontSize: '2.4rem' }}>{r.summary.average.toFixed(1)}</div><Stars value={r.summary.average} /><div className="muted small">{r.summary.count} review{r.summary.count === 1 ? '' : 's'}</div></div>
              <div className="bars">{[5, 4, 3, 2, 1].map((n) => (
                <div className="bar-row" key={n}><span>{n} ★</span><div className="bar"><i style={{ width: `${(r.summary.histogram[n] / maxBar) * 100}%` }} /></div><span className="right">{r.summary.histogram[n]}</span></div>
              ))}</div>
            </div>
            {r.canReview && !editing && <ReviewForm bookId={id} onDone={() => { rev.reload(); book.reload(); }} />}
            {user?.role === 'customer' && !r.canReview && !r.mine && <p className="muted small">🔒 Only customers who bought this book can review it.</p>}
            {r.items.length === 0 && <Empty icon="💬" title="No reviews yet" />}
            {r.items.map((x) => (
              editing && x.mine ? <ReviewForm key={x.id} bookId={id} mine={x} onDone={() => { setEditing(false); rev.reload(); book.reload(); }} /> : (
                <article key={x.id} className={`review ${x.mine ? 'mine' : ''}`}>
                  <div className="row" style={{ gap: 10 }}><Stars value={x.rating} /><strong>{x.title}</strong></div>
                  <div className="meta">{x.userName} · {dateOnly(x.createdAt)}{x.updatedAt ? ' (edited)' : ''} · <span className="badge green">Verified purchase</span></div>
                  <p style={{ margin: '8px 0' }}>{x.body}</p>
                  <div className="actions">
                    {user && !x.mine && <button className="btn secondary sm" onClick={() => helpful(x)}>{x.votedHelpful ? '✓ ' : ''}👍 Helpful ({x.helpfulCount})</button>}
                    {!user && <span className="muted small">👍 {x.helpfulCount} found this helpful</span>}
                    {x.mine && <><button className="btn secondary sm" onClick={() => setEditing(true)}>Edit</button></>}
                    {(x.mine || user?.role === 'admin') && <button className="btn danger secondary sm" onClick={() => remove(x)}>Delete</button>}
                  </div>
                </article>
              )
            ))}
          </>
        )}
      </section>
    </>
  );
}
