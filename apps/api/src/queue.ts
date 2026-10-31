import { Queue } from 'bullmq';
import { defaultJobOptions, env, queueName, type StageJob } from '@cue/core';

const decode = new Queue<StageJob>(queueName('decode'), {
  connection: { url: env().REDIS_URL },
  defaultJobOptions,
});

export async function enqueueIngest(videoId: string) {
  await decode.add('decode', { videoId, stage: 'decode' }, { jobId: `${videoId}-decode` });
}
