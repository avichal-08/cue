import type { RerankCandidate, RerankResult } from '@cue/core';
import { db, segments, videos } from '@cue/db';
import { eq, inArray } from 'drizzle-orm';
import { reranker } from '../models';
import type { Fused } from './fuse';

export const rerankTop = 20;
export const minRerankScore = 0.3;

export interface CandidateRow {
  segmentId: string;
  videoId: string;
  title: string;
  startMs: number;
  endMs: number;
  transcriptText: string | null;
  ocrText: string | null;
  keyframeKey: string | null;
}

export interface Reranked extends Fused {
  rerankScore?: number;
  reason?: string;
  held?: boolean;
}

export interface RerankOutcome {
  hits: Reranked[];
  rows: Map<string, CandidateRow>;
  applied: boolean;
  model?: string;
  error?: string;
  ms: number;
}

export type ImageLoader = (rows: CandidateRow[]) => Promise<Map<string, Buffer>>;

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function candidateFor(row: CandidateRow, image?: Buffer): RerankCandidate {
  const lines = [`video: ${row.title} (${clock(row.startMs)}-${clock(row.endMs)})`];
  if (row.transcriptText) lines.push(`said: ${row.transcriptText}`);
  if (row.ocrText) lines.push(`on screen: ${row.ocrText.replace(/\s+/g, ' ').trim()}`);
  return { id: row.segmentId, text: lines.join('\n'), ...(image ? { image } : {}) };
}

export const hasEvidence = (row: CandidateRow, image?: Buffer) =>
  Boolean(row.transcriptText?.trim() || row.ocrText?.trim() || image);

export const seenOnly = (hit: Fused) =>
  Boolean(hit.matches.visual) &&
  !hit.matches.transcript &&
  !hit.matches.ocr &&
  !hit.matches.keyword;

export function applyRerank(
  hits: Fused[],
  results: RerankResult[],
  { minScore = minRerankScore, held = new Set<string>() } = {},
): Reranked[] {
  const scored = new Map(results.map((r) => [r.id, r]));
  const kept: Reranked[] = [];
  const unscored: Reranked[] = [];
  for (const hit of hits) {
    const r = scored.get(hit.segmentId);
    if (held.has(hit.segmentId)) continue;
    if (!r) unscored.push(hit);
    else if (r.score >= minScore) kept.push({ ...hit, rerankScore: r.score, reason: r.reason });
  }
  kept.sort((a, b) => b.rerankScore! - a.rerankScore! || b.score - a.score);

  const out: Reranked[] = [];
  let next = 0;
  for (const hit of hits) {
    if (held.has(hit.segmentId)) out.push({ ...hit, held: true });
    else if (scored.has(hit.segmentId) && next < kept.length) out.push(kept[next++]!);
  }
  return [...out, ...unscored];
}

export async function loadCandidates(ids: string[]): Promise<Map<string, CandidateRow>> {
  if (!ids.length) return new Map();
  const rows = await db
    .select({
      segmentId: segments.id,
      videoId: segments.videoId,
      title: videos.title,
      startMs: segments.startMs,
      endMs: segments.endMs,
      transcriptText: segments.transcriptText,
      ocrText: segments.ocrText,
      keyframeKey: segments.keyframeKey,
    })
    .from(segments)
    .innerJoin(videos, eq(videos.id, segments.videoId))
    .where(inArray(segments.id, ids));
  return new Map(rows.map((r) => [r.segmentId, r]));
}

export async function skipRerank(hits: Fused[], top = rerankTop): Promise<RerankOutcome> {
  const started = performance.now();
  const pool = hits.slice(0, top);
  const rows = await loadCandidates(pool.map((h) => h.segmentId));
  return { hits: pool, rows, applied: false, ms: performance.now() - started };
}

export async function rerank(
  query: string,
  hits: Fused[],
  { top = rerankTop, images }: { top?: number; images?: ImageLoader } = {},
): Promise<RerankOutcome> {
  const started = performance.now();
  const pool = hits.slice(0, top);
  const rows = await loadCandidates(pool.map((h) => h.segmentId));
  const ms = () => performance.now() - started;
  if (!query.trim() || !pool.length) return { hits: pool, rows, applied: false, ms: ms() };

  const model = reranker();
  try {
    const ordered = pool.map((h) => rows.get(h.segmentId)).filter((r) => r !== undefined);
    const pictures = images ? await images(ordered) : new Map<string, Buffer>();
    const held = new Set(
      pool.filter((h) => seenOnly(h) && !pictures.has(h.segmentId)).map((h) => h.segmentId),
    );
    const candidates = ordered
      .filter((r) => !held.has(r.segmentId) && hasEvidence(r, pictures.get(r.segmentId)))
      .map((r) => candidateFor(r, pictures.get(r.segmentId)));
    if (!candidates.length) return { hits: pool, rows, applied: false, model: model.id, ms: ms() };
    const results = await model.rerank(query, candidates, candidates.length);
    return {
      hits: applyRerank(pool, results, { held }),
      rows,
      applied: true,
      model: model.id,
      ms: ms(),
    };
  } catch (err) {
    const error = err instanceof Error ? err.message.slice(0, 200) : String(err);
    console.warn(`[search] rerank failed, keeping fused order: ${error}`);
    return { hits: pool, rows, applied: false, model: model.id, error, ms: ms() };
  }
}
