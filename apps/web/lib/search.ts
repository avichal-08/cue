import { api } from './api';

export type Modality = 'transcript' | 'ocr' | 'visual' | 'keyword';

export interface ClipSegment {
  segmentId: string;
  startMs: number;
  endMs: number;
  transcriptText: string | null;
  ocrText: string | null;
}

export interface SearchClip {
  videoId: string;
  title: string;
  startMs: number;
  endMs: number;
  score: number | null;
  reason: string | null;
  fusedScore: number;
  matchedBy: Partial<Record<Modality, { rank: number; score: number }>>;
  keyframeUrl: string | null;
  playbackUrl: string | null;
  segments: ClipSegment[];
}

export interface SearchResponse {
  query: string;
  filters: { videoId?: string; fromMs?: number; toMs?: number };
  clips: SearchClip[];
  meta: {
    candidates: number;
    queryCached: boolean;
    reranked: boolean;
    rerankError: string | null;
    keyframes: boolean;
    timings: {
      embedMs: number;
      retrieveMs: number;
      rerankMs: number;
      clipsMs: number;
      totalMs: number;
    };
  };
}

export function search(q: string, keyframes: boolean, limit = 10) {
  return api<SearchResponse>('/search', {
    method: 'POST',
    body: JSON.stringify({ q, keyframes, limit }),
  });
}

export const clipKey = (c: SearchClip) => `${c.videoId}:${c.startMs}`;
