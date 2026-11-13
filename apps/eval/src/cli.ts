import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { client, type Client } from './api';
import { loadConfig, type EvalConfig, type IngestConfig } from './config';
import { loadDataset } from './dataset';
import { ingestMarkdown, summarizeIngest, videoCost } from './ingest';
import { firstCorrectRank, metricsFor, summarize } from './metrics';
import { loadPrices, priceAll, type Prices } from './pricing';
import { gitCommit, summaryMarkdown, writeReport, type VariantResult } from './report';
import { resolveTargets, runQueries } from './runner';

const root = fileURLToPath(new URL('..', import.meta.url));
const results = resolve(root, 'results');

function configPath(arg: string | undefined) {
  if (!arg) throw new Error('usage: pnpm eval <config name or path>, e.g. pnpm eval smoke');
  const candidates = [resolve(arg), resolve(root, arg), resolve(root, 'configs', `${arg}.json`)];
  const found = candidates.find(existsSync);
  if (!found) throw new Error(`config not found: ${arg}`);
  return found;
}

async function connect(base: string) {
  const api = client(base);
  try {
    await api.health();
  } catch {
    throw new Error(`api not reachable at ${base}, start it with pnpm dev`);
  }
  return api;
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function searchCost(api: Client, prices: Prices, since: string, until: string) {
  const { usage } = await api.usage({ since, until, source: 'search' });
  const priced = priceAll(usage, prices);
  return {
    calls: usage.reduce((n, u) => n + u.calls, 0),
    rerankCalls: usage.filter((u) => u.operation === 'rerank').reduce((n, u) => n + u.calls, 0),
    cost: priced.cost,
    estimated: priced.estimated,
    unpriced: priced.unpriced,
  };
}

async function runSearchEval(config: EvalConfig) {
  const dataset = await loadDataset(config.datasetPath);
  const prices = await loadPrices(config.pricesPath);
  const api = await connect(config.api);

  const { queries, notReady } = resolveTargets(dataset, await api.videos());
  if (notReady.length) console.warn(`not ready yet: ${notReady.join(', ')}`);
  const passes = Array.from({ length: config.repeat }, () => queries).flat();

  console.log(
    `${config.name}: ${queries.length} queries from ${dataset.name}` +
      (config.repeat > 1 ? `, ${config.repeat} passes` : ''),
  );
  const startedAt = new Date().toISOString();
  const metrics = metricsFor(config);
  const variants: VariantResult[] = [];

  for (const variant of config.variants) {
    if (config.variants.length > 1) console.log(`\n== ${variant.name}`);
    const since = new Date().toISOString();
    const runs = await runQueries(api, variant, config, passes, (run, done) => {
      const rank = run.error ? `error: ${run.error}` : `rank ${firstCorrectRank(run) ?? 'miss'}`;
      const latency = run.latencyMs === null ? '' : ` ${run.latencyMs}ms`;
      const retried = run.attempts > 1 ? ` (${run.attempts} tries)` : '';
      console.log(`[${done}/${passes.length}] ${run.id} ${rank}${latency}${retried}`);
    });
    await sleep(2_500);
    const usage = await searchCost(api, prices, since, new Date().toISOString());
    const searches = runs.reduce((n, r) => n + r.attempts, 0);
    variants.push({
      ...variant,
      summary: summarize(runs, metrics),
      cost: { searches, ...usage, per1k: searches ? (usage.cost / searches) * 1000 : 0 },
      runs,
    });
  }

  const { path: _p, datasetPath: _d, pricesPath: _pp, variants: _v, ...settings } = config;
  const report = {
    name: config.name,
    description: config.description,
    dataset: dataset.name,
    startedAt,
    finishedAt: new Date().toISOString(),
    commit: gitCommit(),
    config: settings,
    prices: { currency: prices.currency, checked: prices.checked },
    variants,
  };
  const out = await writeReport(results, report);

  console.log(`\n${summaryMarkdown(report)}`);
  console.log(`wrote ${out.json}\nwrote ${out.md}`);
  if (variants.every((v) => v.summary.errors === v.summary.queries)) process.exitCode = 1;
}

async function runIngestReport(config: IngestConfig) {
  const prices = await loadPrices(config.pricesPath);
  const api = await connect(config.api);
  const { videos } = await api.ingestStats();
  const costs = videos.flatMap((v) => videoCost(v, prices) ?? []);
  const summary = summarizeIngest(costs);
  const at = new Date().toISOString();
  const commit = gitCommit();
  const markdown = ingestMarkdown(
    { name: config.name, description: config.description, commit, at },
    costs,
    summary,
    prices,
  );

  const dir = join(results, config.name);
  const base = join(dir, at.replace(/[:.]/g, '-'));
  await mkdir(dir, { recursive: true });
  await writeFile(
    `${base}.json`,
    `${JSON.stringify({ name: config.name, at, commit, prices, summary, videos: costs }, null, 2)}\n`,
  );
  await writeFile(`${base}.md`, markdown);
  console.log(markdown);
  console.log(`wrote ${base}.json\nwrote ${base}.md`);
}

async function main() {
  const loaded = await loadConfig(configPath(process.argv[2]));
  if (loaded.kind === 'ingest') await runIngestReport(loaded.config);
  else await runSearchEval(loaded.config);
}

main().catch((err: unknown) => {
  console.error((err as Error).message);
  process.exitCode = 1;
});
