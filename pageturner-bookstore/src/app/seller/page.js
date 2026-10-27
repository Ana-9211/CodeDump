'use client';
import { useState } from 'react';
import { useFetch, post, put, patch, del, dateTime, money } from '@/lib/client.js';
import { useApp } from '@/components/Providers.js';
import { Empty, ErrorBox, Loading, Status, useGuard } from '@/components/ui.js';
import { BarList, Kpi, SalesChart } from '@/components/Charts.js';

const BLANK = { title: '', authors: '', isbn: '', categoryId: '', price: '', stock: '', description: '', language: 'English', coverUrl: '', lowStock: 5 };

function BookForm({ initial, categories, onSaved, onCancel }) {
  const { toast } = useApp();
  const [f, setF] = useState(initial);
  const [err, setErr] = useState(null);
  const editing = Boolean(initial.bookId);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault(); setErr(null);
    try {
      if (editing) await put(`/api/seller/books/${initial.bookId}`, f); else await post('/api/seller/books', f);
      toast(editing ? 'Listing updated' : 'Listing submitted for approval'); onSaved();
    } catch (e2) { setErr(e2); }
  }
  return (
    <form className="card" onSubmit={submit}>
      <h2>{editing ? 'Edit listing' : 'New listing'}</h2>
      <ErrorBox error={err} />
      <div className="form-grid">
        <div className="field"><label htmlFor="bt">Title</label><input id="bt" required value={f.title} onChange={set('title')} /></div>
        <div className="field"><label htmlFor="ba">Authors</label><input id="ba" required value={f.authors} onChange={set('authors')} /><div className="hint">Separate several authors with commas.</div></div>
        <div className="field"><label htmlFor="bi">ISBN</label><input id="bi" required value={f.isbn} onChange={set('isbn')} /></div>
        <div className="field"><label htmlFor="bc">Category</label>
          <select id="bc" required value={f.categoryId} onChange={set('categoryId')}><option value="">Choose…</option>
            {categories.map((c) => <option key={c.category_id} value={c.category_id}>{'— '.repeat(c.depth)}{c.name}</option>)}</select></div>
        <div className="field"><label htmlFor="bp">Price (₹)</label><input id="bp" type="number" min="1" step="0.01" required value={f.price} onChange={set('price')} /></div>
        <div className="field"><label htmlFor="bs">Stock</label><input id="bs" type="number" min="0" required value={f.stock} onChange={set('stock')} /></div>
        <div className="field"><label htmlFor="bl">Language</label><input id="bl" value={f.language} onChange={set('language')} /></div>
        <div className="field"><label htmlFor="bls">Alert me when stock falls to</label><input id="bls" type="number" min="0" value={f.lowStock} onChange={set('lowStock')} /><div className="hint">You get a notification when stock drops to this number or below.</div></div>
        <div className="field"><label htmlFor="bcu">Cover image URL</label><input id="bcu" type="url" placeholder="https://…/cover.jpg" value={f.coverUrl} onChange={set('coverUrl')} /><div className="hint">Optional. A generated cover is shown if empty.</div></div>
      </div>
      <div className="field"><label htmlFor="bd">Description</label><textarea id="bd" value={f.description} onChange={set('description')} /></div>
      {editing && <p className="hint">Editing a rejected listing sends it back to the administrator for approval. Edits to a live listing take effect immediately.</p>}
      <div className="actions"><button className="btn">{editing ? 'Save changes' : 'Submit listing'}</button><button type="button" className="btn secondary" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

function Books() {
  const { toast } = useApp();
  const books = useFetch('/api/seller/books');
  const cats = useFetch('/api/categories');
  const [form, setForm] = useState(null);
  const done = () => { setForm(null); books.reload(); };
  async function remove(b) {
    if (!confirm(`Remove “${b.title}” from sale? Past orders keep their record.`)) return;
    try { await del(`/api/seller/books/${b.book_id}`); toast('Listing removed'); books.reload(); } catch (e) { toast(e.message, 'err'); }
  }
  if (form) return <BookForm initial={form} categories={cats.data?.items ?? []} onSaved={done} onCancel={() => setForm(null)} />;
  return (
    <>
      <div className="row between" style={{ marginBottom: 12 }}><h2 style={{ margin: 0 }}>My listings</h2><button className="btn" onClick={() => setForm(BLANK)}>+ New listing</button></div>
      <ErrorBox error={books.error} />
      {books.loading ? <Loading /> : books.data.items.length === 0 ? <Empty icon="📚" title="No listings yet">Add your first book. An administrator approves it before it goes live.</Empty> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Title</th><th>Status</th><th className="num">Price</th><th className="num">Stock</th><th className="num">Rating</th><th /></tr></thead>
          <tbody>{books.data.items.map((b) => (
            <tr key={b.book_id}>
              <td><strong>{b.title}</strong><div className="muted small">{b.authors} · {b.isbn}</div>{b.status === 'rejected' && <div className="small" style={{ color: 'var(--brick)' }}>Rejected: {b.rejection_reason}</div>}</td>
              <td><Status value={b.status} /></td><td className="num">{money(b.price_cents)}</td><td className="num">{b.stock}</td>
              <td className="num">{Number(b.avg_rating).toFixed(1)} ({b.review_count})</td>
              <td><div className="actions">
                <button className="btn secondary sm" onClick={() => setForm({ bookId: b.book_id, title: b.title, authors: b.authors, isbn: b.isbn, categoryId: b.category_id, price: (b.price_cents / 100).toFixed(2), stock: b.stock, description: b.description ?? '', language: b.language, coverUrl: b.cover_url ?? '', lowStock: b.low_stock_threshold })}>Edit</button>
                <button className="btn danger secondary sm" onClick={() => remove(b)}>Remove</button></div></td>
            </tr>))}</tbody>
        </table></div>
      )}
    </>
  );
}

const NEXT = { Placed: ['Packed', 'Cancelled'], Packed: ['Shipped', 'Cancelled'], Shipped: ['Delivered'] };
function Orders() {
  const { toast } = useApp();
  const [status, setStatus] = useState('');
  const orders = useFetch(`/api/seller/orders${status ? `?status=${status}` : ''}`);
  async function move(id, to) {
    try { await patch(`/api/seller/order-items/${id}`, { status: to }); toast(`Marked ${to}`); orders.reload(); } catch (e) { toast(e.message, 'err'); }
  }
  return (
    <>
      <div className="row between" style={{ marginBottom: 12 }}><h2 style={{ margin: 0 }}>Order lines to fulfil</h2>
        <select aria-label="Filter by status" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>{['Placed', 'Packed', 'Shipped', 'Delivered', 'Cancelled'].map((s) => <option key={s}>{s}</option>)}</select></div>
      <ErrorBox error={orders.error} />
      {orders.loading ? <Loading /> : orders.data.items.length === 0 ? <Empty icon="📦" title="Nothing here" /> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Order</th><th>Book</th><th>Ship to</th><th className="num">Qty</th><th>Status</th><th /></tr></thead>
          <tbody>{orders.data.items.map((o) => (
            <tr key={o.order_item_id}>
              <td>{o.order_number}<div className="muted small">{dateTime(o.placed_at)}</div></td><td>{o.title}</td>
              <td className="small">{o.ship_full_name}<br />{o.ship_line1}, {o.ship_city} {o.ship_postal_code}</td>
              <td className="num">{o.quantity}</td><td><Status value={o.fulfilment_status} /></td>
              <td><div className="actions">{(NEXT[o.fulfilment_status] ?? []).map((n) => <button key={n} className={`btn sm ${n === 'Cancelled' ? 'danger secondary' : ''}`} onClick={() => move(o.order_item_id, n)}>{n === 'Cancelled' ? 'Cancel' : `Mark ${n}`}</button>)}</div></td>
            </tr>))}</tbody>
        </table></div>
      )}
    </>
  );
}

function Report() {
  const r = useFetch('/api/seller/report');
  if (r.loading) return <Loading />;
  if (r.error) return <ErrorBox error={r.error} />;
  const d = r.data;
  return (
    <>
      <h2>Last 14 days</h2>
      <div className="kpis">
        <Kpi label="Revenue" value={money(d.totals.revenue_cents)} /><Kpi label="Orders" value={d.totals.orders} tone="blue" /><Kpi label="Units sold" value={d.totals.units} tone="amber" />
        <Kpi label="Low-stock books" value={d.lowStock.length} tone={d.lowStock.length ? 'red' : 'green'} />
      </div>
      <div className="card"><h3>Daily revenue <span className="muted small">(bars) and running total (line)</span></h3><SalesChart rows={d.report} /></div>
      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card"><h3>Best sellers</h3>{d.topBooks.length ? <BarList items={d.topBooks} label={(b) => b.title} value={(b) => b.units} format={(v) => `${v}×`} /> : <p className="muted">No sales in this period.</p>}</div>
        <div className="card"><h3>⚠ Restock soon</h3>{d.lowStock.length ? <ul>{d.lowStock.map((b) => <li key={b.book_id}>{b.title} <span className="badge red">{b.stock} left</span></li>)}</ul> : <p className="muted">All stocked up.</p>}</div>
      </div>
    </>
  );
}

export default function SellerHub() {
  const ok = useGuard(['seller']);
  const [tab, setTab] = useState('books');
  if (!ok) return <Loading />;
  const tabs = [['books', '📚 Listings'], ['orders', '📦 Orders'], ['report', '📈 Sales']];
  return (
    <>
      <h1>Seller hub</h1>
      <div className="tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className="tab" onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'books' && <Books />}{tab === 'orders' && <Orders />}{tab === 'report' && <Report />}
    </>
  );
}
