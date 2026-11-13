import type { IngestVideo } from './ingest';
import type { UsageRow } from './pricing';

export interface VideoSummary {
  id: string;
  title: string;
  status: string;
}

export interface SearchHit {
  videoId: string;
  title: string;
  startMs: number;
  endMs: number;
  score: number | null;
}

export interface SearchTimings {
  embedMs: number;
  retrieveMs: number;
  rerankMs: number;
  clipsMs: number;
  totalMs: number;
}

export interface SearchResult {
  clips: SearchHit[];
  meta: { reranked: boolean; rerankError: string | null; timings: SearchTimings };
}

export function client(base: string) {
  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(new URL(path, base), {
      ...init,
      headers: { 'content-type': 'application/json' },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${init?.method ?? 'GET'} ${path} ${res.status}: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  return {
    health: () => call<{ ok: boolean }>('/health'),
    videos: async () => {
      const out: VideoSummary[] = [];
      for (let offset = 0; ; offset += 100) {
        const page = await call<{ videos: VideoSummary[] }>(`/videos?limit=100&offset=${offset}`);
        out.push(...page.videos);
        if (page.videos.length < 100) return out;
      }
    },
    search: (body: {
      q: string;
      limit: number;
      keyframes: boolean;
      rerank: boolean;
      modalities?: string[];
    }) => call<SearchResult>('/search', { method: 'POST', body: JSON.stringify(body) }),
    upload: async (file: {
      filename: string;
      title: string;
      contentType: string;
      body: Buffer;
    }) => {
      const { videoId, uploadUrl } = await call<{ videoId: string; uploadUrl: string }>(
        '/videos/uploads',
        {
          method: 'POST',
          body: JSON.stringify({
            filename: file.filename,
            title: file.title,
            contentType: file.contentType,
          }),
        },
      );
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': file.contentType },
        body: new Uint8Array(file.body),
      });
      if (!put.ok) throw new Error(`upload of ${file.filename} failed: ${put.status}`);
      return call<{ videoId: string; duplicate: boolean }>(`/videos/${videoId}/complete`, {
        method: 'POST',
      });
    },
    ingestStats: () => call<{ videos: IngestVideo[] }>('/stats/ingest'),
    usage: (window: { since: string; until?: string; source?: string }) => {
      const params = new URLSearchParams(
        Object.entries(window).filter((e): e is [string, string] => e[1] !== undefined),
      );
      return call<{ usage: (UsageRow & { source: string })[] }>(
        `/stats/usage?${params.toString()}`,
      );
    },
  };
}

export type Client = ReturnType<typeof client>;
