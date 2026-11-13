'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../../../components/page-header';
import { ago, api } from '../../../lib/api';
import { useProgress } from '../../../lib/progress';
import styles from './jobs.module.css';

interface FailedJob {
  id: string;
  stage: string;
  videoId: string;
  title: string | null;
  error: string;
  attempts: number;
  failedAt: string | null;
}

const firstLine = (s: string) => s.split('\n')[0]!.slice(0, 300);

export default function FailedJobs() {
  const [jobs, setJobs] = useState<FailedJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const body = await api<{ jobs: FailedJob[] }>('/jobs/failed');
      setJobs(body.jobs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useProgress(undefined, (event) => {
    if (event.type === 'stage' && event.status === 'failed') void load();
  });

  async function act(job: FailedJob, action: 'retry' | 'discard') {
    setBusy(job.id);
    try {
      await (action === 'retry'
        ? api(`/jobs/${job.stage}/${encodeURIComponent(job.id)}/retry`, { method: 'POST' })
        : api(`/jobs/${job.stage}/${encodeURIComponent(job.id)}`, { method: 'DELETE' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
      void load();
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="jobs"
        title="Failed jobs."
        quiet="Stages that ran out of attempts. Retry resumes the video from its first unfinished stage."
      />

      {error && <p className={styles.error}>{error}</p>}

      {jobs?.length === 0 && <p className={styles.empty}>Nothing has failed.</p>}

      {jobs && jobs.length > 0 && (
        <ul className={styles.list}>
          {jobs.map((job) => (
            <li key={`${job.stage}/${job.id}`} className={styles.row}>
              <span className={styles.main}>
                <Link href={`/videos/${job.videoId}`} className={styles.title}>
                  {job.title ?? job.videoId}
                </Link>
                <span className={styles.meta}>
                  {job.stage} · {job.attempts} {job.attempts === 1 ? 'attempt' : 'attempts'}
                  {job.failedAt ? ` · ${ago(job.failedAt)}` : ''}
                </span>
                <span className={styles.reason}>{firstLine(job.error)}</span>
              </span>
              <span className={styles.actions}>
                <button
                  className="btn btn-primary"
                  disabled={busy === job.id}
                  onClick={() => void act(job, 'retry')}
                >
                  Retry
                </button>
                <button
                  className="btn btn-quiet"
                  disabled={busy === job.id}
                  onClick={() => void act(job, 'discard')}
                >
                  Discard
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
