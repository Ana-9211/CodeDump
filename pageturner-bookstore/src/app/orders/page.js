'use client';
import Link from 'next/link';
import { useFetch, dateTime, money } from '@/lib/client.js';
import { Empty, ErrorBox, Loading, Status, useGuard } from '@/components/ui.js';

export default function Orders() {
  const ok = useGuard(['customer']);
  const { data, error, loading } = useFetch(ok ? '/api/orders' : null);
  if (!ok || loading) return <Loading />;
  return (
    <>
      <h1>My orders</h1>
      <ErrorBox error={error} />
      {data?.items.length === 0 && <Empty title="No orders yet"><Link className="btn" href="/books">Start shopping</Link></Empty>}
      {data?.items.length > 0 && (
        <div className="table-wrap"><table>
          <thead><tr><th>Order</th><th>Placed</th><th>Items</th><th>Payment</th><th>Status</th><th className="num">Total</th></tr></thead>
          <tbody>{data.items.map((o) => (
            <tr key={o.order_id}>
              <td><Link href={`/orders/${o.order_id}`}>{o.order_number}</Link></td>
              <td>{dateTime(o.placed_at)}</td><td>{o.line_count}</td>
              <td>{o.payment_method?.toUpperCase()} <Status value={o.payment_status ?? '-'} /></td>
              <td><Status value={o.status} /></td><td className="num">{money(o.total_cents)}</td>
            </tr>))}</tbody>
        </table></div>
      )}
    </>
  );
}
