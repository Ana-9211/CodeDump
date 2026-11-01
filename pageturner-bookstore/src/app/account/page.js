'use client';
import { useState } from 'react';
import { del, patch, post, useFetch, dateTime } from '@/lib/client.js';
import { useApp } from '@/components/Providers.js';
import { ErrorBox, Loading, Status, useGuard } from '@/components/ui.js';

function Profile({ account, reload }) {
  const { toast, refresh, user } = useApp();
  const [name, setName] = useState(account.name);
  const [phone, setPhone] = useState(account.phone ?? '');
  const [err, setErr] = useState(null);
  const editable = user.role !== 'admin';
  async function save(e) {
    e.preventDefault(); setErr(null);
    try { await patch('/api/account', { name, phone }); toast('Profile saved'); refresh(); reload(); } catch (e2) { setErr(e2); }
  }
  return (
    <form className="card" onSubmit={save}>
      <h2>Profile</h2><ErrorBox error={err} />
      <div className="form-grid">
        <div className="field"><label htmlFor="pn">Name</label><input id="pn" value={name} disabled={!editable} onChange={(e) => setName(e.target.value)} required /></div>
        <div className="field"><label htmlFor="pe">E-mail</label><input id="pe" value={account.email} disabled /></div>
        <div className="field"><label htmlFor="pp">Phone</label><input id="pp" value={phone} disabled={!editable} onChange={(e) => setPhone(e.target.value)} /></div>
      </div>
      {editable && <button className="btn">Save profile</button>}
    </form>
  );
}

function Password() {
  const { toast } = useApp();
  const [f, setF] = useState({ currentPassword: '', newPassword: '' });
  const [err, setErr] = useState(null);
  async function save(e) {
    e.preventDefault(); setErr(null);
    try { await post('/api/account/password', f); toast('Password changed'); setF({ currentPassword: '', newPassword: '' }); } catch (e2) { setErr(e2); }
  }
  return (
    <form className="card" onSubmit={save}>
      <h2>Change password</h2><ErrorBox error={err} />
      <div className="form-grid">
        <div className="field"><label htmlFor="cp">Current password</label><input id="cp" type="password" autoComplete="current-password" required value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} /></div>
        <div className="field"><label htmlFor="n2">New password</label><input id="n2" type="password" autoComplete="new-password" minLength={8} required value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} /></div>
      </div>
      <button className="btn">Change password</button>
    </form>
  );
}

function Addresses() {
  const { toast } = useApp();
  const a = useFetch('/api/addresses');
  async function makeDefault(id) { try { await patch(`/api/addresses/${id}`); a.reload(); } catch (e) { toast(e.message, 'err'); } }
  async function remove(id) { try { await del(`/api/addresses/${id}`); a.reload(); } catch (e) { toast(e.message, 'err'); } }
  return (
    <div className="card">
      <h2>Saved addresses <span className="muted small">({a.data?.items.length ?? 0} of 5)</span></h2>
      <ErrorBox error={a.error} />
      {a.data?.items.map((x) => (
        <div key={x.address_id} className="row between" style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
          <span><strong>{x.full_name}</strong> <span className="badge grey">{x.label}</span> {x.is_default && <span className="badge green">Default</span>}<br /><span className="small muted">{x.line1}, {x.city}, {x.state} {x.postal_code} · {x.phone}</span></span>
          <span className="actions">{!x.is_default && <button className="btn secondary sm" onClick={() => makeDefault(x.address_id)}>Make default</button>}<button className="btn danger secondary sm" onClick={() => remove(x.address_id)}>Delete</button></span>
        </div>))}
      <p className="hint">Add new addresses at checkout.</p>
    </div>
  );
}

function BecomeSeller({ application, reload }) {
  const { toast } = useApp();
  const [f, setF] = useState({ storeName: '', reason: '' });
  const [err, setErr] = useState(null);
  async function apply(e) {
    e.preventDefault(); setErr(null);
    try { await post('/api/seller-application', f); toast('Application sent to the administrators'); reload(); } catch (e2) { setErr(e2); }
  }
  const pending = application?.status === 'pending';
  return (
    <div className="card" style={{ background: 'var(--amber-tint)' }}>
      <h2>Want to sell books?</h2>
      {application && <div className="alert info">Your last application for “{application.store_name}” is <Status value={application.status} />{application.review_note ? ` — ${application.review_note}` : ''}.</div>}
      {!pending && (
        <form onSubmit={apply}><ErrorBox error={err} />
          <div className="form-grid">
            <div className="field"><label htmlFor="ss">Store name</label><input id="ss" required value={f.storeName} onChange={(e) => setF({ ...f, storeName: e.target.value })} /></div>
            <div className="field"><label htmlFor="sr">Why you?</label><input id="sr" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></div>
          </div>
          <button className="btn amber">Apply to become a seller</button>
        </form>)}
    </div>
  );
}

export default function Account() {
  const ok = useGuard(['customer', 'seller', 'admin']);
  const { user } = useApp();
  const acc = useFetch(ok ? '/api/account' : null);
  if (!ok || (acc.loading && !acc.data)) return <Loading />;
  if (!acc.data) return <ErrorBox error={acc.error} />;
  return (
    <div className="stack">
      <h1>My account</h1>
      <Profile key={acc.data.account.name} account={acc.data.account} reload={acc.reload} />
      <Password />
      {user.role === 'customer' && <><Addresses /><BecomeSeller application={acc.data.application} reload={acc.reload} /></>}
      <p className="muted small">Member since {dateTime(acc.data.account.created_at)}</p>
    </div>
  );
}
