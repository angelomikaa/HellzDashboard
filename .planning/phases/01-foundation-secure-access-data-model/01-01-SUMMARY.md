---
phase: 01-foundation-secure-access-data-model
plan: 01
subsystem: database
tags: [supabase, postgres, rls, vite, react-19, tailwind-v4, bcrypt, pin-auth]

# Dependency graph
requires: []
provides:
  - "6-table append-only schema live in Supabase project thdxyxsjafimxgxpmpqs (members, stat_catalog, submissions, submission_stats, class_key_stats, pin_login_attempts)"
  - "RLS-enabled tables (deny-all) ready for 0002_rls.sql policies"
  - "Whitelist seed pattern: re-runnable upsert with bcrypt-hashed PINs (placeholder rows live)"
  - "Env-driven Supabase client (VITE_* only) + TanStack Query provider"
  - "PIN hash CLI helper (scripts/hash-pin.mjs)"
affects: [01-02, 01-03, 01-04, phase-2-registration, phase-3-rank-engine]

# Tech tracking
tech-stack:
  added: [react-19, vite, typescript-5.9, tailwindcss-v4 (@tailwindcss/vite), "@supabase/supabase-js", "@tanstack/react-query", bcryptjs, supabase-cli]
  patterns:
    - "Env-driven client: only VITE_* vars reach the bundle; server-only secrets never in .env.example"
    - "Versioned migrations (supabase/migrations) + re-runnable upsert seeds (supabase/seeds)"
    - "RLS enabled from day one: deny-all until explicit policies arrive (0002_rls.sql)"
    - "Append-only EAV: unique(submission_id, stat_key); no update/delete paths in schema"
    - "Remote deploys: supabase link + db push with SUPABASE_ACCESS_TOKEN; seeds via Management API Run Query (legacy /v1 endpoint)"

key-files:
  created:
    - supabase/migrations/0001_schema.sql
    - supabase/seeds/whitelist.sql
    - scripts/hash-pin.mjs
    - src/lib/supabase.ts
    - src/App.tsx
    - src/main.tsx
    - src/index.css
    - src/vite-env.d.ts
    - .env.example
  modified:
    - package.json
    - package-lock.json
    - vite.config.ts
    - index.html
    - .gitignore
    - supabase/config.toml

key-decisions:
  - "RLS enabled on all 6 tables inside 0001_schema.sql (not deferred to 0002) — tables are never publicly readable between plan executions"
  - "Seed placeholders approved by owner: example whitelist rows live with real bcrypt hashes of placeholder PIN (1234); real members deferred"
  - "Supabase Management API accessed via legacy /v1 endpoints (api-keys, database/query) — the /api/v1 paths serve an HTML API-reference page and silently 'succeed' with HTML"
  - "AUTH-01/AUTH-02 NOT marked complete in REQUIREMENTS.md — plan 01-01 delivers the data foundation only; enforcement ships in 01-02/01-03"

patterns-established:
  - "Env-driven Supabase client: createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)"
  - "Seed workflow: node scripts/hash-pin.mjs <pin> -> edit supabase/seeds/whitelist.sql -> apply via Management API Run Query"

requirements-completed: []  # AUTH-01/AUTH-02 complete in Plans 01-02/01-03 (RLS+verify-pin, login UI) — 01-01 is the data foundation only

# Metrics
duration: 19min (continuation session; tasks 1-2 in prior session same day)
completed: 2026-10-08
---

# Phase 1 Plan 1: Foundation Scaffold & Data Model Summary

**Vite React-19/Tailwind-v4 SPA scaffold plus a 6-table append-only Supabase schema (RLS-enabled from day one) with a bcrypt-hashed placeholder whitelist, pushed live to project `thdxyxsjafimxgxpmpqs`**

## Performance

- **Duration:** ~19 min continuation session (tasks 1–2 executed in a prior session the same day; task 3 paused on a human-action auth gate in between)
- **Started:** 2026-10-08T18:40:09Z (continuation session)
- **Completed:** 2026-10-08T18:58:42Z
- **Tasks:** 3 of 3
- **Files modified:** 15

## Accomplishments
- All 6 tables (members, stat_catalog, submissions, submission_stats, class_key_stats, pin_login_attempts) are live in the Supabase project with `discord_handle` unique and append-only EAV constraints
- Schema push automated end-to-end: `supabase link` + `supabase db push` using the owner-provided access token (env-var only, never committed)
- Whitelist seed applied and provably live: 3 placeholder rows (owner/officer/member handles) with bcrypt PIN hashes; re-runnable via upsert
- Verified server-side blocking before any policies exist: service-role GET → 200 with rows; anon GET → 200 with `[]` (RLS deny-all); no-auth GET → 401
- Scaffold builds green: `tsc --noEmit` and `vite build` both exit 0; secrets (`.env`, `.secrets/`) gitignored

## task Commits

Each task was committed atomically:

1. **task 1: Scaffold Vite React-TS app (Tailwind v4, supabase-js, env handling)** - `fa72eb7` (feat)
2. **task 2: 6-table schema migration + whitelist seed + PIN hash helper** - `d203949` (feat)
3. **task 3 (partial): supabase init config** - `1786c20` (chore)
4. **task 3: Apply schema + whitelist seed to live Supabase project** - `b584619` (feat)

**Plan metadata:** (final docs commit follows this summary)

## Files Created/Modified
- `supabase/migrations/0001_schema.sql` - 6-table schema, indexes, RLS enable on all tables
- `supabase/seeds/whitelist.sql` - re-runnable upsert seed with real bcrypt placeholder hashes
- `scripts/hash-pin.mjs` - bcrypt hash CLI helper for 4-digit PINs
- `supabase/config.toml` - supabase project config; seed path fixed to `./seeds/*.sql`
- `src/lib/supabase.ts` - env-driven Supabase client (throws on missing VITE_* vars)
- `src/main.tsx`, `src/App.tsx` - app entry with QueryClientProvider; minimal NeoFoot placeholder
- `src/index.css` - `@import "tailwindcss";` (Tailwind v4 CSS-first)
- `src/vite-env.d.ts` - ImportMetaEnv typing for VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
- `package.json`, `package-lock.json`, `vite.config.ts`, `index.html` - toolchain
- `.env.example` - VITE_* vars only; `.gitignore` - `.env`, `.secrets/`

## Decisions Made
- **RLS in 0001, not 0002**: without policies a table is deny-all once RLS is enabled, so enabling it in the initial migration means the seeded `members` rows (PIN hashes included) are never exposed to the anon key — even in the window before Plan 01-02 adds policies. Plan 01-02's own `enable row level security` statements are idempotent no-ops.
- **Placeholder seed (owner-approved)**: the user chose to seed the example rows to prove the pipeline live; all three placeholder rows use PIN `1234` and must be rotated before real members are invited (tracked in 01-USER-SETUP.md).
- **Legacy Management API endpoints**: `api.supabase.com/api/v1/...` serves an HTML Scalar API-reference page (even with Accept: application/json), which silently "succeeds" — the working endpoints are `api.supabase.com/v1/projects/{ref}/api-keys` and `/v1/projects/{ref}/database/query`. Reproducible seed path: `supabase db push` for migrations + Management API Run Query for `supabase/seeds/whitelist.sql`.
- **Requirements traceability**: AUTH-01/AUTH-02 intentionally left Pending in REQUIREMENTS.md — this plan is the data foundation; enforcement (verify-pin, RLS policies, login UI) ships in 01-02/01-03.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] RLS enabled on all 6 tables in 0001_schema.sql**
- **Found during:** task 3 (schema push)
- **Issue:** Plan deferred RLS to 0002_rls.sql, leaving a live window where the anon key could read every `members` row (PIN hashes included) — violates AGENTS.md "non-whitelisted access blocked at the server" and task 3's own acceptance criterion ("anon returns no rows")
- **Fix:** Added 6 `alter table ... enable row level security;` statements before pushing (migration not yet applied anywhere, so editing was safe)
- **Files modified:** supabase/migrations/0001_schema.sql
- **Verification:** anon GET /rest/v1/members returns 200 with `[]`; no-auth GET returns 401
- **Committed in:** b584619

**2. [Rule 3 - Blocking] config.toml seed path pointed to a non-existent file**
- **Found during:** task 3 (pre-push review)
- **Issue:** `[db.seed] sql_paths = ["./seed.sql"]` — file doesn't exist; local `supabase db reset` would fail/skip the whitelist seed
- **Fix:** Changed to `["./seeds/*.sql"]` (the documented glob pattern)
- **Files modified:** supabase/config.toml
- **Verification:** path now matches supabase/seeds/whitelist.sql
- **Committed in:** b584619

**3. [Owner decision, applied] Placeholder whitelist rows needed real bcrypt hashes**
- **Found during:** task 3 (seed application)
- **Issue:** The committed seed contained literal `<bcrypt hash from scripts/hash-pin.mjs>` placeholders — would fail the acceptance criterion (`pin_hash` starts with `$2`) and couldn't apply
- **Fix:** Generated real hashes via `node scripts/hash-pin.mjs 1234` and committed them with the placeholder rows (owner chose "seed placeholders"; real members deferred)
- **Files modified:** supabase/seeds/whitelist.sql
- **Verification:** live rows return `pin_hash_prefix: "$2b$"`
- **Committed in:** b584619

**4. [Process - Requirements] AUTH-01/AUTH-02 not marked complete**
- **Found during:** plan completion (state updates)
- **Issue:** Plan frontmatter lists `requirements: [AUTH-01, AUTH-02]`, but neither requirement is user-verifiable yet ("player can access the panel with their PIN" needs verify-pin + login UI from 01-02/01-03). The plan's own success criteria say "AUTH-01/AUTH-02 data foundation in place"
- **Fix:** Left both Pending in REQUIREMENTS.md; `requirements-completed: []` in this summary
- **Files modified:** none (REQUIREMENTS.md unchanged)

---

**Total deviations:** 4 (1 missing-critical, 1 blocking, 1 owner decision applied, 1 process/documentation)
**Impact on plan:** All fixes required for security and correctness. No scope creep.

## Authentication Gates
- **task 3 (prior session):** `supabase link`/`db push` needed credentials → checkpoint:human-action raised; the owner returned with `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF` and the seed decision. Credentials were used strictly as session environment variables — never written to any file, never committed, never echoed. **The pasted access token should be rotated/revoked now that the push is done** (owner action; see 01-USER-SETUP.md).

## Issues Encountered
- Supabase Management API `/api/v1/*` GET endpoints return an HTML Scalar API-reference page that Invoke-RestMethod/Node fetch parse as a "successful" response — the initial seed attempt silently did nothing and the first api-keys fetch returned an 883KB HTML string. Resolved by discovering the working legacy `/v1/*` endpoints and re-applying the seed (HTTP 201) with a Node-based client.
- PowerShell 5.1 `ConvertTo-Json` serializes long strings as `{"value": ...}` objects, which the Run Query endpoint rejected (`expected string, received object`) — resolved by doing the request in Node.
- `supabase gen keys` (experimental) returned JWT-shaped keys that PostgREST rejects ("Invalid API key"); valid keys came from `/v1/projects/{ref}/api-keys`.

## User Setup Required
**External services require manual configuration.** See [01-USER-SETUP.md](./01-USER-SETUP.md) for:
- Local `.env` values to copy from the Supabase dashboard (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
- Rotating the placeholder whitelist rows/PINs before inviting real members
- Verification commands for local dev and API reachability

## Next Phase Readiness
- Schema + placeholder whitelist live in `thdxyxsjafimxgxpmpqs`; migration history initialized (0001 applied via `db push`)
- RLS enabled deny-all on all tables — 01-02's `0002_rls.sql` policies can layer directly on top (its `enable row level security` statements become idempotent no-ops)
- `members` table contract (uuid pk, unique discord_handle, pin_hash, role check, active) matches the `<interfaces>` block 01-02/01-03 consume
- Blocker for 01-02: none technical; the owner should provide real member handles/PINs (or keep placeholders) before end-of-phase verification of the login flow

---
*Phase: 01-foundation-secure-access-data-model*
*Completed: 2026-10-08*

## Self-Check: PASSED

All 15 key files exist on disk; all 4 task commits (fa72eb7, d203949, 1786c20, b584619) present in git log; all task 3 acceptance criteria re-verified live against the Supabase project.
