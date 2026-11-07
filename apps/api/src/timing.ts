import type { RequestHandler } from 'express';

const skip = ['/events', '/health'];

export const timing: RequestHandler = (req, res, next) => {
  const started = performance.now();
  const path = req.originalUrl.split('?')[0]!;
  if (skip.some((p) => path.startsWith(p))) {
    next();
    return;
  }
  res.on('finish', () => {
    const entry: Record<string, unknown> = {
      at: new Date().toISOString(),
      method: req.method,
      path,
      status: res.statusCode,
      ms: Math.round(performance.now() - started),
    };
    if (res.locals.search) entry.search = res.locals.search;
    console.log(JSON.stringify(entry));
  });
  next();
};
