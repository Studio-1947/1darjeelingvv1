CREATE TABLE "listing_search" (
	"listing_id" text PRIMARY KEY NOT NULL,
	"words" text[] NOT NULL,
	"fields" jsonb NOT NULL,
	"v" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "search_stale" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_search" ADD CONSTRAINT "listing_search_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listing_search_words_gin" ON "listing_search" USING gin ("words");--> statement-breakpoint
CREATE INDEX "listings_search_stale_idx" ON "listings" USING btree ("id") WHERE "listings"."search_stale";--> statement-breakpoint
-- A listing whose words change is read again by the next search (lib/searchIndex.ts). In the
-- database, so every write path is covered, the admin panel and scripts included.
CREATE OR REPLACE FUNCTION listings_search_stale() RETURNS trigger AS $$
BEGIN
  IF NEW.title IS DISTINCT FROM OLD.title
    OR NEW.location IS DISTINCT FROM OLD.location
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.tags IS DISTINCT FROM OLD.tags
    OR NEW.extras IS DISTINCT FROM OLD.extras THEN
    NEW.search_stale := true;
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER listings_search_stale BEFORE UPDATE ON "listings"
  FOR EACH ROW EXECUTE FUNCTION listings_search_stale();
