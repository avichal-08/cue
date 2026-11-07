import { describe, expect, it } from 'vitest';
import { snapToWords, type WordTiming } from '../src/search/snap';

const words: WordTiming[] = [
  { word: 'we', startMs: 1_000, endMs: 1_200 },
  { word: 'use', startMs: 1_300, endMs: 1_600 },
  { word: 'pgvector', startMs: 1_700, endMs: 2_500 },
  { word: 'for', startMs: 4_000, endMs: 4_200 },
  { word: 'search', startMs: 4_300, endMs: 4_900 },
];

describe('snapToWords', () => {
  it('moves edges that cut a word out to the word boundary', () => {
    expect(snapToWords({ startMs: 1_450, endMs: 2_000 }, words, { pad: 0 })).toEqual({
      startMs: 1_300,
      endMs: 2_500,
    });
  });

  it('pads into silence but never into a neighbouring word', () => {
    expect(snapToWords({ startMs: 1_300, endMs: 2_500 }, words, { pad: 400 })).toEqual({
      startMs: 1_200,
      endMs: 2_900,
    });
  });

  it('pads fully when the silence is long enough', () => {
    expect(snapToWords({ startMs: 3_000, endMs: 3_500 }, words, { pad: 400 })).toEqual({
      startMs: 2_600,
      endMs: 3_900,
    });
  });

  it('keeps edges inside the video', () => {
    expect(
      snapToWords({ startMs: 100, endMs: 9_800 }, [], { pad: 400, durationMs: 10_000 }),
    ).toEqual({
      startMs: 0,
      endMs: 10_000,
    });
  });

  it('leaves edges that already sit on a word boundary alone before padding', () => {
    expect(snapToWords({ startMs: 4_000, endMs: 4_900 }, words, { pad: 0 })).toEqual({
      startMs: 4_000,
      endMs: 4_900,
    });
  });

  it('pads silent clips with no words', () => {
    expect(snapToWords({ startMs: 8_000, endMs: 16_000 }, [], { pad: 400 })).toEqual({
      startMs: 7_600,
      endMs: 16_400,
    });
  });
});
