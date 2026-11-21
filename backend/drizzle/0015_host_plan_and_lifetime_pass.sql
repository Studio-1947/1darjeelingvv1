ALTER TABLE "providers" ADD COLUMN "plan_expires_at" text;--> statement-breakpoint
-- Pricing change (2026-09): hosts now pay ₹1 for their first year and ₹499 for each year after.
-- Every host who had already activated gets a year from the day this runs, so nobody is cut off.
UPDATE "providers"
SET "plan_expires_at" = to_char((now() AT TIME ZONE 'UTC') + interval '365 days', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE "activated_at" IS NOT NULL AND "plan_expires_at" IS NULL;--> statement-breakpoint
-- The tourist pass is now ₹1 once, for life. Anyone who paid the old yearly pass (and was not
-- refunded, or owed a refund) keeps access for life.
UPDATE "users"
SET "support_expires_at" = '9999-12-31T23:59:59.999Z'
WHERE "id" IN (
  SELECT "user_id" FROM "payments"
  WHERE "flow" = 'platform_support' AND "status" = 'paid' AND "refund_reason" IS NULL
);
