import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getObject } from "@/lib/storage";

// Payment screenshots contain personal data: only the event's organizer may view them.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const c = await prisma.contribution.findFirst({ where: { id, event: { organizerId: userId } }, select: { proofKey: true } });
  if (!c?.proofKey) return new Response("Not found", { status: 404 });
  const data = await getObject(c.proofKey);
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" },
  });
}
