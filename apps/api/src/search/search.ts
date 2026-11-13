import { presignGet } from '@cue/core';
import { db, videos } from '@cue/db';
import { inArray } from 'drizzle-orm';
import { HttpError } from '../errors';
import { mergeIntoClips, type ClipPart } from './clips';
import { embedQuery } from './embed-query';
import { modalities, type Match, type Modality } from './fuse';
import { parseQuery, type QueryFilters } from './query';
import { rerank, skipRerank, type CandidateRow, type Reranked } from './rerank';
import { rerankWithKeyframes } from './rerank-visual';
import { retrieve } from './retrieve';
import { loadWordsAround, snapToWords } from './snap';

export interface SearchRequest {
  q: string;
  videoId?: string;
  fromMs?: number;
  toMs?: number;
  limit: number;
  keyframes: boolean;
  modalities?: Modality[];
  rerank?: boolean;
}

export interface SearchTimings {
  embedMs: number;
  retrieveMs: number;
  rerankMs: number;
  clipsMs: number;
  totalMs: number;
}

interface Part extends ClipPart {
  hit: Reranked;
  row: CandidateRow;
}

const round = (ms: number) => Math.round(ms);

function explain(parts: Part[]) {
  const matches: Partial<Record<Modality, Match>> = {};
  for (const { hit } of parts) {
    for (const [modality, match] of Object.entries(hit.matches) as [Modality, Match][]) {
      const best = matches[modality];
      if (!best || match.rank < best.rank) matches[modality] = match;
    }
  }
  const top = parts[0]!.hit;
  return {
    score: top.rerankScore ?? null,
    reason: top.reason ?? null,
    fusedScore: Number(top.score.toFixed(5)),
    matchedBy: matches,
  };
}

export async function runSearch(request: SearchRequest) {
  const started = performance.now();
  const parsed = parseQuery(request.q);
  const filters: QueryFilters = {
    ...parsed.filters,
    ...(request.videoId ? { videoId: request.videoId } : {}),
    ...(request.fromMs !== undefined ? { fromMs: request.fromMs } : {}),
    ...(request.toMs !== undefined ? { toMs: request.toMs } : {}),
  };
  if (!parsed.text) throw new HttpError(400, 'query has no search text');

  const query = await embedQuery(parsed.text);
  const use = request.modalities?.length ? request.modalities : modalities;
  const retrieval = await retrieve(parsed.text, query.vector, filters, { use });
  const reranked =
    request.rerank === false
      ? await skipRerank(retrieval.hits)
      : request.keyframes
        ? await rerankWithKeyframes(parsed.text, retrieval.hits)
        : await rerank(parsed.text, retrieval.hits);

  const clipsStarted = performance.now();
  const parts: Part[] = reranked.hits.flatMap((hit, i) => {
    const row = reranked.rows.get(hit.segmentId);
    return row
      ? [
          {
            segmentId: hit.segmentId,
            videoId: row.videoId,
            startMs: row.startMs,
            endMs: row.endMs,
            rank: i + 1,
            relevance: hit.rerankScore ?? (reranked.applied && !hit.held ? 0 : hit.score),
            hit,
            row,
          },
        ]
      : [];
  });
  const clips = mergeIntoClips(parts).slice(0, request.limit);

  const videoIds = [...new Set(clips.map((c) => c.videoId))];
  const videoRows = videoIds.length
    ? await db
        .select({
          id: videos.id,
          title: videos.title,
          storageKey: videos.storageKey,
          durationMs: videos.durationMs,
        })
        .from(videos)
        .where(inArray(videos.id, videoIds))
    : [];
  const byVideo = new Map(videoRows.map((v) => [v.id, v]));
  const words = await loadWordsAround(clips);

  const results = await Promise.all(
    clips.map(async (clip, i) => {
      const video = byVideo.get(clip.videoId);
      const snapped = snapToWords(clip, words[i] ?? [], {
        durationMs: video?.durationMs ?? Infinity,
      });
      const segmentsInOrder = [...clip.parts].sort((a, b) => a.startMs - b.startMs);
      return {
        videoId: clip.videoId,
        title: video?.title ?? '',
        startMs: snapped.startMs,
        endMs: snapped.endMs,
        ...explain(clip.parts),
        keyframeUrl: clip.parts[0]!.row.keyframeKey
          ? await presignGet(clip.parts[0]!.row.keyframeKey)
          : null,
        playbackUrl: video?.storageKey ? await presignGet(video.storageKey) : null,
        segments: segmentsInOrder.map((p) => ({
          segmentId: p.segmentId,
          startMs: p.startMs,
          endMs: p.endMs,
          transcriptText: p.row.transcriptText,
          ocrText: p.row.ocrText,
        })),
      };
    }),
  );

  const finished = performance.now();
  const timings: SearchTimings = {
    embedMs: round(query.ms),
    retrieveMs: round(retrieval.ms),
    rerankMs: round(reranked.ms),
    clipsMs: round(finished - clipsStarted),
    totalMs: round(finished - started),
  };

  return {
    query: parsed.text,
    filters,
    clips: results,
    meta: {
      candidates: retrieval.hits.length,
      queryCached: query.cached,
      embedModel: query.model,
      reranked: reranked.applied,
      rerankModel: reranked.model ?? null,
      rerankError: reranked.error ?? null,
      keyframes: request.keyframes,
      modalities: use,
      timings,
    },
  };
}
