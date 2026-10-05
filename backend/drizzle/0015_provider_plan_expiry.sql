ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "plan_expires_at" text;
UPDATE "providers"
SET "plan_expires_at" = to_char(now() + interval '365 days', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE "status" = 'active' AND "plan_expires_at" IS NULL;
