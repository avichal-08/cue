import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { client, type VideoSummary } from './api';
import { remoteZip } from './zip';

const repo = 'https://huggingface.co/datasets/friedrichor/MSR-VTT/resolve/main';
const root = fileURLToPath(new URL('..', import.meta.url));
const cache = resolve(root, 'data/msrvtt');

const splitSchema = z.array(z.object({ video_id: z.string(), caption: z.string() }));
type Item = z.infer<typeof splitSchema>[number];

export const titleOf = (videoId: string) => `msrvtt ${videoId}`;

export function pick<T>(items: T[], count: number) {
  const n = Math.min(count, items.length);
  return Array.from({ length: n }, (_, i) => items[Math.floor((i * items.length) / n)]!);
}

export function toDataset(name: string, items: Item[]) {
  return {
    name,
    queries: items.map((item) => ({
      id: item.video_id,
      q: item.caption.trim(),
      expect: [{ video: titleOf(item.video_id) }],
    })),
  };
}

async function loadSplit() {
  const path = join(cache, 'msrvtt_test_1k.json');
  if (!existsSync(path)) {
    const res = await fetch(`${repo}/msrvtt_test_1k.json`);
    if (!res.ok) throw new Error(`split download failed: ${res.status}`);
    await writeFile(path, await res.text());
  }
  return splitSchema.parse(JSON.parse(await readFile(path, 'utf8')));
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function waitForIngest(api: ReturnType<typeof client>, titles: Set<string>) {
  for (;;) {
    const mine = (await api.videos()).filter((v) => titles.has(v.title));
    const count = (s: string) => mine.filter((v) => v.status === s).length;
    const ready = count('ready');
    const failed = count('failed');
    console.log(
      `ingest: ${ready} ready, ${failed} failed, ${mine.length - ready - failed} pending`,
    );
    if (ready + failed === mine.length) return mine;
    await sleep(15_000);
  }
}

async function main() {
  const count = Number(process.argv[2] ?? 100);
  if (!Number.isInteger(count) || count < 1) throw new Error('usage: pnpm eval:msrvtt [count]');
  const api = client(process.env.CUE_API ?? 'http://localhost:4000');
  await api.health().catch(() => {
    throw new Error('api not reachable, start it with pnpm dev');
  });

  await mkdir(cache, { recursive: true });
  const items = pick(await loadSplit(), count);
  const name = `msrvtt-1k-a-${items.length}`;
  const datasetPath = resolve(root, 'datasets', `${name}.json`);
  await writeFile(datasetPath, `${JSON.stringify(toDataset(name, items), null, 2)}\n`);
  console.log(`wrote ${datasetPath}`);

  const library = new Map<string, VideoSummary>((await api.videos()).map((v) => [v.title, v]));
  const todo = items.filter((item) => !library.has(titleOf(item.video_id)));
  console.log(`${items.length - todo.length} of ${items.length} clips already in the library`);

  let zip: Awaited<ReturnType<typeof remoteZip>> | undefined;
  for (const [i, item] of todo.entries()) {
    const file = `${item.video_id}.mp4`;
    const local = join(cache, file);
    if (!existsSync(local)) {
      zip ??= await remoteZip(`${repo}/MSRVTT_Videos.zip`);
      const entry = zip.entries.get(`video/${file}`);
      if (!entry) throw new Error(`${file} not in the archive`);
      await writeFile(local, await zip.read(entry));
    }
    const body = await readFile(local);
    const res = await api.upload({
      filename: file,
      title: titleOf(item.video_id),
      contentType: 'video/mp4',
      body,
    });
    console.log(`[${i + 1}/${todo.length}] ${file}${res.duplicate ? ' (duplicate)' : ''}`);
  }

  const done = await waitForIngest(api, new Set(items.map((item) => titleOf(item.video_id))));
  const failed = done.filter((v) => v.status === 'failed');
  if (failed.length) console.warn(`failed: ${failed.map((v) => v.title).join(', ')}`);
  console.log(`run it with: pnpm eval msrvtt`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((err: unknown) => {
    console.error((err as Error).message);
    process.exitCode = 1;
  });
}
