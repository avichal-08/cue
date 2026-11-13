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

export interface SearchResult {
  clips: SearchHit[];
  meta: { reranked: boolean; rerankError: string | null; timings: { totalMs: number } };
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
    search: (body: { q: string; limit: number; keyframes: boolean }) =>
      call<SearchResult>('/search', { method: 'POST', body: JSON.stringify(body) }),
  };
}

export type Client = ReturnType<typeof client>;
