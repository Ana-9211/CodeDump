'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useFetch, post } from '@/lib/client.js';
import { useApp } from '@/components/Providers.js';
import { BookCard, Empty, ErrorBox, Loading, Pagination } from '@/components/ui.js';

function Catalog() {
  const sp = useSearchParams();
  const router = useRouter();
  const { toast, setCartCount } = useApp();
  const q = sp.get('q') ?? '';
  const category = sp.get('category') ?? '';
  const sort = sp.get('sort') ?? 'newest';
  const page = Number(sp.get('page') ?? 1);
  const inStock = sp.get('inStock') === '1';
  const minPrice = sp.get('minPrice') ?? '';
  const maxPrice = sp.get('maxPrice') ?? '';
  const minRating = sp.get('minRating') ?? '';
  const language = sp.get('language') ?? '';
  const langs = useFetch('/api/languages');
  const [price, setPrice] = useState({ min: minPrice, max: maxPrice });

  const qs = new URLSearchParams({ page, limit: 20, sort });
  if (q) qs.set('q', q);
  if (category) qs.set('category', category);
  if (inStock) qs.set('inStock', '1');
  if (minPrice) qs.set('minPrice', minPrice);
  if (maxPrice) qs.set('maxPrice', maxPrice);
  if (minRating) qs.set('minRating', minRating);
  if (language) qs.set('language', language);
  const books = useFetch(`/api/books?${qs}`);
  const cats = useFetch('/api/categories');

  function go(patch) {
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) (v === '' || v == null || v === false ? n.delete(k) : n.set(k, v === true ? '1' : v));
    if (!('page' in patch)) n.delete('page');
    router.push(`/books?${n}`);
  }
  async function add(book) {
    try {
      const r = await post('/api/cart', { bookId: book.book_id, quantity: 1 });
      setCartCount(r.totals.item_count);
      toast(`Added “${book.title}” to your cart`);
    } catch (e) { toast(e.message, 'err'); }
  }
  const tree = cats.data?.items ?? [];
  const d = books.data;

  return (
    <div className="grid-sidebar">
      <aside className="card" aria-label="Filters">
        <h3>Categories</h3>
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px' }}>
          <li><Link href="/books" className="small" style={{ fontWeight: category ? 400 : 700 }}>All books</Link></li>
          {tree.map((c) => (
            <li key={c.category_id} style={{ paddingLeft: c.depth * 14 }}>
              <button className="link small" onClick={() => go({ category: c.category_id })}
                style={{ background: 'none', border: 0, padding: '3px 0', cursor: 'pointer', color: 'var(--forest)', fontWeight: String(c.category_id) === category ? 700 : 400, font: 'inherit', fontSize: '.875rem' }}>
                {c.depth > 0 && '↳ '}{c.name} <span className="muted">({c.subtree_books})</span>
              </button>
            </li>
          ))}
        </ul>
        <label className="check"><input type="checkbox" checked={inStock} onChange={(e) => go({ inStock: e.target.checked })} /> In stock only</label>
        <hr className="divider" />
        <h3>Price (₹)</h3>
        <form className="row" style={{ gap: 6, flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); go({ minPrice: price.min, maxPrice: price.max }); }}>
          <input aria-label="Minimum price" type="number" min="0" placeholder="Min" value={price.min} onChange={(e) => setPrice({ ...price, min: e.target.value })} />
          <input aria-label="Maximum price" type="number" min="0" placeholder="Max" value={price.max} onChange={(e) => setPrice({ ...price, max: e.target.value })} />
          <button className="btn sm">Go</button>
        </form>
        <hr className="divider" />
        <h3>Language</h3>
        <label htmlFor="lang" className="sr-only">Language</label>
        <select id="lang" value={language} onChange={(e) => go({ language: e.target.value })}>
          <option value="">Any language</option>
          {langs.data?.items.map((l) => <option key={l.language} value={l.language}>{l.language} ({l.n})</option>)}
        </select>
        <hr className="divider" />
        <h3>Rating</h3>
        <div className="chips">{['', '4', '3'].map((r) => <button key={r} className={`chip ${minRating === r ? 'active' : ''}`} onClick={() => go({ minRating: r })}>{r ? `${r}★ & up` : 'Any'}</button>)}</div>
      </aside>

      <section>
        <div className="row between" style={{ marginBottom: 16 }}>
          <div>
            <h1 style={{ marginBottom: 2 }}>{q ? `Results for “${q}”` : 'All books'}</h1>
            {d && <span className="muted small">{d.total} book{d.total === 1 ? '' : 's'}</span>}
          </div>
          <div>
            <label htmlFor="sort" className="sr-only">Sort by</label>
            <select id="sort" value={sort} onChange={(e) => go({ sort: e.target.value })}>
              <option value="newest">Newest first</option>
              <option value="rating">Best rated</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
              <option value="title">Title A–Z</option>
            </select>
          </div>
        </div>
        <ErrorBox error={books.error} />
        {books.loading && <Loading />}
        {d && d.items.length === 0 && <Empty icon="🔍" title="No books matched"><p>Try a shorter search or clear the filters.</p><Link className="btn secondary" href="/books">Clear filters</Link></Empty>}
        {d && d.items.length > 0 && <div className="book-grid">{d.items.map((b) => <BookCard key={b.book_id} book={b} onAdd={add} />)}</div>}
        {d && <Pagination page={d.page} pages={d.pages} onPage={(p) => go({ page: p })} />}
      </section>
    </div>
  );
}
export default function BooksPage() { return <Suspense fallback={<Loading />}><Catalog /></Suspense>; }
