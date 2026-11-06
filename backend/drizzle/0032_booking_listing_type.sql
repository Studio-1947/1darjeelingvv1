-- A booking's listing_type used to be whatever the client sent, so a homestay booked as "driver"
-- skipped the date and clash checks. POST /bookings now always stores the listing's own type;
-- this corrects rows saved before that, so accept, confirm and amounts read the right type.
UPDATE "bookings" AS b SET "listing_type" = l."type" FROM "listings" AS l WHERE l."id" = b."listing_id" AND b."listing_type" <> l."type";--> statement-breakpoint
-- Guest counts below one were accepted too; one is the least a booking can be for.
UPDATE "bookings" SET "guests" = 1 WHERE "guests" < 1;
