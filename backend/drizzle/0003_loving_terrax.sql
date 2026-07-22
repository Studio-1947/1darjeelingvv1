CREATE TABLE "kyc_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"doc_type" text NOT NULL,
	"file_key" text NOT NULL,
	"content_type" text NOT NULL,
	"status" text NOT NULL,
	"rejection_reason" text,
	"uploaded_at" text NOT NULL,
	"reviewed_at" text,
	"reviewed_by" text
);
--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "kyc_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;