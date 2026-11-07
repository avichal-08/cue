import { describe, expect, it } from 'vitest';
import type { Word } from '@cue/core';
import { placeWords, segmentTexts, type SegmentRef } from '../src/words';

const segments: SegmentRef[] = [
  { id: 's0', startMs: 0, endMs: 5_000 },
  { id: 's1', startMs: 5_000, endMs: 12_000 },
  { id: 's2', startMs: 12_000, endMs: 20_000 },
];

const w = (word: string, startMs: number): Word => ({ word, startMs, endMs: startMs + 300 });

describe('placeWords', () => {
  it('puts each word in the segment where it starts', () => {
    const placed = placeWords(segments, [w('hi', 100), w('edge', 5_000), w('end', 19_900)]);
    expect(placed.map((p) => [p.word, p.segmentId])).toEqual([
      ['hi', 's0'],
      ['edge', 's1'],
      ['end', 's2'],
    ]);
  });

  it('keeps words that span a boundary in the segment they start in', () => {
    const placed = placeWords(segments, [{ word: 'long', startMs: 4_800, endMs: 5_400 }]);
    expect(placed[0]!.segmentId).toBe('s0');
  });

  it('leaves words outside every segment unlinked', () => {
    expect(placeWords(segments, [w('late', 20_000)])[0]!.segmentId).toBeNull();
    expect(placeWords([], [w('x', 0)])[0]!.segmentId).toBeNull();
  });

  it('sorts unsorted words and segments', () => {
    const placed = placeWords([...segments].reverse(), [w('b', 13_000), w('a', 1_000)]);
    expect(placed.map((p) => [p.word, p.segmentId])).toEqual([
      ['a', 's0'],
      ['b', 's2'],
    ]);
  });
});

describe('segmentTexts', () => {
  it('joins each segment words and sets silent segments to null', () => {
    const placed = placeWords(segments, [w('hello', 100), w('there', 400), w('bye', 13_000)]);
    expect(segmentTexts(segments, placed)).toEqual(
      new Map([
        ['s0', 'hello there'],
        ['s1', null],
        ['s2', 'bye'],
      ]),
    );
  });
});
