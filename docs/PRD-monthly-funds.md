# PRD: Monthly funds

**Status:** prototype built · **Date:** 31 Oct 2026 · Builds on [PRD.md](PRD.md) (Hisaab)

## What I learned from an organizer
I asked people who run a WhatsApp group of about 100 people that pays **every month** into a fund for the Ganesh festival and other society costs. Everyone pays the organizer's number on PhonePe and posts the screenshot in the group. Keeping track is "exhausting", and some people don't pay.

Hisaab was built for **one-off events** like a Diwali dinner or a trip: one collection, one date, one amount, then "Close and settle". This group doesn't work that way:

| One-off event | Monthly fund |
|---|---|
| Collect once, spend, settle, close | Collect every month, spend at festival time, never "settle" |
| "Who hasn't paid?" | "Who hasn't paid **this month**, and who keeps missing months?" |
| Leftover money is returned per person | Leftover money **stays in the fund** |

## Problem
Without fund support, the organizer would create a new collection every month and **add 100 people again each time**. They'd also be missing the two answers that matter for a fund:
1. **Who has missed several months in a row?** Not paying in one month is normal; missing three is a conversation.
2. **How much has each person paid this year?** This comes up in arguments, and for anyone who wants to "catch up".

The money view was wrong for a fund too. Spending ₹19,700 on Ganesh in September out of September's ₹8,000 shows as a "shortfall", when the fund actually has ₹19,800 left.

## Solution: linked monthly collections
Each month is still a normal collection, with its own invite link, review queue, reminders and assistant, so everything already tested keeps working. On top of that:

- **"Repeats every month"** when creating a collection makes it a fund. The first month is named "Sai Nagar Ganesh Fund · May 2026".
- **Start next month** (one tap) copies the members, amount, UPI ID and details. Everyone starts the month unpaid, except people marked "not expected to pay" (the organizer, a shop), who stay excluded. Each person keeps a stable identity across months.
- **The Fund page:**
  - fund collected, spent, money in the fund, and paid this year
  - **"Missed 2 or more months in a row"**, with the months named
  - a **person × month grid**: ✓ / ✗ / … still collecting, with each person's total this year
- **"Also missed Aug, Sep"** appears next to each unpaid person in the month's "Who hasn't paid" list, so the organizer can pick the reminder's tone.
- **The contributor ledger and the WhatsApp money update show the whole fund**: all months collected, all spending, and the balance.
- **Close** for a month stops new payments for that month. There is no per-person settlement, because the balance stays in the fund.

### Design decisions
| Decision | Why |
|---|---|
| Linked months, not one never-ending collection | Matching, stats, reminders, review and the assistant all assume one payment per person per collection. Linking months reuses all of it, while one big collection would mean rewriting each. |
| The current month never counts as "missed" while it's collecting | Not having paid on the 3rd of the month isn't missing it. |
| A month that hasn't started never counts as "missed", even if closed | Starting December early, or closing it by mistake, shouldn't put anyone behind. |
| The next month can only be opened once the current one has begun | Repeated taps on "Start next month" mustn't stack up future months nobody can pay yet. |
| A month with payments or bills can't be deleted | That money belongs to the whole fund's accounts, not to one month. |
| Missed months are counted **in a row**, back from the last finished month | "Missed March, paid since" is not the same problem as "missed the last three". |
| Members are copied from the **latest** month | Changes the organizer made last month (people who left, shops excluded) carry forward. |
| The previous month isn't closed automatically | Late payments for last month are normal, and its link keeps working. |

## Goals and metrics
| Goal | Metric | Target |
|---|---|---|
| No re-entry each month | Time from "new month" to reminders ready | One tap |
| Catch drift early | People with 2+ missed months who pay within the month after a reminder | Rising |
| Trust in the fund | Contributor visits to the fund ledger | Qualitative, from interviews |

## Not built yet: questions for the next organizer conversation
1. **Paying several months at once** ("₹1,500 for Aug–Oct"): today that payment counts toward one month.
2. **Changing the amount mid-year** (₹500 → ₹600 before the festival): the next month copies the latest amount, which can be edited.
3. **Assistant across months** ("who missed 3 months?"): the assistant answers per month today, except for money, where it reports the whole fund's balance.
4. **Year-end:** does the fund reset at Ganesh Chaturthi or in January?
