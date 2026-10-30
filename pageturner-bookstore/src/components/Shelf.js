'use client';
// The catalogue as an endless illustrated bookshelf. This is only the presentation layer: every book, price, stock
// level, filter and search result still comes from GET /api/books, and "Add" uses the normal cart API.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useFetch, post, get, money } from '@/lib/client.js';
import { useApp } from '@/components/Providers.js';
import { BookCover, Stars } from '@/components/ui.js';

const BATCH = 12;

// number of books per shelf row: 2 on phones, more as the screen grows
const colsNow = () => (window.innerWidth < 560 ? 2 : window.innerWidth < 900 ? 3 : window.innerWidth < 1200 ? 4 : 5);
function subscribeCols(cb) { window.addEventListener('resize', cb); return () => window.removeEventListener('resize', cb); }
const useCols = () => useSyncExternalStore(subscribeCols, colsNow, () => 2);

const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

function Row({ books, index, cols, onAdd, canBuy, firstRow }) {
  const pad = cols - books.length;
  return (
    <section className="shelf-row" aria-label={`Shelf ${index + 1}`} style={{ '--cols': cols }}>
      <div className="deco" aria-hidden="true" data-row={index % 6} />
      <ul className="shelf-books">
        {books.map((b, i) => (
          <li key={b.book_id} className="slot" style={{ '--tilt': `${((b.book_id * 7) % 5 - 2) * 0.35}deg` }}>
            <Link href={`/books/${b.book_id}`} prefetch={false} className="spine" tabIndex={-1} aria-hidden="true">
              <BookCover title={b.title} authors={b.authors} id={b.book_id} src={b.cover_url} priority={firstRow && i < 2} />
            </Link>
          </li>
        ))}
        {Array.from({ length: pad }, (_, i) => <li key={`pad${i}`} className="slot empty" aria-hidden="true" />)}
      </ul>
      <div className="plank" aria-hidden="true" />
      <ul className="shelf-tags">
        {books.map((b) => (
          <li key={b.book_id} className="tag">
            <Link href={`/books/${b.book_id}`} prefetch={false} className="t-title">{b.title}</Link>
            <span className="t-author">{b.authors}</span>
            {b.review_count > 0 && <span className="t-stars"><Stars value={b.avg_rating} size=".75rem" /></span>}
            <span className="t-meta">
              <b className="t-price">{money(b.price_cents)}</b>
              <span className="t-id" title="Product ID">ID {b.book_id}</span>
            </span>
            <span className="t-act">
              {b.stock === 0 ? <span className="badge red">Sold out</span>
                : canBuy ? <button className="btn sm amber" onClick={() => onAdd(b)} aria-label={`Add ${b.title} to cart`}>Add to cart</button>
                : b.stock <= 5 ? <span className="badge amber">Only {b.stock} left</span> : <span className="badge green">In stock</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RowSkeleton({ cols }) {
  return (
    <div className="shelf-row skeleton" style={{ '--cols': cols }} aria-hidden="true">
      <ul className="shelf-books">{Array.from({ length: cols }, (_, i) => <li key={i} className="slot"><div className="spine ghost" /></li>)}</ul>
      <div className="plank" />
      <ul className="shelf-tags">{Array.from({ length: cols }, (_, i) => <li key={i} className="tag ghost-tag" />)}</ul>
    </div>
  );
}

export default function Shelf() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user, toast, setCartCount } = useApp();
  const cols = useCols();

  const q = sp.get('q') ?? '';
  const category = sp.get('category') ?? '';
  const sort = sp.get('sort') ?? 'newest';
  const inStock = sp.get('inStock') === '1';
  const minPrice = sp.get('minPrice') ?? '';
  const maxPrice = sp.get('maxPrice') ?? '';
  const minRating = sp.get('minRating') ?? '';
  const language = sp.get('language') ?? '';
  const [price, setPrice] = useState({ min: minPrice, max: maxPrice });

  const cats = useFetch('/api/categories');
  const langs = useFetch('/api/languages');
  const tree = useMemo(() => cats.data?.items ?? [], [cats.data]);

  // The query string without the page number: when it changes the shelf starts again from the top.
  const filterKey = useMemo(() => {
    const p = new URLSearchParams({ limit: BATCH, sort });
    if (q) p.set('q', q);
    if (category) p.set('category', category);
    if (inStock) p.set('inStock', '1');
    if (minPrice) p.set('minPrice', minPrice);
    if (maxPrice) p.set('maxPrice', maxPrice);
    if (minRating) p.set('minRating', minRating);
    if (language) p.set('language', language);
    return p.toString();
  }, [q, category, sort, inStock, minPrice, maxPrice, minRating, language]);

  const [state, setState] = useState({ items: [], page: 0, pages: 1, total: null, loading: true, error: null });
  const live = useRef({ key: '', busy: false });

  const loadNext = useCallback(async (key, page, reset) => {
    if (live.current.busy && !reset) return;
    live.current.busy = true;
    live.current.key = key;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const d = await get(`/api/books?${key}&page=${page}`);
      if (live.current.key !== key) return;                      // the filters changed while this was loading
      setState((s) => {
        const seen = new Set(reset ? [] : s.items.map((b) => b.book_id));
        const fresh = d.items.filter((b) => !seen.has(b.book_id));
        return { items: reset ? fresh : [...s.items, ...fresh], page: d.page, pages: d.pages, total: d.total, loading: false, error: null };
      });
    } catch (error) {
      if (live.current.key === key) setState((s) => ({ ...s, loading: false, error }));
    } finally {
      if (live.current.key === key) live.current.busy = false;
    }
  }, []);

  useEffect(() => { loadNext(filterKey, 1, true); }, [filterKey, loadNext]);

  const more = state.page < state.pages;
  const sentinel = useRef(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !more || state.error || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !live.current.busy) loadNext(filterKey, state.page + 1, false);
    }, { rootMargin: '900px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [more, state.page, state.error, filterKey, loadNext]);

  function go(patch) {
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) (v === '' || v == null || v === false ? n.delete(k) : n.set(k, v === true ? '1' : v));
    n.delete('page');
    const s = n.toString();
    router.push(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }
  async function add(book) {
    try {
      const r = await post('/api/cart', { bookId: book.book_id, quantity: 1 });
      setCartCount(r.totals.item_count);
      toast(`Added “${book.title}” to your cart`);
    } catch (e) { toast(e.message, 'err'); }
  }

  // category chips: roots always, then the children of whatever is selected (one row per level)
  const byId = useMemo(() => new Map(tree.map((c) => [String(c.category_id), c])), [tree]);
  const path = useMemo(() => {
    const out = [];
    let cur = byId.get(String(category));
    while (cur) { out.unshift(cur); cur = cur.parent_id ? byId.get(String(cur.parent_id)) : null; }
    return out;
  }, [byId, category]);
  const levels = [tree.filter((c) => c.depth === 0), ...path.map((p) => tree.filter((c) => String(c.parent_id) === String(p.category_id)))].filter((l) => l.length);
  const filtersOn = Boolean(inStock || minPrice || maxPrice || minRating || language);
  const canBuy = user?.role === 'customer';
  const rows = chunk(state.items, cols);
  const title = q ? `Results for “${q}”` : path.length ? path[path.length - 1].name : 'Every book on the shelves';

  return (
    <div className="bookcase-wrap">
      <div className="case-tools">
        <div className="case-title">
          <h1>{title}</h1>
          {state.total != null && <span className="count" aria-live="polite">{state.total} book{state.total === 1 ? '' : 's'}</span>}
        </div>
        <nav className="cat-rows" aria-label="Categories">
          {levels.map((lvl, i) => (
            <div className="cat-row" key={i}>
              {i === 0 && <button className={`chip dark ${!category ? 'active' : ''}`} aria-pressed={!category} onClick={() => go({ category: '' })}>All</button>}
              {lvl.map((c) => (
                <button key={c.category_id} className={`chip dark ${path.some((p) => p.category_id === c.category_id) ? 'active' : ''}`}
                  aria-pressed={String(c.category_id) === category} onClick={() => go({ category: c.category_id })}>
                  {c.name} <span className="n">{c.subtree_books}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <details className="filters" open={filtersOn || undefined}>
          <summary>Sort and filter{filtersOn ? ' (on)' : ''}</summary>
          <div className="filter-grid">
            <div className="field"><label htmlFor="sort">Sort by</label>
              <select id="sort" value={sort} onChange={(e) => go({ sort: e.target.value })}>
                <option value="newest">Newest first</option><option value="rating">Best rated</option>
                <option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option>
                <option value="title">Title A to Z</option>
              </select></div>
            <div className="field"><label htmlFor="lang">Language</label>
              <select id="lang" value={language} onChange={(e) => go({ language: e.target.value })}>
                <option value="">Any language</option>
                {langs.data?.items.map((l) => <option key={l.language} value={l.language}>{l.language} ({l.n})</option>)}
              </select></div>
            <form className="field price-field" onSubmit={(e) => { e.preventDefault(); go({ minPrice: price.min, maxPrice: price.max }); }}>
              <label htmlFor="pmin">Price (₹)</label>
              <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                <input id="pmin" aria-label="Minimum price" type="number" min="0" placeholder="Min" value={price.min} onChange={(e) => setPrice({ ...price, min: e.target.value })} />
                <input aria-label="Maximum price" type="number" min="0" placeholder="Max" value={price.max} onChange={(e) => setPrice({ ...price, max: e.target.value })} />
                <button className="btn sm">Set</button>
              </div>
            </form>
            <div className="field"><label>Rating</label>
              <div className="chips">{['', '4', '3'].map((r) => <button key={r} className={`chip dark ${minRating === r ? 'active' : ''}`} aria-pressed={minRating === r} onClick={() => go({ minRating: r })}>{r ? `${r}★ & up` : 'Any'}</button>)}</div></div>
            <label className="check on-dark"><input type="checkbox" checked={inStock} onChange={(e) => go({ inStock: e.target.checked })} /> In stock only</label>
            {(filtersOn || q || category) && <button className="btn sm secondary light" onClick={() => router.push(pathname)}>Clear everything</button>}
          </div>
        </details>
      </div>

      <div className="bookcase">
        <div className="crown" aria-hidden="true" />
        {state.error && (
          <div className="alert error" role="alert">
            {state.error.message} <button className="btn sm" onClick={() => loadNext(filterKey, state.page + 1, state.page === 0)}>Try again</button>
          </div>
        )}
        {rows.map((r, i) => <Row key={r[0].book_id} books={r} index={i} cols={cols} onAdd={add} canBuy={canBuy} firstRow={i === 0} />)}
        {state.loading && state.page === 0 && <><RowSkeleton cols={cols} /><RowSkeleton cols={cols} /></>}
        {state.loading && state.page > 0 && <RowSkeleton cols={cols} />}
        {!state.loading && !state.error && state.total === 0 && (
          <div className="shelf-empty">
            <h2>Nothing on this shelf</h2>
            <p>No book matches that search and those filters. Try fewer words or clear the filters.</p>
            <button className="btn amber" onClick={() => router.push(pathname)}>Back to every book</button>
          </div>
        )}
        <div ref={sentinel} className="sentinel" aria-hidden="true" />
        {more && !state.loading && <div className="more"><button className="btn secondary light" onClick={() => loadNext(filterKey, state.page + 1, false)}>Load more books</button></div>}
        {!more && state.total > 0 && !state.loading && (
          <p className="shelf-end">That is every book on this shelf. <button className="link" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Back to the top</button></p>
        )}
        <div className="base" aria-hidden="true" />
      </div>
    </div>
  );
}
