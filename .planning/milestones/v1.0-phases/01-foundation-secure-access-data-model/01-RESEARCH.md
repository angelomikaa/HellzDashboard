# Phase 1 Research: Foundation — Secure Access & Data Model

**Researched:** 2026-10-08 (synthesized from project research validated 2026-10-07 + Phase 1 locked decisions)
**Confidence:** MEDIUM-HIGH overall. Stack versions HIGH. Custom JWT + PostgREST/RLS-claims wiring MEDIUM — day-one spike built into Plan 01-02.

## Sources (canonical)

- `.planning/research/STACK.md` — verified versions (React 19.3, Vite 8, Tailwind 4.3, supabase-js 2.x, Supabase free-tier limits), custom-claim JWT auth design, bcrypt/PBKDF2 guidance
- `.planning/research/ARCHITECTURE.md` — thin SPA + RLS architecture, PIN Gate/Session component boundary, anti-patterns
- `.planning/research/PITFALLS.md` — PIN brute force, RLS-less exposure, free-tier pausing/HTTP 540
- `.planning/phases/01-foundation-secure-access-data-model/01-CONTEXT.md` — D-01…D-13 locked decisions

## Auth Model Delta (research assumptions superseded by locked decisions)

Project research assumed a **shared panel PIN**; the user locked **per-player identity** (D-01):
- Login = **Discord handle (plain text) + personal 4-digit PIN** — no OAuth, no Discord API, no email.
- One Discord handle = one character (1:1) — do NOT model 1:N.
- Owner assigns PINs at registration; stored hashed (D-03). Unique Discord handle enforced at DB level (D-04).
- Whitelist seeded via versioned SQL script with bcrypt-hashed PINs run in the Supabase SQL editor (D-05).
- Session = **7-day custom-claim JWT** `{ sub: <member uuid>, role: "authenticated", member_id, member_role }` (D-06).
- Lockout = **5 wrong attempts → 15-minute lockout per handle**, counter resets on success, DB-backed, server-side only (D-07).

Because `role: "authenticated"` drives PostgREST role switching, RLS policies read member identity via `(auth.jwt()->>'member_id')::uuid` and elevation via `auth.jwt()->>'member_role'`. **The wiring (Edge Function mints HS256 JWT signed with `SUPABASE_JWT_SECRET` → PostgREST accepts → RLS reads claims) is the MEDIUM-confidence piece — Plan 01-02 verifies it end-to-end before anything builds on it.**

## Stack & Versions (from STACK.md, verified 2026-10-07)

| Tech | Version | Notes |
|------|---------|-------|
| React + Vite + TypeScript | 19.3 / 8 / latest | `npm create vite@latest -- --template react-ts`. If TS 7 tooling friction: pin `typescript@5.9`. |
| Tailwind CSS | 4.3 | CSS-first: `@import "tailwindcss"` + `@tailwindcss/vite`, no config file |
| supabase-js | 2.x | Free tier: 500 MB DB, 1 GB storage, 50k MAU, 500k Edge Function invocations |
| Supabase CLI | latest | `supabase init`, `supabase db push` (needs `SUPABASE_ACCESS_TOKEN` for non-TTY) |
| bcryptjs | latest | Pure-JS bcrypt — works in Node (seed hash helper) AND in Deno Edge Functions (npm imports) |
| jose | latest | JWT signing in Edge Functions (`npm:jose` import specifier) |
| tesseract.js | 7.0 | Node spike: direct Node usage, no worker bundling issues; `tessedit_char_whitelist: '0123456789.,%'`, `user_defined_dpi: '300'` |

## Architecture Patterns (from ARCHITECTURE.md)

- Thin SPA talks directly to Supabase; **route guards are UX only — real enforcement is RLS**.
- Edge Function `verify-pin`: bcrypt compare → rate limit → mint custom-claim JWT. Never store PIN plaintext or in the client bundle.
- RLS on **every** table. `class_key_stats` gets **deny-all** for members (no policy = no access) — RNK-02 foundation.
- Submissions **append-only**: SELECT+INSERT policies only for members (no UPDATE/DELETE policies). Officer update policies arrive in Phase 6.
- Anti-patterns to avoid: OCR in Edge Functions (2s CPU cap), one wide table per screenshot type (use EAV `submission_stats` keyed by `stat_key` against `stat_catalog`), storing screenshots in Storage during Phase 1 (decision deferred to Phase 2).

## Schema Design (Phase 1 deliverable)

Five tables from CONTEXT/ROADMAP plus one rate-limiting table required by D-07:

1. `members` — `id uuid pk`, `discord_handle text not null unique` (D-01/D-04), `display_name text not null` (in-game nickname), `pin_hash text not null` (D-03), `role text not null default 'member' check in ('member','officer','owner')`, `active boolean not null default true` (supports Phase 6 removal), `created_at timestamptz`. Class/function columns are set at Phase 2 registration — no 6th table now (D-02: 1:1).
2. `stat_catalog` — `stat_key text pk`, `label text not null`, `group_name text not null check in ('general','quasi','special')`, `value_type text not null check in ('flat','percentual')`. Readable by all authenticated; writes via service role only.
3. `submissions` — `id uuid pk`, `member_id uuid not null references members(id)`, `status text not null default 'pending' check in ('pending','validated','rejected')`, `submitted_at timestamptz not null default now()`. Append-only.
4. `submission_stats` — `id bigserial pk`, `submission_id uuid not null references submissions(id) on delete cascade`, `stat_key text not null references stat_catalog(stat_key)`, `value numeric not null`, `unique (submission_id, stat_key)`. Append-only (EAV).
5. `class_key_stats` — `class_name text not null`, `stat_key text not null references stat_catalog(stat_key)`, `pk (class_name, stat_key)`. Empty until Phase 2/3; deny-all for members.
6. `pin_login_attempts` — `discord_handle text pk`, `failed_count int not null default 0`, `locked_until timestamptz`, `updated_at timestamptz not null default now()`. Written only by the `verify-pin` Edge Function (service role); no client policies.

## Common Pitfalls (Phase 1-specific)

- **PIN brute force**: 10k combos — without server-side lockout trivially scriptable. D-07 kills it (5→15 min per handle).
- **RLS-less tables + exposed anon key**: anon key ships in the client bundle; without RLS anyone reads/writes all guild data. Every table gets RLS enabled + policies.
- **`role` claim misuse**: JWT `role` must be `"authenticated"` for RLS `authenticated` policies; elevation rides a custom `member_role` claim checked inside policies/RPCs.
- **Supabase CLI auth**: `supabase db push` / `functions deploy` need `SUPABASE_ACCESS_TOKEN` (non-TTY) or the owner pastes SQL via the Supabase SQL editor (D-05/D-12 workflow).
- **Free-tier pausing**: project may pause after 1 week inactivity (HTTP 540) — handle gracefully in the SPA's error state (documented; full ops in Phase 6).
- **Screenshots never enter git or Supabase Storage in Phase 1** — local gitignored `.secrets/ocr-samples/` only (D-10).

## Validation Architecture

**Feedback goal:** every plan's tasks are verifiable in <60s without waiting on external services except where genuinely required (live Supabase auth wiring, real-screenshot OCR run).

- **Framework:** Vitest (ships with Vite template; zero extra config for component/logic tests) + `tsc --noEmit` typecheck + `vite build` for bundling verification.
- **Quick run command:** `npx vitest run` (~5–15s).
- **Full suite command:** `npx vitest run && npx tsc --noEmit && npx vite build` (~30–60s).
- **Pure logic (unit-testable before UI):** percentile-free Phase 1 has: JWT claims shaping (pure function building the payload), lockout decision function (5 attempts → lockout window math), OCR spike accuracy computation (per-field accuracy + go/no-go verdict vs 70% threshold).
- **Live-service verification (automated via CLI):** migration apply (`supabase db push`), Edge Function smoke test (`curl` verify-pin → JWT; JWT → PostgREST select of own row; anon → 401/empty). These require `SUPABASE_ACCESS_TOKEN` + project env vars — declared in `user_setup`.
- **Manual-only verifications:** login flow in a real browser (session persists across reload, logout clears) — Plan 01-03 checkpoint:human-verify; OCR spike on real screenshots (user provides files) — Plan 01-04 checkpoint:human-action.
- **Wave 0 requirements:** none — Vitest installs with the scaffold (Plan 01-01 task 1); lockout + accuracy logic unit tests are created inside their consuming plans.

---
*Phase: 01-foundation-secure-access-data-model*
*Researched: 2026-10-08*
