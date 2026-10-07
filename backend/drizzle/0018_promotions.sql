CREATE TABLE "promotions" (
	"id" text PRIMARY KEY NOT NULL,
	"tag" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text NOT NULL,
	"image" text NOT NULL,
	"link" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
INSERT INTO "promotions" ("id", "tag", "title", "subtitle", "image", "link", "sort_order", "active", "created_at") VALUES
	('promo-monsoon', '25% OFF', 'Monsoon escapes', 'Homestays from ₹1,200', 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&q=80', '/category/homestay', 0, true, '2026-10-06T00:00:00.000Z'),
	('promo-sunrise', 'BEST SELLER', 'Sunrise at Tiger Hill', 'Full day cab + guide', 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=800&q=80', '/category/driver', 1, true, '2026-10-06T00:00:00.000Z'),
	('promo-tea', 'NEW', 'Tea garden tours', 'Live tasting sessions', 'https://images.pexels.com/photos/103875/pexels-photo-103875.jpeg?w=800', '/category/spot', 2, true, '2026-10-06T00:00:00.000Z');
