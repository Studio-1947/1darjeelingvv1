-- 0018 seeded three example promotions as live: "25% OFF Monsoon escapes", "BEST SELLER Sunrise at
-- Tiger Hill" and "NEW Tea garden tours". None of them was ever offered, yet the app's home strip
-- showed them from this table (persona test 2026-11-09). Switch those three seeded rows off; real
-- promotions an admin adds are untouched.
UPDATE "promotions" SET "active" = false WHERE "id" IN ('promo-monsoon', 'promo-sunrise', 'promo-tea');
