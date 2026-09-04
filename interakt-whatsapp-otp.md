# Interakt WhatsApp OTP

## Goal
Deliver login codes through the approved Interakt Authentication template `aagan_otp`, with secure verification and delivery-status tracking.

## Tasks
- [x] Harden OTP challenge persistence and verification → Verify: no usable OTP is stored.
- [x] Add Interakt callback data and signed webhook handling → Verify: valid event is recorded once; invalid signature is rejected.
- [x] Document deployment-only Interakt configuration → Verify: no secret appears in tracked examples.
- [x] Run backend typecheck and relevant tests → Verify: typecheck and adapter tests pass; DB suite is blocked by local Postgres credentials.

## Done When
- [x] New and returning Indian WhatsApp numbers can complete the same OTP journey after Interakt is configured.
