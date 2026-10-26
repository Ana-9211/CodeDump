'use client';
import { useState } from 'react';
import Link from 'next/link';
import { post } from '@/lib/client.js';
import { ErrorBox } from '@/components/ui.js';

export default function RegisterPage() {
  const [f, setF] = useState({ role: 'customer', name: '', email: '', password: '', storeName: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await post('/api/auth/register', f);
      window.location.href = f.role === 'seller' ? '/seller' : '/';
    } catch (e2) { setErr(e2); setBusy(false); }
  }
  return (
    <div style={{ maxWidth: 480, margin: '24px auto' }}>
      <form className="card" onSubmit={submit}>
        <h1>Create your account</h1>
        <ErrorBox error={err} />
        <div className="chips" role="radiogroup" aria-label="Account type" style={{ marginBottom: 16 }}>
          {[['customer', '🛍 I want to buy'], ['seller', '🏪 I want to sell']].map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={f.role === v} className={`chip ${f.role === v ? 'active' : ''}`} onClick={() => setF({ ...f, role: v })}>{l}</button>
          ))}
        </div>
        <div className="field"><label htmlFor="n">Full name</label><input id="n" required value={f.name} onChange={set('name')} /></div>
        {f.role === 'seller' && <div className="field"><label htmlFor="s">Store name</label><input id="s" required value={f.storeName} onChange={set('storeName')} /></div>}
        <div className="field"><label htmlFor="e">Email</label><input id="e" type="email" required value={f.email} onChange={set('email')} /></div>
        <div className="field"><label htmlFor="p">Password</label><input id="p" type="password" required minLength={8} autoComplete="new-password" value={f.password} onChange={set('password')} />
          <div className="hint">At least 8 characters with a letter and a number.</div></div>
        <button className="btn block" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
        <p className="small muted" style={{ marginTop: 14 }}>Already registered? <Link href="/login">Sign in</Link></p>
      </form>
    </div>
  );
}
