# Role-aware host dashboard

## Goal

Give each host type a useful, live dashboard: driver operations in rose, business operations in green, and guide operations in blue.

## Tasks

- [ ] Add completion, points, and developer-feedback persistence. Verify: migration applies to a clean test database.
- [ ] Add authenticated host APIs for completing bookings, dashboard analytics, points, and feedback. Verify: endpoint tests cover ownership and idempotency.
- [ ] Make provider dashboard metrics and actions role-aware. Verify: each business type renders its intended palette and metrics.
- [ ] Add membership, reviews, points, and feedback cards with loading and empty states. Verify: provider dashboard build succeeds.
- [ ] Run backend and frontend checks. Verify: tests and production build pass.

## Done when

- Driver mileage is recorded only when a driver completes their own confirmed booking.
- Completed bookings earn one durable points award and can never award twice.
- Host feedback reaches a persisted, authenticated developer-feedback queue.
