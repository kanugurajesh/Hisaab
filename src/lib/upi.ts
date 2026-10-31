const VPA_RE = /^[a-z0-9._-]{2,256}@[a-z][a-z0-9]{1,63}$/;

export function normalizeVpa(vpa: string | null | undefined): string | null {
  if (!vpa) return null;
  const v = vpa.trim().toLowerCase().replace(/\s+/g, "");
  return v || null;
}

export function isValidVpa(vpa: string): boolean {
  return VPA_RE.test(normalizeVpa(vpa) ?? "");
}

/** Standard UPI deep link understood by GPay, PhonePe, Paytm and BHIM. */
export function buildUpiLink(opts: { vpa: string; payeeName: string; amount: number; note: string }): string {
  const params = new URLSearchParams({
    pa: normalizeVpa(opts.vpa)!,
    pn: opts.payeeName,
    am: opts.amount.toFixed(2),
    cu: "INR",
    tn: opts.note.slice(0, 50),
  });
  return `upi://pay?${params.toString()}`;
}

/** UPI RRN / UTR numbers are 12 digits. */
export function isValidUtr(utr: string | null | undefined): boolean {
  return !!utr && /^\d{12}$/.test(utr);
}

export function normalizeUtr(utr: string | null | undefined): string | null {
  if (!utr) return null;
  const digits = utr.replace(/\D/g, "");
  return digits || null;
}
