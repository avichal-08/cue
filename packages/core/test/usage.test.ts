import { afterEach, describe, expect, it } from 'vitest';
import { geminiOcr } from '../src/gemini';
import { groqSpeechToText } from '../src/groq';
import { ProviderError } from '../src/providers';
import {
  geminiUsage,
  metered,
  onProviderCall,
  withCallContext,
  type CallContext,
  type ProviderCall,
} from '../src/usage';

const seen: { call: ProviderCall; ctx?: CallContext }[] = [];
let off = onProviderCall((call, ctx) => seen.push({ call, ctx }));

afterEach(() => {
  seen.length = 0;
  off();
  off = onProviderCall((call, ctx) => seen.push({ call, ctx }));
});

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('metered', () => {
  it('reports request and response usage with the current context', async () => {
    const value = await withCallContext({ source: 'worker', videoId: 'v1', stage: 'see' }, () =>
      metered({ provider: 'p', model: 'm', operation: 'ocr', request: { images: 1 } }, () =>
        Promise.resolve({ value: 42, usage: { inputTokens: 10 } }),
      ),
    );
    expect(value).toBe(42);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.call).toMatchObject({
      provider: 'p',
      model: 'm',
      operation: 'ocr',
      images: 1,
      inputTokens: 10,
      ok: true,
    });
    expect(seen[0]!.ctx).toEqual({ source: 'worker', videoId: 'v1', stage: 'see' });
  });

  it('reports failures with the provider status and rethrows', async () => {
    await expect(
      metered({ provider: 'p', model: 'm', operation: 'rerank' }, () =>
        Promise.reject(new ProviderError('p', 503, 'busy')),
      ),
    ).rejects.toThrow('busy');
    expect(seen[0]!.call).toMatchObject({ ok: false, status: 503 });
    expect(seen[0]!.ctx).toBeUndefined();
  });

  it('keeps going when a listener throws', async () => {
    const stop = onProviderCall(() => {
      throw new Error('boom');
    });
    await metered({ provider: 'p', model: 'm', operation: 'answer' }, () =>
      Promise.resolve({ value: 1 }),
    );
    stop();
    expect(seen).toHaveLength(1);
  });
});

describe('provider usage', () => {
  it('reads gemini token counts, folding thinking into output', () => {
    expect(
      geminiUsage({
        usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 20, thoughtsTokenCount: 5 },
      }),
    ).toEqual({ inputTokens: 300, outputTokens: 25 });
    expect(geminiUsage({})).toEqual({});
  });

  it('meters groq audio from the reported duration', async () => {
    const stt = groqSpeechToText({
      apiKey: 'k',
      fetch: () => json({ text: 'hi', duration: 12.5, words: [] }),
    });
    await stt.transcribe(Buffer.from('x'), 'audio/flac');
    expect(seen[0]!.call).toMatchObject({
      provider: 'groq',
      operation: 'transcribe',
      audioMs: 12_500,
    });
  });

  it('meters gemini ocr with image count and tokens', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff]);
    const ocr = geminiOcr({
      apiKey: 'k',
      fetch: () =>
        json({
          candidates: [{ content: { parts: [{ text: '["hello"]' }] } }],
          usageMetadata: { promptTokenCount: 270, candidatesTokenCount: 4 },
        }),
    });
    await ocr.read(jpeg);
    expect(seen[0]!.call).toMatchObject({
      operation: 'ocr',
      images: 1,
      inputTokens: 270,
      outputTokens: 4,
      ok: true,
    });
  });
});
