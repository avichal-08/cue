import type { Job } from 'bullmq';
import type { Stage, StageJob } from '@cue/core';
import { decode } from './decode';
import { segment } from './segment';
import { transcribe } from './transcribe';

export interface StageContext {
  progress(percent: number): Promise<void>;
}

export type Handler = (job: Job<StageJob>, ctx: StageContext) => Promise<void>;

const stub: Handler = (job) => {
  console.log(`[${job.data.stage}] ${job.data.videoId} (stub)`);
  return Promise.resolve();
};

export const handlers: Record<Stage, Handler> = {
  decode,
  segment,
  transcribe,
  see: stub,
  index: stub,
};
