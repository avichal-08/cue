import type { Client, SearchHit, VideoSummary } from './api';
import type { Variant } from './config';
import type { Dataset } from './dataset';

export interface ResolvedTarget {
  videoId: string;
  title: string;
  startMs?: number;
  endMs?: number;
}

export interface QueryRun {
  id: string;
  q: string;
  expect: ResolvedTarget[];
  hits: SearchHit[];
  reranked: boolean;
  rerankWanted: boolean;
  attempts: number;
  latencyMs: number | null;
  error?: string;
}

export function resolveTargets(dataset: Dataset, videos: VideoSummary[]) {
  const byKey = new Map<string, VideoSummary>();
  for (const v of videos) {
    byKey.set(v.id, v);
    byKey.set(v.title.trim().toLowerCase(), v);
  }

  const missing = new Set<string>();
  const notReady = new Set<string>();
  const resolved = dataset.queries.map((query) => ({
    ...query,
    expect: query.expect.flatMap((t): ResolvedTarget[] => {
      const video = byKey.get(t.video) ?? byKey.get(t.video.trim().toLowerCase());
      if (!video) {
        missing.add(t.video);
        return [];
      }
      if (video.status !== 'ready') notReady.add(video.title);
      return [{ videoId: video.id, title: video.title, startMs: t.start, endMs: t.end }];
    }),
  }));

  if (missing.size) throw new Error(`videos not in the library: ${[...missing].join(', ')}`);
  return { queries: resolved, notReady: [...notReady] };
}

async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>) {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return out;
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

export interface RunOptions {
  concurrency: number;
  retries: number;
  retryDelayMs: number;
}

export async function runQueries(
  api: Client,
  variant: Variant,
  options: RunOptions,
  queries: ReturnType<typeof resolveTargets>['queries'],
  onDone: (run: QueryRun, done: number) => void,
): Promise<QueryRun[]> {
  const { rerank: rerankWanted, ...search } = variant.search;
  let done = 0;
  return pool(queries, options.concurrency, async (query) => {
    const base = { id: query.id, q: query.q, expect: query.expect, rerankWanted };
    let run!: QueryRun;
    for (let attempt = 1; ; attempt++) {
      try {
        const result = await api.search({ q: query.q, ...search, rerank: rerankWanted });
        run = {
          ...base,
          hits: result.clips.map(({ videoId, title, startMs, endMs, score }) => ({
            videoId,
            title,
            startMs,
            endMs,
            score,
          })),
          reranked: result.meta.reranked,
          attempts: attempt,
          latencyMs: result.meta.timings.totalMs,
        };
      } catch (err) {
        run = {
          ...base,
          hits: [],
          reranked: false,
          attempts: attempt,
          latencyMs: null,
          error: (err as Error).message,
        };
      }
      const retry = run.error || (rerankWanted && !run.reranked);
      if (!retry || attempt > options.retries) break;
      await sleep(options.retryDelayMs);
    }
    onDone(run, ++done);
    return run;
  });
}
