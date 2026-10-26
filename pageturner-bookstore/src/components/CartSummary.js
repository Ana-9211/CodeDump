import { money } from '@/lib/client.js';

export function CartSummary({ totals }) {
  const row = (l, v, strong) => <div className="row between" style={{ fontWeight: strong ? 700 : 400, fontSize: strong ? '1.15rem' : '1rem' }}><span>{l}</span><span>{v}</span></div>;
  return (
    <div className="stack">
      {row(`Subtotal (${totals.item_count} item${totals.item_count === 1 ? '' : 's'})`, money(totals.subtotal_cents))}
      {row('GST', money(totals.tax_cents))}
      {row('Shipping', totals.shipping_cents === 0 ? 'FREE' : money(totals.shipping_cents))}
      <hr className="divider" style={{ margin: '4px 0' }} />
      {row('Total', money(totals.total_cents), true)}
    </div>
  );
}
