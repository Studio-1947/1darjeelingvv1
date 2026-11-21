CREATE TABLE "delivery_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"listing_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"address" text NOT NULL,
	"phone" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"host_note" text,
	"created_at" text NOT NULL,
	"updated_at" text
);
--> statement-breakpoint
ALTER TABLE "app_feedback" ADD COLUMN "booking_id" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "route_name" text;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "delivery_requests" ADD CONSTRAINT "delivery_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_requests" ADD CONSTRAINT "delivery_requests_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_requests_provider_created_idx" ON "delivery_requests" USING btree ("provider_id","created_at");--> statement-breakpoint
CREATE INDEX "delivery_requests_user_created_idx" ON "delivery_requests" USING btree ("user_id","created_at");--> statement-breakpoint
-- Give every existing host a page address from their business name; duplicates get -2, -3...
WITH base AS (
  SELECT id, created_at,
    COALESCE(NULLIF(trim(both '-' from regexp_replace(regexp_replace(lower(business_name), '[^a-z0-9 _-]', '', 'g'), '[ _-]+', '-', 'g')), ''), 'host') AS b
  FROM providers
), ranked AS (
  SELECT id, b, row_number() OVER (PARTITION BY b ORDER BY created_at, id) AS n FROM base
)
UPDATE providers p SET slug = CASE WHEN r.n = 1 THEN left(r.b, 60) ELSE left(r.b, 55) || '-' || r.n END
FROM ranked r WHERE r.id = p.id AND p.slug IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "providers_slug_unique" ON "providers" USING btree ("slug");