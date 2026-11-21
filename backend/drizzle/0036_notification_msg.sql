-- Notifications keep their English title/body, and now also the message as a key + details, so
-- the website and app can show it in the reader's language (Bengali, Hindi, Nepali; Nov 2026).
ALTER TABLE "notifications" ADD COLUMN "msg" jsonb;
