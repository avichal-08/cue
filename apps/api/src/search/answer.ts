import { ProviderError, type AnswerSource } from '@cue/core';
import { db, segments, videos } from '@cue/db';
import { and, asc, eq, gt, inArray, lt } from 'drizzle-orm';
import { HttpError } from '../errors';
import { answerer } from '../models';

export interface ClipRef {
  videoId: string;
  startMs: number;
  endMs: number;
}

interface SegmentText {
  transcriptText: string | null;
  ocrText: string | null;
}

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function sourceText(title: string, clip: ClipRef, parts: SegmentText[]) {
  const said = [...new Set(parts.map((p) => p.transcriptText?.trim()).filter(Boolean))];
  const shown = [
    ...new Set(parts.map((p) => p.ocrText?.replace(/\s+/g, ' ').trim()).filter(Boolean)),
  ];
  const lines = [`video "${title}" at ${clock(clip.startMs)}-${clock(clip.endMs)}`];
  if (said.length) lines.push(`said: ${said.join(' ')}`);
  if (shown.length) lines.push(`on screen: ${shown.join(' | ')}`);
  if (!said.length && !shown.length) lines.push('(no speech or on-screen text)');
  return lines.join('\n');
}

export async function loadSources(clips: ClipRef[]): Promise<AnswerSource[]> {
  const ids = [...new Set(clips.map((c) => c.videoId))];
  const titles = new Map(
    (
      await db
        .select({ id: videos.id, title: videos.title })
        .from(videos)
        .where(inArray(videos.id, ids))
    ).map((v) => [v.id, v.title]),
  );
  const queries = clips.map((c) =>
    db
      .select({ transcriptText: segments.transcriptText, ocrText: segments.ocrText })
      .from(segments)
      .where(
        and(
          eq(segments.videoId, c.videoId),
          gt(segments.endMs, c.startMs),
          lt(segments.startMs, c.endMs),
        ),
      )
      .orderBy(asc(segments.startMs)),
  );
  const [first, ...rest] = queries;
  const parts = await db.batch([first!, ...rest]);
  return clips.map((c, i) => ({
    ...c,
    text: sourceText(titles.get(c.videoId) ?? 'untitled', c, parts[i] ?? []),
  }));
}

export async function answerQuestion(query: string, clips: ClipRef[]) {
  const started = performance.now();
  const model = answerer();
  const sources = await loadSources(clips);
  try {
    const answer = await model.answer(query, sources);
    return {
      answer: answer.text,
      grounded: answer.grounded,
      citations: answer.citations.map(({ n, videoId, startMs, endMs }) => ({
        n,
        videoId,
        startMs,
        endMs,
      })),
      model: model.id,
      ms: Math.round(performance.now() - started),
    };
  } catch (err) {
    if (err instanceof ProviderError && err.status === 429)
      throw new HttpError(429, 'answers are busy, try again shortly');
    if (err instanceof ProviderError) throw new HttpError(502, 'answer generation failed');
    throw err;
  }
}
