import { deleteObjects, listObjects } from '@cue/core';
import { db, videos } from '@cue/db';
import { inArray } from 'drizzle-orm';
import { planCleanup, videoIdOf } from './orphans';

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

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error((err as Error).message);
    process.exit(1);
  });
