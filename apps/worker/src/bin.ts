import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { env } from '@cue/core';

export function ffmpegBin(): string {
  const bin = env().FFMPEG_PATH ?? ffmpegStatic;
  if (!bin) throw new Error('ffmpeg binary missing');
  return bin;
}

export function ffprobeBin(): string {
  return env().FFPROBE_PATH ?? ffprobeStatic.path;
}
