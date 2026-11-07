import { UnrecoverableError } from 'bullmq';
import { objectExists, presignGet, type Transcript } from '@cue/core';
import { db, segments, transcriptWords, videos } from '@cue/db';
import { asc, eq } from 'drizzle-orm';
import { audioKey, cutAudio } from './audio';
import { planChunks, stitch, type ChunkResult } from './chunks';
import type { Handler, StageContext } from './handlers';
import { asJobError, stt } from './models';
import { placeWords, segmentTexts } from './words';

const maxUploadBytes = 25 * 1024 * 1024;
const insertChunk = 1_000;

async function transcribeAudio(
  key: string,
  durationMs: number,
  ctx: StageContext,
): Promise<Transcript> {
  const model = stt();
  const input = await presignGet(key);
  const chunks = planChunks(durationMs);
  const parts: ChunkResult[] = [];
  for (const [i, chunk] of chunks.entries()) {
    const audio = await cutAudio(input, chunk);
    if (audio.length > maxUploadBytes)
      throw new UnrecoverableError(`audio chunk ${i} is ${audio.length} bytes, over 25 MB`);
    const transcript = await model.transcribe(audio, 'audio/flac').catch((err: unknown) => {
      throw asJobError(err);
    });
    parts.push({ chunk, transcript });
    await ctx.progress(Math.round(((i + 1) / chunks.length) * 80));
  }
  return stitch(parts);
}

export const transcribe: Handler = async (job, ctx) => {
  const { videoId } = job.data;
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video?.durationMs) throw new UnrecoverableError('decode has not run');

  const key = audioKey(videoId);
  const transcript = (await objectExists(key))
    ? await transcribeAudio(key, video.durationMs, ctx)
    : undefined;

  const segs = await db
    .select({ id: segments.id, startMs: segments.startMs, endMs: segments.endMs })
    .from(segments)
    .where(eq(segments.videoId, videoId))
    .orderBy(asc(segments.startMs));
  const placed = placeWords(segs, transcript?.words ?? []);
  const texts = segmentTexts(segs, placed);

  const inserts = [];
  for (let i = 0; i < placed.length; i += insertChunk) {
    const values = placed.slice(i, i + insertChunk).map((w) => ({
      videoId,
      segmentId: w.segmentId,
      startMs: w.startMs,
      endMs: w.endMs,
      word: w.word,
    }));
    inserts.push(db.insert(transcriptWords).values(values));
  }
  const updates = [...texts].map(([id, transcriptText]) =>
    db.update(segments).set({ transcriptText }).where(eq(segments.id, id)),
  );
  await db.batch([
    db.delete(transcriptWords).where(eq(transcriptWords.videoId, videoId)),
    ...inserts,
    ...updates,
  ]);

  const spoken = [...texts.values()].filter(Boolean).length;
  console.log(
    `[transcribe] ${videoId} ` +
      (transcript
        ? `${placed.length} words (${transcript.language ?? '?'}) in ${spoken}/${segs.length} segments`
        : 'no audio, transcript cleared'),
  );
};
