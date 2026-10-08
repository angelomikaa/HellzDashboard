# Phase 1: Foundation — Secure Access & Data Model - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-08
**Phase:** 1 — Foundation — Secure Access & Data Model
**Areas discussed:** Login identity & whitelist seeding, Session & lockout behavior, OCR spike logistics, Deployment target

---

## Login identity & whitelist seeding

### Q1: What identifies a member at login (paired with their 4-digit PIN)?

| Option | Description | Selected |
|--------|-------------|----------|
| Character name + PIN | RO in-game name everyone already knows; zero new credentials | |
| Discord handle + PIN | Ties panel to guild's chat identity | ✓ |
| Email + PIN | Conventional but adds friction; invites full-account-system creep | |

**User's choice:** Discord handle + PIN

### Q2: Is the Discord handle plain text (no Discord API), or something more?

| Option | Description | Selected |
|--------|-------------|----------|
| Plain text handle | Text identifier in members table; no Discord API/OAuth; auth in Supabase only | ✓ |
| Discord OAuth instead of PIN | New auth architecture; abandons PIN model | |
| Handle + Discord verification | Bot lookup at registration; new integration surface | |

**User's choice:** Plain text handle

### Q3: How does the owner seed the member whitelist during Phase 1?

| Option | Description | Selected |
|--------|-------------|----------|
| SQL seed script | Versioned, bcrypt-hashed PINs, auditable in git, repeatable | ✓ |
| Supabase dashboard by hand | Fastest but invisible in git, error-prone | |
| Owner-only seeding tool | CLI/Edge Function; extra build item beyond roadmap | |

**User's choice:** SQL seed script

### Q4: How does each member's PIN get chosen?

| Option | Description | Selected |
|--------|-------------|----------|
| Owner assigns | Owner collects PIN via Discord DM, hashes, inserts in seed | |
| Temp PIN + change screen | First login with temp PIN then change flow; extra Phase 1 scope | |
| You decide | Mechanics open as long as PINs are hashed and per-player | |

**User's choice (freeform):** "PIN is assigned in the moment of subscribing, alongside in-game nickname for tracking. Discord is the key that will not allow a player to enter two or multiple characters under the same person, effectively stopping multiple nickname hijacking."

### Q5 (follow-up): One Discord handle → one character, or one → many? Who generates the PIN?

**User's choice (freeform):** "Rules of the guild only allow one character per person, multiboxed secondary characters must go to another guild that has flexible rules. The owner sets his pin, like a simpler password verification."

**Notes:** Schema stays 1:1 (member ↔ character). PIN assigned by the owner at registration; player receives it from the owner. Anti-hijack via unique Discord handle at DB level.

---

## Session & lockout behavior

### Q1: How long should a login last?

| Option | Description | Selected |
|--------|-------------|----------|
| 7-day JWT | Fits casual guild rhythm; leaks die in a week | ✓ |
| 30-day JWT | Max convenience; weaker on shared/lost phones | |
| Sliding renewal | 24h session silently renewed; more moving parts | |

**User's choice:** 7-day JWT

### Q2: How aggressive should the PIN lockout be?

| Option | Description | Selected |
|--------|-------------|----------|
| 5 attempts → 15 min | Kills brute force, forgiving for typos; counter resets on success | ✓ |
| 3 attempts → 1 hour | Stricter; fat-fingered members wait an hour | |
| Exponential backoff | 1→5→15→60 min per failure streak; slightly more logic | |

**User's choice:** 5 attempts → 15 min

### Q3: How should the panel behave when the 7-day session expires mid-use?

| Option | Description | Selected |
|--------|-------------|----------|
| Silent expiry + logout button | JWT auto-attached to requests; logout clears it; no banner | ✓ |
| Expiry warning banner | "Session expiring" prompt near end of 7 days | |
| You decide | Session UX open as long as persist + logout work | |

**User's choice:** Silent expiry + logout button

---

## OCR spike logistics

### Q1: Do you have the 10 real guild screenshots now?

| Option | Description | Selected |
|--------|-------------|----------|
| I have them / will provide | Real-data spike immediately; go/no-go meaningful | ✓ |
| Not yet — synthetic first | Harness ships with placeholders; go/no-go deferred | |
| You decide | Researcher/planner plan around it | |

**User's choice:** I have them / will provide

### Q2: How should the OCR spike run — what form does it take?

| Option | Description | Selected |
|--------|-------------|----------|
| Committed script | `scripts/ocr-spike.mjs`, per-field accuracy report, re-runnable | ✓ (after redirect) |
| One-off + report | Interactive run + markdown report; not re-runnable | |
| In-app test page | Dev page in app — flagged as Phase 5 scope | (initial pick) |
| Dev-only spike page reused in P5 | /dev/ocr page for spike + P5 calibration | |
| Script now, page in P5 | Script for P1 go/no-go; in-app page noted for P5 | ✓ (final) |

**User's choice:** Initially picked "In-app test page"; after scope redirect, agreed to "Script now, page in P5".

**Notes:** In-app OCR calibration page deferred to Phase 5 (complements OCRX-01 confidence surfacing).

### Q3: Where should the 10 real screenshots live during the spike?

| Option | Description | Selected |
|--------|-------------|----------|
| Local gitignored folder | Member data never enters git or Supabase Storage | ✓ |
| Private Supabase bucket | Cross-device but puts member data on free-tier backend | |
| You decide | Just never in git or public access | |

**User's choice:** Local gitignored folder

---

## Deployment target

### Q1: Where will the panel be hosted?

| Option | Description | Selected |
|--------|-------------|----------|
| Vercel | Static Vite build + free tier, preview deploys, zero-config fit | ✓ |
| Netlify | Same shape as Vercel | |
| Decide later | Scaffold locally with env-driven Supabase URL | |

**User's choice:** Vercel

### Q2: How should environments be handled?

| Option | Description | Selected |
|--------|-------------|----------|
| Single Supabase project | Dev + prod on one free-tier project; test members via SQL | ✓ |
| Two projects (dev + prod) | Cleaner isolation; double free-tier overhead | |
| You decide | As long as secrets stay in env vars | |

**User's choice:** Single Supabase project

### Q3: Package manager for the scaffolding?

| Option | Description | Selected |
|--------|-------------|----------|
| npm | Standard on Windows + Vercel, lockfile committed | ✓ |
| pnpm | Faster installs, strict lockfile, needs corepack | |
| You decide | — | |

**User's choice:** npm

---

## OpenCode's Discretion

None — all decisions were explicitly chosen by the user.

## Deferred Ideas

- **In-app OCR calibration/test page** — Phase 5 (dev-only route; complements OCRX-01 confidence-surfacing idea).
