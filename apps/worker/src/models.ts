import { UnrecoverableError } from 'bullmq';
import {
  env,
  geminiEmbedder,
  groqSpeechToText,
  ProviderError,
  type ImageEmbedder,
  type SpeechToText,
  type TextEmbedder,
} from '@cue/core';

let cachedStt: SpeechToText | undefined;
let cachedEmbedder: (TextEmbedder & ImageEmbedder) | undefined;

export function stt(): SpeechToText {
  const { GROQ_API_KEY, GROQ_STT_MODEL } = env();
  if (!GROQ_API_KEY) throw new UnrecoverableError('GROQ_API_KEY is not set');
  cachedStt ??= groqSpeechToText({ apiKey: GROQ_API_KEY, model: GROQ_STT_MODEL });
  return cachedStt;
}

export function embedder(): TextEmbedder & ImageEmbedder {
  const { GEMINI_API_KEY, GEMINI_EMBED_MODEL } = env();
  if (!GEMINI_API_KEY) throw new UnrecoverableError('GEMINI_API_KEY is not set');
  cachedEmbedder ??= geminiEmbedder({ apiKey: GEMINI_API_KEY, model: GEMINI_EMBED_MODEL });
  return cachedEmbedder;
}

export function asJobError(err: unknown): unknown {
  return err instanceof ProviderError && !err.retryable ? new UnrecoverableError(err.message) : err;
}
