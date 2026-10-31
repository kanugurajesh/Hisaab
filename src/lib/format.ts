export function inr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function shortDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function longDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function relativeTime(d: Date | string, now = new Date()): string {
  const mins = Math.round((now.getTime() - new Date(d).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * Typed confirmation of a name, forgiving what phone keyboards make hard:
 * case, and punctuation like the "·" in "Ganesh Fund · Nov 2026".
 */
export function matchesName(typed: string, name: string): boolean {
  const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  // A name with no letters or digits ("🎉🎉🎉") has to be typed as it is.
  if (!words(name)) return typed.trim() !== "" && typed.trim() === name.trim();
  return words(typed) === words(name);
}
