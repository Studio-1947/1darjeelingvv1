CREATE TABLE "host_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"body" text NOT NULL,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"listing_id" text,
	"hidden_at" text,
	"hidden_reason" text,
	"created_at" text NOT NULL,
	"updated_at" text
);
--> statement-breakpoint
ALTER TABLE "host_posts" ADD CONSTRAINT "host_posts_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_posts" ADD CONSTRAINT "host_posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_posts" ADD CONSTRAINT "host_posts_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "host_posts_created_at_idx" ON "host_posts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "host_posts_provider_id_idx" ON "host_posts" USING btree ("provider_id");