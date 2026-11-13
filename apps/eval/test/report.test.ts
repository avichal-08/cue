import { describe, expect, it } from 'vitest';
import { mrr, recallAt, summarize, meanIouAt1 } from '../src/metrics';
import { ablationTable, toMarkdown, type Report, type VariantResult } from '../src/report';
import type { QueryRun } from '../src/runner';

const run = (startMs: number, rerankWanted: boolean): QueryRun => ({
  id: 'q1',
  q: 'rust memory',
  expect: [{ videoId: 'v', title: 'Rust', startMs: 0, endMs: 10_000 }],
  hits: [{ videoId: 'v', title: 'Rust', startMs, endMs: startMs + 10_000, score: null }],
  reranked: rerankWanted,
  rerankWanted,
  attempts: 1,
  latencyMs: 50,
});

const variant = (name: string, startMs: number, rerank: boolean): VariantResult => {
  const runs = [run(startMs, rerank)];
  return {
    name,
    search: {
      limit: 10,
      keyframes: false,
      rerank,
      ...(rerank ? {} : { modalities: ['transcript'] }),
    },
    summary: summarize(runs, [recallAt(1), recallAt(5), mrr, meanIouAt1]),
    runs,
  };
};

describe('ablation report', () => {
  const variants = [variant('transcript', 5_000, false), variant('full', 0, true)];

  it('puts one row per variant with only the @1 metrics', () => {
    const lines = ablationTable(variants);
    expect(lines[0]).toBe(
      '| variant | signals | rerank | recall@1 | recall@5 | mrr | mIoU@1 | p50 | p95 | cost / 1k | not reranked |',
    );
    expect(lines[2]).toBe(
      '| transcript | transcript | off | 100.0% | 100.0% | 1.000 | 0.333 | 50 ms | 50 ms | n/a |  |',
    );
    expect(lines[3]).toBe(
      '| full | all | text | 100.0% | 100.0% | 1.000 | 1.000 | 50 ms | 50 ms | n/a | 0 |',
    );
  });

  it('adds a per-query iou matrix when there is more than one variant', () => {
    const report: Report = {
      name: 'ablation',
      dataset: 'd',
      startedAt: 'a',
      finishedAt: 'b',
      commit: 'abc',
      config: {} as Report['config'],
      variants,
    };
    expect(toMarkdown(report)).toContain('| q1 | 0.33 | 1.00 |');
  });
});
