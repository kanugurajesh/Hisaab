# PRD: Hisaab, collection tracking for Choruss

**Status:** prototype built · **Author:** _your name_ · **Date:** 31 Oct 2026

## Problem
Choruss replaces "chat-based payment requests, screenshot proofs and personal spreadsheets" for group collections. But in the current flow a person **only exists in Choruss after they pay and register**. That leaves the organizer two big jobs that still happen by hand in WhatsApp:

1. **Finding who hasn't paid.** The organizer's real list is the WhatsApp group (say 80 people). Choruss shows 52 registrations. Working out the missing 28 means scrolling the group and comparing names one by one: "Is *Seenu* the same as *Srinivas Rao*?"
2. **Trusting the registrations.** Money goes to the organizer's UPI outside the app, so every "I paid ₹500" is self-reported. Organizers open each screenshot to check the amount, the receiver and whether it's a reused image.

Both jobs grow with group size. They're also socially awkward, and they're why organizers keep side spreadsheets.

## Users
- **Organizer** (primary): a society committee member, trip planner or office-party owner. Mobile-first, busy, and uncomfortable chasing neighbours for money.
- **Contributor**: a group member who just wants to pay and be ticked off.

## Goals and metrics
| Goal | Metric | Target |
|---|---|---|
| Collect from more of the group | **Collection rate** = paid ÷ expected | +15 pts vs. no reminders |
| Less chasing | Reminders that lead to a registration (tracked by each person's own link) | ≥ 30% |
| Less manual verification | % of registrations auto-verified | ≥ 80% of genuine payments |
| Safety | Bad payments auto-verified | **0** (hard gate in evals) |
| Cost | AI cost per 100-member event | < $0.05 |

Non-goals: holding money, bank or PSP integration, a WhatsApp Business API bot (deliberately avoided: cost, approvals, spam risk).

## Solution
**1. Expected roster.** The organizer uploads a WhatsApp chat export or pastes names.
- A deterministic parser extracts the members (it handles join, leave, remove and re-add) and **drops every message body**.
- An LLM cleans up the names and flags businesses and the organizer.
- The organizer can exclude anyone.

**2. Matching.** Each roster member is matched to a registration in three stages:
- Phone or exact name → automatic match.
- Fuzzy candidates are scored with Jaro-Winkler plus token alignment.
- An LLM judges nicknames, initials and transliterations, and also sees the payer name read from the UPI screenshot.

Below 90% confidence a match is only *suggested*, and the organizer confirms it with one tap.

**3. Missing list + nudges.**
- Shows ₹ outstanding.
- Writes personal reminders in English, Hindi or Telugu, with a tone that escalates by attempt (friendly → firm → final).
- Sends through a `wa.me` deep link, so the organizer sends from their own WhatsApp and stays in control.
- Each reminder carries a per-person token, so a payment that follows is matched with certainty and counts as a conversion.

**4. Proof verification.**
- A vision LLM extracts the amount, status, payee, UTR and time from the screenshot.
- **Deterministic rules decide the verdict:** amount, receiver, time window, UTR format and reuse, and perceptual-hash image reuse.
- Failures go to a review queue that shows *why*. Only the organizer can reject.

## Key decisions
- **The LLM proposes; code decides.** The model never sets a verdict or invents a match: ids are restricted to the candidates, assignment is one-to-one, and thresholds live in code. This also defeats prompt injection written into screenshots.
- **No AI where a template is better.** The group nudge message is a template, because names must be exact.
- **Privacy.** Message bodies never leave the parser. The LLM sees only the last 4 digits of phone numbers. Proof images are private and served only to the organizer.
- **Degrade gracefully.** If the model is down, matching falls back to fuzzy *suggestions* only, reminders fall back to templates, and proofs go to the review queue.

## Risks
| Risk | Mitigation |
|---|---|
| A screenshot can be edited | A screenshot is not bank confirmation, which the UI says plainly. Future: UPI collect requests / PSP webhooks |
| Wrong auto-match marks a non-payer as paid | High threshold, evals gate precision, the organizer can undo, and rejecting a payment re-opens the person |
| Chat export contains sensitive messages | Bodies are discarded during parsing and covered by a unit test |

## Rollout
1. Ship behind a flag to 10 active organizers and measure collection rate against their previous events.
2. Interview organizers about suggestion accuracy and reminder tone.
3. Add more languages (Tamil, Kannada, Marathi) and scheduled reminders.
