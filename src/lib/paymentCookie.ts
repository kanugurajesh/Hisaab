import { createHmac, timingSafeEqual } from "node:crypto";

// Remembers which contribution this browser registered, so the invite page can
// show its live status (approved, rejected…) instead of a blank form. Signed so
// nobody can look up someone else's payment by guessing an id.

export const paymentCookieName = (inviteCode: string) => `hisaab_paid_${inviteCode}`;

const sign = (id: string) => createHmac("sha256", process.env.NEXTAUTH_SECRET ?? "dev-secret").update(id).digest("base64url");

export function signContributionId(id: string): string {
  return `${id}.${sign(id)}`;
}

export function readContributionId(value: string | undefined): string | null {
  const [id, sig] = value?.split(".") ?? [];
  if (!id || !sig) return null;
  const expected = Buffer.from(sign(id));
  const given = Buffer.from(sig);
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null;
}
