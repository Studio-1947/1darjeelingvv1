-- A host listing with no chosen cover showed a random stock photo (or a blank card) even when the
-- host had uploaded their own photos. New saves now use the host's first photo (lib/listingCover.ts);
-- this gives listings saved before that the same cover.
UPDATE "listings" SET "image" = "extras"->'images'->>0 WHERE coalesce("image", '') = '' AND jsonb_typeof("extras"->'images') = 'array' AND coalesce("extras"->'images'->>0, '') <> '' AND "type" IN ('homestay', 'driver', 'guide', 'cafe', 'shop');
