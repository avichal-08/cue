import { db, providerCalls, stageRuns, videos } from '@cue/db';
import { and, asc, eq, gte, isNotNull, lte, sql, type AnyColumn } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';

const total = (column: AnyColumn) => sql<number>`coalesce(sum(${column}), 0)::int`;

const usageColumns = {
  provider: providerCalls.provider,
  model: providerCalls.model,
  operation: providerCalls.operation,
  calls: sql<number>`count(*)::int`,
  failed: sql<number>`count(*) filter (where not ${providerCalls.ok})::int`,
  ms: total(providerCalls.ms),
  audioMs: total(providerCalls.audioMs),
  inputTokens: total(providerCalls.inputTokens),
  outputTokens: total(providerCalls.outputTokens),
  images: total(providerCalls.images),
  texts: total(providerCalls.texts),
  chars: total(providerCalls.chars),
};

const usageGroup = [providerCalls.provider, providerCalls.model, providerCalls.operation];

export const stats = Router();

stats.get('/ingest', async (_req, res) => {
  const [list, runs, usage] = await db.batch([
    db
      .select({
        id: videos.id,
        title: videos.title,
        status: videos.status,
        durationMs: videos.durationMs,
        createdAt: videos.createdAt,
      })
      .from(videos)
      .orderBy(asc(videos.createdAt)),
    db
      .select({
        videoId: stageRuns.videoId,
        stage: stageRuns.stage,
        status: stageRuns.status,
        attempts: stageRuns.attempts,
        startedAt: stageRuns.startedAt,
        finishedAt: stageRuns.finishedAt,
      })
      .from(stageRuns),
    db
      .select({ videoId: providerCalls.videoId, ...usageColumns })
      .from(providerCalls)
      .where(isNotNull(providerCalls.videoId))
      .groupBy(providerCalls.videoId, ...usageGroup),
  ]);

  res.json({
    videos: list.map((v) => ({
      ...v,
      stages: runs.filter((r) => r.videoId === v.id).map(({ videoId: _v, ...r }) => r),
      usage: usage.filter((u) => u.videoId === v.id).map(({ videoId: _v, ...u }) => u),
    })),
  });
});

const usageQuery = z.object({
  since: z.string().datetime(),
  until: z.string().datetime().optional(),
  source: z.string().min(1).optional(),
});

stats.get('/usage', async (req, res) => {
  const { since, until, source } = usageQuery.parse(req.query);
  const rows = await db
    .select({ source: providerCalls.source, ...usageColumns })
    .from(providerCalls)
    .where(
      and(
        gte(providerCalls.at, new Date(since)),
        until ? lte(providerCalls.at, new Date(until)) : undefined,
        source ? eq(providerCalls.source, source) : undefined,
      ),
    )
    .groupBy(providerCalls.source, ...usageGroup);
  res.json({ since, until: until ?? null, usage: rows });
});
