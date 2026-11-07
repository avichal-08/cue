import { api } from './api';
import type { SearchClip } from './search';

export interface AnswerCitation {
  n: number;
  videoId: string;
  startMs: number;
  endMs: number;
}

export interface AnswerResponse {
  answer: string;
  grounded: boolean;
  citations: AnswerCitation[];
  model: string;
  ms: number;
}

export const answerSources = 5;

export function askAnswer(q: string, clips: SearchClip[]) {
  return api<AnswerResponse>('/answer', {
    method: 'POST',
    body: JSON.stringify({
      q,
      clips: clips
        .slice(0, answerSources)
        .map(({ videoId, startMs, endMs }) => ({ videoId, startMs, endMs })),
    }),
  });
}
