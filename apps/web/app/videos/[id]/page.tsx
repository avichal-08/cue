'use client';

import Link from 'next/link';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { api, formatMs } from '../../../lib/api';
import {
  applyEvent,
  statusAfter,
  toStages,
  useProgress,
  type StageState,
  type VideoStatus,
} from '../../../lib/progress';
import { StageBar } from '../stage-bar';
import styles from './detail.module.css';

interface Detail {
  id: string;
  title: string;
  status: VideoStatus;
  error: string | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  playbackUrl: string | null;
  stages: Partial<StageState>[];
}

interface Segment {
  id: string;
  idx: number;
  startMs: number;
  endMs: number;
  keyframeUrl: string | null;
  transcriptText: string | null;
  ocrText: string | null;
}

export default function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const player = useRef<HTMLVideoElement>(null);
  const [video, setVideo] = useState<Detail | null>(null);
  const [stages, setStages] = useState<StageState[]>(toStages());
  const [segments, setSegments] = useState<Segment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const detail = await api<Detail>(`/videos/${id}`);
      setVideo(detail);
      setStages(toStages(detail.stages));
      const { segments } = await api<{ segments: Segment[] }>(`/videos/${id}/segments`);
      setSegments(segments);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useProgress(id, (event) => {
    setStages((s) => applyEvent(s, event));
    setVideo((v) => (v ? { ...v, status: statusAfter(v.status, event) } : v));
    if (event.type === 'ready' || event.type === 'stage') void load();
  });

  async function retry() {
    setError(null);
    try {
      await api(`/videos/${id}/retry`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function seek(ms: number) {
    const el = player.current;
    if (!el) return;
    el.currentTime = ms / 1000;
    void el.play();
  }

  if (error && !video) return <p className={styles.error}>{error}</p>;
  if (!video) return <p className="muted">loading…</p>;

  return (
    <>
      <p>
        <Link href="/videos">← videos</Link>
      </p>
      <h1 className={styles.title}>{video.title}</h1>
      <p className="muted">
        {video.status} · {formatMs(video.durationMs)}
        {video.width ? ` · ${video.width}×${video.height} · ${video.fps} fps` : ''}
      </p>

      {video.status !== 'ready' && <StageBar stages={stages} />}
      {video.error && <p className={styles.error}>{video.error}</p>}
      {video.status === 'failed' && !video.error?.startsWith('duplicate of') && (
        <button onClick={() => void retry()}>retry</button>
      )}
      {error && <p className={styles.error}>{error}</p>}

      {video.playbackUrl && (
        <video ref={player} className={styles.player} src={video.playbackUrl} controls />
      )}

      <h2>segments</h2>
      {segments.length === 0 ? (
        <p className="muted">segments appear once the video is segmented.</p>
      ) : (
        <ol className={styles.segments}>
          {segments.map((s) => (
            <li key={s.id} className={styles.segment}>
              <button
                className={styles.thumb}
                onClick={() => seek(s.startMs)}
                title="play from here"
              >
                {s.keyframeUrl ? (
                  <img src={s.keyframeUrl} alt={`keyframe of segment ${s.idx + 1}`} />
                ) : (
                  <span>no frame</span>
                )}
                <span className={styles.time}>
                  {formatMs(s.startMs)}–{formatMs(s.endMs)}
                </span>
              </button>
              <div className={styles.text}>
                {s.transcriptText ? <p>{s.transcriptText}</p> : <p className="muted">no speech</p>}
                {s.ocrText && (
                  <details>
                    <summary>on screen</summary>
                    <pre>{s.ocrText}</pre>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
