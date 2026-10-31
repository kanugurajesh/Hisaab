import { parsePhoneNumberFromString } from "libphonenumber-js";

/** Normalize a phone number to E.164, assuming India when no country code is given. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[‎‪-‮ \s()-]/g, "");
  if (!/\d{7,}/.test(cleaned)) return null;
  const parsed = parsePhoneNumberFromString(cleaned, "IN");
  return parsed?.isValid() ? parsed.number : null;
}

export function lastDigits(phone: string | null, n = 4): string | null {
  return phone ? phone.slice(-n) : null;
}
