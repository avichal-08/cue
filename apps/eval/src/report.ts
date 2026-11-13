import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { EvalConfig } from './config';
import { firstCorrectRank, type Summary } from './metrics';
import type { QueryRun } from './runner';

export interface Report {
  name: string;
  description?: string;
  dataset: string;
  startedAt: string;
  finishedAt: string;
  commit: string | null;
  config: Omit<EvalConfig, 'path' | 'datasetPath'>;
  summary: Summary;
  runs: QueryRun[];
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
const ms = (n: number | null) => (n === null ? 'n/a' : `${n} ms`);
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ');

export function toMarkdown(report: Report): string {
  const { summary } = report;
  const lines = [
    `# ${report.name}`,
    '',
    ...(report.description ? [report.description, ''] : []),
    `dataset \`${report.dataset}\` · ${summary.queries} queries · commit \`${report.commit ?? 'unknown'}\` · ${report.finishedAt}`,
    '',
    '| metric | value |',
    '| --- | --- |',
    ...Object.entries(summary.metrics).map(([name, value]) =>
      name === 'mrr' ? `| ${name} | ${value.toFixed(3)} |` : `| ${name} | ${pct(value)} |`,
    ),
    `| latency p50 | ${ms(summary.latencyMs.p50)} |`,
    `| latency p95 | ${ms(summary.latencyMs.p95)} |`,
    `| errors | ${summary.errors} |`,
    `| not reranked | ${summary.unreranked} |`,
    '',
    '| id | query | rank | top hit | latency |',
    '| --- | --- | --- | --- | --- |',
    ...report.runs.map((run) => {
      const rank = run.error ? 'error' : String(firstCorrectRank(run) ?? 'miss');
      const top = run.hits[0];
      const hit = top
        ? `${top.title} ${(top.startMs / 1000).toFixed(1)}–${(top.endMs / 1000).toFixed(1)}s`
        : '';
      return `| ${run.id} | ${cell(run.q)} | ${rank} | ${cell(hit)} | ${ms(run.latencyMs)} |`;
    }),
    '',
  ];
  return lines.join('\n');
}

export async function writeReport(dir: string, report: Report) {
  const stamp = report.startedAt.replace(/[:.]/g, '-');
  const base = join(dir, report.name, stamp);
  await mkdir(join(dir, report.name), { recursive: true });
  const markdown = toMarkdown(report);
  await writeFile(`${base}.json`, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(`${base}.md`, markdown);
  return { json: `${base}.json`, md: `${base}.md`, markdown };
}
