import { describe, expect, it } from 'vitest';
import { firstCorrectRank, mrr, percentile, recallAt, summarize } from '../src/metrics';
import { resolveTargets, type QueryRun } from '../src/runner';

const hit = (videoId: string) => ({ videoId, title: videoId, startMs: 0, endMs: 1000, score: 1 });

const run = (hits: string[], wanted = 'v2', extra: Partial<QueryRun> = {}): QueryRun => ({
  id: 'q',
  q: 'q',
  expect: [{ videoId: wanted, title: wanted }],
  hits: hits.map(hit),
  reranked: true,
  latencyMs: 100,
  ...extra,
});

describe('ranking metrics', () => {
  it('finds the first hit from an expected video', () => {
    expect(firstCorrectRank(run(['v1', 'v2', 'v2']))).toBe(2);
    expect(firstCorrectRank(run(['v1', 'v3']))).toBeNull();
  });

  it('scores recall@k and mrr', () => {
    const r = run(['v1', 'v1', 'v2']);
    expect(recallAt(1).score(r)).toBe(0);
    expect(recallAt(3).score(r)).toBe(1);
    expect(mrr.score(r)).toBeCloseTo(1 / 3);
  });
});

describe('summarize', () => {
  it('averages metrics and counts errors as misses', () => {
    const runs = [
      run(['v2'], 'v2', { latencyMs: 100 }),
      run([], 'v2', { latencyMs: null, error: 'boom', reranked: false }),
      run(['v1'], 'v2', { latencyMs: 300, reranked: false }),
    ];
    const s = summarize(runs, [recallAt(1), mrr]);
    expect(s.metrics['recall@1']).toBeCloseTo(1 / 3);
    expect(s.errors).toBe(1);
    expect(s.unreranked).toBe(1);
    expect(s.latencyMs).toEqual({ p50: 100, p95: 300, mean: 200 });
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
