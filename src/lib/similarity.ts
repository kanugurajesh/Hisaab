// Name similarity tuned for Indian names as they appear in WhatsApp groups
// ("Ravi K", "Ravi Kumar 302", "Dr. Sita Ram ji", "Seenu 🙏").

const HONORIFICS = new Set([
  "mr", "mrs", "ms", "miss", "dr", "shri", "sri", "smt", "kum",
  "ji", "garu", "uncle", "aunty", "auntie", "anna", "akka", "bhai", "bhaiya", "didi", "sir", "madam",
]);

/** Lowercase, strip emoji/punctuation/honorifics and flat numbers, collapse whitespace. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(flat|villa|plot|house|apt|block|no)\b\.?/g, " ")
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t && !HONORIFICS.has(t))
    .join(" ");
}

/** Flat / house numbers in a name ("Anil 302", "Krishna (B-204)"), digits only. Phone-length runs are ignored. */
export function flatNumbers(name: string): Set<string> {
  const found = name.match(/(?<![\p{L}\d])(?:[a-z]-?)?\d{1,4}[a-z]?(?![\p{L}\d])/giu) ?? [];
  return new Set(found.map((f) => f.replace(/\D/g, "")));
}

const BUSINESS_WORDS =
  /\b(shop|store|stores|office|enterprises?|traders|bot|services|sweets|mart|bakery|caterers?|tent house|medicals?|agencies|textiles|electricals)\b/i;

/** "Ganesh Sweets", "Balaji Stores": a business, not a member who pays. */
export function looksLikeBusiness(name: string): boolean {
  return BUSINESS_WORDS.test(name);
}

/** Both names carry a flat number and none of them agree: different households, whatever the names say. */
export function flatsConflict(a: string, b: string): boolean {
  const fa = flatNumbers(a);
  const fb = flatNumbers(b);
  return fa.size > 0 && fb.size > 0 && ![...fa].some((f) => fb.has(f));
}

export function jaroWinkler(a: string, b: string): number {
  if (a === b) return a.length ? 1 : 0;
  if (!a.length || !b.length) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatch = new Array<boolean>(a.length).fill(false);
  const bMatch = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - range);
    const hi = Math.min(i + range + 1, b.length);
    for (let j = lo; j < hi; j++) {
      if (bMatch[j] || a[i] !== b[j]) continue;
      aMatch[i] = bMatch[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let transpositions = 0;
  for (let i = 0, k = 0; i < a.length; i++) {
    if (!aMatch[i]) continue;
    while (!bMatch[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const m = matches;
  const jaro = (m / a.length + m / b.length + (m - transpositions / 2) / m) / 3;
  let prefix = 0;
  while (prefix < 4 && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

/** Score two tokens, treating a single letter as an initial ("k" ~ "kumar"). */
function tokenScore(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 1 || b.length === 1) return a[0] === b[0] ? 0.9 : 0;
  return jaroWinkler(a, b);
}

/**
 * Greedy token alignment: every token of the shorter name must find a partner in
 * the longer one. Missing surname tokens are only lightly penalised, because
 * "Ravi" and "Ravi Kumar" are usually the same person in a group.
 */
function tokenAlignment(a: string[], b: string[]): number {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const used = new Set<number>();
  const scores: number[] = [];
  for (const t of short) {
    let best = 0;
    let bestIdx = -1;
    long.forEach((u, idx) => {
      if (used.has(idx)) return;
      const s = tokenScore(t, u);
      if (s > best) [best, bestIdx] = [s, idx];
    });
    if (bestIdx >= 0) used.add(bestIdx);
    scores.push(best);
  }
  // Blend the average with the weakest token, so a shared surname can't carry
  // two different first names ("Shalini Rao" vs "Srinivas Rao").
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const coverage = (avg + Math.min(...scores)) / 2;
  const missing = long.length - short.length;
  return coverage * Math.pow(0.95, missing);
}

export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = na.split(" ");
  const tb = nb.split(" ");
  // Split vs joined spellings ("Hema Latha" / "Hemalatha") only show up when
  // the token counts differ; compare them with spaces removed.
  const joined = ta.length !== tb.length ? jaroWinkler(ta.join(""), tb.join("")) * 0.95 : 0;
  return Math.max(joined, tokenAlignment(ta, tb));
}
