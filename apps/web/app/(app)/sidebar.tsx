'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Logo } from '../../components/logo';
import { api } from '../../lib/api';
import { useProgress } from '../../lib/progress';
import styles from './shell.module.css';

const icons = {
  search: (
    <svg viewBox="0 0 16 16" aria-hidden>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 14 14" />
    </svg>
  ),
  library: (
    <svg viewBox="0 0 16 16" aria-hidden>
      <rect x="2" y="3" width="12" height="10" rx="2" />
      <path d="M2 6.5h12M6 3v3.5M10 3v3.5" />
    </svg>
  ),
  upload: (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path d="M8 11V3M4.5 6.5 8 3l3.5 3.5M3 13h10" />
    </svg>
  ),
};

const links = [
  { href: '/search', label: 'Search', icon: icons.search },
  { href: '/videos', label: 'Library', icon: icons.library },
  { href: '/upload', label: 'Upload', icon: icons.upload },
];

interface Counts {
  ready: number;
  working: number;
  failed: number;
}

export function Sidebar() {
  const pathname = usePathname();
  const [counts, setCounts] = useState<Counts | null>(null);

  const load = useCallback(async () => {
    try {
      const { videos } = await api<{ videos: { status: string }[] }>('/videos?limit=100');
      setCounts({
        ready: videos.filter((v) => v.status === 'ready').length,
        working: videos.filter((v) => v.status === 'pending' || v.status === 'processing').length,
        failed: videos.filter((v) => v.status === 'failed').length,
      });
    } catch {
      setCounts(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useProgress(undefined, (event) => {
    if (event.type === 'ready' || event.type === 'stage') void load();
  });

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <Logo href="/" />
      </div>

      <nav className={styles.group} aria-label="app">
        <span className={styles.groupLabel}>workspace</span>
        {links.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`${styles.link} ${active ? styles.active : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              {link.icon}
              {link.label}
            </Link>
          );
        })}
      </nav>

      {counts && (
        <div className={styles.group}>
          <span className={styles.groupLabel}>library</span>
          <dl className={styles.counts}>
            <div>
              <dt>ready</dt>
              <dd className="mono">{counts.ready}</dd>
            </div>
            <div>
              <dt>{counts.working ? <span className={styles.pulse} /> : null}indexing</dt>
              <dd className="mono">{counts.working}</dd>
            </div>
            {counts.failed > 0 && (
              <div>
                <dt>failed</dt>
                <dd className={`mono ${styles.bad}`}>{counts.failed}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      <a className={styles.source} href="https://github.com/avichal-08/cue">
        Source on GitHub ↗
      </a>
    </aside>
  );
}
