import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { Router } from "express";
import { z } from "zod";
import { deleteObject, hashObject, objectExists, presignPut } from "@cue/core";
import { claimContentHash, db, videos as videosTable } from "@cue/db";
import { eq } from "drizzle-orm";
import { HttpError } from "../errors";
import { enqueueIngest } from "../queue";

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

async function getVideo(id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, "video not found");
  const [video] = await db.select().from(videosTable).where(eq(videosTable.id, id)).limit(1);
  if (!video) throw new HttpError(404, "video not found");
  return video;
}

videos.post("/:id/complete", async (req, res) => {
  const video = await getVideo(req.params.id);
  if (video.contentHash) {
    await enqueueIngest(video.id);
    res.json({ videoId: video.id, duplicate: false });
    return;
  }
  if (video.sourceType !== "upload" || !video.storageKey) throw new HttpError(409, "not an upload");
  if (!(await objectExists(video.storageKey))) throw new HttpError(409, "upload not found in storage");

  const contentHash = await hashObject(video.storageKey);
  const existing = await claimContentHash(video.id, contentHash);

  if (existing) {
    await deleteObject(video.storageKey);
    await db.delete(videosTable).where(eq(videosTable.id, video.id));
    res.json({ videoId: existing, duplicate: true });
    return;
  }

  await enqueueIngest(video.id);
  res.json({ videoId: video.id, duplicate: false });
});

const urlBody = z.object({
  url: z.string().url().refine((u) => /^https?:/.test(u), "http(s) only"),
  title: z.string().min(1).max(200).optional(),
});

videos.post("/url", async (req, res) => {
  const body = urlBody.parse(req.body);

  const [existing] = await db
    .select({ id: videosTable.id })
    .from(videosTable)
    .where(eq(videosTable.sourceUrl, body.url))
    .limit(1);
  if (existing) {
    res.json({ videoId: existing.id, duplicate: true });
    return;
  }

  const id = randomUUID();
  await db.insert(videosTable).values({
    id,
    title: body.title ?? body.url,
    sourceType: "url",
    sourceUrl: body.url,
  });

  await enqueueIngest(id);
  res.status(201).json({ videoId: id, duplicate: false });
});
