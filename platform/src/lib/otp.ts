import { randomInt } from 'node:crypto';

// Kode 6 digit; randomInt dipakai supaya tidak bergantung pada Math.random.
export function generateOtp(): string {
  return String(randomInt(100000, 999999));
}

export const OTP_EXPIRES_MINUTES = 15;
export const OTP_RESEND_SECONDS = 60;
