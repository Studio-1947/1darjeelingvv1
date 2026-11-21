# Mobile profile and trips UI port

## Goal
Bring the Android Profile and My Trips experience closer to the web mobile UI using the existing account and booking data.

## Tasks
- [x] Compare Profile and My Trips with the web screens. -> Verify: identify trips filtering and summary as the largest gap.
- [x] Add phone-first booking summary and status filters to My Trips. -> Verify: upcoming bookings exclude completed/cancelled rows; Past includes completed, cancelled, and declined rows.
- [x] Validate the React Native app. -> Verify: TypeScript and all 16 Jest tests pass.

## Done When
- [x] Trips supports the web screen's actionable status views without breaking Profile navigation or wide layouts.
