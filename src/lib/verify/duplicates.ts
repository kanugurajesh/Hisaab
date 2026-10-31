import { normalizeUtr } from "@/lib/upi";
import type { ProofExtraction } from "./extract";
import { hammingDistance, type PreparedImage } from "./image";

export const NEAR_DUPLICATE_BITS = 6;

export interface StoredProof {
  utr: string | null;
  proofSha256: string | null;
  proofPhash: string | null;
  extracted: unknown;
}

/**
 * Is this screenshot a copy of an earlier one (exact bytes, or re-compressed /
 * cropped)? Success screens from one app, for the same amount to the same
 * organizer, look nearly identical at hash resolution, so near-identical
 * pixels only count when what's written on them agrees too: the same UTR, or
 * the same time and amount (an edited copy usually keeps those). When neither
 * can be compared, near-identical pixels are enough to ask the organizer.
 */
export function isSameScreenshot(o: StoredProof, image: PreparedImage, extracted: ProofExtraction): boolean {
  if (o.proofSha256 === image.sha256) return true;
  if (!o.proofPhash || hammingDistance(o.proofPhash, image.dhash) > NEAR_DUPLICATE_BITS) return false;
  const ox = o.extracted as Partial<ProofExtraction> | null;
  const utr = normalizeUtr(extracted.utr);
  const otherUtr = o.utr ?? normalizeUtr(ox?.utr ?? null);
  if (utr && otherUtr && utr === otherUtr) return true;
  const ts = extracted.timestamp;
  const otherTs = ox?.timestamp ?? null;
  if (ts && otherTs && ts === otherTs && extracted.amount === (ox?.amount ?? null)) return true;
  const comparable = (!!utr && !!otherUtr) || (!!ts && !!otherTs);
  return !comparable;
}
