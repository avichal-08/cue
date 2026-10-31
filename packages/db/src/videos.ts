import { and, eq, ne } from 'drizzle-orm';
import { db } from './client';
import { videos } from './schema';

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e.code === '23505' || e.cause?.code === '23505';
}

async function findByHash(contentHash: string, excludeId: string) {
  const [row] = await db
    .select({ id: videos.id })
    .from(videos)
    .where(and(eq(videos.contentHash, contentHash), ne(videos.id, excludeId)))
    .limit(1);
  return row?.id;
}

export async function claimContentHash(
  videoId: string,
  contentHash: string,
): Promise<string | undefined> {
  const existing = await findByHash(contentHash, videoId);
  if (existing) return existing;
  try {
    await db.update(videos).set({ contentHash }).where(eq(videos.id, videoId));
    return undefined;
  } catch (err) {
    if (isUniqueViolation(err)) return findByHash(contentHash, videoId);
    throw err;
  }
}
