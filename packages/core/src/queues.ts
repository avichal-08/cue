import { createHash } from 'node:crypto';
import type { DefaultJobOptions, Queue } from 'bullmq';

export const stages = ['decode', 'segment', 'transcribe', 'see', 'index'] as const;
export type Stage = (typeof stages)[number];

export const queueName = (stage: Stage) => `cue-${stage}`;

export function nextStage(stage: Stage): Stage | undefined {
  return stages[stages.indexOf(stage) + 1];
}

export function stagesAfter(stage: Stage): Stage[] {
  return stages.slice(stages.indexOf(stage) + 1);
}

export interface StageJob {
  videoId: string;
  stage: Stage;
}

export const stageJobId = (videoId: string, stage: Stage) => `${videoId}-${stage}`;

export const stageVersions: Record<Stage, number> = {
  decode: 1,
  segment: 1,
  transcribe: 1,
  see: 1,
  index: 1,
};

export function stageInputHash(stage: Stage, source: string, upstream?: string) {
  return createHash('sha256')
    .update(`${stage}@${stageVersions[stage]}:${source}:${upstream ?? ''}`)
    .digest('hex');
}

export async function enqueueStage(queue: Queue<StageJob>, videoId: string, stage: Stage) {
  const jobId = stageJobId(videoId, stage);
  const job = await queue.getJob(jobId);
  if (job) {
    const state = await job.getState();
    if (state === 'failed') {
      await job.retry('failed', { resetAttemptsMade: true, resetAttemptsStarted: true });
      return;
    }
    if (state !== 'completed') return;
    await job.remove();
  }
  await queue.add(stage, { videoId, stage }, { jobId });
}

export const defaultJobOptions: DefaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: 1_000,
  removeOnFail: 5_000,
};

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

export const progressChannel = (videoId: string) => `cue:progress:${videoId}`;
