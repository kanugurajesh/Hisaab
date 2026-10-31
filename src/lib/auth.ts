import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

export const demoLoginEnabled = process.env.DEMO_LOGIN === "true";

const providers: NextAuthOptions["providers"] = [];
if (process.env.GOOGLE_CLIENT_ID) {
  providers.push(GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "" }));
}
if (demoLoginEnabled) {
  providers.push(
    CredentialsProvider({
      id: "demo",
      name: "Demo organizer",
      credentials: {},
      authorize: async () => ({ id: "demo", email: "demo@choruss.local", name: "Demo Organizer" }),
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
