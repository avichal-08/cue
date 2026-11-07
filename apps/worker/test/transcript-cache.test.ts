import { describe, expect, it } from 'vitest';
import { parseTranscript, transcriptCacheKey } from '../src/transcript-cache';

describe('transcriptCacheKey', () => {
  it('keys by model, chunk settings and audio hash', () => {
    expect(transcriptCacheKey('abc123', 'groq/whisper-large-v3-turbo')).toBe(
      'cache/transcripts/groq_whisper-large-v3-turbo/c600000-o5000/abc123.json',
    );
  });

  it('gives different models different keys', () => {
    expect(transcriptCacheKey('h', 'groq/whisper-large-v3')).not.toBe(
      transcriptCacheKey('h', 'groq/whisper-large-v3-turbo'),
    );
  });
});

describe('parseTranscript', () => {
  const good = {
    text: 'hi there',
    language: 'English',
    words: [{ word: 'hi', startMs: 0, endMs: 200 }],
  };

  it('reads a saved transcript back', () => {
    expect(parseTranscript(JSON.stringify(good))).toEqual(good);
  });

  it('treats broken or wrong-shaped files as a miss', () => {
    expect(parseTranscript('{not json')).toBeUndefined();
    expect(parseTranscript('{"text":"x"}')).toBeUndefined();
    expect(parseTranscript('{"text":"x","words":[{"word":"a","startMs":"0"}]}')).toBeUndefined();
  });
});
