import { withCallContext } from '@cue/core';
import { Router } from 'express';
import { z } from 'zod';
import { answerQuestion } from '../search/answer';

const clip = z
  .object({
    videoId: z.string().uuid(),
    startMs: z.number().int().min(0),
    endMs: z.number().int().min(0),
  })
  .refine((c) => c.endMs > c.startMs, 'endMs must be after startMs');

const body = z.object({
  q: z.string().trim().min(1).max(500),
  clips: z.array(clip).min(1).max(8),
});

export const answer = Router();

answer.post('/', async (req, res) => {
  const { q, clips } = body.parse(req.body);
  const result = await withCallContext({ source: 'answer' }, () => answerQuestion(q, clips));
  res.locals.search = {
    query: q,
    sources: clips.length,
    citations: result.citations.length,
    grounded: result.grounded,
    answerMs: result.ms,
  };
  res.json(result);
});
