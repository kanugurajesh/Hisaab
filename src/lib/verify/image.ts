import { createHash } from "node:crypto";
import sharp from "sharp";

export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);

export interface PreparedImage {
  /** Downscaled JPEG sent to the vision model and stored. */
  jpeg: Buffer;
  sha256: string;
  /** 64-bit difference hash, hex. Survives re-compression and small crops. */
  dhash: string;
}

export class InvalidImageError extends Error {}

/** `what` names the image in error messages shown to the uploader ("screenshot", "bill photo"). */
export async function prepareProofImage(input: Buffer, what = "screenshot"): Promise<PreparedImage> {
  if (input.length > MAX_PROOF_BYTES) throw new InvalidImageError(`The ${what} must be 5 MB or smaller.`);
  let format: string | undefined;
  try {
    format = (await sharp(input).metadata()).format;
  } catch {
    throw new InvalidImageError("That file is not an image.");
  }
  // Trust the decoded bytes, not the browser-supplied MIME type.
  if (!format || !ALLOWED_FORMATS.has(format)) throw new InvalidImageError(`Upload the ${what} as a JPG, PNG or WebP.`);

  const jpeg = await sharp(input)
    .rotate()
    .resize({ width: 1080, height: 2400, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  return { jpeg, sha256: createHash("sha256").update(input).digest("hex"), dhash: await dhash(input) };
}

export async function dhash(input: Buffer): Promise<string> {
  const { data } = await sharp(input).greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  let bits = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits = (bits << 1n) | (data[y * 9 + x] > data[y * 9 + x + 1] ? 1n : 0n);
    }
  }
  return bits.toString(16).padStart(16, "0");
}

export function hammingDistance(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (x) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}
