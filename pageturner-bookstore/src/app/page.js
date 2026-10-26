'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useFetch, post } from '@/lib/client.js';
import { useApp } from '@/components/Providers.js';
import { BookCard, ErrorBox, Loading } from '@/components/ui.js';

export default function Home() {
  const router = useRouter();
  const { user, toast, setCartCount } = useApp();
  const [q, setQ] = useState('');
  const cats = useFetch('/api/categories');
  const fresh = useFetch('/api/books?limit=8&sort=newest');
  const top = useFetch('/api/books?limit=4&sort=rating');
  const trending = useFetch('/api/trending');

  async function add(book) {
    try {
      const r = await post('/api/cart', { bookId: book.book_id, quantity: 1 });
      setCartCount(r.totals.item_count);
      toast(`Added “${book.title}” to your cart`);
    } catch (e) { toast(e.message, 'err'); }
  }
  const roots = (cats.data?.items ?? []).filter((c) => c.depth === 0);

  return (
    <>
      <section className="hero">
        <h1>Find your next favourite book.</h1>
        <p>Thousands of pages, one trusted shelf. Search by title, author or ISBN, or wander through the categories.</p>
        <form onSubmit={(e) => { e.preventDefault(); router.push(`/books?q=${encodeURIComponent(q.trim())}`); }}>
          <label htmlFor="hero-q" className="sr-only">Search</label>
          <input id="hero-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try “dune” or “physics”" />
          <button type="submit">Search</button>
        </form>
        {!user && <p style={{ marginTop: 16 }}><Link className="btn amber" href="/register">Create a free account</Link></p>}
      </section>

      <section aria-labelledby="cats" style={{ marginBottom: 32 }}>
        <h2 id="cats">Browse by category</h2>
        <div className="chips">
          {roots.map((c) => <Link key={c.category_id} className="chip" href={`/books?category=${c.category_id}`}>{c.name} <span className="muted">({c.subtree_books})</span></Link>)}
        </div>
      </section>

      {trending.data?.items?.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2>🔥 Trending this week</h2>
          <p className="muted small">Ranked from reader activity stored in MongoDB.</p>
          <div className="book-grid">{trending.data.items.map((b) => <BookCard key={b.book_id} book={b} onAdd={add} />)}</div>
        </section>
      )}

      <section style={{ marginBottom: 32 }}>
        <h2>⭐ Top rated</h2>
        <ErrorBox error={top.error} />
        {top.loading ? <Loading /> : <div className="book-grid">{top.data?.items.map((b) => <BookCard key={b.book_id} book={b} onAdd={add} />)}</div>}
      </section>

      <section>
        <div className="row between"><h2>New arrivals</h2><Link href="/books?sort=newest">See all →</Link></div>
        <ErrorBox error={fresh.error} />
        {fresh.loading ? <Loading /> : <div className="book-grid">{fresh.data?.items.map((b) => <BookCard key={b.book_id} book={b} onAdd={add} />)}</div>}
      </section>
    </>
  );
}
