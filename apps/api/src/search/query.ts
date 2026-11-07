export interface QueryFilters {
  videoId?: string;
  fromMs?: number;
  toMs?: number;
}

export interface ParsedQuery {
  text: string;
  filters: QueryFilters;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clock = /^(?:(\d+):)?(\d+):(\d{1,2})$/;
const units = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/;

export function parseTime(value: string): number | undefined {
  const v = value.trim().toLowerCase();
  if (/^\d+(?:\.\d+)?$/.test(v)) return Math.round(Number(v) * 1000);
  const c = clock.exec(v);
  if (c) {
    const [h, m, s] = [Number(c[1] ?? 0), Number(c[2]), Number(c[3])];
    return s < 60 && (c[1] === undefined || m < 60) ? ((h * 60 + m) * 60 + s) * 1000 : undefined;
  }
  const u = units.exec(v);
  if (u && (u[1] || u[2] || u[3])) {
    return Math.round(
      ((Number(u[1] ?? 0) * 60 + Number(u[2] ?? 0)) * 60 + Number(u[3] ?? 0)) * 1000,
    );
  }
  return undefined;
}

export function parseQuery(raw: string): ParsedQuery {
  const filters: QueryFilters = {};
  const words: string[] = [];
  for (const token of raw.trim().split(/\s+/).filter(Boolean)) {
    const [, key, value] = /^(video|from|to):(.+)$/i.exec(token) ?? [];
    const k = key?.toLowerCase();
    if (k === 'video' && value && uuid.test(value)) {
      filters.videoId = value.toLowerCase();
      continue;
    }
    if ((k === 'from' || k === 'to') && value) {
      const ms = parseTime(value);
      if (ms !== undefined) {
        filters[k === 'from' ? 'fromMs' : 'toMs'] = ms;
        continue;
      }
    }
    words.push(token);
  }
  if (filters.fromMs !== undefined && filters.toMs !== undefined && filters.fromMs > filters.toMs) {
    [filters.fromMs, filters.toMs] = [filters.toMs, filters.fromMs];
  }
  return { text: words.join(' '), filters };
}
