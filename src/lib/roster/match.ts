import { callStructured } from "@/lib/ai/groq";
import { s } from "@/lib/ai/schema";
import { lastDigits } from "@/lib/phone";
import { flatsConflict, looksLikeBusiness, nameSimilarity, normalizeName } from "@/lib/similarity";

// Three-stage matcher between the expected roster and people who registered:
//   1. deterministic (phone, exact normalised name)  -> auto match
//   2. fuzzy candidate generation (Jaro-Winkler + token alignment)
//   3. LLM adjudication for the ambiguous rest, constrained to the candidates
// Code, not the model, enforces one-to-one assignment and the auto-accept bar.

export const AUTO_ACCEPT = 0.9;
export const SUGGEST_MIN = 0.6;
const CANDIDATE_MIN = 0.55;

export interface RosterEntry {
  id: string;
  displayName: string;
  phone: string | null;
}

export interface ContributionEntry {
  id: string;
  name: string;
  phone: string | null;
  payerName: string | null;
}

export interface Proposal {
  rosterId: string;
  contributionId: string | null;
  confidence: number;
  reason: string;
}

export interface MatchDecision {
  rosterId: string;
  contributionId: string;
  confidence: number;
  reason: string;
  status: "MATCHED" | "SUGGESTED";
}

export interface Candidates {
  roster: RosterEntry;
  candidates: { contribution: ContributionEntry; score: number }[];
}

/** Both sides have a phone number and they differ: maybe a second number, maybe a second Priya. */
function phonesDiffer(r: RosterEntry, c: ContributionEntry): boolean {
  return !!r.phone && !!c.phone && r.phone !== c.phone;
}

export function deterministicMatches(roster: RosterEntry[], contributions: ContributionEntry[]) {
  const decisions: MatchDecision[] = [];
  const usedR = new Set<string>();
  const usedC = new Set<string>();
  const take = (r: RosterEntry, c: ContributionEntry, reason: string) => {
    decisions.push({ rosterId: r.id, contributionId: c.id, confidence: 1, reason, status: "MATCHED" });
    usedR.add(r.id);
    usedC.add(c.id);
  };

  const byPhone = new Map(contributions.filter((c) => c.phone).map((c) => [c.phone!, c]));
  for (const r of roster) {
    const c = r.phone ? byPhone.get(r.phone) : undefined;
    if (c && !usedC.has(c.id)) take(r, c, "Same phone number");
  }

  // Exact name only when it is unambiguous on both sides. normalizeName drops
  // flat numbers, so "Venkat 101" and "Venkat 202" need the flat check here.
  const count = <T>(items: T[], key: (t: T) => string) => {
    const m = new Map<string, T[]>();
    for (const i of items) m.set(key(i), [...(m.get(key(i)) ?? []), i]);
    return m;
  };
  const rByName = count(roster.filter((r) => !usedR.has(r.id)), (r) => normalizeName(r.displayName));
  const cByName = count(contributions.filter((c) => !usedC.has(c.id)), (c) => normalizeName(c.name));
  for (const [name, rs] of rByName) {
    const cs = cByName.get(name);
    if (!name || rs.length !== 1 || cs?.length !== 1) continue;
    if (flatsConflict(rs[0].displayName, cs[0].name) || phonesDiffer(rs[0], cs[0])) continue;
    take(rs[0], cs[0], "Same name");
  }

  return {
    decisions,
    roster: roster.filter((r) => !usedR.has(r.id)),
    contributions: contributions.filter((c) => !usedC.has(c.id)),
  };
}

export function scorePair(r: RosterEntry, c: ContributionEntry): number {
  if (flatsConflict(r.displayName, c.name)) return 0;
  const byName = nameSimilarity(r.displayName, c.name);
  const byPayer = c.payerName ? nameSimilarity(r.displayName, c.payerName) * 0.95 : 0;
  return Math.max(byName, byPayer);
}

export function generateCandidates(roster: RosterEntry[], contributions: ContributionEntry[], k = 3): Candidates[] {
  return roster
    .map((r) => ({
      roster: r,
      candidates: contributions
        .map((c) => ({ contribution: c, score: scorePair(r, c) }))
        .filter((x) => x.score >= CANDIDATE_MIN)
        .sort((a, b) => b.score - a.score)
        .slice(0, k),
    }))
    .filter((x) => x.candidates.length > 0);
}

/**
 * Turn model proposals into safe decisions: drop ids the model invented, enforce
 * one contribution per roster member (highest confidence wins), apply thresholds.
 * Different phone numbers on both sides, or a business on one side only ("Ganesh Sweets" vs.
 * "Ganesh Iyer"), cap the pair at a suggestion.
 */
export function resolveProposals(proposals: Proposal[], candidates: Candidates[]): MatchDecision[] {
  const allowed = new Map(candidates.map((c) => [c.roster.id, new Map(c.candidates.map((x) => [x.contribution.id, x.contribution]))]));
  const rosterById = new Map(candidates.map((c) => [c.roster.id, c.roster]));
  const usedR = new Set<string>();
  const usedC = new Set<string>();
  const out: MatchDecision[] = [];
  for (const p of [...proposals].sort((a, b) => b.confidence - a.confidence)) {
    if (!p.contributionId || !allowed.get(p.rosterId)?.has(p.contributionId)) continue;
    if (usedR.has(p.rosterId) || usedC.has(p.contributionId)) continue;
    let confidence = Math.max(0, Math.min(1, p.confidence));
    const roster = rosterById.get(p.rosterId)!;
    const contribution = allowed.get(p.rosterId)!.get(p.contributionId)!;
    if (phonesDiffer(roster, contribution) || looksLikeBusiness(roster.displayName) !== looksLikeBusiness(contribution.name)) {
      confidence = Math.min(confidence, AUTO_ACCEPT - 0.01);
    }
    if (confidence < SUGGEST_MIN) continue;
    usedR.add(p.rosterId);
    usedC.add(p.contributionId);
    out.push({
      rosterId: p.rosterId,
      contributionId: p.contributionId,
      confidence,
      reason: p.reason,
      status: confidence >= AUTO_ACCEPT ? "MATCHED" : "SUGGESTED",
    });
  }
  return out;
}

const adjudicationSchema = s.object({
  decisions: s.array(
    s.object({
      rosterId: s.string(),
      contributionId: s.nullable(s.string("Id of the matching registration, or null if none is the same person.")),
      confidence: s.number("0 to 1. Use >= 0.9 only when you are sure."),
      reason: s.string("Short reason, under 15 words."),
    }),
  ),
});

const ADJUDICATE_PROMPT = `You match members of an Indian WhatsApp group to people who registered a payment for a group event.
For each group member, decide which candidate registration (if any) is the same person.
Consider: initials ("Ravi K" = "Ravi Kumar"), nicknames and short forms ("Seenu" = "Srinivas", "Lakshmi" = "Laxmi"),
transliteration variants ("Mohammed"/"Mohd"/"Md"), honorifics and flat numbers ("Anil 302", "Sharma ji"),
surname-first order, and the payer name on their UPI screenshot. Matching phone endings are strong evidence;
different phone endings are strong evidence against. Common first names alone (e.g. two different "Priya"s) are NOT enough.
Only choose from the candidate ids given. If unsure, return null or a low confidence.`;

export async function adjudicate(candidates: Candidates[], eventId: string, batchSize = 25): Promise<Proposal[]> {
  const proposals: Proposal[] = [];
  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    const payload = batch.map((b) => ({
      rosterId: b.roster.id,
      groupName: b.roster.displayName,
      phoneEndsWith: lastDigits(b.roster.phone),
      candidates: b.candidates.map((x) => ({
        id: x.contribution.id,
        registeredName: x.contribution.name,
        upiPayerName: x.contribution.payerName,
        phoneEndsWith: lastDigits(x.contribution.phone),
      })),
    }));
    const res = await callStructured({
      task: "roster_match",
      kind: "text",
      schemaName: "roster_matches",
      schema: adjudicationSchema,
      eventId,
      temperature: 0,
      reasoningEffort: "medium",
      messages: [
        { role: "system", content: ADJUDICATE_PROMPT },
        { role: "user", content: JSON.stringify(payload) },
      ],
      mock: () => ({
        decisions: batch.map((b) => {
          const top = b.candidates[0];
          const ok = top.score >= 0.8;
          return {
            rosterId: b.roster.id,
            contributionId: ok ? top.contribution.id : null,
            confidence: ok ? Math.min(0.95, top.score) : 0.3,
            reason: ok ? "Similar name" : "No confident match",
          };
        }),
      }),
    });
    proposals.push(...res.decisions);
  }
  return proposals;
}

/** Full pipeline over plain data; persistence lives in services/matching.ts. */
export async function matchRoster(roster: RosterEntry[], contributions: ContributionEntry[], eventId: string): Promise<MatchDecision[]> {
  const det = deterministicMatches(roster, contributions);
  const candidates = generateCandidates(det.roster, det.contributions);
  if (!candidates.length) return det.decisions;
  let proposals: Proposal[];
  try {
    proposals = await adjudicate(candidates, eventId);
  } catch {
    // Model unavailable: fall back to fuzzy scores, which can only ever suggest.
    proposals = candidates.map((c) => ({
      rosterId: c.roster.id,
      contributionId: c.candidates[0].contribution.id,
      confidence: Math.min(c.candidates[0].score, AUTO_ACCEPT - 0.01),
      reason: "Similar name (AI unavailable)",
    }));
  }
  return [...det.decisions, ...resolveProposals(proposals, candidates)];
}
