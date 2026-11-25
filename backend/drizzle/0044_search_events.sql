CREATE TABLE "search_events" (
	"id" text PRIMARY KEY NOT NULL,
	"session" text NOT NULL,
	"q" text NOT NULL,
	"q_norm" text NOT NULL,
	"type" text,
	"surface" text NOT NULL,
	"source" text NOT NULL,
	"results" integer NOT NULL,
	"fallback" boolean DEFAULT false NOT NULL,
	"opened_listing_id" text,
	"opened_rank" integer,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "search_events_created_at_idx" ON "search_events" USING btree ("created_at");