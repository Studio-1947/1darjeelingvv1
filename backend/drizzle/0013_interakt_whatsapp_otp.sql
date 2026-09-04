ALTER TABLE "otps" DROP CONSTRAINT "otps_pkey";--> statement-breakpoint
ALTER TABLE "otps" ADD COLUMN "id" text;--> statement-breakpoint
UPDATE "otps" SET "id" = md5(random()::text || clock_timestamp()::text || "phone") WHERE "id" IS NULL;--> statement-breakpoint
ALTER TABLE "otps" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "otps" ADD CONSTRAINT "otps_pkey" PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "otps" ADD COLUMN "otp_hash" text;--> statement-breakpoint
-- Existing pre-Interakt OTP rows are invalidated rather than retaining recoverable codes.
DELETE FROM "otps";--> statement-breakpoint
ALTER TABLE "otps" ALTER COLUMN "otp_hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "otps" DROP COLUMN "otp";--> statement-breakpoint
ALTER TABLE "otps" ADD COLUMN "consumed_at" text;--> statement-breakpoint
ALTER TABLE "otps" ADD COLUMN "expires_at" text NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';--> statement-breakpoint
ALTER TABLE "otps" ALTER COLUMN "expires_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_verified_at" text;--> statement-breakpoint
CREATE TABLE "interakt_delivery_events" (
  "id" text PRIMARY KEY NOT NULL,
  "callback_data" text NOT NULL,
  "event_type" text NOT NULL,
  "received_at" text NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "interakt_delivery_events_callback_event_unique" ON "interakt_delivery_events" USING btree ("callback_data", "event_type");
