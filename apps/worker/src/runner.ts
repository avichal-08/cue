import { UnrecoverableError, type Job, type Queue } from 'bullmq';
import {
  enqueueStage,
  nextStage,
  stageInputHash,
  stages,
  type Stage,
  type StageJob,
} from '@cue/core';
import { db, failRun, finishRun, getRun, setRunProgress, startRun, videos } from '@cue/db';
import { eq } from 'drizzle-orm';
import type { Handler } from './handlers';
import { publish } from './progress';

type Video = typeof videos.$inferSelect;

const sourceKey = (v: Video) => (v.sourceType === 'url' ? v.sourceUrl : v.contentHash) ?? v.id;

async function loadVideo(id: string) {
  const [video] = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  if (!video) throw new UnrecoverableError('video not found');
  return video;
}

async function setVideo(id: string, set: Partial<Video>) {
  await db.update(videos).set(set).where(eq(videos.id, id));
}

async function inputHashFor(video: Video, stage: Stage) {
  const prev = stages[stages.indexOf(stage) - 1];
  if (!prev) return stageInputHash(stage, sourceKey(video));
  const upstream = await getRun(video.id, prev);
  if (upstream?.status !== 'done' || !upstream.inputHash)
    throw new UnrecoverableError(`${prev} has not finished`);
  return stageInputHash(stage, sourceKey(video), upstream.inputHash);
}

async function execute(job: Job<StageJob>, handler: Handler, inputHash: string) {
  const { videoId, stage } = job.data;
  await startRun(videoId, stage);
  await publish({ type: 'stage', videoId, stage, status: 'running' });

  try {
    await handler(job, {
      progress: async (progress) => {
        await setRunProgress(videoId, stage, progress);
        await publish({ type: 'progress', videoId, stage, progress });
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const final =
      err instanceof UnrecoverableError || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    await failRun(videoId, stage, error, final);
    if (final) {
      await setVideo(videoId, { status: 'failed', error });
      await publish({ type: 'stage', videoId, stage, status: 'failed', error });
    }
    throw err;
  }

  await finishRun(videoId, stage, inputHash);
  await publish({ type: 'stage', videoId, stage, status: 'done' });
}

export async function runStage(
  job: Job<StageJob>,
  handler: Handler,
  queues: Record<Stage, Queue<StageJob>>,
) {
  const { videoId, stage } = job.data;
  const video = await loadVideo(videoId);
  if (video.status !== 'processing') await setVideo(videoId, { status: 'processing', error: null });

  const inputHash = await inputHashFor(video, stage);
  const run = await getRun(videoId, stage);
  if (run?.status === 'done' && run.inputHash === inputHash) {
    console.log(`[${stage}] ${videoId} unchanged, skipped`);
  } else {
    await execute(job, handler, inputHash);
  }

  const next = nextStage(stage);
  if (next) {
    await enqueueStage(queues[next], videoId, next);
    return;
  }
  await setVideo(videoId, { status: 'ready', error: null });
  await publish({ type: 'ready', videoId });
}
