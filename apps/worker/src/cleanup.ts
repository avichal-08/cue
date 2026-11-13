import { deleteObjects, listObjects } from '@cue/core';
import { db, videos } from '@cue/db';
import { inArray } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const abandonAfterMs = 24 * 60 * 60_000;

interface VideoRow {
  id: string;
  sourceType: string;
  status: string;
  contentHash: string | null;
  createdAt: Date;
}

export const videoIdOf = (key: string) => /^videos\/([^/]+)\//.exec(key)?.[1] ?? null;

export function isAbandoned(v: VideoRow, now: number) {
  return (
    v.sourceType === 'upload' &&
    v.status === 'pending' &&
    !v.contentHash &&
    now - v.createdAt.getTime() > abandonAfterMs
  );
}

export function planCleanup(
  objects: { key: string; size: number }[],
  rows: VideoRow[],
  now = Date.now(),
) {
  const known = new Map(rows.map((r) => [r.id, r]));
  const abandoned = rows.filter((r) => isAbandoned(r, now)).map((r) => r.id);
  const drop = new Set(abandoned);
  const orphans = objects.filter((o) => {
    const id = videoIdOf(o.key);
    return id !== null && (!known.has(id) || drop.has(id));
  });
  return {
    abandoned,
    objects: orphans,
    bytes: orphans.reduce((n, o) => n + o.size, 0),
  };
}

async function main() {
  const apply = process.argv.includes('--delete');
  const objects = await listObjects('videos/');
  const ids = [...new Set(objects.flatMap((o) => videoIdOf(o.key) ?? []))];
  const rows = await db
    .select({
      id: videos.id,
      sourceType: videos.sourceType,
      status: videos.status,
      contentHash: videos.contentHash,
      createdAt: videos.createdAt,
    })
    .from(videos);
  const plan = planCleanup(objects, rows);

  const prefixes = [...new Set(plan.objects.map((o) => videoIdOf(o.key)))];
  console.log(`${objects.length} objects under videos/ for ${ids.length} videos`);
  console.log(
    `orphaned: ${plan.objects.length} objects (${(plan.bytes / 1e6).toFixed(1)} MB) in ${prefixes.length} prefixes`,
  );
  for (const id of prefixes) console.log(`  videos/${id}/`);
  console.log(`abandoned uploads: ${plan.abandoned.length}`);
  for (const id of plan.abandoned) console.log(`  ${id}`);

  if (!apply) {
    if (plan.objects.length || plan.abandoned.length)
      console.log('dry run, pass --delete to remove');
    return;
  }
  await deleteObjects(plan.objects.map((o) => o.key));
  if (plan.abandoned.length) await db.delete(videos).where(inArray(videos.id, plan.abandoned));
  console.log(`deleted ${plan.objects.length} objects and ${plan.abandoned.length} video rows`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error((err as Error).message);
      process.exit(1);
    });
}
