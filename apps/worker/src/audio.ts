import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { uploadStream } from '@cue/core';
import type { Span } from './bounds';
import { run } from './exec';

export const audioKey = (videoId: string) => `videos/${videoId}/audio.flac`;

export async function extractAudio(videoId: string, input: string) {
  if (!ffmpeg) throw new Error('ffmpeg binary missing');
  const dir = await mkdtemp(join(tmpdir(), 'cue-audio-'));
  try {
    const out = join(dir, 'audio.flac');
    await run(ffmpeg, [
      '-v',
      'error',
      '-y',
      '-i',
      input,
      '-map',
      '0:a:0',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-c:a',
      'flac',
      out,
    ]);
    const key = audioKey(videoId);
    await uploadStream(key, createReadStream(out), 'audio/flac');
    return key;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const seconds = (ms: number) => (ms / 1000).toFixed(3);

export async function cutAudio(input: string, { startMs, endMs }: Span): Promise<Buffer> {
  if (!ffmpeg) throw new Error('ffmpeg binary missing');
  const dir = await mkdtemp(join(tmpdir(), 'cue-chunk-'));
  try {
    const out = join(dir, 'chunk.flac');
    await run(ffmpeg, [
      '-v',
      'error',
      '-ss',
      seconds(startMs),
      '-t',
      seconds(endMs - startMs),
      '-i',
      input,
      '-c:a',
      'flac',
      out,
    ]);
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
