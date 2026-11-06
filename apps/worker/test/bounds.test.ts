import { describe, expect, it } from 'vitest';
import { toSegments, type Span } from '../src/bounds';

const bounds = { minMs: 5_000, maxMs: 30_000 };
const lengths = (spans: Span[]) => spans.map((s) => s.endMs - s.startMs);

function random(seed: number) {
  return () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed / 2_147_483_648;
  };
}

describe('toSegments', () => {
  it('keeps scenes that are already within bounds', () => {
    expect(toSegments([10_000, 20_000], 30_000, bounds)).toEqual([
      { startMs: 0, endMs: 10_000 },
      { startMs: 10_000, endMs: 20_000 },
      { startMs: 20_000, endMs: 30_000 },
    ]);
  });

  it('merges a short scene into the next one', () => {
    expect(toSegments([2_000, 12_000], 20_000, bounds)).toEqual([
      { startMs: 0, endMs: 12_000 },
      { startMs: 12_000, endMs: 20_000 },
    ]);
  });

  it('merges a short last scene into the previous one', () => {
    expect(toSegments([10_000], 12_000, bounds)).toEqual([{ startMs: 0, endMs: 12_000 }]);
  });

  it('splits a long scene into equal parts under the max', () => {
    expect(toSegments([], 70_000, bounds)).toEqual([
      { startMs: 0, endMs: 23_333 },
      { startMs: 23_333, endMs: 46_667 },
      { startMs: 46_667, endMs: 70_000 },
    ]);
  });

  it('returns one segment for a video shorter than the min', () => {
    expect(toSegments([1_000], 3_000, bounds)).toEqual([{ startMs: 0, endMs: 3_000 }]);
  });

  it('ignores unsorted, duplicate and out of range cuts', () => {
    expect(toSegments([20_000, 10_000, 10_000, 0, 40_000], 30_000, bounds)).toEqual(
      toSegments([10_000, 20_000], 30_000, bounds),
    );
  });

  it('returns nothing for an empty video and rejects bad bounds', () => {
    expect(toSegments([], 0, bounds)).toEqual([]);
    expect(() => toSegments([], 10_000, { minMs: 5_000, maxMs: 8_000 })).toThrow();
  });

  it('always covers the video with contiguous spans inside the bounds', () => {
    const next = random(42);
    for (let run = 0; run < 500; run++) {
      const durationMs = 6_000 + Math.floor(next() * 600_000);
      const cuts = Array.from({ length: Math.floor(next() * 40) }, () =>
        Math.floor(next() * durationMs),
      );
      const spans = toSegments(cuts, durationMs, bounds);

      expect(spans[0]!.startMs).toBe(0);
      expect(spans.at(-1)!.endMs).toBe(durationMs);
      spans.slice(1).forEach((s, i) => expect(s.startMs).toBe(spans[i]!.endMs));
      for (const len of lengths(spans)) {
        expect(len).toBeGreaterThanOrEqual(bounds.minMs);
        expect(len).toBeLessThanOrEqual(bounds.maxMs);
      }
    }
  });
});
