"use server";

import { Prisma } from "@prisma/client";
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { rateLimit } from "@/lib/rateLimit";

export type SignUpResult = { ok: true } | { ok: false; error: string };

const signUpSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(80, "Name is too long"),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200, "Password is too long"),
});

const TAKEN = "An account with this email already exists. Sign in instead.";

export async function signUp(input: { name: string; email: string; password: string }): Promise<SignUpResult> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (!rateLimit(`signup:${ip}`, 10, 10 * 60_000)) return { ok: false, error: "Too many attempts. Please try again in a few minutes." };

  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { name, email, password } = parsed.data;

  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) return { ok: false, error: TAKEN };
  try {
    await prisma.user.create({ data: { name, email, passwordHash: await hashPassword(password) } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { ok: false, error: TAKEN };
    throw err;
  }
  return { ok: true };
}
