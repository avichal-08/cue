'use client';

import Link from 'next/link';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { PageHeader } from '../../../../components/page-header';
import { api, formatMs, timecode } from '../../../../lib/api';
import {
  applyEvent,
  statusAfter,
  toStages,
  useProgress,
  type StageState,
  type VideoStatus,
} from '../../../../lib/progress';
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
  const [nowMs, setNowMs] = useState(0);
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
    if (event.type === 'ready' || (event.type === 'stage' && event.status !== 'running'))
      void load();
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
    void el.play().catch(() => undefined);
  }

  if (error && !video) return <p className={styles.error}>{error}</p>;
  if (!video) return <div className={styles.skeleton} aria-label="loading" />;

  const duration = video.durationMs ?? segments.at(-1)?.endMs ?? 0;
  const active = segments.find((s) => nowMs >= s.startMs && nowMs < s.endMs);
  const meta = [
    formatMs(video.durationMs),
    video.width ? `${video.width}×${video.height}` : null,
    video.fps ? `${video.fps} fps` : null,
  ].filter(Boolean);

  return (
    <>
      <Link href="/videos" className={styles.back}>
        ← Library
      </Link>
      <PageHeader
        eyebrow={video.status === 'ready' ? meta.join(' · ') : video.status}
        title={video.title}
        actions={
          video.status === 'failed' && !video.error?.startsWith('duplicate of') ? (
            <button className="btn btn-primary" onClick={() => void retry()}>
              Retry from the failed stage
            </button>
          ) : undefined
        }
      />

      {video.status !== 'ready' && (
        <div className={styles.progress}>
          <StageBar stages={stages} />
          {video.error && <p className={styles.error}>{video.error}</p>}
        </div>
      )}
      {error && <p className={styles.error}>{error}</p>}

      {video.playbackUrl && (
        <div className={styles.stage}>
          <video
            ref={player}
            src={video.playbackUrl}
            controls
            preload="metadata"
            onTimeUpdate={(e) => setNowMs(e.currentTarget.currentTime * 1000)}
          />
          {segments.length > 0 && duration > 0 && (
            <div className={styles.strip} role="group" aria-label="segments timeline">
              {segments.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`${styles.cell} ${active?.id === s.id ? styles.on : ''}`}
                  style={{ flexGrow: s.endMs - s.startMs }}
                  onClick={() => seek(s.startMs)}
                  title={`${timecode(s.startMs)} – ${timecode(s.endMs)}`}
                  aria-label={`play from ${timecode(s.startMs)}`}
                />
              ))}
              <span
                className={styles.head}
                style={{ left: `${Math.min(100, (nowMs / duration) * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}

      <div className={styles.sectionHead}>
        <h2>Segments</h2>
        <span className="mono quiet">{segments.length}</span>
      </div>

      {segments.length === 0 ? (
        <p className="quiet">Segments appear here once the video has been cut into scenes.</p>
      ) : (
        <ol className={styles.segments}>
          {segments.map((s) => (
            <li key={s.id} className={active?.id === s.id ? styles.current : undefined}>
              <button type="button" className={styles.thumb} onClick={() => seek(s.startMs)}>
                {s.keyframeUrl ? <img src={s.keyframeUrl} alt="" /> : <span />}
                <span className={`mono ${styles.time}`}>
                  {timecode(s.startMs)} → {timecode(s.endMs)}
                </span>
              </button>
              <div className={styles.text}>
                {s.transcriptText && <p>{s.transcriptText}</p>}
                {s.ocrText && s.transcriptText && (
                  <details className={styles.ocr}>
                    <summary>On screen</summary>
                    <pre>{s.ocrText}</pre>
                  </details>
                )}
                {s.ocrText && !s.transcriptText && (
                  <div className={styles.ocr}>
                    <span className="eyebrow">on screen</span>
                    <pre>{s.ocrText}</pre>
                  </div>
                )}
                {!s.transcriptText && !s.ocrText && (
                  <p className="quiet">Nothing said or written on screen here.</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
