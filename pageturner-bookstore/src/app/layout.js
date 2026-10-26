import './globals.css';
import Providers from '@/components/Providers.js';
import Nav from '@/components/Nav.js';

export const metadata = {
  title: 'PageTurner - Online Bookstore',
  description: 'DBMS mini project: an online bookstore on PostgreSQL + MongoDB with database-enforced roles.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <Providers>
          <Nav />
          <main id="main">{children}</main>
          <footer>PageTurner · PES1UG24CS058 · DBMS Mini Project · PostgreSQL + MongoDB + Next.js</footer>
        </Providers>
      </body>
    </html>
  );
}
