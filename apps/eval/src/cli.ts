import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { client } from './api';
import { loadConfig } from './config';
import { loadDataset } from './dataset';
import { firstCorrectRank, metricsFor, summarize } from './metrics';
import { gitCommit, writeReport } from './report';
import { resolveTargets, runQueries } from './runner';

const root = fileURLToPath(new URL('..', import.meta.url));

function configPath(arg: string | undefined) {
  if (!arg) throw new Error('usage: pnpm eval <config name or path>, e.g. pnpm eval smoke');
  const candidates = [resolve(arg), resolve(root, arg), resolve(root, 'configs', `${arg}.json`)];
  const found = candidates.find(existsSync);
  if (!found) throw new Error(`config not found: ${arg}`);
  return found;
}

async function main() {
  const config = await loadConfig(configPath(process.argv[2]));
  const dataset = await loadDataset(config.datasetPath);
  const api = client(config.api);

  try {
    await api.health();
  } catch {
    throw new Error(`api not reachable at ${config.api}, start it with pnpm dev`);
  }

  const { queries, notReady } = resolveTargets(dataset, await api.videos());
  if (notReady.length) console.warn(`not ready yet: ${notReady.join(', ')}`);

  console.log(`${config.name}: ${queries.length} queries from ${dataset.name}`);
  const startedAt = new Date().toISOString();
  const runs = await runQueries(api, config, queries, (run, done) => {
    const rank = run.error ? `error: ${run.error}` : `rank ${firstCorrectRank(run) ?? 'miss'}`;
    const latency = run.latencyMs === null ? '' : ` ${run.latencyMs}ms`;
    console.log(`[${done}/${queries.length}] ${run.id} ${rank}${latency}`);
  });

  const summary = summarize(runs, metricsFor(config));
  const { path: _path, datasetPath: _datasetPath, ...settings } = config;
  const out = await writeReport(resolve(root, 'results'), {
    name: config.name,
    description: config.description,
    dataset: dataset.name,
    startedAt,
    finishedAt: new Date().toISOString(),
    commit: gitCommit(),
    config: settings,
    summary,
    runs,
  });

  console.log(`\n${out.markdown.split('\n\n| id')[0]}\n`);
  console.log(`wrote ${out.json}\nwrote ${out.md}`);
  if (summary.errors === summary.queries) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error((err as Error).message);
  process.exitCode = 1;
});
