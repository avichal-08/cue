import { afterEach, describe, expect, it } from 'vitest';
import { limiter } from '../src/limits';
import { groqSpeechToText, toTranscript } from '../src/groq';
import { ProviderError } from '../src/providers';

const body = {
  text: ' Hello world. ',
  language: 'English',
  words: [
    { word: ' Hello', start: 0.12, end: 0.48 },
    { word: ' ', start: 0.48, end: 0.5 },
    { word: 'world.', start: 0.5, end: 1.0049 },
  ],
};

function fakeFetch(response: Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl: typeof fetch = (url, init) => {
    const href = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    calls.push({ url: href, init: init! });
    return Promise.resolve(response);
  };
  return { calls, impl };
}

afterEach(() => limiter.reset());

describe('toTranscript', () => {
  it('converts seconds to ms, trims words and drops empty ones', () => {
    expect(toTranscript(body)).toEqual({
      text: 'Hello world.',
      language: 'English',
      words: [
        { word: 'Hello', startMs: 120, endMs: 480 },
        { word: 'world.', startMs: 500, endMs: 1005 },
      ],
    });
  });

  it('handles a response with no speech', () => {
    expect(toTranscript({})).toEqual({ text: '', language: undefined, words: [] });
  });
});

describe('groqSpeechToText', () => {
  it('posts the audio with word timestamps and parses the reply', async () => {
    const { calls, impl } = fakeFetch(Response.json(body));
    const stt = groqSpeechToText({ apiKey: 'k', fetch: impl });

    const transcript = await stt.transcribe(Buffer.from('flac'), 'audio/flac');

    expect(stt.id).toBe('groq/whisper-large-v3-turbo');
    expect(transcript.words).toHaveLength(2);
    expect(calls[0]!.url).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
    expect(calls[0]!.init.headers).toEqual({ authorization: 'Bearer k' });

    const form = calls[0]!.init.body as FormData;
    expect(form.get('model')).toBe('whisper-large-v3-turbo');
    expect(form.get('response_format')).toBe('verbose_json');
    expect(form.get('timestamp_granularities[]')).toBe('word');
    expect(form.get('temperature')).toBe('0');
    expect(form.get('language')).toBeNull();
    expect((form.get('file') as File).name).toBe('audio.flac');
  });

  it('throws a retryable error with retry-after on 429', async () => {
    const { impl } = fakeFetch(
      new Response('rate limited', { status: 429, headers: { 'retry-after': '7' } }),
    );
    const err = await groqSpeechToText({ apiKey: 'k', fetch: impl })
      .transcribe(Buffer.from('x'), 'audio/flac')
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toMatchObject({ status: 429, retryAfterMs: 7_000, retryable: true });
  });

  it('marks client errors as not retryable', async () => {
    const { impl } = fakeFetch(new Response('bad key', { status: 401 }));
    const err = await groqSpeechToText({ apiKey: 'k', fetch: impl })
      .transcribe(Buffer.from('x'), 'audio/flac')
      .catch((e: unknown) => e);

    expect(err).toMatchObject({ status: 401, retryable: false });
  });
});
