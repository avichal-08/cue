import { describe, expect, it } from 'vitest';
import {
  firstCorrectRank,
  hitWithin,
  iou,
  meanIouAt1,
  metricsFor,
  mrr,
  percentile,
  recallAt,
  recallAtIou,
  summarize,
} from '../src/metrics';
import { resolveTargets, type QueryRun, type ResolvedTarget } from '../src/runner';

const hit = (videoId: string, startMs = 0, endMs = 1000) => ({
  videoId,
  title: videoId,
  startMs,
  endMs,
  score: 1,
});

const run = (
  hits: ReturnType<typeof hit>[],
  expect: ResolvedTarget[] = [{ videoId: 'v2', title: 'v2' }],
  extra: Partial<QueryRun> = {},
): QueryRun => ({
  id: 'q',
  q: 'q',
  expect,
  hits,
  reranked: true,
  rerankWanted: true,
  attempts: 1,
  latencyMs: 100,
  ...extra,
});

const span = (startMs: number, endMs: number, videoId = 'v2'): ResolvedTarget => ({
  videoId,
  title: videoId,
  startMs,
  endMs,
});

describe('video ranking', () => {
  it('finds the first hit from an expected video', () => {
    expect(firstCorrectRank(run([hit('v1'), hit('v2'), hit('v2')]))).toBe(2);
    expect(firstCorrectRank(run([hit('v1'), hit('v3')]))).toBeNull();
  });

  it('scores recall@k and mrr', () => {
    const r = run([hit('v1'), hit('v1'), hit('v2')]);
    expect(recallAt(1).score(r)).toBe(0);
    expect(recallAt(3).score(r)).toBe(1);
    expect(mrr.score(r)).toBeCloseTo(1 / 3);
  });
});

describe('iou', () => {
  it('measures temporal overlap', () => {
    expect(iou({ startMs: 0, endMs: 10 }, { startMs: 0, endMs: 10 })).toBe(1);
    expect(iou({ startMs: 0, endMs: 10 }, { startMs: 5, endMs: 15 })).toBeCloseTo(5 / 15);
    expect(iou({ startMs: 0, endMs: 10 }, { startMs: 20, endMs: 30 })).toBe(0);
  });
});

describe('timestamp metrics', () => {
  const target = [span(40_000, 68_000)];

  it('counts a hit when playback starts inside or near the span', () => {
    const at = (startMs: number) => run([hit('v2', startMs, startMs + 10_000)], target);
    expect(hitWithin(1, 5_000).score(at(50_000))).toBe(1);
    expect(hitWithin(1, 5_000).score(at(36_000))).toBe(1);
    expect(hitWithin(1, 5_000).score(at(72_000))).toBe(1);
    expect(hitWithin(1, 5_000).score(at(30_000))).toBe(0);
    expect(hitWithin(1, 5_000).score(run([hit('v1', 50_000, 60_000)], target))).toBe(0);
  });

  it('only looks at the top k', () => {
    const r = run([hit('v1'), hit('v2', 45_000, 60_000)], target);
    expect(hitWithin(1, 5_000).score(r)).toBe(0);
    expect(hitWithin(2, 5_000).score(r)).toBe(1);
  });

  it('scores R@k at an iou threshold and mIoU of the top hit', () => {
    const r = run([hit('v2', 40_000, 54_000), hit('v2', 40_000, 68_000)], target);
    expect(recallAtIou(1, 0.5).score(r)).toBe(1);
    expect(recallAtIou(1, 0.7).score(r)).toBe(0);
    expect(recallAtIou(2, 0.7).score(r)).toBe(1);
    expect(meanIouAt1.score(r)).toBeCloseTo(0.5);
    expect(meanIouAt1.score(run([hit('v1', 40_000, 68_000)], target))).toBe(0);
  });

  it('takes the best of several targets', () => {
    const r = run([hit('v3', 0, 10_000)], [span(40_000, 68_000), span(0, 10_000, 'v3')]);
    expect(meanIouAt1.score(r)).toBe(1);
  });

  it('skips queries without spans', () => {
    const r = run([hit('v2')]);
    expect(hitWithin(1, 5_000).score(r)).toBeNull();
    expect(recallAtIou(1, 0.5).score(r)).toBeNull();
    expect(meanIouAt1.score(r)).toBeNull();
  });
});

describe('summarize', () => {
  it('averages metrics and counts errors as misses', () => {
    const runs = [
      run([hit('v2')], undefined, { latencyMs: 100 }),
      run([], undefined, { latencyMs: null, error: 'boom', reranked: false }),
      run([hit('v1')], undefined, { latencyMs: 300, reranked: false, rerankError: '429' }),
    ];
    const s = summarize(runs, [recallAt(1), mrr]);
    expect(s.metrics['recall@1']).toEqual({ value: 1 / 3, n: 3, format: 'pct' });
    expect(s.errors).toBe(1);
    expect(s.unreranked).toBe(1);
    expect(s.latencyMs).toEqual({ p50: 100, p95: 300, mean: 200 });
  });

  it('does not count a rerank with nothing to score as a failure', () => {
    const runs = [run([hit('v2')], undefined, { reranked: false })];
    expect(summarize(runs, [mrr]).unreranked).toBe(0);
  });

  it('does not count a variant with rerank off as unreranked', () => {
    const runs = [run([hit('v2')], undefined, { reranked: false, rerankWanted: false })];
    expect(summarize(runs, [mrr]).unreranked).toBe(0);
  });

  it('averages timestamp metrics only over labelled queries', () => {
    const runs = [run([hit('v2', 0, 10_000)], [span(0, 10_000)]), run([hit('v2')])];
    const s = summarize(runs, [meanIouAt1]);
    expect(s.metrics['mIoU@1']).toEqual({ value: 1, n: 1, format: 'num' });
  });

  it('builds the metric list from config', () => {
    const names = metricsFor({ k: [1, 5], windowSec: 5, iou: [0.5] }).map((m) => m.name);
    expect(names).toEqual([
      'recall@1',
      'recall@5',
      'mrr',
      'hit@1 ±5s',
      'hit@5 ±5s',
      'R@1 iou≥0.5',
      'R@5 iou≥0.5',
      'mIoU@1',
    ]);
  });
});

describe('percentile', () => {
  it('uses nearest rank', () => {
    const values = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(percentile(values, 50)).toBe(10);
    expect(percentile(values, 95)).toBe(19);
    expect(percentile([], 95)).toBeNull();
  });
});

describe('resolveTargets', () => {
  const videos = [
    { id: 'id-rust', title: 'Rust in 100 Seconds', status: 'ready' },
    { id: 'id-go', title: 'golang', status: 'processing' },
  ];

  it('matches titles without case and ids exactly', () => {
    const { queries, notReady } = resolveTargets(
      {
        name: 'd',
        queries: [
          { id: 'a', q: 'x', expect: [{ video: 'rust in 100 seconds' }] },
          { id: 'b', q: 'y', expect: [{ video: 'id-go', start: 0, end: 1000 }] },
        ],
      },
      videos,
    );
    expect(queries[0]!.expect[0]!.videoId).toBe('id-rust');
    expect(queries[1]!.expect[0]).toMatchObject({ videoId: 'id-go', startMs: 0, endMs: 1000 });
    expect(notReady).toEqual(['golang']);
  });

  it('fails on videos that are not in the library', () => {
    expect(() =>
      resolveTargets(
        { name: 'd', queries: [{ id: 'a', q: 'x', expect: [{ video: 'nope' }] }] },
        videos,
      ),
    ).toThrow(/nope/);
  });
});
