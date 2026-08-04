ALTER TABLE "bookings" ADD COLUMN "tourist_notified_at" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "provider_notified_at" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "notify_error" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refund_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refunded_at" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refund_amount" integer;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refund_reason" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refund_error" text;