'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { post } from '@/lib/client.js';
import { ErrorBox } from '@/components/ui.js';

const DEMOS = [
  ['Customer', 'customer1@bookstore.test'], ['Seller', 'seller1@bookstore.test'], ['Admin', 'admin@bookstore.test'],
];
function Form() {
  const sp = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const { user } = await post('/api/auth/login', { email, password });
      const next = sp.get('next');
      const home = user.role === 'seller' ? '/seller' : user.role === 'admin' ? '/admin' : '/';
      window.location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : home;
    } catch (e2) { setErr(e2); setBusy(false); }
  }
  return (
    <div style={{ maxWidth: 440, margin: '24px auto' }}>
      <form className="card" onSubmit={submit}>
        <h1>Welcome back</h1>
        <ErrorBox error={err} />
        <div className="field"><label htmlFor="em">Email</label><input id="em" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label htmlFor="pw">Password</label><input id="pw" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <button className="btn block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="small" style={{ marginTop: 12 }}><Link href="/forgot-password">Forgot your password?</Link></p>
        <p className="small muted" style={{ marginTop: 6 }}>New here? <Link href="/register">Create an account</Link></p>
      </form>
      <div className="card tight" style={{ marginTop: 16, background: 'var(--sky-tint)' }}>
        <strong className="small">Demo accounts</strong> <span className="muted small">(password <code>Passw0rd!</code>)</span>
        <div className="chips" style={{ marginTop: 8 }}>
          {DEMOS.map(([l, e]) => <button key={e} type="button" className="chip" onClick={() => { setEmail(e); setPassword('Passw0rd!'); }}>{l}</button>)}
        </div>
      </div>
    </div>
  );
}
export default function LoginPage() { return <Suspense><Form /></Suspense>; }
