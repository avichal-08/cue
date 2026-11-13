import { Router } from 'express';
import { z } from 'zod';
import { modalities } from '../search/fuse';
import { runSearch } from '../search/search';

const body = z.object({
  q: z.string().trim().min(1).max(500),
  videoId: z.string().uuid().optional(),
  fromMs: z.number().int().min(0).optional(),
  toMs: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(50).default(10),
  keyframes: z.boolean().default(false),
  modalities: z.array(z.enum(modalities)).min(1).optional(),
  rerank: z.boolean().default(true),
});

export const search = Router();

search.post('/', async (req, res) => {
  const result = await runSearch(body.parse(req.body));
  res.locals.search = {
    query: result.query,
    clips: result.clips.length,
    reranked: result.meta.reranked,
    queryCached: result.meta.queryCached,
    ...result.meta.timings,
  };
  res.json(result);
});
