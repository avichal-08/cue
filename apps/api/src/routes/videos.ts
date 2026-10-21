import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { Router } from "express";
import { z } from "zod";
import { presignPut } from "@cue/core";
import { db, videos as videosTable } from "@cue/db";

export const videos = Router();

const uploadBody = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().regex(/^video\//),
  title: z.string().min(1).max(200).optional(),
});

videos.post("/uploads", async (req, res) => {
  const body = uploadBody.parse(req.body);
  const ext = extname(body.filename).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".mp4";

  const id = randomUUID();
  const storageKey = `videos/${id}/source${ext}`;

  await db.insert(videosTable).values({
    id,
    title: body.title ?? body.filename,
    sourceType: "upload",
    storageKey,
  });

  const uploadUrl = await presignPut(storageKey, body.contentType);
  res.status(201).json({ videoId: id, uploadUrl });
});
