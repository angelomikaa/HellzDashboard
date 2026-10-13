# Phase 1: Foundation — Secure Access & Data Model - Context

**Gathered:** 2026-10-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 delivers the project's security and data foundation on a greenfield repo:

1. **Project scaffolding** — React 19 + Vite + TypeScript + Tailwind CSS v4 + supabase-js client, npm, Vercel-ready env handling
2. **Supabase schema migrations** — `members`, `submissions`, `submission_stats`, `stat_catalog`, `class_key_stats` (EAV-style, append-only submissions)
3. **RLS policies on every table** + `verify-pin` Edge Function with custom-claim JWT + server-side PIN rate limiting
4. **OCR feasibility spike** — round-trip test on 10 real guild screenshots with a documented go/no-go decision (pivot threshold ~70% field accuracy)

**Requirements covered:** AUTH-01 (hashed per-player 4-digit PIN), AUTH-02 (whitelist-only access, blocked at the server).

**Not in this phase:** admin/registration UI (Phase 2), rank math (Phase 3), dashboards (Phase 4), OCR production feature (Phase 5), officer tools & promotion page (Phase 6). The `members`/role schema is designed now so Phase 2 registration and Phase 6 officer tools plug in without migrations.

</domain>

<decisions>
## Implementation Decisions

### Login Identity & Membership Model
- **D-01:** Login identifier is the **Discord handle (plain text) + 4-digit PIN**. No Discord API integration, no OAuth, no bot verification — auth lives entirely in Supabase. User explicitly rejected character-name and email as login IDs.
- **D-02:** **One Discord handle = one character.** Guild rules allow one character per person; multiboxed secondary characters must go to another guild with flexible rules. Schema stays 1:1 (`members` ↔ character) — do NOT model 1:N member→characters.
- **D-03:** **The owner assigns each member's PIN at registration** (like a simple password the owner controls): when a player subscribes, the owner registers them with Discord handle + in-game nickname and sets the PIN. The panel stores it hashed (bcrypt/PBKDF2); the player receives the PIN from the owner (e.g., Discord DM). There is no self-service signup or PIN-change screen.
- **D-04:** Anti-hijack is an identity property: registration binds the character to the Discord identity, so nobody can register a character under another person's handle. Enforce unique Discord handle at the DB level.
- **D-05:** **Phase 1 whitelist seeding via a versioned SQL seed script** (bcrypt-hashed PINs, role per member) run by the owner through the Supabase SQL editor — auditable in git, repeatable, no UI needed. Admin UI for member management is Phase 6.

### Session & Lockout
- **D-06:** **7-day custom-claim JWT** (claims: `{ member_id, role: member|officer|owner }`). Login persists across page reloads; silent expiry (no "session expiring" banner); a logout button clears the session.
- **D-07:** **PIN lockout: 5 wrong attempts → 15-minute lockout per handle**, attempt counter resets after a successful login. Chosen to kill brute force (10k combos becomes months) while staying forgiving for typos. Enforced server-side in the `verify-pin` Edge Function + DB-backed attempt tracking — never client-side.

### OCR Spike Logistics
- **D-08:** **Spike vehicle = committed Node script** (e.g. `scripts/ocr-spike.mjs`) that loads screenshots from a local folder, runs region-based Tesseract.js recognition, and prints a per-field accuracy report plus a go/no-go verdict against the ~70% field-accuracy threshold. Re-runnable whenever the game UI changes.
- **D-09:** **The user will provide the 10 real guild screenshots** (Portuguese locale, `1.234.567` thousand separators) — spike runs on real data immediately, no synthetic placeholders.
- **D-10:** **Real screenshots live in a local gitignored folder** (e.g. `.secrets/ocr-samples/`) — member data never enters git or Supabase Storage.

### Deployment & Tooling
- **D-11:** **Host on Vercel** (static Vite build, preview deploys). Supabase URL/anon key read from env vars (`VITE_*`), never committed to git.
- **D-12:** **Single Supabase project for dev and prod** (free tier) — two projects would double the pause/limits/seeds/migrations overhead. Test/dev members are seeded locally via SQL, not by experimenting on live data.
- **D-13:** **npm as package manager**, lockfile committed.

### OpenCode's Discretion
No explicit "you decide" areas — all decisions above were chosen by the user.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning docs (project-level)
- `.planning/PROJECT.md` — project context, stat structure (General/Quasi/Special), constraints, Key Decisions table
- `.planning/REQUIREMENTS.md` — AUTH-01, AUTH-02 are Phase 1's requirements; full v1/v2 requirement set and Out of Scope table
- `.planning/ROADMAP.md` — Phase 1 goal, success criteria, and planned plan breakdown (01-01…01-03)

### Research (phase-relevant, validated 2026-10-07)
- `.planning/research/STACK.md` — verified stack versions, Supabase free-tier limits, custom-claim JWT auth design (`verify-pin` + `auth.jwt()` RLS)
- `.planning/research/ARCHITECTURE.md` — thin SPA + RLS architecture, component boundaries (`PIN Gate / Session`, OCR pipeline isolation), anti-patterns to avoid
- `.planning/research/PITFALLS.md` — OCR accuracy collapse, PIN brute force, key-stat exposure, free-tier limits (pausing/HTTP 540)
- `.planning/research/SUMMARY.md` — decision summary, gaps to address (custom JWT wiring = day-one spike), confidence assessment

No external specs/ADRs exist — requirements and decisions are fully captured in the docs above and in this file.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **None — greenfield.** Repo currently contains only `.planning/` docs, `AGENTS.md`, and git history. Phase 1 creates all code from scratch.

### Established Patterns
- **None yet.** Research prescribes the patterns to adopt: thin SPA talking directly to Supabase, all security in RLS, OCR pipeline isolated under `features/submit/ocr/` (only `regions.ts`/`parse.ts` should ever need game-UI updates), rank math in Postgres RPCs (Phase 3).

### Integration Points
- **Everything is new.** Key integration points to create in Phase 1: Supabase client setup (env-driven), `verify-pin` Edge Function, schema migrations + RLS, Vercel deploy config, and the spike script's local (gitignored) screenshot folder.

</code_context>

<specifics>
## Specific Ideas

- **Discord handle is the identity key** — the user's own framing: "Discord is the key that will not allow a player to enter two or multiple characters under the same person, effectively stopping multiple nickname hijacking."
- **Owner-assigned PINs** — "the owner sets his pin, like a simpler password verification" — PIN assignment happens at subscription time, alongside the in-game nickname used for tracking.
- **One character per person** — multiboxed secondary characters must go to another guild with flexible rules; this is a guild rule the panel's data model encodes as 1:1.

</specifics>

<deferred>
## Deferred Ideas

- **In-app OCR calibration/test page** (dev-only route for testing OCR in the browser) — belongs in Phase 5, where it complements/extends the confidence-surfacing idea (OCRX-01). User initially picked this as the spike vehicle, then agreed to a committed script for Phase 1 with the page as a Phase 5 idea.

</deferred>

---

*Phase: 1-Foundation — Secure Access & Data Model*
*Context gathered: 2026-10-08*
