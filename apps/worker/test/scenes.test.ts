import { describe, expect, it } from 'vitest';
import { parseSceneScores, pickCuts, type FrameScore } from '../src/scenes';

const output = [
  'frame:0    pts:0       pts_time:0',
  'lavfi.scene_score=0.000000',
  'frame:1    pts:46080   pts_time:3',
  'lavfi.scene_score=0.688130',
  'frame:2    pts:92160   pts_time:6.0335',
  'lavfi.scene_score=0.063590',
].join('\r\n');

function series(fps: number, seconds: number, base: (ms: number) => number): FrameScore[] {
  return Array.from({ length: fps * seconds }, (_, i) => {
    const ms = Math.round((i * 1000) / fps);
    return { ms, score: base(ms) };
  });
}

describe('parseSceneScores', () => {
  it('pairs each frame time with its score in ms', () => {
    expect(parseSceneScores(output)).toEqual([
      { ms: 0, score: 0 },
      { ms: 3_000, score: 0.68813 },
      { ms: 6_034, score: 0.06359 },
    ]);
  });

  it('returns nothing for empty output', () => {
    expect(parseSceneScores('')).toEqual([]);
  });
});

describe('pickCuts', () => {
  it('cuts on hard scene changes', () => {
    const scores = series(25, 10, (ms) => (ms === 4_000 ? 0.7 : 0.01));
    expect(pickCuts(scores, 10_000)).toEqual([4_000]);
  });

  it('cuts on a small change that spikes above a still background', () => {
    const scores = series(25, 10, (ms) => (ms === 6_000 ? 0.064 : 0));
    expect(pickCuts(scores, 10_000)).toEqual([6_000]);
  });

  it('ignores small changes inside steady motion', () => {
    const scores = series(25, 10, (ms) => (ms === 6_000 ? 0.12 : 0.05));
    expect(pickCuts(scores, 10_000)).toEqual([]);
  });

  it('ignores motion below the soft floor', () => {
    const scores = series(25, 10, (ms) => (ms % 1_000 === 0 ? 0.015 : 0.0005));
    expect(pickCuts(scores, 10_000)).toEqual([]);
  });

  it('never cuts at the very start or at the end', () => {
    const scores = [
      { ms: 0, score: 1 },
      { ms: 40, score: 0 },
      { ms: 9_960, score: 0 },
      { ms: 10_000, score: 1 },
    ];
    expect(pickCuts(scores, 10_000)).toEqual([]);
  });

  it('finds every slide change in a slide talk', () => {
    const changes = [40_000, 48_000, 56_000];
    const scores = series(25, 64, (ms) =>
      ms === 40_000 ? 0.064 : ms === 48_000 ? 1 : ms === 56_000 ? 0.39 : 0,
    );
    expect(pickCuts(scores, 64_000)).toEqual(changes);
  });
});
