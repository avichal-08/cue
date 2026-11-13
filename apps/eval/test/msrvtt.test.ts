import { describe, expect, it } from 'vitest';
import { parseDataset } from '../src/dataset';
import { pick, toDataset } from '../src/msrvtt';
import { firstPerVideo } from '../src/runner';

describe('msrvtt', () => {
  it('picks an evenly spaced subset', () => {
    const items = Array.from({ length: 1000 }, (_, i) => i);
    const subset = pick(items, 100);
    expect(subset).toHaveLength(100);
    expect(subset.slice(0, 3)).toEqual([0, 10, 20]);
    expect(pick(items, 5000)).toHaveLength(1000);
  });

  it('builds a valid dataset with one video per query', () => {
    const d = parseDataset(
      toDataset('msrvtt-1k-a-1', [{ video_id: 'video7020', caption: ' a woman baking ' }]),
    );
    expect(d.queries[0]).toEqual({
      id: 'video7020',
      q: 'a woman baking',
      expect: [{ video: 'msrvtt video7020' }],
    });
  });

  it('keeps only the first clip of each video when ranking by video', () => {
    const hit = (videoId: string, startMs: number) => ({
      videoId,
      title: videoId,
      startMs,
      endMs: startMs + 1000,
      score: null,
    });
    const ranked = firstPerVideo([hit('a', 0), hit('a', 5000), hit('b', 0), hit('a', 9000)]);
    expect(ranked.map((h) => `${h.videoId}@${h.startMs}`)).toEqual(['a@0', 'b@0']);
  });
});
