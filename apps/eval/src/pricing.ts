import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const modelPrice = z.object({
  audioHour: z.number().min(0).optional(),
  minBilledSec: z.number().min(0).optional(),
  inputTokensM: z.number().min(0).optional(),
  outputTokensM: z.number().min(0).optional(),
  image: z.number().min(0).optional(),
  source: z.string().optional(),
});

const pricesSchema = z.object({
  currency: z.string(),
  checked: z.string(),
  charsPerToken: z.number().positive().default(4),
  models: z.record(modelPrice),
});

export type Prices = z.infer<typeof pricesSchema>;

export async function loadPrices(path: string): Promise<Prices> {
  return pricesSchema.parse(JSON.parse(await readFile(path, 'utf8')));
}

export interface UsageRow {
  provider: string;
  model: string;
  operation: string;
  calls: number;
  failed: number;
  ms: number;
  audioMs: number;
  inputTokens: number;
  outputTokens: number;
  images: number;
  texts: number;
  chars: number;
}

export interface Priced {
  cost: number;
  estimated: boolean;
  unpriced: boolean;
}

export function priceUsage(row: UsageRow, prices: Prices): Priced {
  const price = prices.models[`${row.provider}/${row.model}`];
  if (!price) return { cost: 0, estimated: false, unpriced: true };

  let cost = 0;
  let estimated = false;
  const billed = row.calls - row.failed;

  if (price.audioHour !== undefined) {
    const minMs = (price.minBilledSec ?? 0) * 1000 * billed;
    cost += (Math.max(row.audioMs, minMs) / 3_600_000) * price.audioHour;
  }
  if (price.inputTokensM !== undefined) {
    let tokens = row.inputTokens;
    if (!tokens && row.chars) {
      tokens = row.chars / prices.charsPerToken;
      estimated = true;
    }
    cost += (tokens / 1e6) * price.inputTokensM;
  }
  if (price.outputTokensM !== undefined) cost += (row.outputTokens / 1e6) * price.outputTokensM;
  if (price.image !== undefined) cost += row.images * price.image;

  return { cost, estimated, unpriced: false };
}

export function priceAll(rows: UsageRow[], prices: Prices) {
  const priced = rows.map((row) => ({ row, ...priceUsage(row, prices) }));
  return {
    rows: priced,
    cost: priced.reduce((sum, p) => sum + p.cost, 0),
    estimated: priced.some((p) => p.estimated),
    unpriced: [
      ...new Set(priced.filter((p) => p.unpriced).map((p) => `${p.row.provider}/${p.row.model}`)),
    ],
  };
}
