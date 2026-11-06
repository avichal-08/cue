import { UnrecoverableError } from 'bullmq';
import ffprobe from 'ffprobe-static';
import { run } from './exec';

interface ProbeOutput {
  streams?: {
    codec_type?: string;
    width?: number;
    height?: number;
    avg_frame_rate?: string;
    r_frame_rate?: string;
  }[];
  format?: { duration?: string };
}

export interface MediaInfo {
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
}

export function parseRate(rate: string | undefined) {
  const [num, den] = (rate ?? '').split('/').map(Number);
  if (!num || !den) return undefined;
  return Math.round((num / den) * 1000) / 1000;
}

export function toMediaInfo({ streams, format }: ProbeOutput): MediaInfo {
  const video = streams?.find((s) => s.codec_type === 'video');
  const hasAudio = !!streams?.some((s) => s.codec_type === 'audio');
  const durationMs = Math.round(Number(format?.duration) * 1000);
  const fps = parseRate(video?.avg_frame_rate) ?? parseRate(video?.r_frame_rate);
  if (!video?.width || !video.height || !fps || !(durationMs > 0))
    throw new UnrecoverableError('not a playable video');
  return { durationMs, width: video.width, height: video.height, fps, hasAudio };
}

export async function probe(input: string): Promise<MediaInfo> {
  const out = await run(ffprobe.path, [
    '-v',
    'error',
    '-show_entries',
    'stream=codec_type,width,height,avg_frame_rate,r_frame_rate:format=duration',
    '-of',
    'json',
    input,
  ]).catch((err: Error) => {
    if (/invalid data|moov atom not found/i.test(err.message))
      throw new UnrecoverableError('not a playable video');
    throw err;
  });
  return toMediaInfo(JSON.parse(out) as ProbeOutput);
}
