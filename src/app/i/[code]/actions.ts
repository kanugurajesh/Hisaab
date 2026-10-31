"use server";

import { headers } from "next/headers";
import { rateLimit } from "@/lib/rateLimit";
import { registerContribution, type RegistrationResult } from "@/lib/services/registration";
import { InvalidImageError } from "@/lib/verify/image";

export async function register(code: string, _: RegistrationResult | undefined, form: FormData): Promise<RegistrationResult> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (!rateLimit(`register:${ip}`, 10, 10 * 60_000)) return { ok: false, error: "Too many attempts. Please try again in a few minutes." };

  const file = form.get("proof");
  const proof = file instanceof File && file.size ? Buffer.from(await file.arrayBuffer()) : null;
  const str = (k: string) => (form.get(k) as string | null) || undefined;
  try {
    return await registerContribution(
      code,
      { name: str("name") ?? "", phone: str("phone"), amount: str("amount") ?? "", utr: str("utr"), nudgeToken: str("r") },
      proof,
    );
  } catch (err) {
    if (err instanceof InvalidImageError) return { ok: false, error: err.message };
    throw err;
  }
}
