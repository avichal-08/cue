import { describe, expect, it } from 'vitest';
import { parseQuery, parseTime } from '../src/search/query';

const id = '903b0c1d-9aaa-462e-bddc-ece7ccab8a58';

describe('parseTime', () => {
  it.each([
    ['90', 90_000],
    ['2.5', 2_500],
    ['1:30', 90_000],
    ['1:02:03', 3_723_000],
    ['5m', 300_000],
    ['45s', 45_000],
    ['1h30m', 5_400_000],
    ['1H2M3S', 3_723_000],
  ])('reads %s as %d ms', (input, ms) => {
    expect(parseTime(input)).toBe(ms);
  });

  it.each(['', 'soon', '1:75', '1:60:00', 'm', '5x'])('rejects %j', (input) => {
    expect(parseTime(input)).toBeUndefined();
  });
});

describe('parseQuery', () => {
  it('keeps plain text as the search text', () => {
    expect(parseQuery('  vector  database setup ')).toEqual({
      text: 'vector database setup',
      filters: {},
    });
  });

  it('pulls video and time filters out of the text', () => {
    expect(parseQuery(`rerank top 50 video:${id.toUpperCase()} from:1:00 to:5m`)).toEqual({
      text: 'rerank top 50',
      filters: { videoId: id, fromMs: 60_000, toMs: 300_000 },
    });
  });

  it('swaps a reversed time range', () => {
    expect(parseQuery('x from:10m to:2m').filters).toEqual({ fromMs: 120_000, toMs: 600_000 });
  });

  it('leaves malformed filters in the text', () => {
    expect(parseQuery('video:abc from:later to: why http://x.io')).toEqual({
      text: 'video:abc from:later to: why http://x.io',
      filters: {},
    });
  });

  it('allows a filter-only query', () => {
    expect(parseQuery(`video:${id}`)).toEqual({ text: '', filters: { videoId: id } });
  });
});
