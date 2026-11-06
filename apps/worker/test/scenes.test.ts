import { describe, expect, it } from 'vitest';
import { parseSceneCuts } from '../src/scenes';

const output = [
  'frame:0    pts:46080   pts_time:3',
  'lavfi.scene_score=0.688130',
  'frame:1    pts:92160   pts_time:6.0335',
  'lavfi.scene_score=0.520802',
].join('\n');

describe('parseSceneCuts', () => {
  it('reads cut times in ms from ffmpeg metadata output', () => {
    expect(parseSceneCuts(output, 9_000)).toEqual([3_000, 6_034]);
  });

  it('drops cuts at the start, at or past the end, and duplicates', () => {
    const out = 'pts_time:0\npts_time:2.5\npts_time:2.5\npts_time:9\npts_time:12';
    expect(parseSceneCuts(out, 9_000)).toEqual([2_500]);
  });

  it('returns cuts sorted and nothing for empty output', () => {
    expect(parseSceneCuts('pts_time:5\npts_time:1', 9_000)).toEqual([1_000, 5_000]);
    expect(parseSceneCuts('', 9_000)).toEqual([]);
  });
});
