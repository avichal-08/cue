import { describe, expect, it } from 'vitest';
import { pickKeyframe, type FrameRef } from '../src/keyframes';

const frames: FrameRef[] = [0, 2_000, 4_000, 6_000, 8_000, 10_000].map((tsMs) => ({
  id: `f${tsMs}`,
  tsMs,
  storageKey: `frames/${tsMs}.jpg`,
}));

describe('pickKeyframe', () => {
  it('picks the frame closest to the middle of the segment', () => {
    expect(pickKeyframe({ startMs: 0, endMs: 9_000 }, frames)?.tsMs).toBe(4_000);
    expect(pickKeyframe({ startMs: 6_000, endMs: 12_000 }, frames)?.tsMs).toBe(8_000);
  });

  it('only considers frames inside the segment', () => {
    expect(pickKeyframe({ startMs: 9_000, endMs: 30_000 }, frames)?.tsMs).toBe(10_000);
  });

  it('prefers the earlier frame on a tie', () => {
    expect(pickKeyframe({ startMs: 2_000, endMs: 8_000 }, frames)?.tsMs).toBe(4_000);
  });

  it('falls back to the nearest frame when none fall inside', () => {
    expect(pickKeyframe({ startMs: 10_500, endMs: 11_500 }, frames)?.tsMs).toBe(10_000);
  });

  it('returns undefined when the video has no frames', () => {
    expect(pickKeyframe({ startMs: 0, endMs: 5_000 }, [])).toBeUndefined();
  });
});
