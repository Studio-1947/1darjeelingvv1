CREATE TABLE "vouchers" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"discount_percentage" integer NOT NULL,
	"tier" integer NOT NULL,
	"status" text NOT NULL,
	"used_at" text,
	"used_on_booking_id" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "voucher_id" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "applied_discount" integer;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
