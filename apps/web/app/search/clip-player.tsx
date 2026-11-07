'use client';

import { useEffect, useRef } from 'react';
import styles from './player.module.css';

export interface PlayerClip {
  key: string;
  src: string;
  title: string;
  startMs: number;
  endMs: number;
}

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function ClipPlayer({ clip }: { clip: PlayerClip }) {
  const video = useRef<HTMLVideoElement>(null);
  const stopAt = useRef<number | null>(clip.endMs / 1000);

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
      <figcaption className={styles.caption}>
        <span>
          <strong>{clip.title}</strong> · {clock(clip.startMs)}–{clock(clip.endMs)}
        </span>
        <button type="button" onClick={playClip}>
          replay clip
        </button>
      </figcaption>
    </figure>
  );
}
