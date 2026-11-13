import { describe, expect, it } from 'vitest';
import { mergeIntoClips, type ClipPart } from '../src/search/clips';

const part = (
  segmentId: string,
  videoId: string,
  startMs: number,
  endMs: number,
  rank: number,
  relevance = 1,
): ClipPart => ({ segmentId, videoId, startMs, endMs, rank, relevance });

const spans = (clips: ReturnType<typeof mergeIntoClips>) => clips.map((c) => [c.startMs, c.endMs]);

describe('mergeIntoClips', () => {
  it('merges touching hits from the same video into one clip', () => {
    const clips = mergeIntoClips([part('b', 'v', 10_000, 20_000, 1), part('a', 'v', 0, 10_000, 2)]);
    expect(clips).toHaveLength(1);
    expect(clips[0]).toMatchObject({ videoId: 'v', startMs: 0, endMs: 20_000, rank: 1 });
    expect(clips[0]!.parts.map((p) => p.segmentId)).toEqual(['b', 'a']);
  });

  it('keeps hits apart when the gap is too large', () => {
    const clips = mergeIntoClips([part('a', 'v', 0, 10_000, 1), part('b', 'v', 12_000, 20_000, 2)]);
    expect(spans(clips)).toEqual([
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

  it('only absorbs neighbours that are nearly as relevant as the seed', () => {
    const clips = mergeIntoClips([
      part('seed', 'v', 30_000, 40_000, 1, 1),
      part('close', 'v', 40_000, 50_000, 2, 0.9),
      part('weak', 'v', 20_000, 30_000, 3, 0.7),
    ]);
    expect(spans(clips)).toEqual([
      [30_000, 50_000],
      [20_000, 30_000],
    ]);
    expect(clips.map((c) => c.rank)).toEqual([1, 3]);
  });

  it('does not chain through a weak segment', () => {
    const clips = mergeIntoClips([
      part('a', 'v', 0, 10_000, 1, 1),
      part('gap', 'v', 10_000, 20_000, 3, 0.4),
      part('c', 'v', 20_000, 30_000, 2, 1),
    ]);
    expect(spans(clips)).toEqual([
      [0, 10_000],
      [20_000, 30_000],
      [10_000, 20_000],
    ]);
  });

  it('grows in both directions from the seed', () => {
    const clips = mergeIntoClips([
      part('mid', 'v', 10_000, 20_000, 1, 0.8),
      part('left', 'v', 0, 10_000, 2, 0.8),
      part('right', 'v', 20_000, 30_000, 3, 0.75),
    ]);
    expect(spans(clips)).toEqual([[0, 30_000]]);
    expect(clips[0]!.parts.map((p) => p.segmentId)).toEqual(['mid', 'left', 'right']);
  });

  it('stops growing a clip at the maximum length', () => {
    const hits = [0, 1, 2, 3].map((i) => part(`s${i}`, 'v', i * 30_000, (i + 1) * 30_000, i + 1));
    expect(spans(mergeIntoClips(hits, { maxMs: 90_000 }))).toEqual([
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
