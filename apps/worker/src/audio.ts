import { createReadStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { uploadStream } from '@cue/core';
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
