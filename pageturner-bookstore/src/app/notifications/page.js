'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { post, useFetch, dateTime } from '@/lib/client.js';
import { useApp } from '@/components/Providers.js';
import { Empty, ErrorBox, Loading, useGuard } from '@/components/ui.js';


export default function Notifications() {
  const ok = useGuard(['customer', 'seller', 'admin']);
  const { setUnread } = useApp();
  const n = useFetch(ok ? '/api/notifications' : null);
  async function readAll() { await post('/api/notifications', {}); setUnread(0); n.reload(); }
  useEffect(() => { if (n.data?.unread) setUnread(n.data.unread); }, [n.data, setUnread]);
  if (!ok || (n.loading && !n.data)) return <Loading />;
  return (
    <>
      <div className="row between"><h1>Notifications</h1>{n.data?.unread > 0 && <button className="btn secondary sm" onClick={readAll}>Mark all as read</button>}</div>
      <p className="muted small">Each one was created by a database trigger. E-mail delivery is simulated: the message is queued in the <code>notifications</code> table.</p>
      <ErrorBox error={n.error} />
      {n.data?.items.length === 0 && <Empty title="You are all caught up" />}
      {n.data?.items.map((x) => (
        <div key={x.notification_id} className="card tight" style={{ marginBottom: 10, borderLeft: `5px solid ${x.read_at ? 'var(--line)' : 'var(--amber)'}` }}>
          <div className="row between"><strong>{x.subject}</strong><span className="muted small">{dateTime(x.created_at)}</span></div>
          {x.body && <p className="small" style={{ margin: '6px 0 0' }}>{x.body}</p>}
          {x.link && <Link className="small" href={x.link}>Open →</Link>}
        </div>
      ))}
    </>
  );
}
