import { useEffect, useRef } from 'react';
import { apiUrl } from './api';

export const stages = ['decode', 'segment', 'transcribe', 'see', 'index'] as const;
export type Stage = (typeof stages)[number];
export type RunStatus = 'queued' | 'running' | 'done' | 'failed';
export type VideoStatus = 'pending' | 'processing' | 'ready' | 'failed';

export interface StageState {
  stage: Stage;
  status: RunStatus;
  progress: number;
  error?: string | null;
}

export type ProgressEvent =
  | {
      type: 'stage';
      videoId: string;
      stage: Stage;
      status: 'running' | 'done' | 'failed';
      error?: string;
    }
  | { type: 'progress'; videoId: string; stage: Stage; progress: number }
  | { type: 'ready'; videoId: string };

export function toStages(runs: Partial<StageState>[] = []): StageState[] {
  return stages.map((stage) => {
    const run = runs.find((r) => r.stage === stage);
    return {
      stage,
      status: run?.status ?? 'queued',
      progress: run?.progress ?? 0,
      error: run?.error,
    };
  });
}

export function applyEvent(current: StageState[], event: ProgressEvent): StageState[] {
  if (event.type === 'ready') return current.map((s) => ({ ...s, status: 'done', progress: 100 }));
  const at = stages.indexOf(event.stage);
  return current.map((s, i) => {
    if (i < at) return s;
    if (i > at) {
      return event.type === 'stage' && event.status === 'running'
        ? { ...s, status: 'queued', progress: 0, error: null }
        : s;
    }
    if (event.type === 'progress') return { ...s, status: 'running', progress: event.progress };
    return {
      ...s,
      status: event.status,
      progress: event.status === 'done' ? 100 : event.status === 'running' ? 0 : s.progress,
      error: event.error ?? null,
    };
  });
}

export function statusAfter(status: VideoStatus, event: ProgressEvent): VideoStatus {
  if (event.type === 'ready') return 'ready';
  if (event.type === 'stage' && event.status === 'failed') return 'failed';
  if (event.type === 'stage' && event.status === 'running') return 'processing';
  return status;
}

export function useProgress(videoId: string | undefined, onEvent: (event: ProgressEvent) => void) {
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });

  useEffect(() => {
    const source = new EventSource(`${apiUrl}/events${videoId ? `?video=${videoId}` : ''}`);
    source.onmessage = (message: MessageEvent<string>) =>
      handler.current(JSON.parse(message.data) as ProgressEvent);
    return () => source.close();
  }, [videoId]);
}
