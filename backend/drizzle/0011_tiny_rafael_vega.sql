CREATE TABLE "otp_send_counters" (
	"scope" text NOT NULL,
	"day" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "otp_send_counters_scope_day_pk" PRIMARY KEY("scope","day")
);
