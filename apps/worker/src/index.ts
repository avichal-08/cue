import { Queue, Worker } from 'bullmq';
import { defaultJobOptions, env, queueName, stages, type Stage, type StageJob } from '@cue/core';
import { handlers } from './handlers';
import { redis } from './progress';
import { runStage } from './runner';

const connection = { url: env().REDIS_URL };

const queues = Object.fromEntries(
  stages.map((s) => [s, new Queue<StageJob>(queueName(s), { connection, defaultJobOptions })]),
) as Record<Stage, Queue<StageJob>>;

const workers = stages.map(
  (stage) =>
    new Worker<StageJob>(queueName(stage), (job) => runStage(job, handlers[stage], queues), {
      connection,
    }),
);

for (const w of workers) {
  w.on('failed', (job, err) => console.error(`[${w.name}] ${job?.id} failed: ${err.message}`));
}

console.log(`worker registered: ${workers.map((w) => w.name).join(', ')}`);

async function shutdown() {
  await Promise.all([
    ...workers.map((w) => w.close()),
    ...Object.values(queues).map((q) => q.close()),
  ]);
  redis.disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
