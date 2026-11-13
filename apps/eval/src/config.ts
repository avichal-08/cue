import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

export const modalities = ['transcript', 'ocr', 'visual', 'keyword'] as const;
export type Modality = (typeof modalities)[number];

const searchSchema = z.object({
  limit: z.number().int().min(1).max(50).optional(),
  keyframes: z.boolean().optional(),
  rerank: z.boolean().optional(),
  modalities: z.array(z.enum(modalities)).min(1).optional(),
});

const configSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/, 'use lowercase letters, digits and dashes'),
  description: z.string().optional(),
  api: z.string().url().default('http://localhost:4000'),
  dataset: z.string().min(1),
  search: searchSchema.default({}),
  variants: z
    .array(z.object({ name: z.string().min(1), search: searchSchema.default({}) }))
    .min(1)
    .refine((v) => new Set(v.map((x) => x.name)).size === v.length, 'variant names must be unique')
    .optional(),
  k: z.array(z.number().int().min(1)).nonempty().default([1, 5, 10]),
  windowSec: z.number().min(0).default(5),
  iou: z.array(z.number().gt(0).max(1)).default([0.3, 0.5]),
  concurrency: z.number().int().min(1).max(8).default(1),
  retries: z.number().int().min(0).max(5).default(2),
  retryDelayMs: z.number().int().min(0).default(5_000),
  repeat: z.number().int().min(1).max(20).default(1),
  prices: z.string().default('../prices.json'),
});

const ingestSchema = z.object({
  kind: z.literal('ingest'),
  name: z.string().regex(/^[a-z0-9-]+$/, 'use lowercase letters, digits and dashes'),
  description: z.string().optional(),
  api: z.string().url().default('http://localhost:4000'),
  prices: z.string().default('../prices.json'),
});

export type IngestConfig = z.infer<typeof ingestSchema> & { path: string; pricesPath: string };

export interface SearchOptions {
  limit: number;
  keyframes: boolean;
  rerank: boolean;
  modalities?: Modality[];
}

export interface Variant {
  name: string;
  search: SearchOptions;
}

type Raw = z.infer<typeof configSchema>;

export type EvalConfig = Omit<Raw, 'search' | 'variants'> & {
  variants: Variant[];
  path: string;
  datasetPath: string;
  pricesPath: string;
};

const defaults: SearchOptions = { limit: 10, keyframes: false, rerank: true };

export function parseConfig(raw: unknown, path: string): EvalConfig {
  const { search, variants, ...config } = configSchema.parse(raw);
  const base = { ...defaults, ...search };
  return {
    ...config,
    variants: (variants ?? [{ name: 'default', search: {} }]).map((v) => ({
      name: v.name,
      search: { ...base, ...v.search },
    })),
    path,
    datasetPath: resolve(dirname(path), config.dataset),
    pricesPath: resolve(dirname(path), config.prices),
  };
}

export function parseIngestConfig(raw: unknown, path: string): IngestConfig {
  const config = ingestSchema.parse(raw);
  return { ...config, path, pricesPath: resolve(dirname(path), config.prices) };
}

export type AnyConfig =
  { kind: 'search'; config: EvalConfig } | { kind: 'ingest'; config: IngestConfig };

export async function loadConfig(path: string): Promise<AnyConfig> {
  const raw = JSON.parse(await readFile(path, 'utf8')) as { kind?: unknown };
  return raw.kind === 'ingest'
    ? { kind: 'ingest', config: parseIngestConfig(raw, path) }
    : { kind: 'search', config: parseConfig(raw, path) };
}
