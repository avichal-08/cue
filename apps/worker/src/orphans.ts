export const abandonAfterMs = 24 * 60 * 60_000;

interface VideoRow {
  id: string;
  sourceType: string;
  status: string;
  contentHash: string | null;
  createdAt: Date;
}

export const videoIdOf = (key: string) => /^videos\/([^/]+)\//.exec(key)?.[1] ?? null;

export function isAbandoned(v: VideoRow, now: number) {
  return (
    v.sourceType === 'upload' &&
    v.status === 'pending' &&
    !v.contentHash &&
    now - v.createdAt.getTime() > abandonAfterMs
  );
}

export function planCleanup(
  objects: { key: string; size: number }[],
  rows: VideoRow[],
  now = Date.now(),
) {
  const known = new Map(rows.map((r) => [r.id, r]));
  const abandoned = rows.filter((r) => isAbandoned(r, now)).map((r) => r.id);
  const drop = new Set(abandoned);
  const orphans = objects.filter((o) => {
    const id = videoIdOf(o.key);
    return id !== null && (!known.has(id) || drop.has(id));
  });
  return {
    abandoned,
    objects: orphans,
    bytes: orphans.reduce((n, o) => n + o.size, 0),
  };
}
