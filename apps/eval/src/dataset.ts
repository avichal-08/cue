import { readFile } from 'node:fs/promises';
import { z } from 'zod';

export function toMs(value: number | string): number {
  if (typeof value === 'number') return value;
  const parts = value.split(':').map(Number);
  if (parts.length < 1 || parts.length > 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) {
    throw new Error(`bad timestamp "${value}", use seconds, m:ss or h:mm:ss`);
  }
  return Math.round(parts.reduce((total, n) => total * 60 + n, 0) * 1000);
}

const time = z.union([z.number().int().min(0), z.string().min(1)]).transform(toMs);

const target = z
  .object({
    video: z.string().min(1),
    start: time.optional(),
    end: time.optional(),
  })
  .refine((t) => (t.start === undefined) === (t.end === undefined), 'give both start and end')
  .refine((t) => t.start === undefined || t.end! > t.start, 'end must be after start');

const query = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  q: z.string().trim().min(1).max(500),
  expect: z.array(target).min(1),
});

const datasetSchema = z
  .object({
    name: z.string().min(1),
    queries: z.array(query).min(1),
  })
  .refine(
    (d) => new Set(d.queries.map((q) => q.id)).size === d.queries.length,
    'query ids must be unique',
  );

export type Dataset = z.infer<typeof datasetSchema>;
export type Target = Dataset['queries'][number]['expect'][number];

export function parseDataset(raw: unknown): Dataset {
  return datasetSchema.parse(raw);
}

export async function loadDataset(path: string): Promise<Dataset> {
  return parseDataset(JSON.parse(await readFile(path, 'utf8')));
}
