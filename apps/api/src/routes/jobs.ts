import { stages } from '@cue/core';
import { db, firstUnfinishedStage, videos } from '@cue/db';
import { eq, inArray } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../errors';
import { enqueueFrom, failedJob, failedJobs } from '../queue';

export const jobs = Router();

const listQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });
const jobParams = z.object({ stage: z.enum(stages), id: z.string().min(1) });

jobs.get('/failed', async (req, res) => {
  const { limit } = listQuery.parse(req.query);
  const failed = await failedJobs(limit);
  const ids = [...new Set(failed.map((j) => j.videoId))];
  const rows = ids.length
    ? await db
        .select({ id: videos.id, title: videos.title, status: videos.status })
        .from(videos)
        .where(inArray(videos.id, ids))
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  res.json({
    jobs: failed.map((j) => ({
      ...j,
      title: byId.get(j.videoId)?.title ?? null,
      videoStatus: byId.get(j.videoId)?.status ?? null,
    })),
  });
});

async function loadFailed(params: unknown) {
  const { stage, id } = jobParams.parse(params);
  const job = await failedJob(stage, id);
  if (!job) throw new HttpError(404, 'no failed job with that id');
  return job;
}

jobs.post('/:stage/:id/retry', async (req, res) => {
  const job = await loadFailed(req.params);
  const { videoId } = job.data;
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video) {
    await job.remove();
    throw new HttpError(410, 'the video is gone, so the job was discarded');
  }
  const from = (await firstUnfinishedStage(videoId)) ?? job.data.stage;
  await db.update(videos).set({ status: 'pending', error: null }).where(eq(videos.id, videoId));
  await enqueueFrom(videoId, from);
  res.status(202).json({ videoId, from });
});

jobs.delete('/:stage/:id', async (req, res) => {
  const job = await loadFailed(req.params);
  await job.remove();
  res.status(204).end();
});
