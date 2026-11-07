import { env, geminiEmbedder, type ImageEmbedder, type TextEmbedder } from '@cue/core';
import { HttpError } from './errors';

let cachedEmbedder: (TextEmbedder & ImageEmbedder) | undefined;

export function embedder(): TextEmbedder & ImageEmbedder {
  const { GEMINI_API_KEY, GEMINI_EMBED_MODEL } = env();
  if (!GEMINI_API_KEY)
    throw new HttpError(503, 'search is not configured: GEMINI_API_KEY is missing');
  cachedEmbedder ??= geminiEmbedder({ apiKey: GEMINI_API_KEY, model: GEMINI_EMBED_MODEL });
  return cachedEmbedder;
}
