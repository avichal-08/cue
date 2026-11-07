import { db, transcriptWords } from '@cue/db';
import { and, asc, eq, gt, lt } from 'drizzle-orm';

export const padMs = 400;
const lookaroundMs = 5_000;

export interface Span {
  startMs: number;
  endMs: number;
}

export interface WordTiming extends Span {
  word?: string;
}

export function snapToWords(
  span: Span,
  words: WordTiming[],
  { pad = padMs, durationMs = Infinity }: { pad?: number; durationMs?: number } = {},
): Span {
  let { startMs, endMs } = span;

  const startWord = words.find((w) => w.startMs < startMs && startMs < w.endMs);
  if (startWord) startMs = startWord.startMs;
  const endWord = words.find((w) => w.startMs < endMs && endMs < w.endMs);
  if (endWord) endMs = endWord.endMs;

  const before = words.filter((w) => w.endMs <= startMs).at(-1);
  const after = words.find((w) => w.startMs >= endMs);
  startMs = Math.max(0, startMs - pad, before?.endMs ?? 0);
  endMs = Math.min(durationMs, endMs + pad, after?.startMs ?? Infinity);

  return { startMs, endMs: Math.max(endMs, startMs) };
}

export async function loadWordsAround(
  spans: (Span & { videoId: string })[],
): Promise<WordTiming[][]> {
  if (!spans.length) return [];
  const queries = spans.map((s) =>
    db
      .select({ startMs: transcriptWords.startMs, endMs: transcriptWords.endMs })
      .from(transcriptWords)
      .where(
        and(
          eq(transcriptWords.videoId, s.videoId),
          gt(transcriptWords.endMs, s.startMs - lookaroundMs),
          lt(transcriptWords.startMs, s.endMs + lookaroundMs),
        ),
      )
      .orderBy(asc(transcriptWords.startMs)),
  );
  const [first, ...rest] = queries;
  return db.batch([first!, ...rest]);
}
