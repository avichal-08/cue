import { getObject, putObject, type Transcript } from '@cue/core';
import { chunkMs, overlapMs } from './chunks';

const version = `c${chunkMs}-o${overlapMs}`;

export function transcriptCacheKey(audioHash: string, modelId: string) {
  const model = modelId.replace(/[^a-z0-9.-]+/gi, '_');
  return `cache/transcripts/${model}/${version}/${audioHash}.json`;
}

export function parseTranscript(raw: string): Transcript | undefined {
  try {
    const t = JSON.parse(raw) as Partial<Transcript>;
    if (typeof t.text !== 'string' || !Array.isArray(t.words)) return undefined;
    const valid = t.words.every(
      (w) => typeof w.word === 'string' && Number.isFinite(w.startMs) && Number.isFinite(w.endMs),
    );
    return valid ? { text: t.text, language: t.language, words: t.words } : undefined;
  } catch {
    return undefined;
  }
}

export async function readTranscript(key: string): Promise<Transcript | undefined> {
  try {
    return parseTranscript((await getObject(key)).toString('utf8'));
  } catch (err) {
    if ((err as { name?: string }).name === 'NoSuchKey') return undefined;
    throw err;
  }
}

export async function writeTranscript(key: string, transcript: Transcript) {
  await putObject(key, JSON.stringify(transcript), 'application/json');
}
