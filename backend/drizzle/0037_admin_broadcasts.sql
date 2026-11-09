-- Admin panel Notifications page (Nov 2026): one row per message the team sends, and the screen a
-- notification opens when tapped.
CREATE TABLE "broadcasts" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"audience" text NOT NULL,
	"business_type" text,
	"phone" text,
	"recipients" integer DEFAULT 0 NOT NULL,
	"devices" integer DEFAULT 0 NOT NULL,
	"pushed" integer DEFAULT 0 NOT NULL,
	"push_failed" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"sent_by" text,
	"created_at" text NOT NULL,
	"finished_at" text
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "link" text;--> statement-breakpoint
CREATE INDEX "broadcasts_created_at_idx" ON "broadcasts" USING btree ("created_at");