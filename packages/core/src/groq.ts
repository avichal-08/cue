import { ProviderError, type SpeechToText, type Transcript } from './providers';
import { metered } from './usage';

const endpoint = 'https://api.groq.com/openai/v1/audio/transcriptions';

const extensions: Record<string, string> = {
  'audio/flac': 'flac',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
};

interface VerboseJson {
  text?: string;
  duration?: number;
  language?: string;
  words?: { word: string; start: number; end: number }[];
}

export function toTranscript(body: VerboseJson): Transcript {
  return {
    text: (body.text ?? '').trim(),
    language: body.language,
    words: (body.words ?? [])
      .map((w) => ({
        word: w.word.trim(),
        startMs: Math.round(w.start * 1000),
        endMs: Math.round(w.end * 1000),
      }))
      .filter((w) => w.word),
  };
}

function retryAfterMs(res: Response) {
  const seconds = Number(res.headers.get('retry-after'));
  return seconds > 0 ? seconds * 1000 : undefined;
}

export interface GroqOptions {
  apiKey: string;
  model?: string;
  language?: string;
  fetch?: typeof fetch;
}

export function groqSpeechToText({
  apiKey,
  model = 'whisper-large-v3-turbo',
  language,
  fetch: fetchImpl = fetch,
}: GroqOptions): SpeechToText {
  return {
    id: `groq/${model}`,
    async transcribe(audio, mimeType) {
      const form = new FormData();
      const ext = extensions[mimeType] ?? 'flac';
      form.append('file', new Blob([audio], { type: mimeType }), `audio.${ext}`);
      form.append('model', model);
      form.append('response_format', 'verbose_json');
      form.append('timestamp_granularities[]', 'word');
      form.append('temperature', '0');
      if (language) form.append('language', language);

      return metered({ provider: 'groq', model, operation: 'transcribe' }, async () => {
        const res = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { authorization: `Bearer ${apiKey}` },
          body: form,
        });
        if (!res.ok)
          throw new ProviderError('groq', res.status, await res.text(), retryAfterMs(res));
        const body = (await res.json()) as VerboseJson;
        const value = toTranscript(body);
        const audioMs = body.duration
          ? Math.round(body.duration * 1000)
          : (value.words.at(-1)?.endMs ?? 0);
        return { value, usage: { audioMs } };
      });
    },
  };
}
