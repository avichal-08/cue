import { describe, expect, it } from 'vitest';
import { aboveFloor, fuse, type Ranked } from '../src/search/fuse';

const list = (...ids: string[]): Ranked[] =>
  ids.map((segmentId, i) => ({ segmentId, score: 1 - i / 10 }));
const even = { transcript: 1, ocr: 1, visual: 1, keyword: 1 };

describe('fuse', () => {
  it('scores by weight / (k + rank) summed across lists', () => {
    const [top] = fuse({ transcript: list('a'), keyword: list('a') }, even, 60);
    expect(top!.score).toBeCloseTo(2 / 61);
  });

  it('rewards agreement between lists over a single top rank', () => {
    const fused = fuse(
      { transcript: list('solo', 'both'), ocr: list('x', 'both'), keyword: list('y', 'both') },
      even,
    );
    expect(fused[0]!.segmentId).toBe('both');
  });

  it('records each modality rank and raw score for explanations', () => {
    const [a] = fuse({ visual: list('z', 'a'), keyword: [{ segmentId: 'a', score: 0.42 }] }, even);
    expect(a).toMatchObject({
      segmentId: 'a',
      matches: { visual: { rank: 2, score: 0.9 }, keyword: { rank: 1, score: 0.42 } },
    });
  });

  it('applies modality weights', () => {
    const lists = { transcript: list('t'), visual: list('v') };
    expect(fuse(lists, { ...even, visual: 0.5 })[0]!.segmentId).toBe('t');
    expect(fuse(lists, { ...even, transcript: 0.5 })[0]!.segmentId).toBe('v');
  });

  it('counts a duplicate within one list once, at its best rank', () => {
    const [a] = fuse({ transcript: list('a', 'b', 'a') }, even, 60);
    expect(a!.score).toBeCloseTo(1 / 61);
    expect(fuse({ transcript: list('a', 'b', 'a') }, even)).toHaveLength(2);
  });

  it('breaks ties by id so results are stable', () => {
    expect(fuse({ transcript: list('b'), ocr: list('a') }, even).map((f) => f.segmentId)).toEqual([
      'a',
      'b',
    ]);
  });

  it('returns nothing for no lists', () => {
    expect(fuse({})).toEqual([]);
  });
});

describe('aboveFloor', () => {
  it('drops vector hits below their modality floor and keeps keyword hits', () => {
    const kept = aboveFloor(
      {
        transcript: [
          { segmentId: 'a', score: 0.8 },
          { segmentId: 'b', score: 0.6 },
        ],
        visual: [{ segmentId: 'c', score: 0.64 }],
        keyword: [{ segmentId: 'd', score: 0.01 }],
      },
      { transcript: 0.65, visual: 0.65 },
    );
    expect(kept).toEqual({
      transcript: [{ segmentId: 'a', score: 0.8 }],
      visual: [],
      keyword: [{ segmentId: 'd', score: 0.01 }],
    });
  });

  it('lets a strong single-modality match win once noise is removed', () => {
    const lists = {
      transcript: [{ segmentId: 'talk', score: 0.53 }],
      visual: [{ segmentId: 'blue', score: 0.73 }],
    };
    expect(fuse(lists)[0]!.segmentId).toBe('talk');
    expect(fuse(aboveFloor(lists))[0]!.segmentId).toBe('blue');
  });
});
