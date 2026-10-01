# Regional WhatsApp OTP access

## Goal
Allow users with Indian, Nepali, Bangladeshi, and Bhutanese WhatsApp numbers to authenticate safely.

## Tasks
- [x] Add failing provider tests for `+91`, `+977`, `+880`, and `+975` splitting -> Unsupported country codes remain rejected.
- [x] Update Interakt splitting to recognize only the supported calling codes -> Provider tests pass.
- [x] Add explicit country selection and canonical E.164 submission to public web login -> Web tests and build pass.
- [x] Add the same country selection and country-specific length validation to mobile login -> Typecheck and 21 Jest tests pass.
- [x] Update user-facing OTP guidance and environment documentation -> Login flows show explicit supported-country choices.
- [x] Run targeted tests, full backend tests, web build/tests, and mobile build-time checks.

## Done When
- [x] All four supported countries produce unambiguous E.164 OTP requests through WhatsApp.

## Notes
- Local numbers are interpreted using the country the user explicitly selects.
- Existing Indian accounts and `+91` behavior remain compatible.
