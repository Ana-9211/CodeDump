'use client';
import Link from 'next/link';
import { del, post, useFetch } from '@/lib/client.js';
import { useApp } from '@/components/Providers.js';
import { BookCard, Empty, ErrorBox, Loading, useGuard } from '@/components/ui.js';

export default function Wishlist() {
  const ok = useGuard(['customer']);
  const { toast, setCartCount } = useApp();
  const w = useFetch(ok ? '/api/wishlist' : null);
  async function add(book) {
    try { const r = await post('/api/cart', { bookId: book.book_id, quantity: 1 }); setCartCount(r.totals.item_count); toast('Added to your cart'); } catch (e) { toast(e.message, 'err'); }
  }
  async function remove(book) {
    try { await del(`/api/wishlist/${book.book_id}`); w.reload(); } catch (e) { toast(e.message, 'err'); }
  }
  if (!ok || w.loading) return <Loading />;
  return (
    <>
      <h1>♡ My wishlist</h1>
      <ErrorBox error={w.error} />
      {w.data?.items.length === 0 && <Empty icon="♡" title="Nothing saved yet"><p>Tap “Wishlist” on any book to keep it for later.</p><Link className="btn" href="/books">Browse books</Link></Empty>}
      <div className="book-grid">{w.data?.items.map((b) => (
        <div key={b.book_id} className="stack"><BookCard book={b} onAdd={add} /><button className="btn secondary sm block" onClick={() => remove(b)}>Remove</button></div>
      ))}</div>
    </>
  );
}
