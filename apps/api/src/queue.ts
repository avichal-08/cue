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

export interface FailedJob {
  id: string;
  stage: Stage;
  videoId: string;
  error: string;
  attempts: number;
  failedAt: string | null;
}

export async function failedJobs(limit: number): Promise<FailedJob[]> {
  const perStage = await Promise.all(
    stages.map(async (stage) => {
      const jobs = await queues[stage].getFailed(0, limit - 1);
      return jobs.map((job) => ({
        id: job.id ?? '',
        stage,
        videoId: job.data.videoId,
        error: job.failedReason,
        attempts: job.attemptsMade,
        failedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
      }));
    }),
  );
  return perStage
    .flat()
    .sort((a, b) => (b.failedAt ?? '').localeCompare(a.failedAt ?? ''))
    .slice(0, limit);
}

export async function failedJob(stage: Stage, id: string) {
  const job = await queues[stage].getJob(id);
  return job && (await job.getState()) === 'failed' ? job : null;
}
