import { Router } from "express";

export const videos = Router();

videos.all("/{*rest}", (_req, res) => {
  res.status(501).json({ error: "not implemented" });
});
