'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { put, del, useFetch, money } from '@/lib/client.js';
import { useApp } from '@/components/Providers.js';
import { BookCover, Empty, ErrorBox, Loading, useGuard } from '@/components/ui.js';
import { CartSummary } from '@/components/CartSummary.js';

export default function CartPage() {
  const ok = useGuard(['customer']);
  const { toast, setCartCount } = useApp();
  const cart = useFetch(ok ? '/api/cart' : null);
  const d = cart.data;
  useEffect(() => { if (d) setCartCount(d.totals.item_count); }, [d, setCartCount]);

  async function setQty(bookId, quantity) {
    try { await put('/api/cart', { bookId, quantity }); cart.reload(); } catch (e) { toast(e.message, 'err'); }
  }
  async function remove(bookId) {
    try { await del(`/api/cart/${bookId}`); cart.reload(); } catch (e) { toast(e.message, 'err'); }
  }
  if (!ok || (cart.loading && !d)) return <Loading />;

  return (
    <>
      <h1>Your cart</h1>
      <ErrorBox error={cart.error} />
      {d && d.items.length === 0 && <Empty title="Your cart is empty"><Link className="btn" href="/books">Find a book</Link></Empty>}
      {d && d.items.length > 0 && (
        <div className="grid-cart">
          <div className="card">
            {d.items.map((i) => (
              <div key={i.book_id} className="row" style={{ padding: '12px 0', borderBottom: '1px solid var(--line)', alignItems: 'flex-start' }}>
                <BookCover title={i.title} authors="" id={i.book_id} src={i.cover_url} size="small" />
                <div style={{ flex: 1, minWidth: 180 }}>
                  <Link href={`/books/${i.book_id}`}><strong>{i.title}</strong></Link>
                  <div className="muted small">{i.authors} · {money(i.price_cents)} each</div>
                  {i.quantity > i.stock && <div className="badge red">Only {i.stock} in stock</div>}
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn secondary sm" aria-label="Decrease" disabled={i.quantity <= 1} onClick={() => setQty(i.book_id, i.quantity - 1)}>−</button>
                  <span aria-live="polite" style={{ minWidth: 22, textAlign: 'center' }}>{i.quantity}</span>
                  <button className="btn secondary sm" aria-label="Increase" disabled={i.quantity >= Math.min(10, i.stock)} onClick={() => setQty(i.book_id, i.quantity + 1)}>+</button>
                </div>
                <strong style={{ minWidth: 80, textAlign: 'right' }}>{money(i.line_total_cents)}</strong>
                <button className="btn danger secondary sm" onClick={() => remove(i.book_id)}>Remove</button>
              </div>
            ))}
          </div>
          <aside className="card">
            <h2>Order summary</h2>
            <CartSummary totals={d.totals} />
            <Link href="/checkout" className="btn amber block" style={{ marginTop: 16 }}>Proceed to checkout</Link>
            <p className="hint">Free shipping on orders above ₹499.</p>
          </aside>
        </div>
      )}
    </>
  );
}
