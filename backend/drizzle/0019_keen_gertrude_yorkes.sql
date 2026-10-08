CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"ref_id" text,
	"read_at" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" text PRIMARY KEY NOT NULL,
	"tag" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text NOT NULL,
	"image" text NOT NULL,
	"link" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "push_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
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
ALTER TABLE "users" ADD COLUMN "interests" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "push_tokens_user_id_idx" ON "push_tokens" USING btree ("user_id");