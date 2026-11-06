import { and, eq, sql } from 'drizzle-orm';
import { stages, type Stage } from '@cue/core';
import { db } from './client';
import { stageRuns } from './schema';

export async function getRun(videoId: string, stage: Stage) {
  const [run] = await db
    .select()
    .from(stageRuns)
    .where(and(eq(stageRuns.videoId, videoId), eq(stageRuns.stage, stage)))
    .limit(1);
  return run;
}

export async function startRun(videoId: string, stage: Stage) {
  const now = new Date();
  await db
    .insert(stageRuns)
    .values({ videoId, stage, status: 'running', attempts: 1, startedAt: now })
    .onConflictDoUpdate({
      target: [stageRuns.videoId, stageRuns.stage],
      set: {
        status: 'running',
        attempts: sql`${stageRuns.attempts} + 1`,
        progress: 0,
        error: null,
        startedAt: now,
        finishedAt: null,
      },
    });
}

export async function finishRun(videoId: string, stage: Stage, inputHash: string) {
  await db
    .update(stageRuns)
    .set({ status: 'done', inputHash, progress: 100, error: null, finishedAt: new Date() })
    .where(and(eq(stageRuns.videoId, videoId), eq(stageRuns.stage, stage)));
}

export async function failRun(videoId: string, stage: Stage, error: string, final: boolean) {
  await db
    .update(stageRuns)
    .set({ status: final ? 'failed' : 'queued', error, finishedAt: final ? new Date() : null })
    .where(and(eq(stageRuns.videoId, videoId), eq(stageRuns.stage, stage)));
}

export async function setRunProgress(videoId: string, stage: Stage, progress: number) {
  await db
    .update(stageRuns)
    .set({ progress })
    .where(and(eq(stageRuns.videoId, videoId), eq(stageRuns.stage, stage)));
}

export async function firstUnfinishedStage(videoId: string): Promise<Stage | undefined> {
  const runs = await db
    .select({ stage: stageRuns.stage, status: stageRuns.status })
    .from(stageRuns)
    .where(eq(stageRuns.videoId, videoId));
  const done = new Set(runs.filter((r) => r.status === 'done').map((r) => r.stage));
  return stages.find((s) => !done.has(s));
}
