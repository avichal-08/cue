import type { QueryRun } from './runner';

export interface Metric {
  name: string;
  score: (run: QueryRun) => number;
}

export function firstCorrectRank(run: QueryRun): number | null {
  const wanted = new Set(run.expect.map((t) => t.videoId));
  const i = run.hits.findIndex((h) => wanted.has(h.videoId));
  return i === -1 ? null : i + 1;
}

export function recallAt(k: number): Metric {
  return {
    name: `recall@${k}`,
    score: (run) => {
      const rank = firstCorrectRank(run);
      return rank !== null && rank <= k ? 1 : 0;
    },
  };
}

export const mrr: Metric = {
  name: 'mrr',
  score: (run) => {
    const rank = firstCorrectRank(run);
    return rank === null ? 0 : 1 / rank;
  },
};

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i]!;
}

export interface Summary {
  queries: number;
  errors: number;
  unreranked: number;
  metrics: Record<string, number>;
  latencyMs: { p50: number | null; p95: number | null; mean: number | null };
}

export function summarize(runs: QueryRun[], metrics: Metric[]): Summary {
  const scores: Record<string, number> = {};
  for (const m of metrics) {
    const total = runs.reduce((sum, run) => sum + m.score(run), 0);
    scores[m.name] = runs.length ? total / runs.length : 0;
  }
  const latencies = runs.flatMap((r) => (r.latencyMs === null ? [] : [r.latencyMs]));
  return {
    queries: runs.length,
    errors: runs.filter((r) => r.error).length,
    unreranked: runs.filter((r) => !r.error && !r.reranked).length,
    metrics: scores,
    latencyMs: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      mean: latencies.length
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : null,
    },
  };
}
