'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, formatMs } from '../../lib/api';
import {
  applyEvent,
  statusAfter,
  toStages,
  useProgress,
  type StageState,
  type VideoStatus,
} from '../../lib/progress';
import { StageBar } from './stage-bar';
import styles from './videos.module.css';

interface Summary {
  id: string;
  title: string;
  status: VideoStatus;
  durationMs: number | null;
  error: string | null;
  createdAt: string;
}

interface Row extends Summary {
  stages: StageState[];
}

const finished = (s: VideoStatus) => s === 'ready' || s === 'failed';

export default function Videos() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { videos } = await api<{ videos: Summary[] }>('/videos?limit=100');
      const withStages = await Promise.all(
        videos.map(async (v) => {
          if (finished(v.status)) {
            return { ...v, stages: toStages(v.status === 'ready' ? doneRuns : []) };
          }
          const detail = await api<{ stages: Partial<StageState>[] }>(`/videos/${v.id}`);
          return { ...v, stages: toStages(detail.stages) };
        }),
      );
      setRows(withStages);
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

  if (error) return <p className={styles.error}>could not load videos: {error}</p>;
  if (!rows) return <p className="muted">loading…</p>;

  return (
    <>
      <h1>videos</h1>
      {rows.length === 0 ? (
        <p className="muted">
          no videos yet. <Link href="/">upload one</Link>.
        </p>
      ) : (
        <ul className={styles.list}>
          {rows.map((v) => (
            <li key={v.id} className={styles.item}>
              <div className={styles.row}>
                <Link href={`/videos/${v.id}`} className={styles.title}>
                  {v.title}
                </Link>
                <span className={styles.meta}>
                  <span className={`${styles.badge} ${styles[v.status]}`}>{v.status}</span>{' '}
                  {formatMs(v.durationMs)}
                </span>
              </div>
              {!finished(v.status) || v.status === 'failed' ? <StageBar stages={v.stages} /> : null}
              {v.error && <p className={styles.error}>{v.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const doneRuns = toStages().map((s) => ({ ...s, status: 'done' as const, progress: 100 }));
