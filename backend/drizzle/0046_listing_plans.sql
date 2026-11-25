ALTER TABLE "listings" ADD COLUMN "plan_expires_at" text;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "plan_grace" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "member_no" text;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_member_no_unique" UNIQUE("member_no");--> statement-breakpoint
-- Membership card numbers: AGN-00001, AGN-00002, ... given on a listing's first payment
-- (lib/listingPlan.ts nextMemberNo).
CREATE SEQUENCE IF NOT EXISTS "listing_member_no_seq";--> statement-breakpoint
-- The switch from one plan per business to one per listing (user decision 2026-11-25): every
-- listing a host has today keeps what the business had. A paid year carries over to each listing
-- until the same date; a business on the free start puts each listing on its own free start.
-- Shops list free and spots, events and nature entries have no plan, so they are left alone.
UPDATE "listings" AS l SET "plan_expires_at" = p."plan_expires_at"
  FROM "providers" AS p
  WHERE p."id" = l."provider_id" AND p."plan_expires_at" IS NOT NULL AND NOT p."grace"
    AND l."type" IN ('homestay', 'driver', 'guide', 'cafe');--> statement-breakpoint
UPDATE "listings" AS l SET "plan_grace" = true
  FROM "providers" AS p
  WHERE p."id" = l."provider_id" AND p."status" = 'active' AND p."grace"
    AND l."type" IN ('homestay', 'driver', 'guide', 'cafe');--> statement-breakpoint
-- Listings carrying a paid year get their card number now, oldest first.
UPDATE "listings" AS l SET "member_no" = 'AGN-' || lpad(nextval('listing_member_no_seq')::text, 5, '0')
  FROM (SELECT "id" FROM "listings" WHERE "plan_expires_at" IS NOT NULL ORDER BY "created_at", "id") AS o
  WHERE l."id" = o."id";
