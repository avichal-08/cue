import type { Job } from 'bullmq';
import type { Stage, StageJob } from '@cue/core';
import { fetchSource } from './source';

export type Handler = (job: Job<StageJob>) => Promise<void>;

const stub: Handler = async (job) => {
  console.log(`[${job.data.stage}] ${job.data.videoId} (stub)`);
};

export const handlers: Record<Stage, Handler> = {
  decode: async (job) => {
    await fetchSource(job.data.videoId);
    await stub(job);
  },
  segment: stub,
  transcribe: stub,
  see: stub,
  index: stub,
};
