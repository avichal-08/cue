import { Queue, Worker } from 'bullmq';
import { defaultJobOptions, env, nextStage, queueName, stages, type StageJob } from '@cue/core';
import { handlers } from './handlers';

const connection = { url: env().REDIS_URL };

const queues = Object.fromEntries(
  stages.map((s) => [s, new Queue<StageJob>(queueName(s), { connection, defaultJobOptions })]),
);

const workers = stages.map(
  (stage) =>
    new Worker<StageJob>(
      queueName(stage),
      async (job) => {
        await handlers[stage](job);
        const next = nextStage(stage);
        if (next) await queues[next]!.add(next, { videoId: job.data.videoId, stage: next });
      },
      { connection },
    ),
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
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
