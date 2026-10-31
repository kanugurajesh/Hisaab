import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { DUMMY_HASH, verifyPassword } from "@/lib/password";
import { rateLimit } from "@/lib/rateLimit";

export const demoLoginEnabled = process.env.DEMO_LOGIN === "true";

const providers: NextAuthOptions["providers"] = [
  CredentialsProvider({
    id: "password",
    name: "Email and password",
    credentials: { email: { type: "email" }, password: { type: "password" } },
    authorize: async (credentials) => {
      const email = credentials?.email?.trim().toLowerCase();
      const password = credentials?.password;
      if (!email || !password) return null;
      if (!rateLimit(`login:${email}`, 10, 10 * 60_000)) throw new Error("Too many attempts. Please try again in a few minutes.");

      const user = await prisma.user.findUnique({ where: { email } });
      const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
      if (!user?.passwordHash || !ok) return null;
      return { id: user.id, email: user.email, name: user.name };
    },
  }),
];
if (demoLoginEnabled) {
  providers.push(
    CredentialsProvider({
      id: "demo",
      name: "Demo organizer",
      credentials: {},
      authorize: async () => ({ id: "demo", email: "demo@hisaab.local", name: "Demo Organizer" }),
    }),
  );
}

export const authOptions: NextAuthOptions = {
  providers,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.email) {
        const dbUser = await prisma.user.upsert({
          where: { email: user.email },
          update: { name: user.name ?? undefined },
          create: { email: user.email, name: user.name },
        });
        token.uid = dbUser.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) (session.user as { id?: string }).id = token.uid as string;
      return session;
    },
  },
};

export async function requireOrganizer(): Promise<{ id: string; name: string | null }> {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) redirect("/login");
  return { id, name: session!.user?.name ?? null };
}

/** Loads an event only if it belongs to the signed-in organizer. */
export async function requireEvent(eventId: string) {
  const user = await requireOrganizer();
  const event = await prisma.event.findFirst({ where: { id: eventId, organizerId: user.id } });
  if (!event) redirect("/events");
  return event;
}
