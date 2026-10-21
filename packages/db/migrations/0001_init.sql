CREATE TYPE "public"."embedding_kind" AS ENUM('text', 'image');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('upload', 'url');--> statement-breakpoint
CREATE TYPE "public"."stage" AS ENUM('decode', 'segment', 'transcribe', 'see', 'index');--> statement-breakpoint
CREATE TYPE "public"."video_status" AS ENUM('pending', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "embedding_cache" (
	"content_hash" text NOT NULL,
	"model" text NOT NULL,
	"kind" "embedding_kind" NOT NULL,
	"embedding" real[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "embedding_cache_content_hash_model_kind_pk" PRIMARY KEY("content_hash","model","kind")
);
--> statement-breakpoint
CREATE TABLE "frames" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"segment_id" uuid,
	"ts_ms" integer NOT NULL,
	"storage_key" text NOT NULL,
	"is_keyframe" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"idx" integer NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"keyframe_key" text,
	"transcript_text" text,
	"ocr_text" text,
	"search_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', coalesce(transcript_text, '') || ' ' || coalesce(ocr_text, ''))) STORED,
	"text_embedding" vector(1536),
	"visual_embedding" vector(1024),
	"ocr_embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stage_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"stage" "stage" NOT NULL,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"input_hash" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcript_words" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"segment_id" uuid,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"word" text NOT NULL,
	"confidence" real
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"source_type" "source_type" NOT NULL,
	"source_url" text,
	"storage_key" text,
	"content_hash" text,
	"duration_ms" integer,
	"width" integer,
	"height" integer,
	"fps" real,
	"status" "video_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "frames" ADD CONSTRAINT "frames_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frames" ADD CONSTRAINT "frames_segment_id_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segments" ADD CONSTRAINT "segments_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_runs" ADD CONSTRAINT "stage_runs_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_words" ADD CONSTRAINT "transcript_words_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_words" ADD CONSTRAINT "transcript_words_segment_id_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "frames_video_ts_key" ON "frames" USING btree ("video_id","ts_ms");--> statement-breakpoint
CREATE UNIQUE INDEX "segments_video_idx_key" ON "segments" USING btree ("video_id","idx");--> statement-breakpoint
CREATE INDEX "segments_search_tsv_idx" ON "segments" USING gin ("search_tsv");--> statement-breakpoint
CREATE INDEX "segments_text_embedding_idx" ON "segments" USING hnsw ("text_embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "segments_visual_embedding_idx" ON "segments" USING hnsw ("visual_embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "segments_ocr_embedding_idx" ON "segments" USING hnsw ("ocr_embedding" vector_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "stage_runs_video_stage_key" ON "stage_runs" USING btree ("video_id","stage");--> statement-breakpoint
CREATE INDEX "stage_runs_status_idx" ON "stage_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "transcript_words_video_start_idx" ON "transcript_words" USING btree ("video_id","start_ms");--> statement-breakpoint
CREATE UNIQUE INDEX "videos_content_hash_key" ON "videos" USING btree ("content_hash");