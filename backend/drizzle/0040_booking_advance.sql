ALTER TABLE "bookings" ADD COLUMN "advance_percent" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "advance_amount" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "advance_refund_days" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "advance_paid_at" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "advance_received_at" text;