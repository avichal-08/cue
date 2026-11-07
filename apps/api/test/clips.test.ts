import { describe, expect, it } from 'vitest';
import { mergeIntoClips, type ClipPart } from '../src/search/clips';

const part = (
  segmentId: string,
  videoId: string,
  startMs: number,
  endMs: number,
  rank: number,
): ClipPart => ({
  segmentId,
  videoId,
  startMs,
  endMs,
  rank,
});

describe('mergeIntoClips', () => {
  it('merges touching hits from the same video into one clip', () => {
    const clips = mergeIntoClips([part('b', 'v', 10_000, 20_000, 1), part('a', 'v', 0, 10_000, 2)]);
    expect(clips).toHaveLength(1);
    expect(clips[0]).toMatchObject({ videoId: 'v', startMs: 0, endMs: 20_000, rank: 1 });
    expect(clips[0]!.parts.map((p) => p.segmentId)).toEqual(['b', 'a']);
  });

  it('keeps hits apart when the gap is too large', () => {
    const clips = mergeIntoClips([part('a', 'v', 0, 10_000, 1), part('b', 'v', 12_000, 20_000, 2)]);
    expect(clips.map((c) => [c.startMs, c.endMs])).toEqual([
      [0, 10_000],
      [12_000, 20_000],
    ]);
  });

  it('allows a small gap', () => {
    const clips = mergeIntoClips([part('a', 'v', 0, 10_000, 1), part('b', 'v', 10_800, 20_000, 2)]);
    expect(clips).toHaveLength(1);
  });

  it('never merges across videos', () => {
    const clips = mergeIntoClips([
      part('a', 'v1', 0, 10_000, 1),
      part('b', 'v2', 10_000, 20_000, 2),
    ]);
    expect(clips.map((c) => c.videoId)).toEqual(['v1', 'v2']);
  });

  it('stops growing a clip at the maximum length', () => {
    const hits = [0, 1, 2, 3].map((i) => part(`s${i}`, 'v', i * 30_000, (i + 1) * 30_000, i + 1));
    const clips = mergeIntoClips(hits, { maxMs: 90_000 });
    expect(clips.map((c) => [c.startMs, c.endMs])).toEqual([
      [0, 90_000],
      [90_000, 120_000],
    ]);
  });

  it('orders clips by their best hit', () => {
    const clips = mergeIntoClips([
      part('x', 'v1', 0, 5_000, 3),
      part('y', 'v2', 0, 5_000, 1),
      part('z', 'v1', 5_000, 9_000, 2),
    ]);
    expect(clips.map((c) => [c.videoId, c.rank])).toEqual([
      ['v2', 1],
      ['v1', 2],
    ]);
  });

  it('returns nothing for no hits', () => {
    expect(mergeIntoClips([])).toEqual([]);
  });
});
