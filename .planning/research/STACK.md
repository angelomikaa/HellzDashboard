# Stack Research — v1.1 Home, Whitelist & Fine Ranks

**Domain:** Additive features on a LIVE single-guild stats panel (Supabase free tier + React 19 SPA)
**Project:** Hellz / NeoFoot — Ragnarok Origin guild stats panel
**Researched:** 2026-10-13 (v1.1 milestone definition)
**Overall confidence:** HIGH — every recommendation is an extension of a pattern already proven live in v1.0; versions verified against the npm registry (2026-10-13); Edge Function patterns verified against current official Supabase docs via Context7.

**Scope note:** The v1.0 stack (React 19 + Vite 8 + Tailwind v4 + TypeScript, Supabase free tier, Tesseract.js, custom-claim JWTs, SECURITY DEFINER RPCs, vitest, Node .mjs smoke scripts) is validated and NOT re-researched. This file covers only what the four NEW v1.1 features need.

## Headline Finding

**ZERO new runtime dependencies.** All four v1.1 features are SQL migrations + one new Edge Function (reusing the exact imports and secrets of `verify-pin`) + React components in the established patterns. The right stack decision for this milestone is disciplined reuse — every new npm package would add surface area without solving anything the existing platform can't already do.

## Recommended Stack (per feature)

### 1. Whitelist lifecycle + first-login PIN setup

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| SQL migration 0012 (`members.pin_hash` → nullable + `add_member` RPC) | Postgres 17 (live project) | Handle-only registration by staff | `pin_hash` is currently `NOT NULL` (0001_schema.sql:5) — the schema change is mandatory. `add_member` follows the 0011 SECURITY DEFINER RPC pattern (`set_member_role`/`set_member_active`): officer/owner gate inside the function, role forced to `'member'`, unique-handle violation surfaces naturally. No direct INSERT policy on `members` is added — the RPC stays the narrow write surface | HIGH |
| New Edge Function `setup-pin` | Deno 2 (current Edge Runtime; `deno_version = 2` in config.toml) | Player picks own 4-digit PIN on first login; mints the session | Verified against current official docs: `Deno.serve` + `Deno.env.get` + pinned `npm:` specifier imports remain the standard Edge Function pattern (official examples still use exactly this, e.g. `npm:@upstash/redis@^1`). Reuses `npm:bcryptjs@3`, `npm:jose@4`, `npm:@supabase/supabase-js@2` — identical pins to `verify-pin` | HIGH |
| `verify-pin` modification (branch before bcrypt) | existing function | Route pinless members to setup | **Discovered integration constraint:** `bcryptjs.compareSync(pin, null)` throws on a null hash — today's `verify-pin` would 500 on a pinless member. The function must branch on `pin_hash is null` BEFORE the compare and return a distinct `pin_setup_required` response. This also preserves the WR-01 timing-equalization pattern (dummy compare on the pinless path too) | HIGH |
| Existing lockout machinery (`pin_login_attempts` + `_shared/lockout.ts` + `record_pin_failure` RPC) | existing | Rate-limit PIN-setup attempts | PIN setup is a brute-forceable surface (same 10k keyspace as login). Reuse the proven per-handle counter — do NOT build a second rate-limit mechanism | HIGH |
| Existing JWT minting (HS256, `NEFOOT_JWT_SECRET` + `NEFOOT_JWT_KEY_ID` kid) | existing | Session for freshly-PINned member | `setup-pin` mints the SAME 7-day custom-claim JWT (`role: 'authenticated'`, `member_id`, `member_role`) with the same `SignJWT` code — the player lands in the panel directly, no second login. No new secrets: project-level function secrets are visible to all functions. PostgREST verifies HS256 identically regardless of jose version | HIGH |
| Atomic conditional write (in `setup-pin`) | SQL pattern | Prevent double-set race | `update members set pin_hash = <bcrypt> where discord_handle = <h> and pin_hash is null` with a returned-row count — if 0 rows, another request claimed the PIN first → `already_set` error. This is the same "trust only the returned count" discipline as CR-01 | HIGH |

**Auth-flow shape (recommended):** `verify-pin` returns `{ pin_setup_required: true }` for an ACTIVE member with null `pin_hash` → client swaps the login form to a choose-your-PIN mode (enter twice) → `POST /functions/v1/setup-pin { discord_handle, pin }` → on success returns the standard `{ session }` shape → existing `session.ts` stores it unchanged.

**Accepted design constraint (flag for PITFALLS, not solvable by stack):** between officer add and player claim, handle knowledge alone identifies the member — anyone who learns a freshly added handle can squat its PIN. The whitelist model already trusts handle+PIN knowledge; the mitigation is operational (officer notifies the player immediately, small claim window), and once claimed, uniform 401s return. The `pin_setup_required` response also reveals that a handle exists-and-is-unclaimed — an accepted, narrower enumeration leak than the v1.0 uniform-401 rule, unavoidable if the player must learn they need to set a PIN.

### 2. Personalized home (new landing tab)

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Existing React 19 + Tailwind v4 + tab-state navigation | 19.2.8 / 4.3.3 (both current: react latest 19.3.0, tailwind exact-latest 4.3.3) | New `inicio` tab as landing view | App.tsx already routes via a `Tab` union type + `useState` — add `'inicio'` to the union, change the default from `'painel'`, done. NO router library is needed or justified for one more conditional tab | HIGH |
| `my_report` RPC extension (add `last_validated_at`) | SQL migration | Stale-data CTA input | The stale check needs "days since last validated submission" — `select max(submitted_at) from submissions where member_id = caller and status = 'validated'` folded into the existing member contract. Pure SQL; the RPC is already the single member read surface (RNK-02 closed-payload discipline continues) | HIGH |
| Native `Date` + `Intl.NumberFormat('pt-BR')` | browser built-ins | Stale threshold + value formatting | The stale CTA is ONE comparison (`now - last_validated_at > 7 days`) on ISO timestamptz strings the RPC already returns. Do NOT add date-fns/dayjs for this. `Intl.NumberFormat` is the established formatting path — zero bundle cost | HIGH |
| Existing raw-fetch data layer (`api.ts` `restFetch`) + TanStack Query patterns | 5.104.x (current 5.104.2) | Fetch own report | One new `fetchMyReport`-shaped call (or the extended existing one). api.ts deliberately avoids supabase-js for data (foreign-JWT session); new fields are additive to `MyReport`, rendered verbatim | HIGH |

**No new rendering capability is needed.** The home tab composes the ALREADY-LIVE pieces: OvrHero (member-visible since Phase 4), StatCard, tier bands from `presentation.ts` — plus a best-stats strip (top-N by the new points) and the stale CTA banner. Destaques keeps its guild-wide get_promotion payload untouched.

### 3. Value-proportional 99 scale

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Pure Postgres numeric arithmetic | built-ins (`round`, `nullif`, `greatest`, `ln`/`power` if curved) | points = value relative to best | **Verified: no library needed or warranted.** The scale is `points = round(own_value / nullif(max_v, 0) * 99, 2)` — leader(s at max) hold 99, everyone below scales by real value distance (the 98/97/96/95 top-end cuts emerge naturally). Division-by-zero guarded via `nullif`; `numeric` (not double) keeps the exact-decimal discipline the smoke matrix relies on. If the owner later wants a compressed top-end curve, `ln()`/`power()` are Postgres built-ins — still no dep | HIGH |
| Migration updating `my_report` v4, `class_top5`, `get_promotion` | SQL migration | Single rank-math definition | The rank formula lives in three RPCs (0009 + 0011) and must change in ONE migration so all consumers stay consistent — the compute-on-read design means no backfill, no triggers, nothing else to touch | HIGH |
| `src/lib/rankMath.ts` + vitest re-baseline | existing (vitest 5.0.3, current 5.0.4) | Executable spec mirror | The TS spec module and its locked test values (74.25, 49.5, 99…) change to the new formula; SQL must agree to the decimal (proven via `smoke-rank.mjs`). Also re-baseline: `smoke-promotion.mjs` (top-6-by-points ordering can shift) and tier bands D-01/D-02 in `presentation.ts` — which is exactly what the dummy seed (feature 4) calibrates | HIGH |
| OVR formula | unchanged | Inherit the finer scale | `OVR = 51 + mean(6 key-stat points) * 48/99` is points-agnostic — finer points automatically produce finer OVR. Floor-51 and all-6-or-nothing semantics carry over untouched | HIGH |

### 4. Dummy-data seed workflow (reversible)

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Seed + purge SQL files, applied via existing `apply-seed.mjs` | existing script (Management API Run Query, proven live 01-01) | Reversible ~5-players-per-class calibration cohort | `apply-seed.mjs` takes ANY SQL file — seed (multi-statement upserts: members + `status='validated'` submissions + submission_stats) and purge both go through it. Service-level SQL bypasses RLS exactly like every existing seed. No new script, no new dep, no runner | HIGH |
| Sentinel handle prefix (e.g. `dummy-`) for seed rows | convention | Reversibility key | Purge = `where discord_handle like 'dummy-%'`. Zero migration, greppable, and the `add_member` RPC can reject real registrations matching the sentinel. (Alternative: a `seeded boolean` marker column in migration 0012 — more robust, but prefix + RPC rejection is simpler; decide in phase planning) | MEDIUM (design choice, both work) |
| Ordered deletes in the purge file | SQL, verified against 0001_schema.sql | FK-safe cleanup | **Discovered constraint:** `submission_stats → submissions` is `on delete cascade`, but `submissions → members` has NO cascade (default NO ACTION). The purge MUST delete submissions before members (deleting submissions cascades their stats; then members delete cleanly). Get the order wrong and the purge fails on FK violations | HIGH |
| Existing `hash-pin.mjs` | existing | bcrypt hashes for seed members | Seed members are ordinary members (they log in during calibration); the proven hash generator covers them | HIGH |
| `supabase/seeds/dummy/` subfolder (NOT `supabase/seeds/`) | placement detail | Keep dummy data opt-in | **Discovered pitfall:** config.toml sets `db.seed sql_paths = ["./seeds/*.sql"]` — a flat glob that auto-applies every direct child of `seeds/` on each local `db reset`. Placing the dummy seed at `seeds/dummy-players.sql` would silently auto-seed every local reset. A `dummy/` subfolder is outside the non-recursive glob (verify with one local `db reset` during implementation) and stays a deliberate `node scripts/apply-seed.mjs supabase/seeds/dummy/seed.sql` action | MEDIUM (glob non-recursion is standard behavior, trivially verified) |

## What NOT to Add (explicit non-recommendations)

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Any new npm package at all | Every v1.1 need is met by SQL + the existing Edge Function imports + React patterns already in the repo. New deps add bundle, audit, and upgrade surface for zero capability gain | The tables above — exclusively existing tech |
| `jose@6` (current major, 6.2.12) in the new function | `verify-pin` pins `npm:jose@4` (resolves ≤4.15.9) and is proven live; the two functions must mint token-for-token identical sessions. Mixing majors gains nothing (the SignJWT HS256 API is unchanged) and risks subtle behavioral drift | Pin `npm:jose@4` in `setup-pin` to match; revisit a joint major bump only as dedicated tech debt |
| A router library (react-router etc.) for the new landing tab | App.tsx's `Tab` union + conditional render is the established, tested pattern (6 tabs already); a router would rewrite navigation mid-milestone for one additional tab | Add `'inicio'` to the union, change the default tab |
| date-fns / dayjs | The stale CTA is one `Date` comparison against an ISO timestamptz; there is no timezone arithmetic, no formatting edge the native APIs don't cover | Native `Date` + `Intl` |
| supabase-js in the client data layer | api.ts deliberately uses raw fetch because the session is a foreign (verify-pin) JWT — supabase-js session handling would fight it (documented plan-02-01 decision) | Extend `restFetch` with the new RPC/response fields |
| A faker library for dummy data | The seed's whole purpose is REALISTIC cohort shapes to calibrate displays; faker emits plausible-but-wrong distributions and adds a dev dep. Hand-authored SQL (~5 rows per class) gives full control of spread and outliers | Hand-authored seed SQL with owner-reviewed values |
| Seeding via Supabase Auth / local `db reset` for the LIVE project | Live-project writes are Management-API-only in this repo (01-01 proven; the /api/v1/* HTML-page trap is documented in apply-seed.mjs); `db reset` touches only local | `apply-seed.mjs` for both seed and purge |
| A second rate-limit mechanism for PIN setup | Duplicates the proven lockout (5 attempts / 15 min, DB-backed, atomic) with a new, unproven one | Reuse `pin_login_attempts` + `record_pin_failure` + `_shared/lockout.ts` |
| Client-side points recomputation for the new scale | Would duplicate the SQL math and violate the AGENTS.md non-negotiable (all rank math in Postgres) — and risks leaking key-stat reasoning | Compute-on-read in the RPCs, as today |

## Installation

```bash
# NOTHING. No new dependencies, no new dev dependencies.
# Verify existing pins resolve to current (they do, checked 2026-10-13):
#   react ^19.2.8        -> 19.3.0 available in range ✓
#   vite ^8.3.0          -> 8.3.4 ✓
#   tailwindcss 4.3.3    -> exact latest ✓
#   @supabase/supabase-js ^2.117.3 -> exact latest ✓
#   @tanstack/react-query ^5.104.1 -> 5.104.2 ✓
#   vitest ^5.0.3        -> 5.0.4 ✓
#   bcryptjs 3.0.3       -> exact latest ✓ (Edge Function pin npm:bcryptjs@3 matches)

# The only "install-class" actions in v1.1 are deployments:
supabase functions deploy setup-pin   # after writing supabase/functions/setup-pin/
# migrations 0012+ applied via the established live-migration path
```

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `npm:jose@4` (Edge Functions) | `npm:jose@4` (both functions) | HS256 + kid header is version-agnostic to PostgREST verification, but keep both functions on the same major for behavioral parity. jose current major is 6.2.12 — deliberately not adopted |
| `npm:bcryptjs@3` (Edge Functions) | bcryptjs 3.0.3 (devDep, `hash-pin.mjs`) | Same major on both sides of the hash — hashes produced by `hash-pin.mjs` verify inside `setup-pin`/`verify-pin`. **Note:** `compareSync` throws on a null hash — the pinless-member branch must come first |
| Migration 0012 (nullable `pin_hash`) | `verify-pin`, `fetchMe` projections, RLS (0002/0004/0005), column grants | `fetchMe`/`fetchMembers` never select `pin_hash` (explicit projections) and column grants don't include it — a nullable pin_hash changes nothing for any existing reader. Only `verify-pin` touches the column |
| Value-proportional migration | `smoke-rank.mjs`, `smoke-promotion.mjs`, `rankMath.test.ts`, tier bands D-01/D-02 | The locked contract values (74.25, 49.5…) and possibly tier band edges CHANGE — all baselines must be re-locked in the same phase, or the smoke matrices go red by design |
| Dummy seed SQL | `config.toml` `[db.seed] sql_paths` | Keep dummy files OUT of `supabase/seeds/` direct children (auto-applied on local `db reset`); a subfolder stays opt-in |
| React 19.2.8 / Vite 8.3 / Tailwind 4.3.3 / TS ~6.0.2 | unchanged from v1.0 | TypeScript npm latest is 7.0.2; the project deliberately pins the 6.x line (v1.0 decision) — no reason to touch it mid-milestone. oxlint ^1.81 → 1.87 available in caret range; irrelevant churn |

## Sources

- npm registry (`npm view <pkg> version`, 2026-10-13) — react 19.3.0, vite 8.3.4, tailwindcss 4.3.3, @supabase/supabase-js 2.117.3, @tanstack/react-query 5.104.2, tesseract.js 7.0.0, vitest 5.0.4, oxlint 1.87.0, bcryptjs 3.0.3, jose 6.2.12 (latest) / 4.15.9 (v4 line), @vitejs/plugin-react 6.1.2 — **HIGH**
- Context7 `/supabase/supabase` (official docs/examples) — Edge Functions still standard on `Deno.serve` + `Deno.env.get` + pinned `npm:` imports; `supabase functions deploy` + project-level secrets; per-function secrets via dashboard — **HIGH**
- Local codebase (authoritative for integration points): `verify-pin/index.ts` (jose@4 SignJWT + kid, DUMMY_HASH timing pattern, lockout flow), `0001_schema.sql` (pin_hash NOT NULL; FK cascade asymmetry), `0009_rank_engine.sql`/`0011` (rank formula in 3 RPCs), `config.toml` (`db.seed` glob, `deno_version = 2`), `apply-seed.mjs`/`hash-pin.mjs` (seed tooling), `App.tsx` (Tab union), `api.ts` (raw-fetch contract), `session.ts` (localStorage session shape) — **HIGH**
- Project validated-capability list (milestone context) — Supabase free tier, Management API smoke scripts, bcrypt PIN hashing, custom-claim JWTs, SECURITY DEFINER RPCs: treated as ground truth, not re-researched — **HIGH**
- `db.seed` glob non-recursion (subfolder exclusion) — standard glob semantics, not independently doc-verified — **MEDIUM**, trivially verified with one local `supabase db reset` during implementation

---
*Stack research for: NeoFoot v1.1 — Home, Whitelist & Fine Ranks*
*Researched: 2026-10-13*
