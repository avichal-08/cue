import ffmpeg from 'ffmpeg-static';
import { run } from './exec';

export const hardCut = 0.3;
export const softCut = 0.02;
export const spikeRatio = 4;
export const windowMs = 1_000;
const analysisWidth = 320;

export interface FrameScore {
  ms: number;
  score: number;
}

export function parseSceneScores(output: string): FrameScore[] {
  const scores: FrameScore[] = [];
  let ms: number | undefined;
  for (const line of output.split(/\r?\n/)) {
    const time = /pts_time:(\d+(?:\.\d+)?)/.exec(line);
    if (time) ms = Math.round(Number(time[1]) * 1000);
    const score = /lavfi\.scene_score=(\d+(?:\.\d+)?)/.exec(line);
    if (score && ms !== undefined) {
      scores.push({ ms, score: Number(score[1]) });
      ms = undefined;
    }
  }
  return scores.sort((a, b) => a.ms - b.ms);
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function pickCuts(scores: FrameScore[], durationMs: number): number[] {
  const cuts: number[] = [];
  let lo = 0;
  let hi = 0;
  scores.forEach(({ ms, score }, i) => {
    if (ms <= 0 || ms >= durationMs || score < softCut) return;
    while (scores[lo]!.ms < ms - windowMs) lo++;
    while (hi + 1 < scores.length && scores[hi + 1]!.ms <= ms + windowMs) hi++;
    const around = scores.slice(lo, hi + 1).filter((_, j) => lo + j !== i);
    if (score >= hardCut || score >= spikeRatio * median(around.map((s) => s.score))) cuts.push(ms);
  });
  return cuts;
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
    `scale=${analysisWidth}:-2,select='gte(scene,0)',metadata=print:file=-`,
    '-f',
    'null',
    '-',
  ]);
  return pickCuts(parseSceneScores(out), durationMs);
}
