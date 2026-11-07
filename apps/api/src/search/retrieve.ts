import { db, segments, videos } from '@cue/db';
import { and, desc, eq, gt, inArray, isNotNull, lt, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  aboveFloor,
  defaultWeights,
  fuse,
  minSimilarity,
  type Fused,
  type Modality,
  type Ranked,
} from './fuse';
import type { QueryFilters } from './query';

export const perModality = 50;

const vectorColumns = {
  transcript: segments.textEmbedding,
  ocr: segments.ocrEmbedding,
  visual: segments.visualEmbedding,
} satisfies Partial<Record<Modality, AnyPgColumn>>;

function scope(filters: QueryFilters): SQL[] {
  const where: SQL[] = [
    inArray(
      segments.videoId,
      db.select({ id: videos.id }).from(videos).where(eq(videos.status, 'ready')),
    ),
  ];
  if (filters.videoId) where.push(eq(segments.videoId, filters.videoId));
  if (filters.fromMs !== undefined) where.push(gt(segments.endMs, filters.fromMs));
  if (filters.toMs !== undefined) where.push(lt(segments.startMs, filters.toMs));
  return where;
}

function vectorSearch(column: AnyPgColumn, vector: string, filters: QueryFilters, limit: number) {
  const distance = sql`${column} <=> ${vector}::vector`;
  return db
    .select({ segmentId: segments.id, score: sql<number>`1 - (${distance})` })
    .from(segments)
    .where(and(isNotNull(column), ...scope(filters)))
    .orderBy(distance)
    .limit(limit);
}

function keywordSearch(text: string, filters: QueryFilters, limit: number) {
  const query = sql`websearch_to_tsquery('english', ${text})`;
  const rank = sql<number>`ts_rank_cd(${segments.searchTsv}, ${query})`;
  return db
    .select({ segmentId: segments.id, score: rank })
    .from(segments)
    .where(and(sql`${segments.searchTsv} @@ ${query}`, ...scope(filters)))
    .orderBy(desc(rank))
    .limit(limit);
}

export interface Retrieval {
  hits: Fused[];
  lists: Partial<Record<Modality, Ranked[]>>;
  ms: number;
}

export async function retrieve(
  text: string,
  vector: number[] | undefined,
  filters: QueryFilters,
  { limit = perModality, weights = defaultWeights, floors = minSimilarity } = {},
): Promise<Retrieval> {
  const started = performance.now();
  const literal = vector ? `[${vector.join(',')}]` : undefined;
  const vectorModalities = literal
    ? (Object.keys(vectorColumns) as (keyof typeof vectorColumns)[])
    : [];
  const useKeyword = text.trim().length > 0;

  const results = await db.batch([
    db.execute(sql`set local hnsw.iterative_scan = relaxed_order`),
    db.execute(sql`set local hnsw.ef_search = ${sql.raw(String(Math.max(40, limit * 2)))}`),
    ...vectorModalities.map((m) => vectorSearch(vectorColumns[m], literal!, filters, limit)),
    ...(useKeyword ? [keywordSearch(text, filters, limit)] : []),
  ]);

  const rows = results.slice(2) as Ranked[][];
  const lists: Partial<Record<Modality, Ranked[]>> = {};
  vectorModalities.forEach((m, i) => {
    lists[m] = rows[i]!.map((r) => ({ segmentId: r.segmentId, score: Number(r.score) })).sort(
      (a, b) => b.score - a.score,
    );
  });
  if (useKeyword) {
    lists.keyword = rows[vectorModalities.length]!.map((r) => ({
      segmentId: r.segmentId,
      score: Number(r.score),
    }));
  }

  return { hits: fuse(aboveFloor(lists, floors), weights), lists, ms: performance.now() - started };
}
