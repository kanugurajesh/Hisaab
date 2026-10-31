import { icsFile } from "@/lib/calendar";
import { prisma } from "@/lib/db";

// "Add to calendar" for Apple Calendar and Outlook. Anyone with the invite code can download it.
export async function GET(_: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const event = await prisma.event.findUnique({ where: { inviteCode: code } });
  if (!event) return new Response("Not found", { status: 404 });
  const filename = `${event.name.replace(/[^\w -]+/g, "").trim() || "event"}.ics`;
  return new Response(icsFile({ ...event, uid: event.id }), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"` },
  });
}
