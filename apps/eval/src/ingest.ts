import { priceAll, type Prices, type UsageRow } from './pricing';

export const stageOrder = ['decode', 'segment', 'transcribe', 'see', 'index'] as const;

export interface StageRun {
  stage: string;
  status: string;
  attempts: number;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface IngestVideo {
  id: string;
  title: string;
  status: string;
  durationMs: number | null;
  stages: StageRun[];
  usage: UsageRow[];
}

export interface VideoCost {
  id: string;
  title: string;
  durationMs: number;
  wallMs: number | null;
  stageMs: Record<string, number>;
  tracked: boolean;
  cost: number;
  byOperation: Record<string, number>;
  calls: number;
  failed: number;
}

const ms = (run: StageRun) =>
  run.startedAt && run.finishedAt ? Date.parse(run.finishedAt) - Date.parse(run.startedAt) : null;

export function videoCost(video: IngestVideo, prices: Prices): VideoCost | null {
  if (video.status !== 'ready' || !video.durationMs) return null;
  const done = video.stages.filter((s) => s.status === 'done');
  const stageMs: Record<string, number> = {};
  for (const run of done) {
    const t = ms(run);
    if (t !== null) stageMs[run.stage] = t;
  }
  const complete = stageOrder.every((s) => stageMs[s] !== undefined);
  const starts = done.flatMap((s) => (s.startedAt ? [Date.parse(s.startedAt)] : []));
  const ends = done.flatMap((s) => (s.finishedAt ? [Date.parse(s.finishedAt)] : []));

  const priced = priceAll(video.usage, prices);
  const byOperation: Record<string, number> = {};
  for (const p of priced.rows)
    byOperation[p.row.operation] = (byOperation[p.row.operation] ?? 0) + p.cost;

  return {
    id: video.id,
    title: video.title,
    durationMs: video.durationMs,
    wallMs: complete ? Math.max(...ends) - Math.min(...starts) : null,
    stageMs,
    tracked: video.usage.length > 0,
    cost: priced.cost,
    byOperation,
    calls: video.usage.reduce((n, u) => n + u.calls, 0),
    failed: video.usage.reduce((n, u) => n + u.failed, 0),
  };
}

const hours = (ms: number) => ms / 3_600_000;

export interface IngestSummary {
  videos: number;
  videoHours: number;
  timed: { videos: number; minutesPerHour: number; stageMinutesPerHour: Record<string, number> };
  costed: {
    videos: number;
    perHour: number;
    byOperationPerHour: Record<string, number>;
    callsPerHour: number;
  } | null;
}

export function summarizeIngest(costs: VideoCost[]): IngestSummary {
  const timed = costs.filter((c) => c.wallMs !== null);
  const timedHours = hours(timed.reduce((n, c) => n + c.durationMs, 0));
  const stageMinutesPerHour: Record<string, number> = {};
  for (const stage of stageOrder) {
    const total = timed.reduce((n, c) => n + (c.stageMs[stage] ?? 0), 0);
    stageMinutesPerHour[stage] = timedHours ? total / 60_000 / timedHours : 0;
  }

  const costed = costs.filter((c) => c.tracked);
  const costedHours = hours(costed.reduce((n, c) => n + c.durationMs, 0));
  const byOperationPerHour: Record<string, number> = {};
  for (const c of costed)
    for (const [op, cost] of Object.entries(c.byOperation))
      byOperationPerHour[op] = (byOperationPerHour[op] ?? 0) + cost / costedHours;

  return {
    videos: costs.length,
    videoHours: hours(costs.reduce((n, c) => n + c.durationMs, 0)),
    timed: {
      videos: timed.length,
      minutesPerHour: timedHours
        ? timed.reduce((n, c) => n + c.wallMs!, 0) / 60_000 / timedHours
        : 0,
      stageMinutesPerHour,
    },
    costed: costedHours
      ? {
          videos: costed.length,
          perHour: costed.reduce((n, c) => n + c.cost, 0) / costedHours,
          byOperationPerHour,
          callsPerHour: costed.reduce((n, c) => n + c.calls, 0) / costedHours,
        }
      : null,
  };
}

const money = (n: number) => `$${n < 0.01 ? n.toFixed(5) : n.toFixed(4)}`;
const clock = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function ingestMarkdown(
  head: { name: string; description?: string; commit: string | null; at: string },
  costs: VideoCost[],
  summary: IngestSummary,
  prices: Prices,
): string {
  const lines = [
    `# ${head.name}`,
    '',
    ...(head.description ? [head.description, ''] : []),
    `${summary.videos} ready videos · ${(summary.videoHours * 60).toFixed(1)} min of video · commit \`${head.commit ?? 'unknown'}\` · ${head.at}`,
    '',
    '| per hour of video | value | from |',
    '| --- | --- | --- |',
    `| index time | ${summary.timed.minutesPerHour.toFixed(1)} min | ${summary.timed.videos} videos |`,
    ...stageOrder.map(
      (s) => `| ↳ ${s} | ${(summary.timed.stageMinutesPerHour[s] ?? 0).toFixed(1)} min | |`,
    ),
  ];
  if (summary.costed) {
    lines.push(
      `| cost at paid prices | ${money(summary.costed.perHour)} | ${summary.costed.videos} tracked videos |`,
      ...Object.entries(summary.costed.byOperationPerHour)
        .sort((a, b) => b[1] - a[1])
        .map(([op, cost]) => `| ↳ ${op} | ${money(cost)} | |`),
      `| provider calls | ${Math.round(summary.costed.callsPerHour)} | |`,
    );
  } else {
    lines.push('| cost at paid prices | n/a | no video has tracked calls yet |');
  }
  lines.push(
    '',
    '| video | length | index time | ' + stageOrder.join(' | ') + ' | calls | cost |',
    '| --- | --- | --- | ' + stageOrder.map(() => '---').join(' | ') + ' | --- | --- |',
    ...costs.map(
      (c) =>
        `| ${c.title.replace(/\|/g, '\\|')} | ${clock(c.durationMs)} | ${c.wallMs === null ? 'n/a' : clock(c.wallMs)} | ` +
        stageOrder.map((s) => (c.stageMs[s] === undefined ? '' : clock(c.stageMs[s]))).join(' | ') +
        ` | ${c.tracked ? `${c.calls}${c.failed ? ` (${c.failed} failed)` : ''}` : 'untracked'} | ${c.tracked ? money(c.cost) : ''} |`,
    ),
    '',
    `Prices in ${prices.currency}, checked ${prices.checked}, from \`prices.json\`. Index time runs from the first stage start to the last stage finish, so it includes queue waits. Videos indexed before call tracking existed count toward time but not cost.`,
    '',
  );
  return lines.join('\n');
}
