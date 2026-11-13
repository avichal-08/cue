import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { EvalConfig, SearchOptions } from './config';
import { bestIou, firstCorrectRank, spans, type MetricResult, type Summary } from './metrics';
import type { QueryRun } from './runner';

export interface SearchCost {
  searches: number;
  calls: number;
  rerankCalls: number;
  cost: number;
  per1k: number;
  estimated: boolean;
  unpriced: string[];
}

export interface VariantResult {
  name: string;
  search: SearchOptions;
  summary: Summary;
  cost?: SearchCost;
  runs: QueryRun[];
}

export interface Report {
  name: string;
  description?: string;
  dataset: string;
  startedAt: string;
  finishedAt: string;
  commit: string | null;
  config: Omit<EvalConfig, 'path' | 'datasetPath' | 'pricesPath' | 'variants'>;
  prices?: { currency: string; checked: string };
  variants: VariantResult[];
}

export function gitCommit(): string | null {
  try {
    const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
    return dirty ? `${sha}-dirty` : sha;
  } catch {
    return null;
  }
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const value = (m: MetricResult) => (m.format === 'pct' ? pct(m.value) : m.value.toFixed(3));
const ms = (n: number | null) => (n === null ? 'n/a' : `${n} ms`);
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ');
const row = (cells: (string | number)[]) => `| ${cells.join(' | ')} |`;

const signals = (s: SearchOptions) => (s.modalities ? s.modalities.join(' + ') : 'all');
const per1k = (c: SearchCost | undefined) =>
  c ? `$${c.per1k.toFixed(3)}${c.estimated ? '~' : ''}${c.unpriced.length ? '?' : ''}` : 'n/a';

function header(report: Report) {
  const queries = report.variants[0]?.summary.queries ?? 0;
  const prices = report.prices
    ? ` · prices in ${report.prices.currency} checked ${report.prices.checked}`
    : '';
  return [
    `# ${report.name}`,
    '',
    ...(report.description ? [report.description, ''] : []),
    `dataset \`${report.dataset}\` · ${queries} searches · commit \`${report.commit ?? 'unknown'}\` · ${report.finishedAt}${prices}`,
    '',
  ];
}

function summaryTable({ summary, cost }: VariantResult) {
  return [
    '| metric | value | queries |',
    '| --- | --- | --- |',
    ...Object.entries(summary.metrics).map(([name, m]) => row([name, value(m), m.n])),
    row(['latency p50', ms(summary.latencyMs.p50), '']),
    row(['latency p95', ms(summary.latencyMs.p95), '']),
    ...Object.entries(summary.phasesMs).map(([phase, p]) =>
      row([`↳ ${phase} p50 / p95`, `${ms(p.p50)} / ${ms(p.p95)}`, '']),
    ),
    row(['cost per 1k searches', per1k(cost), cost ? cost.searches : '']),
    row(['errors', summary.errors, '']),
    row(['not reranked', summary.unreranked, '']),
    '',
  ];
}

function queryTable({ runs }: VariantResult) {
  return [
    '| id | query | rank | top hit | iou@1 | latency |',
    '| --- | --- | --- | --- | --- | --- |',
    ...runs.map((run) => {
      const rank = run.error ? 'error' : String(firstCorrectRank(run) ?? 'miss');
      const top = run.hits[0];
      const hit = top
        ? `${top.title} ${(top.startMs / 1000).toFixed(1)}–${(top.endMs / 1000).toFixed(1)}s`
        : '';
      const wanted = spans(run);
      const overlap = wanted.length ? bestIou(top, wanted).toFixed(2) : '';
      return row([run.id, cell(run.q), rank, cell(hit), overlap, ms(run.latencyMs)]);
    }),
    '',
  ];
}

const atOne = (name: string) => name === 'mrr' || /@1( |$)/.test(name);

export function ablationTable(variants: VariantResult[]) {
  const names = Object.keys(variants[0]?.summary.metrics ?? {}).filter(atOne);
  return [
    row(['variant', 'signals', 'rerank', ...names, 'p50', 'p95', 'cost / 1k', 'not reranked']),
    row(Array.from({ length: names.length + 7 }, () => '---')),
    ...variants.map((v) =>
      row([
        v.name,
        signals(v.search),
        v.search.rerank ? (v.search.keyframes ? 'text + keyframes' : 'text') : 'off',
        ...names.map((n) => {
          const m = v.summary.metrics[n];
          return m ? value(m) : '';
        }),
        ms(v.summary.latencyMs.p50),
        ms(v.summary.latencyMs.p95),
        per1k(v.cost),
        v.search.rerank ? v.summary.unreranked : '',
      ]),
    ),
    '',
  ];
}

function iouMatrix(variants: VariantResult[]) {
  const ids = variants[0]?.runs.map((r) => r.id) ?? [];
  return [
    'IoU of the top clip for each query; `miss` means the top clip is from the wrong video.',
    '',
    row(['id', ...variants.map((v) => v.name)]),
    row(Array.from({ length: variants.length + 1 }, () => '---')),
    ...ids.map((id) =>
      row([
        id,
        ...variants.map((v) => {
          const run = v.runs.find((r) => r.id === id);
          if (!run || run.error) return 'error';
          if (firstCorrectRank(run) !== 1) return 'miss';
          const wanted = spans(run);
          return wanted.length ? bestIou(run.hits[0], wanted).toFixed(2) : 'hit';
        }),
      ]),
    ),
    '',
  ];
}

export function summaryMarkdown(report: Report): string {
  const [only] = report.variants;
  const body =
    report.variants.length === 1 && only ? summaryTable(only) : ablationTable(report.variants);
  return [...header(report), ...body].join('\n');
}

export function toMarkdown(report: Report): string {
  const [only] = report.variants;
  const body =
    report.variants.length === 1 && only
      ? [...summaryTable(only), ...queryTable(only)]
      : [...ablationTable(report.variants), ...iouMatrix(report.variants)];
  return [...header(report), ...body].join('\n');
}

export async function writeReport(dir: string, report: Report) {
  const stamp = report.startedAt.replace(/[:.]/g, '-');
  const base = join(dir, report.name, stamp);
  await mkdir(join(dir, report.name), { recursive: true });
  await writeFile(`${base}.json`, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(`${base}.md`, toMarkdown(report));
  return { json: `${base}.json`, md: `${base}.md` };
}
