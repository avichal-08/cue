import { describe, expect, it } from 'vitest';
import { geminiOcr, ocrPrompt, parseOcrReply } from '../src/gemini';
import { ProviderError } from '../src/providers';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
const reply = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] });

function fakeFetch(response: Response) {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const impl: typeof fetch = (url, init) => {
    sent.push({
      url: url as string,
      body: JSON.parse(init!.body as string) as Record<string, unknown>,
    });
    return Promise.resolve(response);
  };
  return { sent, impl };
}

describe('parseOcrReply', () => {
  it('returns trimmed, non-empty text blocks', () => {
    expect(parseOcrReply(reply('["  Title  ", "", "def f():\\n    return 1", 3]'))).toEqual([
      'Title',
      'def f():\n    return 1',
    ]);
  });

  it('joins json split across parts', () => {
    const body = { candidates: [{ content: { parts: [{ text: '["a",' }, { text: '"b"]' }] } }] };
    expect(parseOcrReply(body)).toEqual(['a', 'b']);
  });

  it('treats an empty reply as no text', () => {
    expect(parseOcrReply({})).toEqual([]);
    expect(parseOcrReply(reply('[]'))).toEqual([]);
  });

  it('rejects a reply that is not a list', () => {
    expect(() => parseOcrReply(reply('{"text":"x"}'))).toThrow(ProviderError);
  });
});

describe('geminiOcr', () => {
  it('sends the frame inline with the prompt and asks for a json list', async () => {
    const { sent, impl } = fakeFetch(Response.json(reply('["SELECT * FROM users"]')));
    const ocr = geminiOcr({ apiKey: 'k', fetch: impl });

    expect(await ocr.read(jpeg)).toEqual([{ text: 'SELECT * FROM users' }]);
    expect(ocr.id).toBe('gemini/gemini-3.5-flash-lite');
    expect(sent[0]!.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
    );
    expect(sent[0]!.body).toEqual({
      contents: [
        {
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: jpeg.toString('base64') } },
            { text: ocrPrompt },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: { type: 'ARRAY', items: { type: 'STRING' } },
      },
    });
  });

  it('turns broken json into a retryable provider error', async () => {
    const { impl } = fakeFetch(Response.json(reply('["unterminated')));
    const err = await geminiOcr({ apiKey: 'k', fetch: impl })
      .read(jpeg)
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 502, retryable: true });
  });

  it('passes http errors through with their status', async () => {
    const { impl } = fakeFetch(
      new Response('quota', { status: 429, headers: { 'retry-after': '5' } }),
    );
    const err = await geminiOcr({ apiKey: 'k', fetch: impl })
      .read(jpeg)
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 429, retryAfterMs: 5_000 });
  });
});
