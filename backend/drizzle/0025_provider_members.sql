CREATE TABLE "provider_members" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"phone_key" text NOT NULL,
	"user_id" text,
	"name" text,
	"role" text DEFAULT 'co_owner' NOT NULL,
	"added_by" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_members" ADD CONSTRAINT "provider_members_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_members" ADD CONSTRAINT "provider_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_members_provider_phone_unique" ON "provider_members" USING btree ("provider_id","phone_key");--> statement-breakpoint
CREATE INDEX "provider_members_phone_key_idx" ON "provider_members" USING btree ("phone_key");--> statement-breakpoint
CREATE INDEX "provider_members_user_id_idx" ON "provider_members" USING btree ("user_id");