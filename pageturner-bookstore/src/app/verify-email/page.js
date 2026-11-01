'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { post } from '@/lib/client.js';
import { useApp } from '@/components/Providers.js';

function Inner() {
  const token = useSearchParams().get('token');
  const { refresh } = useApp();
  const [state, setState] = useState({ status: token ? 'working' : 'error', message: token ? '' : 'This link is missing its token.' });
  useEffect(() => {
    if (!token) return;
    post('/api/auth/verify', { token })
      .then((r) => { setState({ status: 'ok', message: r.message }); refresh(); })
      .catch((e) => setState({ status: 'error', message: e.message }));
  }, [token, refresh]);
  return (
    <div style={{ maxWidth: 440, margin: '24px auto' }}>
      <div className="card">
        <h1>E-mail verification</h1>
        {state.status === 'working' && <p className="muted">Checking your link…</p>}
        {state.status === 'ok' && <div className="alert success">{state.message}</div>}
        {state.status === 'error' && <div className="alert error" role="alert">{state.message}</div>}
        <p className="small" style={{ marginTop: 14 }}><Link href="/">← Back to the shop</Link></p>
      </div>
    </div>
  );
}
export default function VerifyEmail() { return <Suspense fallback={null}><Inner /></Suspense>; }
