import type { DefaultJobOptions } from "bullmq";

export const stages = ["decode", "segment", "transcribe", "see", "index"] as const;
export type Stage = (typeof stages)[number];

export const queueName = (stage: Stage) => `cue-${stage}`;

export function nextStage(stage: Stage): Stage | undefined {
  return stages[stages.indexOf(stage) + 1];
}

export interface StageJob {
  videoId: string;
  stage: Stage;
}

export const defaultJobOptions: DefaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: 1_000,
  removeOnFail: 5_000,
};

export type ProgressEvent =
  | { type: "stage"; videoId: string; stage: Stage; status: "running" | "done" | "failed"; error?: string }
  | { type: "progress"; videoId: string; stage: Stage; progress: number }
  | { type: "ready"; videoId: string };

export const progressChannel = (videoId: string) => `cue:progress:${videoId}`;
