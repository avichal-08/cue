import { createHash } from 'node:crypto';
import type { EmbedRole } from '@cue/core';

export type TextField = 'transcript' | 'ocr';

export interface SegmentText {
  id: string;
  transcriptText: string | null;
  ocrText: string | null;
}

export interface TextJob {
  segmentId: string;
  field: TextField;
  hash: string;
}

export function hashText(text: string, role: EmbedRole = 'document') {
  return createHash('sha256').update(`${role}\n${text}`).digest('hex');
}

const clean = (text: string | null) => text?.replace(/\s+/g, ' ').trim() || undefined;

export function planTextJobs(segments: SegmentText[]) {
  const jobs: TextJob[] = [];
  const texts = new Map<string, string>();
  for (const s of segments) {
    for (const [field, raw] of [
      ['transcript', s.transcriptText],
      ['ocr', s.ocrText],
    ] as const) {
      const text = clean(raw);
      if (!text) continue;
      const hash = hashText(text);
      texts.set(hash, text);
      jobs.push({ segmentId: s.id, field, hash });
    }
  }
  return { jobs, texts };
}
