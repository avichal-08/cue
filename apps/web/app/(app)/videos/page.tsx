'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../../../components/page-header';
import { ago, api, formatMs } from '../../../lib/api';
import {
  applyEvent,
  statusAfter,
  toStages,
  useProgress,
  type StageState,
  type VideoStatus,
} from '../../../lib/progress';
import { StageBar } from './stage-bar';
import styles from './videos.module.css';

interface Summary {
  id: string;
  title: string;
  status: VideoStatus;
  sourceType: 'upload' | 'url';
  durationMs: number | null;
  error: string | null;
  createdAt: string;
}

interface Row extends Summary {
  stages: StageState[];
}

const working = (s: VideoStatus) => s === 'pending' || s === 'processing';

export default function Library() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { videos } = await api<{ videos: Summary[] }>('/videos?limit=100');
      const withStages = await Promise.all(
        videos.map(async (v) => {
          if (!working(v.status) && v.status !== 'failed') return { ...v, stages: toStages() };
          const detail = await api<{ stages: Partial<StageState>[] }>(`/videos/${v.id}`);
          return { ...v, stages: toStages(detail.stages) };
        }),
      );
      setRows(withStages);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useProgress(undefined, (event) => {
    if (!rows?.some((r) => r.id === event.videoId)) {
      void load();
      return;
    }
    setRows(
      (current) =>
        current?.map((r) =>
          r.id === event.videoId
            ? { ...r, status: statusAfter(r.status, event), stages: applyEvent(r.stages, event) }
            : r,
        ) ?? null,
    );
    if (event.type === 'ready' || (event.type === 'stage' && event.status === 'failed'))
      void load();
  });

  const ready = rows?.filter((r) => r.status === 'ready').length ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="library"
        title="Your videos."
        quiet={rows?.length ? `${ready} of ${rows.length} ready to search.` : undefined}
        actions={
          <Link href="/upload" className="btn btn-primary">
            Upload
          </Link>
        }
      />

      {error && <p className={styles.error}>Couldn&apos;t reach the API: {error}</p>}
      {!rows && !error && <div className={styles.skeleton} aria-label="loading" />}

      {rows?.length === 0 && (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Nothing indexed yet.</p>
          <p className="quiet">
            Upload a video or paste a link, and it will appear here while it indexes.
          </p>
          <Link href="/upload" className="btn btn-quiet">
            Add your first video
          </Link>
        </div>
      )}

      {rows && rows.length > 0 && (
        <ul className={styles.list}>
          {rows.map((v) => (
            <li key={v.id}>
              <Link href={`/videos/${v.id}`} className={styles.row}>
                <span className={`${styles.state} ${styles[v.status]}`} aria-label={v.status} />
                <span className={styles.main}>
                  <span className={styles.title}>{v.title}</span>
                  {v.status === 'failed' && v.error ? (
                    <span className={styles.rowError}>{v.error}</span>
                  ) : (
                    <span className={styles.meta}>
                      {v.sourceType === 'url' ? 'from a link' : 'uploaded'} · {ago(v.createdAt)}
                    </span>
                  )}
                </span>
                {working(v.status) || v.status === 'failed' ? (
                  <StageBar stages={v.stages} compact />
                ) : (
                  <span className={styles.readyLabel}>ready</span>
                )}
                <span className={`mono ${styles.duration}`}>{formatMs(v.durationMs)}</span>
                <span className={styles.chevron} aria-hidden>
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
