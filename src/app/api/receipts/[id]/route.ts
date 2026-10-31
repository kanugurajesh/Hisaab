import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getObject } from "@/lib/storage";

// Bills are part of the shared ledger: the organizer and anyone holding the
// invite code (the group) may open them. Contributor payment screenshots stay
// organizer-only in /api/proofs.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const code = new URL(req.url).searchParams.get("c");
  let where: { id: string; event: { inviteCode: string } | { organizerId: string } };
  if (code) {
    where = { id, event: { inviteCode: code } };
  } else {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return new Response("Unauthorized", { status: 401 });
    where = { id, event: { organizerId: userId } };
  }
  const e = await prisma.expense.findFirst({ where, select: { receiptKey: true } });
  if (!e?.receiptKey) return new Response("Not found", { status: 404 });
  const data = await getObject(e.receiptKey);
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" },
  });
}
