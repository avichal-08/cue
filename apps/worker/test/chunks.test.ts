import { describe, expect, it } from 'vitest';
import type { Transcript } from '@cue/core';
import { planChunks, stitch } from '../src/chunks';

const words = (...list: [string, number, number][]): Transcript => ({
  text: list.map((w) => w[0]).join(' '),
  language: 'English',
  words: list.map(([word, startMs, endMs]) => ({ word, startMs, endMs })),
});

describe('planChunks', () => {
  it('uses one chunk when audio fits', () => {
    expect(planChunks(600_000)).toEqual([{ startMs: 0, endMs: 600_000 }]);
  });

  it('steps by size minus overlap and ends exactly at the duration', () => {
    expect(planChunks(25_000, 10_000, 2_000)).toEqual([
      { startMs: 0, endMs: 10_000 },
      { startMs: 8_000, endMs: 18_000 },
      { startMs: 16_000, endMs: 25_000 },
    ]);
  });

  it('covers long audio with overlapping chunks no longer than the size', () => {
    const chunks = planChunks(3 * 3_600_000);
    expect(chunks[0]!.startMs).toBe(0);
    expect(chunks.at(-1)!.endMs).toBe(3 * 3_600_000);
    chunks.slice(1).forEach((c, i) => expect(c.startMs).toBeLessThan(chunks[i]!.endMs));
    chunks.forEach((c) => expect(c.endMs - c.startMs).toBeLessThanOrEqual(600_000));
  });

  it('returns nothing for empty audio and rejects overlap >= size', () => {
    expect(planChunks(0)).toEqual([]);
    expect(() => planChunks(10_000, 1_000, 1_000)).toThrow();
  });
});

describe('stitch', () => {
  it('shifts word times by each chunk start', () => {
    const t = stitch([
      { chunk: { startMs: 0, endMs: 10_000 }, transcript: words(['hello', 100, 400]) },
      { chunk: { startMs: 8_000, endMs: 18_000 }, transcript: words(['world', 5_000, 5_400]) },
    ]);
    expect(t.words.map((w) => [w.word, w.startMs, w.endMs])).toEqual([
      ['hello', 100, 400],
      ['world', 13_000, 13_400],
    ]);
    expect(t.text).toBe('hello world');
    expect(t.language).toBe('English');
  });

  it('keeps each overlapped word once, split at the middle of the overlap', () => {
    const t = stitch([
      {
        chunk: { startMs: 0, endMs: 10_000 },
        transcript: words(['a', 7_500, 7_800], ['b', 8_500, 8_800], ['c', 9_500, 9_800]),
      },
      {
        chunk: { startMs: 8_000, endMs: 18_000 },
        transcript: words(['b', 500, 800], ['c', 1_500, 1_800], ['d', 3_000, 3_300]),
      },
    ]);
    expect(t.words.map((w) => [w.word, w.startMs])).toEqual([
      ['a', 7_500],
      ['b', 8_500],
      ['c', 9_500],
      ['d', 11_000],
    ]);
  });

  it('switches chunks at a word both heard, even when their times disagree', () => {
    const t = stitch([
      {
        chunk: { startMs: 0, endMs: 4_000 },
        transcript: words(['the', 3_020, 3_100], ['exact', 3_180, 3_400], ['moment', 3_540, 3_900]),
      },
      {
        chunk: { startMs: 3_000, endMs: 7_000 },
        transcript: words(
          ['the', 0, 100],
          ['exact', 180, 400],
          ['moment', 460, 800],
          ['where', 900, 1_100],
        ),
      },
    ]);
    expect(t.text).toBe('the exact moment where');
    expect(t.words.find((w) => w.word === 'moment')?.startMs).toBe(3_460);
  });

  it('matches words ignoring case and punctuation', () => {
    const t = stitch([
      { chunk: { startMs: 0, endMs: 4_000 }, transcript: words(['Then,', 3_400, 3_600]) },
      {
        chunk: { startMs: 3_000, endMs: 7_000 },
        transcript: words(['then', 600, 800], ['jump', 900, 1_100]),
      },
    ]);
    expect(t.text).toBe('then jump');
  });

  it('falls back to the middle of the overlap when no word matches', () => {
    const t = stitch([
      {
        chunk: { startMs: 0, endMs: 4_000 },
        transcript: words(['one', 3_100, 3_300], ['two', 3_600, 3_800]),
      },
      {
        chunk: { startMs: 3_000, endMs: 7_000 },
        transcript: words(['uno', 100, 300], ['dos', 600, 800], ['three', 1_200, 1_400]),
      },
    ]);
    expect(t.text).toBe('one dos three');
  });

  it('returns an empty transcript when nothing was said', () => {
    expect(stitch([{ chunk: { startMs: 0, endMs: 5_000 }, transcript: words() }])).toEqual({
      text: '',
      language: 'English',
      words: [],
    });
  });
});
