import { and, eq, inArray } from 'drizzle-orm';
import { db } from './client';
import { embeddingCache } from './schema';

type Kind = 'text' | 'image';

const readChunk = 500;
const writeChunk = 50;

export async function cachedEmbeddings(
  model: string,
  kind: Kind,
  hashes: string[],
): Promise<Map<string, number[]>> {
  const found = new Map<string, number[]>();
  const unique = [...new Set(hashes)];
  for (let i = 0; i < unique.length; i += readChunk) {
    const rows = await db
      .select({ hash: embeddingCache.contentHash, embedding: embeddingCache.embedding })
      .from(embeddingCache)
      .where(
        and(
          eq(embeddingCache.model, model),
          eq(embeddingCache.kind, kind),
          inArray(embeddingCache.contentHash, unique.slice(i, i + readChunk)),
        ),
      );
    for (const r of rows) found.set(r.hash, r.embedding);
  }
  return found;
}

export async function cacheEmbeddings(
  model: string,
  kind: Kind,
  entries: { hash: string; embedding: number[] }[],
) {
  for (let i = 0; i < entries.length; i += writeChunk) {
    const values = entries
      .slice(i, i + writeChunk)
      .map((e) => ({ contentHash: e.hash, model, kind, embedding: e.embedding }));
    await db.insert(embeddingCache).values(values).onConflictDoNothing();
  }
}
