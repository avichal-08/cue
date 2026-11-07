import { describe, expect, it } from 'vitest';
import { queryHash } from '../src/search/embed-query';

describe('queryHash', () => {
  it('treats case and spacing differences as the same query', () => {
    expect(queryHash('Vector  Database ')).toBe(queryHash('vector database'));
  });

  it('differs for different queries and never matches a document hash format', () => {
    expect(queryHash('vector database')).not.toBe(queryHash('vector databases'));
    expect(queryHash('x')).toMatch(/^[0-9a-f]{64}$/);
  });
});
