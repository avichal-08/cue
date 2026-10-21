import type { Job } from "bullmq";
import type { Stage, StageJob } from "@cue/core";

export type Handler = (job: Job<StageJob>) => Promise<void>;

const stub: Handler = async (job) => {
  console.log(`[${job.data.stage}] ${job.data.videoId} (stub)`);
};

export const handlers: Record<Stage, Handler> = {
  decode: stub,
  segment: stub,
  transcribe: stub,
  see: stub,
  index: stub,
};
