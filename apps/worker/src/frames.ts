import { createReadStream } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { uploadStream } from '@cue/core';
import { db, frames } from '@cue/db';
import { eq } from 'drizzle-orm';
import { run } from './exec';

export const frameIntervalMs = 2_000;
const maxSide = 1024;
const uploadConcurrency = 8;
const insertChunk = 500;

export const frameKey = (videoId: string, tsMs: number) =>
  `videos/${videoId}/frames/${String(tsMs).padStart(9, '0')}.jpg`;

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]!);
  });
  await Promise.all(workers);
}

export async function sampleFrames(videoId: string, input: string, durationMs: number) {
  if (!ffmpeg) throw new Error('ffmpeg binary missing');
  const dir = await mkdtemp(join(tmpdir(), 'cue-frames-'));
  try {
    await run(ffmpeg, [
      '-v',
      'error',
      '-i',
      input,
      '-map',
      '0:v:0',
      '-vf',
      `fps=1000/${frameIntervalMs},scale='min(${maxSide},iw)':'min(${maxSide},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`,
      '-q:v',
      '4',
      join(dir, '%06d.jpg'),
    ]);

    const files = (await readdir(dir)).filter((f) => f.endsWith('.jpg')).sort();
    const rows = files
      .map((file, i) => ({ file, tsMs: i * frameIntervalMs }))
      .filter((f) => f.tsMs < durationMs)
      .map(({ file, tsMs }) => ({ file, tsMs, storageKey: frameKey(videoId, tsMs) }));

    await mapLimit(rows, uploadConcurrency, (r) =>
      uploadStream(r.storageKey, createReadStream(join(dir, r.file)), 'image/jpeg'),
    );

    const values = rows.map(({ tsMs, storageKey }) => ({ videoId, tsMs, storageKey }));
    const inserts = [];
    for (let i = 0; i < values.length; i += insertChunk)
      inserts.push(db.insert(frames).values(values.slice(i, i + insertChunk)));
    await db.batch([db.delete(frames).where(eq(frames.videoId, videoId)), ...inserts]);

    return rows.length;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
