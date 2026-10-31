import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cue',
  description: 'search inside your videos',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <Link href="/">
            <strong>cue</strong>
          </Link>
          <Link href="/videos">videos</Link>
          <Link href="/search">search</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
