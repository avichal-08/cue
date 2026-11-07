import type { Transcript, Word } from '@cue/core';
import type { Span } from './bounds';

export const chunkMs = 10 * 60_000;
export const overlapMs = 5_000;
const matchToleranceMs = 1_000;

export function planChunks(durationMs: number, size = chunkMs, overlap = overlapMs): Span[] {
  if (durationMs <= 0) return [];
  if (overlap >= size) throw new Error('overlap must be smaller than chunk size');
  const chunks: Span[] = [];
  for (let startMs = 0; ; startMs += size - overlap) {
    const endMs = Math.min(startMs + size, durationMs);
    chunks.push({ startMs, endMs });
    if (endMs >= durationMs) return chunks;
  }
}

export interface ChunkResult {
  chunk: Span;
  transcript: Transcript;
}

const norm = (word: string) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

function shift(words: Word[], byMs: number): Word[] {
  return words.map((w) => ({ ...w, startMs: w.startMs + byMs, endMs: w.endMs + byMs }));
}

function join(kept: Word[], next: Word[], overlap: Span): Word[] {
  const mid = (overlap.startMs + overlap.endMs) / 2;
  let best: { i: number; j: number; distance: number } | undefined;
  kept.forEach((a, i) => {
    if (a.startMs < overlap.startMs) return;
    next.forEach((b, j) => {
      if (b.startMs >= overlap.endMs || !norm(a.word) || norm(a.word) !== norm(b.word)) return;
      if (Math.abs(a.startMs - b.startMs) > matchToleranceMs) return;
      const distance = Math.abs((a.startMs + b.startMs) / 2 - mid);
      if (!best || distance < best.distance) best = { i, j, distance };
    });
  });
  if (best) return [...kept.slice(0, best.i), ...next.slice(best.j)];
  return [...kept.filter((w) => w.startMs < mid), ...next.filter((w) => w.startMs >= mid)];
}

export function stitch(parts: ChunkResult[]): Transcript {
  let words: Word[] = [];
  parts.forEach(({ chunk, transcript }, i) => {
    const shifted = shift(transcript.words, chunk.startMs);
    const prev = parts[i - 1]?.chunk;
    words = prev ? join(words, shifted, { startMs: chunk.startMs, endMs: prev.endMs }) : shifted;
  });
  return {
    text: words.map((w) => w.word).join(' '),
    language: parts.find((p) => p.transcript.language)?.transcript.language,
    words,
  };
}
