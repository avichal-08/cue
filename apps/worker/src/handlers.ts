import type { Job } from 'bullmq';
import type { Stage, StageJob } from '@cue/core';
import { fetchSource } from './source';

export interface StageContext {
  progress(percent: number): Promise<void>;
}

export type Handler = (job: Job<StageJob>, ctx: StageContext) => Promise<void>;

const stub: Handler = (job) => {
  console.log(`[${job.data.stage}] ${job.data.videoId} (stub)`);
  return Promise.resolve();
};

export const handlers: Record<Stage, Handler> = {
  decode: async (job, ctx) => {
    await fetchSource(job.data.videoId);
    await stub(job, ctx);
  },
  segment: stub,
  transcribe: stub,
  see: stub,
  index: stub,
};
