import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config';
import { parseDataset, toMs } from '../src/dataset';

describe('toMs', () => {
  it('reads numbers as ms and clock strings as time', () => {
    expect(toMs(1500)).toBe(1500);
    expect(toMs('45')).toBe(45_000);
    expect(toMs('1:30')).toBe(90_000);
    expect(toMs('1:02:03.5')).toBe(3_723_500);
  });

  it('rejects junk', () => {
    expect(() => toMs('1:xx')).toThrow();
    expect(() => toMs('1:2:3:4')).toThrow();
  });
});

describe('parseDataset', () => {
  const query = {
    id: 'a',
    q: 'rust memory',
    expect: [{ video: 'Rust', start: '0:40', end: '1:08' }],
  };

  it('converts spans to ms', () => {
    const d = parseDataset({ name: 'x', queries: [query] });
    expect(d.queries[0]!.expect[0]).toEqual({ video: 'Rust', start: 40_000, end: 68_000 });
  });

  it('allows a whole-video target', () => {
    const d = parseDataset({ name: 'x', queries: [{ ...query, expect: [{ video: 'Rust' }] }] });
    expect(d.queries[0]!.expect[0]!.start).toBeUndefined();
  });

  it('rejects half spans, reversed spans and duplicate ids', () => {
    const bad = (expect: unknown[]) => () =>
      parseDataset({ name: 'x', queries: [{ ...query, expect }] });
    expect(bad([{ video: 'Rust', start: 5 }])).toThrow();
    expect(bad([{ video: 'Rust', start: 9, end: 5 }])).toThrow();
    expect(() => parseDataset({ name: 'x', queries: [query, query] })).toThrow();
  });
});

describe('parseConfig', () => {
  it('fills defaults and resolves the dataset next to the config', () => {
    const c = parseConfig(
      { name: 'smoke', dataset: '../datasets/a.json' },
      '/evals/configs/smoke.json',
    );
    expect(c.variants).toEqual([
      { name: 'default', search: { limit: 10, keyframes: false, rerank: true } },
    ]);
    expect(c.k).toEqual([1, 5, 10]);
    expect(c.retries).toBe(2);
    expect(c.datasetPath.replace(/\\/g, '/')).toMatch(/\/evals\/datasets\/a\.json$/);
  });

  it('layers variant search options over the shared ones', () => {
    const c = parseConfig(
      {
        name: 'ablation',
        dataset: 'a.json',
        search: { limit: 5, rerank: false },
        variants: [
          { name: 'transcript', search: { modalities: ['transcript'] } },
          { name: 'full', search: { rerank: true, keyframes: true } },
        ],
      },
      'c.json',
    );
    expect(c.variants).toEqual([
      {
        name: 'transcript',
        search: { limit: 5, keyframes: false, rerank: false, modalities: ['transcript'] },
      },
      { name: 'full', search: { limit: 5, keyframes: true, rerank: true } },
    ]);
  });

  it('rejects bad names, unknown signals and duplicate variants', () => {
    expect(() => parseConfig({ name: 'Smoke Run', dataset: 'a.json' }, 'c.json')).toThrow();
    const variants = (v: unknown[]) => () =>
      parseConfig({ name: 'x', dataset: 'a.json', variants: v }, 'c.json');
    expect(variants([{ name: 'a', search: { modalities: ['audio'] } }])).toThrow();
    expect(variants([{ name: 'a' }, { name: 'a' }])).toThrow();
  });
});
