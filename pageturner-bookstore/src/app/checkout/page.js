'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { post, useFetch } from '@/lib/client.js';
import { useApp } from '@/components/Providers.js';
import { ErrorBox, Loading, useGuard } from '@/components/ui.js';
import { CartSummary } from '@/components/CartSummary.js';

const EMPTY = { label: 'Home', fullName: '', line1: '', line2: '', city: '', state: '', postalCode: '', phone: '' };
const METHODS = [['upi', 'UPI'], ['card', 'Credit / debit card'], ['cod', 'Cash on delivery']];

export default function Checkout() {
  const ok = useGuard(['customer']);
  const router = useRouter();
  const { toast, setCartCount } = useApp();
  const cart = useFetch(ok ? '/api/cart' : null);
  const addrs = useFetch(ok ? '/api/addresses' : null);
  const [addressId, setAddressId] = useState(null);
  const [method, setMethod] = useState('upi');
  const [card, setCard] = useState({ number: '', expiry: '', cvv: '' });
  const [upi, setUpi] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const list = addrs.data?.items;
  useEffect(() => {
    if (list && addressId == null && list.length) setAddressId((list.find((a) => a.is_default) ?? list[0]).address_id);
    if (list && list.length === 0) setAdding(true);
  }, [list, addressId]);

  async function saveAddress(e) {
    e.preventDefault(); setErr(null);
    try {
      const r = await post('/api/addresses', form);
      setAddressId(r.addressId); setAdding(false); setForm(EMPTY); addrs.reload();
    } catch (e2) { setErr(e2); }
  }
  async function place() {
    setBusy(true); setErr(null);
    try {
      const { order } = await post('/api/orders', { addressId, paymentMethod: method, ...(method === 'card' ? { card } : {}), ...(method === 'upi' ? { upi } : {}) });
      setCartCount(0);
      toast(`Order ${order.order_number} placed!`);
      router.push(`/orders/${order.order_id}`);
    } catch (e) { setErr(e); setBusy(false); }
  }
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  if (!ok || (cart.loading && !cart.data) || (addrs.loading && !addrs.data)) return <Loading />;
  if (cart.data && cart.data.items.length === 0) return <div className="empty"><h2>Your cart is empty</h2><Link href="/books" className="btn">Browse books</Link></div>;

  return (
    <>
      <h1>Checkout</h1>
      <ErrorBox error={err} />
      <div className="grid-cart">
        <div className="stack">
          <section className="card">
            <h2>1 · Delivery address</h2>
            {list?.map((a) => (
              <label key={a.address_id} className="card tight" style={{ display: 'flex', gap: 12, cursor: 'pointer', borderColor: a.address_id === addressId ? 'var(--forest)' : undefined, background: a.address_id === addressId ? 'var(--forest-tint)' : undefined, marginBottom: 10, fontWeight: 400 }}>
                <input type="radio" name="addr" checked={a.address_id === addressId} onChange={() => setAddressId(a.address_id)} />
                <span><strong>{a.full_name}</strong> <span className="badge grey">{a.label}</span><br />{a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.city}, {a.state} {a.postal_code}<br /><span className="muted small">📞 {a.phone}</span></span>
              </label>
            ))}
            {!adding && <button className="btn secondary sm" onClick={() => setAdding(true)}>+ Add a new address</button>}
            {adding && (
              <form onSubmit={saveAddress} className="card tight">
                <div className="form-grid">
                  <div className="field"><label htmlFor="a1">Full name</label><input id="a1" required value={form.fullName} onChange={set('fullName')} /></div>
                  <div className="field"><label htmlFor="a2">Phone</label><input id="a2" required value={form.phone} onChange={set('phone')} /></div>
                  <div className="field"><label htmlFor="a3">Address line 1</label><input id="a3" required value={form.line1} onChange={set('line1')} /></div>
                  <div className="field"><label htmlFor="a4">Address line 2</label><input id="a4" value={form.line2} onChange={set('line2')} /></div>
                  <div className="field"><label htmlFor="a5">City</label><input id="a5" required value={form.city} onChange={set('city')} /></div>
                  <div className="field"><label htmlFor="a6">State</label><input id="a6" required value={form.state} onChange={set('state')} /></div>
                  <div className="field"><label htmlFor="a7">PIN code</label><input id="a7" required value={form.postalCode} onChange={set('postalCode')} /></div>
                  <div className="field"><label htmlFor="a8">Label</label><input id="a8" value={form.label} onChange={set('label')} /></div>
                </div>
                <div className="actions"><button className="btn sm">Save address</button>{list?.length > 0 && <button type="button" className="btn secondary sm" onClick={() => setAdding(false)}>Cancel</button>}</div>
              </form>
            )}
          </section>
          <section className="card">
            <h2>2 · Payment</h2>
            <p className="hint">Payments go through a <strong>test gateway</strong>: no real money moves, and your card number is checked and then discarded - only the last 4 digits are kept.</p>
            <div className="chips">{METHODS.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={method === v} className={`chip ${method === v ? 'active' : ''}`} onClick={() => setMethod(v)}>{l}</button>)}</div>
            {method === 'card' && (
              <div className="form-grid" style={{ marginTop: 14 }}>
                <div className="field"><label htmlFor="cn">Card number</label><input id="cn" inputMode="numeric" autoComplete="cc-number" placeholder="4242 4242 4242 4242" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} /></div>
                <div className="field"><label htmlFor="ce">Expiry (MM/YY)</label><input id="ce" autoComplete="cc-exp" placeholder="12/30" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: e.target.value })} /></div>
                <div className="field"><label htmlFor="cv">CVV</label><input id="cv" type="password" inputMode="numeric" autoComplete="cc-csc" maxLength={4} value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value })} /></div>
                <p className="hint">Test cards: 4242 4242 4242 4242 is approved, 4000 0000 0000 0002 is declined.</p>
              </div>
            )}
            {method === 'upi' && (
              <div className="field" style={{ marginTop: 14 }}><label htmlFor="up">UPI ID</label><input id="up" autoComplete="off" placeholder="name@bank" value={upi} onChange={(e) => setUpi(e.target.value)} /><p className="hint">fail@upi is declined; anything else works.</p></div>
            )}
            {method === 'cod' && <p className="hint" style={{ marginTop: 14 }}>Pay in cash when the parcel arrives. (An extra over the SRS, which lists card and UPI.)</p>}
          </section>
        </div>
        <aside className="card">
          <h2>Summary</h2>
          {cart.data && <CartSummary totals={cart.data.totals} />}
          <button className="btn amber block" style={{ marginTop: 16 }} disabled={busy || !addressId} onClick={place}>{busy ? 'Placing order…' : 'Place order'}</button>
          <p className="hint">Placing the order is one database transaction: stock, order lines, payment and cart all change together or not at all.</p>
        </aside>
      </div>
    </>
  );
}
