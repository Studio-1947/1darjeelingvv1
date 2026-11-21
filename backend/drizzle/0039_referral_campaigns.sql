CREATE TABLE "campaign_signups" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"user_id" text NOT NULL,
	"joined_as" text NOT NULL,
	"reward_days" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "campaign_signups_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "referral_campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"code_key" text NOT NULL,
	"name" text NOT NULL,
	"audience" text DEFAULT 'any' NOT NULL,
	"reward_days" integer DEFAULT 0 NOT NULL,
	"ends_at" text,
	"max_uses" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" text NOT NULL,
	CONSTRAINT "referral_campaigns_code_key_unique" UNIQUE("code_key")
);
--> statement-breakpoint
ALTER TABLE "campaign_signups" ADD CONSTRAINT "campaign_signups_campaign_id_referral_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."referral_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_signups" ADD CONSTRAINT "campaign_signups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_signups_campaign_id_idx" ON "campaign_signups" USING btree ("campaign_id");