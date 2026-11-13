import type { SearchHit } from './api';
import type { QueryRun, ResolvedTarget } from './runner';

export interface Metric {
  name: string;
  format: 'pct' | 'num';
  score: (run: QueryRun) => number | null;
}

type Span = Required<Pick<ResolvedTarget, 'videoId' | 'startMs' | 'endMs'>>;

export const spans = (run: QueryRun): Span[] =>
  run.expect.flatMap((t) =>
    t.startMs === undefined || t.endMs === undefined
      ? []
      : [{ videoId: t.videoId, startMs: t.startMs, endMs: t.endMs }],
  );

export function iou(a: { startMs: number; endMs: number }, b: { startMs: number; endMs: number }) {
  const inter = Math.max(0, Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs));
  const union = Math.max(a.endMs, b.endMs) - Math.min(a.startMs, b.startMs);
  return union > 0 ? inter / union : 0;
}

export function startGapMs(hit: SearchHit, span: Span) {
  if (hit.startMs < span.startMs) return span.startMs - hit.startMs;
  if (hit.startMs > span.endMs) return hit.startMs - span.endMs;
  return 0;
}

const sameVideo = (hit: SearchHit, wanted: Span[]) =>
  wanted.filter((s) => s.videoId === hit.videoId);

export function bestIou(hit: SearchHit | undefined, wanted: Span[]) {
  if (!hit) return 0;
  return Math.max(0, ...sameVideo(hit, wanted).map((s) => iou(hit, s)));
}

export function firstCorrectRank(run: QueryRun): number | null {
  const wanted = new Set(run.expect.map((t) => t.videoId));
  const i = run.hits.findIndex((h) => wanted.has(h.videoId));
  return i === -1 ? null : i + 1;
}

export function recallAt(k: number): Metric {
  return {
    name: `recall@${k}`,
    format: 'pct',
    score: (run) => {
      const rank = firstCorrectRank(run);
      return rank !== null && rank <= k ? 1 : 0;
    },
  };
}

export const mrr: Metric = {
  name: 'mrr',
  format: 'num',
  score: (run) => {
    const rank = firstCorrectRank(run);
    return rank === null ? 0 : 1 / rank;
  },
};

export function hitWithin(k: number, windowMs: number): Metric {
  return {
    name: `hit@${k} ±${windowMs / 1000}s`,
    format: 'pct',
    score: (run) => {
      const wanted = spans(run);
      if (!wanted.length) return null;
      const lands = run.hits
        .slice(0, k)
        .some((h) => sameVideo(h, wanted).some((s) => startGapMs(h, s) <= windowMs));
      return lands ? 1 : 0;
    },
  };
}

export function recallAtIou(k: number, threshold: number): Metric {
  return {
    name: `R@${k} iou≥${threshold}`,
    format: 'pct',
    score: (run) => {
      const wanted = spans(run);
      if (!wanted.length) return null;
      return run.hits.slice(0, k).some((h) => bestIou(h, wanted) >= threshold) ? 1 : 0;
    },
  };
}

export const meanIouAt1: Metric = {
  name: 'mIoU@1',
  format: 'num',
  score: (run) => {
    const wanted = spans(run);
    return wanted.length ? bestIou(run.hits[0], wanted) : null;
  },
};

export function metricsFor(config: { k: number[]; windowSec: number; iou: number[] }): Metric[] {
  const windowMs = config.windowSec * 1000;
  return [
    ...config.k.map(recallAt),
    mrr,
    ...config.k.map((k) => hitWithin(k, windowMs)),
    ...config.iou.flatMap((t) => config.k.map((k) => recallAtIou(k, t))),
    meanIouAt1,
  ];
}

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i]!;
}

export interface MetricResult {
  value: number;
  n: number;
  format: Metric['format'];
}

export interface Summary {
  queries: number;
  errors: number;
  unreranked: number;
  metrics: Record<string, MetricResult>;
  latencyMs: { p50: number | null; p95: number | null; mean: number | null };
  phasesMs: Record<string, { p50: number | null; p95: number | null }>;
}

const phases = ['embedMs', 'retrieveMs', 'rerankMs', 'clipsMs'] as const;

export function summarize(runs: QueryRun[], metrics: Metric[]): Summary {
  const scores: Record<string, MetricResult> = {};
  for (const m of metrics) {
    const values = runs.flatMap((run) => {
      const s = m.score(run);
      return s === null ? [] : [s];
    });
    scores[m.name] = {
      value: values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0,
      n: values.length,
      format: m.format,
    };
  }
  const latencies = runs.flatMap((r) => (r.latencyMs === null ? [] : [r.latencyMs]));
  return {
    queries: runs.length,
    errors: runs.filter((r) => r.error).length,
    unreranked: runs.filter((r) => !r.error && r.rerankWanted && !r.reranked).length,
    metrics: scores,
    latencyMs: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      mean: latencies.length
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : null,
    },
    phasesMs: Object.fromEntries(
      phases.map((phase) => {
        const values = runs.flatMap((r) => (r.timings ? [r.timings[phase]] : []));
        return [
          phase.replace(/Ms$/, ''),
          { p50: percentile(values, 50), p95: percentile(values, 95) },
        ];
      }),
    ),
  };
}
