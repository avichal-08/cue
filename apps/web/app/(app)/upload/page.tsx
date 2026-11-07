'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type DragEvent, type FormEvent } from 'react';
import { PageHeader } from '../../../components/page-header';
import { api, putFile } from '../../../lib/api';
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

const size = (bytes: number) =>
  bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${(bytes / 1e6).toFixed(1)} MB`;

export default function Upload() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const busy = status.kind === 'busy';

  function pick(next: File | undefined) {
    if (!next) return;
    if (!next.type.startsWith('video/')) {
      setStatus({ kind: 'error', message: `${next.name} is not a video file.` });
      return;
    }
    setFile(next);
    setStatus({ kind: 'idle' });
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (!busy) pick(e.dataTransfer.files[0]);
  }

  async function run(task: () => Promise<Registered>) {
    try {
      const { videoId } = await task();
      router.push(`/videos/${videoId}`);
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  function upload() {
    if (!file) return;
    void run(async () => {
      setStatus({ kind: 'busy', label: 'Preparing upload', fraction: 0 });
      const started = await api<Started>('/videos/uploads', {
        method: 'POST',
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || 'video/mp4',
          title: title.trim() || file.name.replace(/\.[^.]+$/, ''),
        }),
      });
      await putFile(started.uploadUrl, file, (fraction) =>
        setStatus({ kind: 'busy', label: 'Uploading to storage', fraction }),
      );
      setStatus({ kind: 'busy', label: 'Checking for duplicates', fraction: 1 });
      return api<Registered>(`/videos/${started.videoId}/complete`, { method: 'POST' });
    });
  }

  function addLink(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    void run(() => {
      setStatus({ kind: 'busy', label: 'Adding link' });
      return api<Registered>('/videos/url', {
        method: 'POST',
        body: JSON.stringify({ url: url.trim(), ...(title.trim() ? { title: title.trim() } : {}) }),
      });
    });
  }

  return (
    <>
      <PageHeader eyebrow="upload" title="Add a video." quiet="Cue indexes it in the background." />

      <div
        className={`${styles.drop} ${dragging ? styles.dragging : ''} ${file ? styles.hasFile : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          ref={input}
          type="file"
          accept="video/*"
          hidden
          onChange={(e) => pick(e.target.files?.[0])}
        />
        {file ? (
          <div className={styles.file}>
            <span className={styles.fileIcon} aria-hidden />
            <div className={styles.fileText}>
              <strong>{file.name}</strong>
              <span className="mono quiet">{size(file.size)}</span>
            </div>
            {!busy && (
              <button type="button" className="btn btn-link" onClick={() => setFile(null)}>
                Remove
              </button>
            )}
          </div>
        ) : (
          <>
            <span className={styles.dropIcon} aria-hidden>
              <svg viewBox="0 0 24 24">
                <path d="M12 16V5M7.5 9.5 12 5l4.5 4.5M5 19h14" />
              </svg>
            </span>
            <p className={styles.dropTitle}>Drop a video here</p>
            <p className="quiet">MP4, MOV, MKV or WebM, straight from your browser to storage.</p>
            <button type="button" className="btn btn-quiet" onClick={() => input.current?.click()}>
              Choose a file
            </button>
          </>
        )}
      </div>

      <div className={styles.row}>
        <label className={styles.label}>
          <span>Title</span>
          <input
            className="field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              file ? file.name.replace(/\.[^.]+$/, '') : 'Defaults to the file name or link'
            }
            disabled={busy}
          />
        </label>
        <button type="button" className="btn btn-primary" disabled={!file || busy} onClick={upload}>
          Upload and index
        </button>
      </div>

      {status.kind === 'busy' && (
        <div className={styles.progress} role="status">
          <div className={styles.progressHead}>
            <span>{status.label}</span>
            {status.fraction !== undefined && (
              <span className="mono">{Math.round(status.fraction * 100)}%</span>
            )}
          </div>
          <div className={styles.bar}>
            <span style={{ width: `${(status.fraction ?? 0.15) * 100}%` }} />
          </div>
        </div>
      )}
      {status.kind === 'error' && <p className={styles.error}>{status.message}</p>}

      <div className={styles.divider}>
        <span className="eyebrow">or from a link</span>
      </div>

      <form className={styles.link} onSubmit={addLink}>
        <input
          className="field"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://"
          aria-label="video link"
          disabled={busy}
        />
        <button type="submit" className="btn btn-quiet" disabled={!url.trim() || busy}>
          Add link
        </button>
      </form>
      <p className={styles.note}>
        Direct video links are downloaded as they are. Pages such as YouTube need yt-dlp on the
        worker.
      </p>
    </>
  );
}
