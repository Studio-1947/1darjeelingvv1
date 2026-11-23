ALTER TABLE "payments" ADD COLUMN "billing" jsonb;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "gstin" text;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "gst_legal_name" text;