import ffmpeg from 'ffmpeg-static';
import { run } from './exec';

export const sceneThreshold = 0.3;
const analysisWidth = 320;

export function parseSceneCuts(output: string, durationMs: number): number[] {
  const cuts = new Set<number>();
  for (const match of output.matchAll(/pts_time:(\d+(?:\.\d+)?)/g)) {
    const ms = Math.round(Number(match[1]) * 1000);
    if (ms > 0 && ms < durationMs) cuts.add(ms);
  }
  return [...cuts].sort((a, b) => a - b);
}

export async function detectScenes(input: string, durationMs: number): Promise<number[]> {
  if (!ffmpeg) throw new Error('ffmpeg binary missing');
  const out = await run(ffmpeg, [
    '-v',
    'error',
    '-i',
    input,
    '-map',
    '0:v:0',
    '-an',
    '-vf',
    `scale=${analysisWidth}:-2,select='gt(scene,${sceneThreshold})',metadata=print:file=-`,
    '-f',
    'null',
    '-',
  ]);
  return parseSceneCuts(out, durationMs);
}
