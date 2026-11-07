'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, putFile } from '../lib/api';
import styles from './upload.module.css';

interface Started {
  videoId: string;
  uploadUrl: string;
}

interface Registered {
  videoId: string;
  duplicate: boolean;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; label: string; fraction?: number }
  | { kind: 'error'; message: string };

export function UploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const busy = status.kind === 'busy';

  async function run(task: () => Promise<Registered>) {
    try {
      const { videoId } = await task();
      router.push(`/videos/${videoId}`);
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  function uploadFile(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    void run(async () => {
      setStatus({ kind: 'busy', label: 'preparing upload' });
      const started = await api<Started>('/videos/uploads', {
        method: 'POST',
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || 'video/mp4',
          ...(title ? { title } : {}),
        }),
      });
      await putFile(started.uploadUrl, file, (fraction) =>
        setStatus({ kind: 'busy', label: 'uploading', fraction }),
      );
      setStatus({ kind: 'busy', label: 'checking for duplicates' });
      return api<Registered>(`/videos/${started.videoId}/complete`, { method: 'POST' });
    });
  }

  function addUrl(e: FormEvent) {
    e.preventDefault();
    if (!url) return;
    void run(() => {
      setStatus({ kind: 'busy', label: 'adding link' });
      return api<Registered>('/videos/url', {
        method: 'POST',
        body: JSON.stringify({ url, ...(title ? { title } : {}) }),
      });
    });
  }

  return (
    <div className={styles.forms}>
      <label className={styles.field}>
        <span>title (optional)</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
      </label>

      <form className={styles.card} onSubmit={uploadFile}>
        <h2>upload a file</h2>
        <input
          type="file"
          accept="video/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={busy}
        />
        <button type="submit" disabled={!file || busy}>
          upload
        </button>
      </form>

      <form className={styles.card} onSubmit={addUrl}>
        <h2>or paste a link</h2>
        <input
          type="url"
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={busy}
        />
        <button type="submit" disabled={!url || busy}>
          add
        </button>
      </form>

      {status.kind === 'busy' && (
        <div className={styles.status}>
          <span>{status.label}…</span>
          {status.fraction !== undefined && (
            <progress value={status.fraction} max={1}>
              {Math.round(status.fraction * 100)}%
            </progress>
          )}
        </div>
      )}
      {status.kind === 'error' && <p className={styles.error}>{status.message}</p>}
    </div>
  );
}
