'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useApp } from './Providers.js';
import { post } from '@/lib/client.js';

export default function Nav() {
  const { user, cartCount, unread, logout, ready } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [sent, setSent] = useState(null);
  async function resend() { try { setSent(await post('/api/auth/resend-verification')); } catch (e) { setSent({ message: e.message }); } }
  const cur = (p) => (pathname === p || pathname.startsWith(p + '/') ? 'page' : undefined);

  return (
    <>
    <header className="nav">
      <div className="nav-inner">
        <Link href="/" className="brand">📖 Page<span>Turner</span></Link>
        <form role="search" onSubmit={(e) => { e.preventDefault(); router.push(`/books?q=${encodeURIComponent(q.trim())}`); }}>
          <label htmlFor="nav-q" className="sr-only">Search books</label>
          <input id="nav-q" type="search" placeholder="Search title, author or ISBN" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="search-btn" type="submit">Search</button>
        </form>
        <nav className="nav-links" aria-label="Main">
          <Link href="/books" aria-current={cur('/books')}>Browse</Link>
          {ready && !user && (<><Link href="/login" aria-current={cur('/login')}>Sign in</Link><Link href="/register" aria-current={cur('/register')}>Join</Link></>)}
          {user?.role === 'customer' && (<>
            <Link href="/orders" aria-current={cur('/orders')}>My orders</Link>
            <Link href="/wishlist" aria-current={cur('/wishlist')}>♡ Wishlist</Link>
            <Link href="/cart" aria-current={cur('/cart')}>🛒 Cart{cartCount > 0 && <span className="badge-count">{cartCount}</span>}</Link>
          </>)}
          {user?.role === 'seller' && <Link href="/seller" aria-current={cur('/seller')}>Seller hub</Link>}
          {user?.role === 'admin' && <Link href="/admin" aria-current={cur('/admin')}>Admin</Link>}
          {user && <Link href="/notifications" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-current={cur('/notifications')}>🔔{unread > 0 && <span className="badge-count">{unread}</span>}</Link>}
          {user && <Link href="/account" aria-current={cur('/account')}>Account</Link>}
          {user && (<><span className="role-chip" title={user.name}>{user.role}</span><button className="link" onClick={logout}>Sign out</button></>)}
        </nav>
      </div>
    </header>
    {user && user.emailVerified === false && (
      <div className="verify-banner" role="status">
        ✉️ Please confirm your e-mail address.{' '}
        {sent ? <span>{sent.message} {sent.devLink && <a href={sent.devLink}>Demo link</a>}</span> : <button className="link" onClick={resend}>Resend the link</button>}
      </div>
    )}
    </>
  );
}
