import { UnrecoverableError } from 'bullmq';
import { env, groqSpeechToText, ProviderError, type SpeechToText } from '@cue/core';

let cachedStt: SpeechToText | undefined;

export function stt(): SpeechToText {
  const { GROQ_API_KEY, GROQ_STT_MODEL } = env();
  if (!GROQ_API_KEY) throw new UnrecoverableError('GROQ_API_KEY is not set');
  cachedStt ??= groqSpeechToText({ apiKey: GROQ_API_KEY, model: GROQ_STT_MODEL });
  return cachedStt;
}

export function asJobError(err: unknown): unknown {
  return err instanceof ProviderError && !err.retryable ? new UnrecoverableError(err.message) : err;
}
