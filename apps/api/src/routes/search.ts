import { Router } from 'express';

export const search = Router();

search.all('/{*rest}', (_req, res) => {
  res.status(501).json({ error: 'not implemented' });
});
