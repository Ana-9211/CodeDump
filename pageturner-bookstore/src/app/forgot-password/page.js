'use client';
import { useState } from 'react';
import Link from 'next/link';
import { post } from '@/lib/client.js';
import { ErrorBox } from '@/components/ui.js';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);
  async function submit(e) {
    e.preventDefault(); setErr(null);
    try { setRes(await post('/api/auth/forgot', { email })); } catch (e2) { setErr(e2); }
  }
  return (
    <div style={{ maxWidth: 440, margin: '24px auto' }}>
      <form className="card" onSubmit={submit}>
        <h1>Reset your password</h1>
        <p className="muted">Enter your account e-mail and we will send you a link that works for 30 minutes.</p>
        <ErrorBox error={err} />
        {res && <div className="alert success">{res.message}</div>}
        {res?.devResetLink && <div className="alert info small"><strong>Demo mode:</strong> no mail server is connected, so here is the link: <br /><a href={res.devResetLink}>{res.devResetLink}</a></div>}
        <div className="field"><label htmlFor="fe">Email</label><input id="fe" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <button className="btn block">Send reset link</button>
        <p className="small" style={{ marginTop: 14 }}><Link href="/login">← Back to sign in</Link></p>
      </form>
    </div>
  );
}
