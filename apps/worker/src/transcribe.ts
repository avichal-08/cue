import { UnrecoverableError } from 'bullmq';
import { objectExists, presignGet } from '@cue/core';
import { db, videos } from '@cue/db';
import { eq } from 'drizzle-orm';
import { audioKey, cutAudio } from './audio';
import { planChunks, stitch, type ChunkResult } from './chunks';
import type { Handler } from './handlers';
import { asJobError, stt } from './models';

const maxUploadBytes = 25 * 1024 * 1024;

export const transcribe: Handler = async (job, ctx) => {
  const { videoId } = job.data;
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video?.durationMs) throw new UnrecoverableError('decode has not run');

  const key = audioKey(videoId);
  if (!(await objectExists(key))) {
    console.log(`[transcribe] ${videoId} no audio, skipped`);
    return;
  }

  const model = stt();
  const input = await presignGet(key);
  const chunks = planChunks(video.durationMs);
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

  const transcript = stitch(parts);
  console.log(
    `[transcribe] ${videoId} ${chunks.length} chunks, ${transcript.words.length} words ` +
      `(${transcript.language ?? '?'}): ${transcript.text.slice(0, 80)}`,
  );
};
