ALTER TABLE "reviews" ADD COLUMN "photos" jsonb DEFAULT '[]'::jsonb NOT NULL;
