import { Router } from "express";

export const jobs = Router();

jobs.all("/{*rest}", (_req, res) => {
  res.status(501).json({ error: "not implemented" });
});
