import { Queue } from 'bullmq';
import {
  defaultJobOptions,
  enqueueStage,
  env,
  queueName,
  stageJobId,
  stages,
  type Stage,
  type StageJob,
} from '@cue/core';

const connection = { url: env().REDIS_URL };

const queues = Object.fromEntries(
  stages.map((s) => [s, new Queue<StageJob>(queueName(s), { connection, defaultJobOptions })]),
) as Record<Stage, Queue<StageJob>>;

export async function enqueueIngest(videoId: string) {
  await queues.decode.add(
    'decode',
    { videoId, stage: 'decode' },
    { jobId: stageJobId(videoId, 'decode') },
  );
}

export async function enqueueFrom(videoId: string, stage: Stage) {
  await enqueueStage(queues[stage], videoId, stage);
}
