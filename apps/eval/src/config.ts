import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

const configSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/, 'use lowercase letters, digits and dashes'),
  description: z.string().optional(),
  api: z.string().url().default('http://localhost:4000'),
  dataset: z.string().min(1),
  search: z
    .object({
      limit: z.number().int().min(1).max(50).default(10),
      keyframes: z.boolean().default(false),
    })
    .default({}),
  k: z.array(z.number().int().min(1)).nonempty().default([1, 5, 10]),
  windowSec: z.number().min(0).default(5),
  iou: z.array(z.number().gt(0).max(1)).default([0.3, 0.5]),
  concurrency: z.number().int().min(1).max(8).default(1),
});

export type EvalConfig = z.infer<typeof configSchema> & { path: string; datasetPath: string };

export function parseConfig(raw: unknown, path: string): EvalConfig {
  const config = configSchema.parse(raw);
  return { ...config, path, datasetPath: resolve(dirname(path), config.dataset) };
}

export async function loadConfig(path: string): Promise<EvalConfig> {
  return parseConfig(JSON.parse(await readFile(path, 'utf8')), path);
}
