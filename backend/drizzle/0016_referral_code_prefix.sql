-- Referral codes now read ANG26-XXXXXX. Codes issued before the prefix are bare six-character
-- strings; give them the prefix so every user sees the same format. A bare code that was already
-- shared still redeems: normaliseCode adds the prefix to a six-character code before the lookup.
UPDATE "users" SET "referral_code" = 'ANG26-' || "referral_code"
  WHERE "referral_code" IS NOT NULL AND "referral_code" NOT LIKE 'ANG26-%' AND length("referral_code") = 6;
