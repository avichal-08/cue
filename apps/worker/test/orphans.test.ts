import { describe, expect, it } from 'vitest';
import { abandonAfterMs, planCleanup, videoIdOf } from '../src/orphans';

const now = Date.UTC(2026, 10, 13);
const row = (id: string, over: Partial<Parameters<typeof planCleanup>[1][number]> = {}) => ({
  id,
  sourceType: 'upload',
  status: 'ready',
  contentHash: 'h',
  createdAt: new Date(now - 2 * abandonAfterMs),
  ...over,
});

describe('planCleanup', () => {
  it('reads the video id from a key', () => {
    expect(videoIdOf('videos/abc/frames/000001000.jpg')).toBe('abc');
    expect(videoIdOf('other/abc/x')).toBeNull();
  });

  it('finds objects with no video and uploads that never completed', () => {
    const objects = [
      { key: 'videos/live/source.mp4', size: 10 },
      { key: 'videos/gone/source.mp4', size: 20 },
      { key: 'videos/gone/audio.flac', size: 5 },
      { key: 'videos/stuck/source.mp4', size: 7 },
      { key: 'videos/fresh/source.mp4', size: 3 },
      { key: 'notes/readme.txt', size: 1 },
    ];
    const rows = [
      row('live'),
      row('stuck', { status: 'pending', contentHash: null }),
      row('fresh', { status: 'pending', contentHash: null, createdAt: new Date(now - 60_000) }),
      row('link', { sourceType: 'url', status: 'pending', contentHash: null }),
    ];
    const plan = planCleanup(objects, rows, now);
    expect(plan.abandoned).toEqual(['stuck']);
    expect(plan.objects.map((o) => o.key)).toEqual([
      'videos/gone/source.mp4',
      'videos/gone/audio.flac',
      'videos/stuck/source.mp4',
    ]);
    expect(plan.bytes).toBe(32);
  });
});
