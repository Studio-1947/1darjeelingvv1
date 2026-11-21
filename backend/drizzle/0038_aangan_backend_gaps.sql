CREATE TABLE "place_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"place" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"entry_price" integer,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"review_note" text,
	"listing_id" text,
	"created_at" text NOT NULL,
	"reviewed_at" text,
	"reviewed_by" text
);
--> statement-breakpoint
CREATE TABLE "trip_plan_members" (
	"plan_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "trip_plan_members_plan_id_user_id_pk" PRIMARY KEY("plan_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "trip_plan_saves" (
	"plan_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "trip_plan_saves_plan_id_user_id_pk" PRIMARY KEY("plan_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "trip_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"cover" text,
	"stops" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"days" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"start_date" text,
	"nights" integer DEFAULT 1 NOT NULL,
	"stay_listing_id" text,
	"driver_listing_id" text,
	"seats" integer DEFAULT 2 NOT NULL,
	"cost_per_person" integer,
	"notes" text DEFAULT '' NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"hidden_at" text,
	"created_at" text NOT NULL,
	"updated_at" text
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "room_name" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "room_price" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "pickup_place" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "drop_place" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "pickup_time" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "days" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "quoted_fare" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancel_note" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancelled_by" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancelled_at" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancel_late" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "declined" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancel_requested_at" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancel_request_reason" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancel_request_note" text;--> statement-breakpoint
ALTER TABLE "host_posts" ADD COLUMN "kind" text DEFAULT 'update' NOT NULL;--> statement-breakpoint
ALTER TABLE "place_suggestions" ADD CONSTRAINT "place_suggestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_suggestions" ADD CONSTRAINT "place_suggestions_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_plan_members" ADD CONSTRAINT "trip_plan_members_plan_id_trip_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."trip_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_plan_members" ADD CONSTRAINT "trip_plan_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_plan_saves" ADD CONSTRAINT "trip_plan_saves_plan_id_trip_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."trip_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_plan_saves" ADD CONSTRAINT "trip_plan_saves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_plans" ADD CONSTRAINT "trip_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_plans" ADD CONSTRAINT "trip_plans_stay_listing_id_listings_id_fk" FOREIGN KEY ("stay_listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_plans" ADD CONSTRAINT "trip_plans_driver_listing_id_listings_id_fk" FOREIGN KEY ("driver_listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "place_suggestions_status_idx" ON "place_suggestions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "place_suggestions_user_id_idx" ON "place_suggestions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trip_plans_created_at_idx" ON "trip_plans" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "trip_plans_user_id_idx" ON "trip_plans" USING btree ("user_id");