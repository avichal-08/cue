CREATE TABLE "provider_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"video_id" uuid,
	"stage" text,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"operation" text NOT NULL,
	"ok" boolean NOT NULL,
	"status" integer,
	"ms" integer NOT NULL,
	"audio_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"images" integer,
	"texts" integer,
	"chars" integer
);
--> statement-breakpoint
ALTER TABLE "provider_calls" ADD CONSTRAINT "provider_calls_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provider_calls_video_idx" ON "provider_calls" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "provider_calls_at_idx" ON "provider_calls" USING btree ("at");