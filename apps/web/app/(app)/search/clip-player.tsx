'use client';

import { useEffect, useRef, useState } from 'react';
import { timecode } from '../../../lib/api';
import styles from './player.module.css';

export interface PlayerClip {
  key: string;
  src: string;
  title: string;
  startMs: number;
  endMs: number;
}

export function ClipPlayer({ clip }: { clip: PlayerClip }) {
  const video = useRef<HTMLVideoElement>(null);
  const stopAt = useRef<number | null>(clip.endMs / 1000);
  const [nowMs, setNowMs] = useState(clip.startMs);

  function playClip() {
    const el = video.current;
    if (!el) return;
    stopAt.current = clip.endMs / 1000;
    el.currentTime = clip.startMs / 1000;
    void el.play().catch(() => undefined);
  }

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const start = () => playClip();
    if (el.readyState >= 1) start();
    else el.addEventListener('loadedmetadata', start, { once: true });
    return () => el.removeEventListener('loadedmetadata', start);
  }, [clip.key, clip.src]);

  function onTimeUpdate() {
    const el = video.current;
    if (el) setNowMs(el.currentTime * 1000);
    if (el && stopAt.current !== null && el.currentTime >= stopAt.current) {
      el.pause();
      stopAt.current = null;
    }
  }

  function onSeeked() {
    const el = video.current;
    if (el && stopAt.current !== null && el.currentTime < clip.startMs / 1000 - 0.5) {
      stopAt.current = null;
    }
  }

  const span = Math.max(1, clip.endMs - clip.startMs);
  const fraction = Math.min(1, Math.max(0, (nowMs - clip.startMs) / span));

  return (
    <figure className={styles.player}>
      <video
        ref={video}
        src={clip.src}
        controls
        preload="metadata"
        onTimeUpdate={onTimeUpdate}
        onSeeked={onSeeked}
      />
      <div className={styles.clipBar} aria-hidden>
        <span style={{ width: `${fraction * 100}%` }} />
      </div>
      <figcaption className={styles.caption}>
        <strong>{clip.title}</strong>
        <span className="mono quiet">
          {timecode(clip.startMs)} → {timecode(clip.endMs)}
        </span>
        <button type="button" className="btn btn-quiet" onClick={playClip}>
          Replay clip
        </button>
      </figcaption>
    </figure>
  );
}
