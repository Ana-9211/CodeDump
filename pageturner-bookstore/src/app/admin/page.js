'use client';
import { useState } from 'react';
import { useFetch, patch, post, del, dateTime, money } from '@/lib/client.js';
import { useApp } from '@/components/Providers.js';
import { Empty, ErrorBox, Loading, Status, useGuard } from '@/components/ui.js';
import { BarList, Kpi, SalesChart } from '@/components/Charts.js';

function Moderation() {
  const { toast } = useApp();
  const [status, setStatus] = useState('pending');
  const books = useFetch(`/api/admin/books?status=${status}`);
  async function act(b, action) {
    let reason;
    if (action === 'reject') { reason = prompt('Reason for rejecting (shown to the seller):'); if (!reason) return; }
    try { await patch(`/api/admin/books/${b.book_id}`, { action, reason }); toast(`Book ${action}ed`.replace('ee', 'e')); books.reload(); } catch (e) { toast(e.message, 'err'); }
  }
  return (
    <>
      <div className="chips" style={{ marginBottom: 14 }}>{['pending', 'approved', 'rejected', 'removed', 'all'].map((s) => <button key={s} className={`chip ${status === s ? 'active' : ''}`} onClick={() => setStatus(s)}>{s}</button>)}</div>
      <ErrorBox error={books.error} />
      {books.loading ? <Loading /> : books.data.items.length === 0 ? <Empty icon="✅" title="Nothing to review" /> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Book</th><th>Store</th><th>Category</th><th className="num">Price</th><th className="num">Stock</th><th>Status</th><th /></tr></thead>
          <tbody>{books.data.items.map((b) => (
            <tr key={b.book_id}><td><strong>{b.title}</strong><div className="muted small">{b.authors} · {b.isbn}</div></td><td>{b.store_name}</td><td>{b.category_name}</td>
              <td className="num">{money(b.price_cents)}</td><td className="num">{b.stock}</td><td><Status value={b.status} /></td>
              <td><div className="actions">
                {['pending', 'rejected'].includes(b.status) && <button className="btn sm" onClick={() => act(b, 'approve')}>Approve</button>}
                {b.status === 'pending' && <button className="btn danger secondary sm" onClick={() => act(b, 'reject')}>Reject</button>}
                {b.status === 'approved' && <button className="btn danger secondary sm" onClick={() => act(b, 'remove')}>Take down</button>}</div></td></tr>))}</tbody>
        </table></div>
      )}
    </>
  );
}

function Users() {
  const { toast, user } = useApp();
  const users = useFetch('/api/admin/users');
  async function set(u, status) {
    try { await patch(`/api/admin/users/${u.user_id}`, { status }); toast(`${u.name} is now ${status}`); users.reload(); } catch (e) { toast(e.message, 'err'); }
  }
  if (users.loading) return <Loading />;
  return (
    <><ErrorBox error={users.error} />
      <div className="table-wrap"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th /></tr></thead>
        <tbody>{users.data?.items.map((u) => (
          <tr key={u.user_id}><td>{u.name}</td><td>{u.email}</td><td><span className="badge blue">{u.role_name}</span></td><td><Status value={u.status} /></td><td>{dateTime(u.created_at)}</td>
            <td>{u.role_name !== 'admin' && u.user_id !== user?.userId && (u.status === 'active'
              ? <button className="btn danger secondary sm" onClick={() => set(u, 'suspended')}>Suspend</button>
              : <button className="btn secondary sm" onClick={() => set(u, 'active')}>Reactivate</button>)}</td></tr>))}</tbody>
      </table></div></>
  );
}

function Dashboard() {
  const r = useFetch('/api/admin/report');
  if (r.loading) return <Loading />;
  if (r.error) return <ErrorBox error={r.error} />;
  const d = r.data;
  return (
    <>
      <h2>Last 30 days</h2>
      <div className="kpis">
        <Kpi label="Revenue" value={money(d.totals.revenue_cents)} /><Kpi label="Orders" value={d.totals.orders} tone="blue" />
        <Kpi label="Live books" value={d.counts.live_books} tone="amber" /><Kpi label="Awaiting approval" value={d.counts.pending_books} tone={d.counts.pending_books ? 'red' : 'green'} />
        <Kpi label="Active users" value={d.counts.active_users} tone="blue" />
      </div>
      <div className="card"><h3>Revenue per day and running total</h3><p className="muted small">Window function <code>SUM() OVER (ORDER BY day)</code> inside <code>fn_sales_report()</code>.</p><SalesChart rows={d.report} /></div>
      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card"><h3>Seller leaderboard</h3><p className="muted small">CTE + <code>RANK() OVER</code> in view <code>v_seller_performance</code>.</p>
          <div className="table-wrap"><table><thead><tr><th>#</th><th>Store</th><th className="num">Units</th><th className="num">Revenue</th></tr></thead>
            <tbody>{d.sellers.map((s) => <tr key={s.seller_id}><td>{s.revenue_rank}</td><td>{s.store_name}</td><td className="num">{s.units}</td><td className="num">{money(s.revenue_cents)}</td></tr>)}</tbody></table></div></div>
        <div className="card"><h3>Orders by status</h3><BarList items={d.orderStatus} label={(x) => x.status} value={(x) => x.n} />
          <h3 style={{ marginTop: 18 }}>Top books</h3>{d.topBooks.length ? <BarList items={d.topBooks} label={(b) => b.title} value={(b) => b.units} format={(v) => `${v}×`} /> : <p className="muted">No sales yet.</p>}</div>
      </div>
      <div className="card" style={{ marginTop: 16 }}><h3>Category tree</h3><p className="muted small">Built by the recursive CTE in <code>fn_category_tree()</code>; counts include sub-categories.</p>
        {d.categories.map((c) => <div key={c.category_id} style={{ paddingLeft: c.depth * 22 }}>{c.depth ? '↳ ' : ''}<strong>{c.name}</strong> <span className="muted small">{c.subtree_books} books</span></div>)}</div>
    </>
  );
}

function Audit() {
  const a = useFetch('/api/admin/audit');
  if (a.loading) return <Loading />;
  return (
    <><p className="muted small">Written automatically by database triggers. The application cannot edit or delete these rows.</p><ErrorBox error={a.error} />
      <div className="table-wrap"><table><thead><tr><th>When</th><th>Who</th><th>Table</th><th>Record</th><th>Action</th><th>Change</th></tr></thead>
        <tbody>{a.data?.items.map((x) => (<tr key={x.audit_id}><td className="nowrap">{dateTime(x.changed_at)}</td><td>{x.actor_name ?? 'system'}</td><td>{x.table_name}</td><td>{x.record_id}</td><td><span className="badge blue">{x.action}</span></td>
          <td className="small"><code>{JSON.stringify(x.old_data)} → {JSON.stringify(x.new_data)}</code></td></tr>))}</tbody></table></div></>
  );
}

function Settings() {
  const { toast } = useApp();
  const s = useFetch('/api/admin/settings');
  const [vals, setVals] = useState({});
  async function save(key) {
    try { await patch('/api/admin/settings', { key, value: Number(vals[key]) }); toast('Setting saved'); s.reload(); setVals((v) => ({ ...v, [key]: undefined })); } catch (e) { toast(e.message, 'err'); }
  }
  if (s.loading) return <Loading />;
  return (
    <div className="stack"><ErrorBox error={s.error} />{s.data?.items.map((x) => (
      <div key={x.setting_key} className="card tight row between">
        <div><strong>{x.setting_key}</strong><div className="muted small">{x.description}</div></div>
        <div className="row"><input style={{ width: 130 }} type="number" aria-label={x.setting_key} value={vals[x.setting_key] ?? x.setting_value} onChange={(e) => setVals({ ...vals, [x.setting_key]: e.target.value })} />
          <button className="btn sm" disabled={vals[x.setting_key] === undefined} onClick={() => save(x.setting_key)}>Save</button></div>
      </div>))}<p className="hint">Money values are in paise (100 paise = ₹1).</p></div>
  );
}

function Applications() {
  const { toast } = useApp();
  const apps = useFetch('/api/admin/seller-applications');
  async function decide(a, action) {
    let note;
    if (action === 'reject') { note = prompt('Reason for rejecting (shown to the applicant):'); if (!note) return; }
    try { await patch(`/api/admin/seller-applications/${a.application_id}`, { action, note }); toast(action === 'approve' ? `${a.applicant} is now a seller` : 'Application rejected'); apps.reload(); } catch (e) { toast(e.message, 'err'); }
  }
  if (apps.loading) return <Loading />;
  return (
    <><ErrorBox error={apps.error} />
      {apps.data?.items.length === 0 ? <Empty icon="🏪" title="No seller applications" /> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Applicant</th><th>Store</th><th>Reason</th><th>Status</th><th>Applied</th><th /></tr></thead>
          <tbody>{apps.data?.items.map((a) => (
            <tr key={a.application_id}><td>{a.applicant}<div className="muted small">{a.email}</div></td><td>{a.store_name}</td><td className="small">{a.reason || '-'}</td>
              <td><Status value={a.status} />{a.review_note && <div className="muted small">{a.review_note}</div>}</td><td>{dateTime(a.created_at)}</td>
              <td>{a.status === 'pending' && <div className="actions"><button className="btn sm" onClick={() => decide(a, 'approve')}>Approve</button><button className="btn danger secondary sm" onClick={() => decide(a, 'reject')}>Reject</button></div>}</td></tr>))}</tbody>
        </table></div>)}</>
  );
}

function Categories() {
  const { toast } = useApp();
  const cats = useFetch('/api/categories');
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  async function add(e) {
    e.preventDefault();
    try { await post('/api/admin/categories', { name, parentId: parentId || null }); toast('Category added'); setName(''); cats.reload(); } catch (e2) { toast(e2.message, 'err'); }
  }
  async function rename(c) {
    const n = prompt('New name:', c.name); if (!n || n === c.name) return;
    try { await patch(`/api/admin/categories/${c.category_id}`, { name: n }); cats.reload(); } catch (e) { toast(e.message, 'err'); }
  }
  async function remove(c) {
    if (!confirm(`Delete “${c.name}”?`)) return;
    try { await del(`/api/admin/categories/${c.category_id}`); toast('Category deleted'); cats.reload(); } catch (e) { toast(e.message, 'err'); }
  }
  const items = cats.data?.items ?? [];
  return (
    <div className="grid-2" style={{ gridTemplateColumns: '1fr 320px', alignItems: 'start' }}>
      <div className="card"><h3>Category tree</h3><p className="muted small">Deleting is blocked while a category has books or sub-categories (a rule inside <code>fn_delete_category</code>).</p>
        {items.map((c) => (
          <div key={c.category_id} className="row between" style={{ paddingLeft: c.depth * 22, padding: '5px 0 5px ' + c.depth * 22 + 'px' }}>
            <span>{c.depth ? '↳ ' : ''}<strong>{c.name}</strong> <span className="muted small">{c.direct_books} direct · {c.subtree_books} total</span></span>
            <span className="actions"><button className="btn secondary sm" onClick={() => rename(c)}>Rename</button><button className="btn danger secondary sm" onClick={() => remove(c)}>Delete</button></span>
          </div>))}</div>
      <form className="card" onSubmit={add}><h3>Add category</h3>
        <div className="field"><label htmlFor="cn">Name</label><input id="cn" required value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label htmlFor="cpar">Parent</label><select id="cpar" value={parentId} onChange={(e) => setParentId(e.target.value)}><option value="">(top level)</option>{items.map((c) => <option key={c.category_id} value={c.category_id}>{'— '.repeat(c.depth)}{c.name}</option>)}</select></div>
        <button className="btn">Add</button></form>
    </div>
  );
}

export default function Admin() {
  const ok = useGuard(['admin']);
  const [tab, setTab] = useState('dash');
  if (!ok) return <Loading />;
  const tabs = [['dash', '📊 Dashboard'], ['books', '✅ Moderation'], ['users', '👥 Users'], ['apps', '🏪 Seller applications'], ['cats', '🗂 Categories'], ['audit', '🧾 Audit log'], ['settings', '⚙ Settings']];
  return (
    <>
      <h1>Admin console</h1>
      <div className="tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className="tab" onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'dash' && <Dashboard />}{tab === 'books' && <Moderation />}{tab === 'users' && <Users />}{tab === 'apps' && <Applications />}{tab === 'cats' && <Categories />}{tab === 'audit' && <Audit />}{tab === 'settings' && <Settings />}
    </>
  );
}
