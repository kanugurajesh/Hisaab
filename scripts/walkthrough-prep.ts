// Gets the local database ready for scripts/walkthrough.ts (not part of the app).
//
//   tsx --env-file=.env scripts/walkthrough-prep.ts
//
// - Moves leftover e2e/test collections off the demo organizer account onto an
//   "e2e archive" user (nothing is deleted), so the collections list is clean.
// - Gives the demo organizer a password, so the recording can sign in with
//   email + password even when DEMO_LOGIN is off.
// - Removes collections left behind by earlier walkthrough recordings.
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

export const DEMO_EMAIL = "demo@hisaab.local";
export const DEMO_PASSWORD = "hisaab-demo-2026";
export const WALK_EVENT = "Children's Day Party – Block C";

const prisma = new PrismaClient();

async function main() {
  const demo = await prisma.user.findUniqueOrThrow({ where: { email: DEMO_EMAIL } });
  const archive = await prisma.user.upsert({
    where: { email: "e2e-archive@hisaab.local" },
    update: {},
    create: { email: "e2e-archive@hisaab.local", name: "E2E archive" },
  });

  const old = await prisma.event.deleteMany({ where: { organizerId: demo.id, name: WALK_EVENT } });

  const keepEvent = (code: string) => code === "diwali26" || code.startsWith("sainagar-");
  const events = await prisma.event.findMany({ where: { organizerId: demo.id }, select: { id: true, inviteCode: true } });
  const move = events.filter((e) => !keepEvent(e.inviteCode)).map((e) => e.id);
  await prisma.event.updateMany({ where: { id: { in: move } }, data: { organizerId: archive.id } });
  const funds = await prisma.fund.updateMany({ where: { organizerId: demo.id, name: { not: "Sai Nagar Ganesh Fund" } }, data: { organizerId: archive.id } });

  await prisma.user.update({ where: { id: demo.id }, data: { name: "Ravi Kumar", passwordHash: await hashPassword(DEMO_PASSWORD) } });

  console.log(`Removed ${old.count} old walkthrough collection(s); moved ${move.length} test collections and ${funds.count} test funds to ${archive.email}.`);
  const left = await prisma.event.findMany({ where: { organizerId: demo.id }, select: { name: true }, orderBy: { createdAt: "asc" } });
  console.log("Demo account now has:", left.map((e) => e.name).join(" | "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
