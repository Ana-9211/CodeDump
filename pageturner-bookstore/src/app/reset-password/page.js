'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { post } from '@/lib/client.js';
import { ErrorBox } from '@/components/ui.js';

function Form() {
  const token = useSearchParams().get('token') ?? '';
  const [pw, setPw] = useState('');
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(false);
  async function submit(e) {
    e.preventDefault(); setErr(null);
    try { await post('/api/auth/reset', { token, password: pw }); setDone(true); } catch (e2) { setErr(e2); }
  }
  return (
    <div style={{ maxWidth: 440, margin: '24px auto' }}>
      <form className="card" onSubmit={submit}>
        <h1>Choose a new password</h1>
        <ErrorBox error={err} />
        {done ? <div className="alert success">Password changed. <Link href="/login">Sign in</Link></div> : (<>
          <div className="field"><label htmlFor="np">New password</label><input id="np" type="password" minLength={8} required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            <div className="hint">At least 8 characters with a letter and a number.</div></div>
          <button className="btn block" disabled={!token}>Change password</button></>)}
      </form>
    </div>
  );
}
export default function Reset() { return <Suspense><Form /></Suspense>; }
