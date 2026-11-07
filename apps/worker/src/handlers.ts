import type { Job } from 'bullmq';
import type { Stage, StageJob } from '@cue/core';
import { decode } from './decode';
import { indexText } from './indexing';
import { see } from './see';
import { segment } from './segment';
import { transcribe } from './transcribe';

export interface StageContext {
  progress(percent: number): Promise<void>;
}

export type Handler = (job: Job<StageJob>, ctx: StageContext) => Promise<void>;

export const handlers: Record<Stage, Handler> = {
  decode,
  segment,
  transcribe,
  see,
  index: indexText,
};
