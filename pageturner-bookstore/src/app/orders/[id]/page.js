'use client';
import { use } from 'react';
import Link from 'next/link';
import { post, useFetch, dateTime, money } from '@/lib/client.js';
import { useApp } from '@/components/Providers.js';
import { ErrorBox, Loading, Status, useGuard } from '@/components/ui.js';

const FLOW = ['Placed', 'Packed', 'Shipped', 'Delivered'];

export default function OrderPage({ params }) {
  const { id } = use(params);
  const ok = useGuard(['customer']);
  const { toast } = useApp();
  const { data, error, loading, reload } = useFetch(ok ? `/api/orders/${id}` : null);
  if (!ok || (loading && !data)) return <Loading />;
  if (error) return <><ErrorBox error={error} /><Link href="/orders">← My orders</Link></>;
  const { order: o, items, payment } = data;
  // the order has reached the stage that EVERY live item has reached (the slowest item decides)
  const live = items.filter((i) => i.fulfilment_status !== 'Cancelled');
  const reached = live.length ? Math.min(...live.map((i) => FLOW.indexOf(i.fulfilment_status))) : 0;
  const canCancel = items.some((i) => ['Placed', 'Packed'].includes(i.fulfilment_status)) && o.status !== 'Cancelled';

  async function cancel() {
    if (!confirm('Cancel this order? Items that have not shipped will be returned to stock.')) return;
    try { await post(`/api/orders/${id}/cancel`); toast('Order cancelled'); reload(); } catch (e) { toast(e.message, 'err'); }
  }
  return (
    <>
      <p className="small"><Link href="/orders">← My orders</Link></p>
      <div className="row between"><h1>{o.order_number}</h1><Status value={o.status} /></div>
      <p className="muted">Placed {dateTime(o.placed_at)}</p>
      <div className="card">
        <div className="steps" aria-label="Order progress">
          {o.status === 'Cancelled' ? <div className="step cancelled" style={{ paddingTop: 0 }}>Cancelled {dateTime(o.cancelled_at)}</div>
            : FLOW.map((s, i) => <div key={s} className={`step ${i <= reached ? 'done' : ''}`}>{s}</div>)}
        </div>
      </div>
      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Items</h2>
          {items.map((i) => (
            <div key={i.order_item_id} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
              <div><Link href={`/books/${i.book_id}`}>{i.title}</Link><div className="muted small">{i.quantity} × {money(i.unit_price_cents)}</div></div>
              <div className="right"><strong>{money(i.line_total_cents)}</strong><br /><Status value={i.fulfilment_status} /></div>
            </div>))}
          <div className="stack small" style={{ marginTop: 14 }}>
            <div className="row between"><span>Subtotal</span><span>{money(o.subtotal_cents)}</span></div>
            <div className="row between"><span>GST</span><span>{money(o.tax_cents)}</span></div>
            <div className="row between"><span>Shipping</span><span>{o.shipping_cents ? money(o.shipping_cents) : 'FREE'}</span></div>
            <div className="row between" style={{ fontWeight: 700, fontSize: '1.1rem' }}><span>Total</span><span>{money(o.total_cents)}</span></div>
          </div>
        </div>
        <div className="stack">
          <div className="card"><h3>Delivering to</h3>
            <p>{o.ship_full_name}<br />{o.ship_line1}{o.ship_line2 ? `, ${o.ship_line2}` : ''}<br />{o.ship_city}, {o.ship_state} {o.ship_postal_code}<br />📞 {o.ship_phone}</p></div>
          {payment && <div className="card"><h3>Payment</h3><p>{payment.method.toUpperCase()} · <Status value={payment.status} /><br /><span className="muted small">Ref {payment.transaction_ref}</span></p></div>}
          {canCancel && <button className="btn danger secondary" onClick={cancel}>Cancel order</button>}
        </div>
      </div>
    </>
  );
}
