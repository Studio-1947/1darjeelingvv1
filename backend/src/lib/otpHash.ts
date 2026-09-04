import argon2 from 'argon2';

/**
 * OTPs are short-lived credentials, but still must never be recoverable from the database.
 * Argon2id makes a leaked challenge table useless for replay.
 */
export function hashOtp(otp: string): Promise<string> {
  return argon2.hash(otp, { type: argon2.argon2id });
}

export function verifyOtpHash(hash: string, otp: string): Promise<boolean> {
  return argon2.verify(hash, otp);
}
