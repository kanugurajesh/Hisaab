import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { monthLabel } from "@/lib/funds/months";
import { istIso } from "@/lib/ist";
import { normalizePhone } from "@/lib/phone";
import { putObject } from "@/lib/storage";
import { normalizeUtr } from "@/lib/upi";
import { extractProof, type ProofExtraction } from "@/lib/verify/extract";
import { isSameScreenshot } from "@/lib/verify/duplicates";
import { prepareProofImage } from "@/lib/verify/image";
import { evaluateProof } from "@/lib/verify/rules";
import { runMatching } from "./matching";

export const registrationInput = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  phone: z.string().trim().max(20).optional(),
  amount: z.coerce.number().int("Whole rupees only").positive("Enter the amount you paid").max(1_000_000),
  utr: z.string().trim().max(40).optional(),
  nudgeToken: z.string().max(40).optional(),
});

export type RegistrationResult =
  | { ok: true; contributionId: string; status: "VERIFIED" | "NEEDS_REVIEW" | "UNVERIFIED" }
  | { ok: false; error: string };

function istNowString(): string {
  return istIso().slice(0, 16);
}

export async function registerContribution(
  inviteCode: string,
  raw: Record<keyof z.infer<typeof registrationInput>, string | undefined>,
  proof: Buffer | null,
): Promise<RegistrationResult> {
  const parsed = registrationInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const input = parsed.data;

  const event = await prisma.event.findUnique({ where: { inviteCode } });
  if (!event || event.status !== "OPEN") return { ok: false, error: "This collection is closed." };

  const phone = normalizePhone(input.phone);
  if (input.phone && !phone) return { ok: false, error: "That phone number doesn't look right." };
  const enteredUtr = normalizeUtr(input.utr);

  const image = proof ? await prepareProofImage(proof) : null;
  const proofKey = image ? `proofs/${event.id}/${randomUUID()}.jpg` : null;
  if (image && proofKey) await putObject(proofKey, image.jpeg, "image/jpeg");

  const contribution = await prisma.contribution.create({
    data: {
      eventId: event.id,
      name: input.name,
      phone,
      amount: input.amount,
      proofKey,
      proofSha256: image?.sha256,
      proofPhash: image?.dhash,
    },
  });

  // Reminder links carry a per-person token, which is a certain match.
  if (input.nudgeToken) {
    await prisma.rosterMember.updateMany({
      where: { eventId: event.id, nudgeToken: input.nudgeToken, contributionId: null, status: { in: ["PENDING", "SUGGESTED"] } },
      data: { status: "MATCHED", contributionId: contribution.id, matchConfidence: 1, matchReason: "Registered from their reminder link" },
    });
  }

  let result: RegistrationResult = { ok: true, contributionId: contribution.id, status: "UNVERIFIED" };
  if (image) {
    let extracted: ProofExtraction | null = null;
    try {
      extracted = await extractProof({
        jpeg: image.jpeg,
        eventId: event.id,
        mock: () => ({
          isPaymentScreenshot: true,
          app: "gpay",
          status: "success",
          amount: input.amount,
          utr: enteredUtr ?? String(parseInt(image.sha256.slice(0, 12), 16) % 1e12).padStart(12, "0"),
          payeeName: event.organizerName,
          payeeVpa: event.organizerUpiVpa,
          payerName: input.name,
          timestamp: istNowString(),
          readability: "high",
        }),
      });
    } catch {
      // Vision model unavailable: keep UNVERIFIED so it lands in the review queue.
    }

    if (extracted) {
      // In a monthly fund, a payment is only good for one month: last month's
      // screenshot (or UTR) reused this month is the likeliest fraud there.
      const others = await prisma.contribution.findMany({
        where: { id: { not: contribution.id }, ...(event.fundId ? { event: { fundId: event.fundId } } : { eventId: event.id }) },
        select: { name: true, eventId: true, utr: true, proofSha256: true, proofPhash: true, extracted: true, event: { select: { period: true } } },
      });
      const usedBy = (o: (typeof others)[number]) =>
        o.eventId !== event.id && o.event.period ? `${o.name} for ${monthLabel(o.event.period)}` : o.name;
      const utr = enteredUtr ?? normalizeUtr(extracted.utr);
      const utrOwner = utr ? others.find((o) => o.utr === utr) : undefined;
      const imageOwner = others.find((o) => isSameScreenshot(o, image, extracted));
      const { checks, verified } = evaluateProof({
        extracted,
        declared: { amount: input.amount, utr: enteredUtr },
        event,
        duplicates: { utrUsedBy: utrOwner ? usedBy(utrOwner) : null, imageUsedBy: imageOwner ? usedBy(imageOwner) : null },
      });
      let status: "VERIFIED" | "NEEDS_REVIEW" = verified ? "VERIFIED" : "NEEDS_REVIEW";
      const data = { verificationStatus: status, extracted, checks: checks as unknown as object[] };
      try {
        // A UTR can only be claimed once per event; duplicates stay null and flagged.
        await prisma.contribution.update({ where: { id: contribution.id }, data: { ...data, utr: utr && !utrOwner ? utr : null } });
      } catch {
        // Lost a race to a concurrent registration with the same UTR.
        const utrCheck = checks.find((c) => c.id === "utr_unique");
        if (utrCheck) Object.assign(utrCheck, { pass: false, detail: "Already used by another registration" });
        status = "NEEDS_REVIEW";
        await prisma.contribution.update({ where: { id: contribution.id }, data: { ...data, verificationStatus: status, utr: null } });
      }
      result = { ok: true, contributionId: contribution.id, status };
    }
  }

  await runMatching(event.id).catch(() => undefined);
  return result;
}
