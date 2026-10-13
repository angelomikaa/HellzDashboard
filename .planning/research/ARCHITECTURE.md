# Architecture Research — v1.1 Home, Whitelist & Fine Ranks

**Domain:** Additive features on a LIVE single-guild stats panel (Supabase free tier: Postgres/RLS/Edge Functions + React 19 SPA)
**Project:** Hellz / NeoFoot — Ragnarok Origin guild stats panel
**Researched:** 2026-10-13
**Overall confidence:** HIGH — every recommendation slots into a pattern already proven live in v1.0 (11 migrations, 5 smoke matrices, owner DevTools leak proofs); all integration points verified directly against the shipped codebase.

**Scope note:** The v1.0 architecture is SHIPPED and PROVEN — thin React 19 SPA → PostgREST (RLS on every table) + SECURITY DEFINER RPCs + verify-pin-minted custom-claim HS256 JWTs, compute-on-read rank engine, append-only submissions, aggregates-only member surface. This file researches ONLY how the four additive v1.1 features slot into that live system without disturbing it. Stack choices are already settled in `STACK.md` (authoritative) — this file aligns with it and does not re-derive them.

## Headline Finding

**All four features are additive extensions of existing seams — zero structural change to the v1.0 architecture.** Whitelist = one schema relaxation + one RPC following the 0011 pattern. PIN setup = one branch in verify-pin + one sibling Edge Function copying it. Home = one new tab in the existing `Tab` union + one additive field on the closed `my_report` payload. Fine ranks = one formula swap inside the same three RPCs, one migration. The only genuinely new architectural surface is `setup-pin`, and it is deliberately a near-verbatim clone of `verify-pin`.

---

## 1. Whitelist Lifecycle — `add_member` RPC + nullable `pin_hash`

### Where it lives

| Piece | Location | Change |
|-------|----------|--------|
| Schema | `supabase/migrations/0012_*.sql` | `alter table members alter column pin_hash drop not null;` — the ONLY schema change in the milestone (`0001_schema.sql:6` is the sole `NOT NULL` touching this flow) |
| Registration write | New `add_member(p_discord_handle, p_display_name)` SECURITY DEFINER RPC in 0012 | The ONLY write path — no direct INSERT policy is added |
| Removal | `set_member_active` (0011) | **Unchanged** — role-differentiated deactivation/reactivation stays exactly as shipped |

### Why an RPC, not an RLS INSERT policy

The current write surface on `members` is deliberately zero for every client credential: 0005 revokes `insert` on `members` from `anon, authenticated` (column-level security), and 0002's comment states the v1.0 position — "registration = owner via service role / seed." v1.1 changes WHO may register (officers + owner, from the UI) without changing HOW (a privileged server-side write):

- The RPC follows the 0011 pattern verbatim: **staff gate INSIDE the function** (`member_role in ('officer','owner')` AND live `active` row — the 0009:62-68 gate copied into every 0011 RPC), `security definer set search_path = public`.
- `role` is **forced to `'member'` inside the function** — never a parameter. This preserves the D-08 invariant structurally: no caller input can mint an officer/owner row, and the owner remains seeded-only (0011 `set_member_role` never grants 'owner'; `add_member` never creates one).
- `pin_hash` is simply **omitted from the INSERT** → NULL → the member is "unclaimed" until first-login setup.
- The unique-handle constraint (`0001:4`) surfaces a duplicate registration naturally (Postgres 23505) — no pre-check race; the constraint is the arbiter.
- Handle hygiene carries over: trim + the `members_discord_handle_len` ≤64 constraint (0003:44-45) already protect the column; the RPC should trim to match verify-pin's WR-04 discipline.
- **Re-adding a previously removed handle:** recommend `add_member` deliberately does NOT upsert — a removed member is reactivated via the existing `set_member_active(p_active => true)` flow, which already carries the role-differentiated target rules. `add_member` = new rows only; reactivation = existing RPC. Two verbs, two intents, no overlapping write semantics.
- EXECUTE hygiene (WR-02 lesson, 0011:690-700): `revoke execute ... from public, anon; grant execute ... to authenticated;`.
- Optional (STACK.md): reject `dummy-%` handles inside the RPC so the seed sentinel can never collide with a real registration.

### RLS implications

**None.** No new policy on `members` in any direction. This is the same discipline as `officer_queue` (0011:118): "No staff SELECT policy exists — this RPC is the only officer read surface." `add_member` becomes the only officer WRITE surface on `members`; the 42P17 recursion minefield (0007→0008 lesson) is never entered because no new policy subqueries `members`.

---

## 2. First-Login PIN Setup — verify-pin branch + `setup-pin` clone

### The discovered constraint driving the design

`bcryptjs.compareSync(pin, null)` **throws** — today's `verify-pin` (`index.ts:148`) would 500 on a pinless member the moment 0012 lands and `add_member` is used. The branch on `pin_hash is null` must come BEFORE the compare (line 148), and the pinless path must still run a dummy compare (WR-01 timing-equalization pattern, `index.ts:27,144`) so latency stays uniform.

### Data flow — the new auth flow

```
Officer UI ── POST /rpc/add_member {p_discord_handle, p_display_name}
                    │  SECURITY DEFINER: staff gate + role forced 'member'
                    ▼
        members row (active=true, pin_hash=NULL)     [officer notifies player off-band]
                    │
                    ▼
Player submits handle + 4 digits ── POST /functions/v1/verify-pin
                    │  lockout gate (pin_login_attempts, _shared/lockout.ts)
                    │  → member lookup → active check
                    │  → pin_hash IS NULL branch (BEFORE compareSync)
                    ▼
        200 { pin_setup_required: true }        [does NOT record a failure;
                │                                clears counter like a success —
                │                                identification succeeded]
                ▼
LoginPage swaps to PIN-setup mode (enter twice, client equality check)
                │
                ▼
POST /functions/v1/setup-pin {discord_handle, pin}
        │  same env secrets (SUPABASE_URL, SERVICE_ROLE_KEY,
        │  NEFOOT_JWT_SECRET, NEFOOT_JWT_KEY_ID) — no new secrets
        │  1. lockout gate — SAME pin_login_attempts counter (reuse, not a
        │     second rate-limit mechanism)
        │  2. member lookup: missing / inactive / pin_hash NOT null
        │     → dummy compare (timing) → record_pin_failure → uniform 401
        │  3. bcrypt.hashSync(pin)
        │  4. ATOMIC conditional write (service-role admin client):
        │       update members set pin_hash = <hash>
        │       where discord_handle = <h> and pin_hash is null
        │     → trust the RETURNED row count only (CR-01 discipline);
        │     0 rows ⇒ another request claimed first ⇒ 401 (never overwrite)
        │  5. resetState() upsert on pin_login_attempts
        │  6. mint the SAME 7-day HS256 JWT — identical SignJWT block:
        │     { role:'authenticated', member_id, member_role },
        │     kid header, SESSION_SECONDS = 7d, npm:jose@4
        ▼
200 { session } ── saveSession() ── App.tsx lands on 'inicio'
```

### Architectural rules for `setup-pin`

- **Clone, don't reinvent:** same imports pinned exactly as verify-pin (`npm:bcryptjs@3`, `npm:jose@4`, `npm:@supabase/supabase-js@2`), same CORS headers, same `^\d{4}$` + handle validation, same WR-05 env-secret fail-fast, same WR-03 "infra errors are never user failures" pattern.
- **The write goes through the service-role admin client** — never through PostgREST as the user (pin_hash is ungranted at column level, 0005; that must stay true). No new grants, no new policy.
- **One-way claim:** the `pin_hash is null` predicate in the WHERE clause makes PIN-set idempotent-safe and race-proof without a lock or advisory latch — a second setup attempt finds 0 rows. Once claimed, the member is indistinguishable from any v1.0 member at the auth layer.
- **JWT shape identical to verify-pin's** — session.ts's `NeoFootSession` and every RLS policy consume the same claims unchanged. The only safe cosmetic difference: `setIssuer('nefoot-setup-pin')` for auditability (nothing validates issuer; PostgREST verifies signature + kid only).
- **Accepted leak (mirrors STACK.md):** `pin_setup_required` reveals exists-and-unclaimed — narrower than v1.0's uniform-401 rule, unavoidable if the player must learn they need to set a PIN. Mitigations stay operational (immediate officer notification, small claim window) + mechanical (lockout on setup attempts, uniform 401 after claim).

---

## 3. Personalized Home — `'inicio'` tab + `my_report` extension

### Where it lives

| Piece | Location | Change |
|-------|----------|--------|
| Tab | `src/App.tsx:20` | Add `'inicio'` to the `Tab` union; change `useState<Tab>('painel')` default to `'inicio'` — no router, no new navigation machinery (6 tabs already prove the pattern) |
| Data | `my_report` RPC | One additive field: `last_validated_at` = `max(submitted_at) filter (status='validated')` over the caller's OWN submissions — computed inside the SECURITY DEFINER body, no new table read surface, no new RPC |
| Client | `src/lib/api.ts` | Extend the `MyReport` interface + `fetchMyReport` (restFetch raw-fetch layer, NOT supabase-js — unchanged decision) with the new field |
| View | new `src/features/home/` | Composes ALREADY-LIVE pieces: OvrHero, StatCard, tier bands from `presentation.ts`, plus a best-stats strip (top-N own stats by the new points) and the stale CTA banner |

### Stale-CTA decision logic — client display only

The RPC returns the raw `last_validated_at` timestamptz (null when no validated submission ever); the `> 7 days` comparison and the CTA banner are **pure presentation in React** (`now - last_validated_at > 7d`, native `Date`). This is architecturally correct because the stale check is a nudge, not enforcement — there is nothing to protect server-side: the timestamp is the caller's own data. Consequence: threshold changes are client-only deploys, and the RPC contract stays stable.

### Security check — no new member-facing leak surface

Audited against the RNK-02/CMP-03 invariants:

- `my_report` remains a **closed payload**: the addition is ONE scalar timestamp of the caller's own lifecycle. No key-stat identity (`is_key`, key lists), no other individuals' values — the cohort CTE structure is untouched, only the output `jsonb_build_object` gains a field.
- The best-stats strip renders fields the payload **already returns** (`own_value`, `points`) — sorted client-side, zero new serialization.
- `last_validated_at` derives from `submissions` rows the caller can already read via `member_select_own_submissions` (0002:16) — no information elevation whatsoever.
- Destaques (`get_promotion`) is untouched by this feature; it keeps its guild-wide closed payload.

---

## 4. Value-Proportional 99 Scale — one formula, three RPCs, one migration

### Where the formula changes

The rank formula (`(below + (ties-1)/2) / (n-1) * 99`, average-rank ties) exists in **five places across three RPCs**, and ALL must change in ONE migration so every consumer stays consistent (compute-on-read means nothing else needs touching — no backfill, no triggers):

| Location | Current | Becomes |
|----------|---------|---------|
| `my_report` stats block (0011:517-526) | percentile points per stat | value-proportional: `round(own_value / nullif(max_v, 0) * 99, 2)` |
| `my_report` OVR lateral (0011:546-554) | percentile points per key stat | same formula (unrounded, per 03-01 spec semantics) |
| `class_top5` OVR lateral (0011:646-649) | percentile points | same formula — **`cmp` CTE must gain `max(b.value) as max_v`** (it currently computes only n/below/ties) |
| `get_promotion` OVR lateral (0011:356-359) | percentile points | same formula + same `cmp` addition |
| `get_promotion` highlights (0011:399-403) | points per stat for top-6 selection | same formula — the **RNK-02 anti-leak property survives**: the formula is still IDENTICAL for all 57 stats, so top-6-by-points selection still cannot correlate with the key set |

Formula properties (all verified against the live schema): `agg` in `my_report` already computes `max_v` (0011:497); `nullif` guards division-by-zero; `numeric` arithmetic preserves the exact-decimal discipline the smoke matrix locks; equal values get equal points automatically (the tie machinery dissolves — keep `n` for the unchanged D-12 `n>=3` gate); `own_value > max_v` is impossible (max includes own). Edge to decide in phase planning: `max_v = 0` (all cohort values zero, values are non-negative in-game) — recommend an explicit `case` returning 99 when `own_value = max_v`, never NULL.

### OVR inheritance — zero formula change

`OVR = 51 + mean(6 key-stat points) * 48.0/99` (0009:13 contract, live in all three RPCs) is **points-agnostic**: finer points flow straight through, producing a finer OVR scale. Floor-51, the exactly-6 gate, all-6-or-nothing, and the active-cohort D-07 filter all carry over untouched. **The key stats stay hidden exactly as today** — `class_key_stats` is still read only inside the SECURITY DEFINER bodies and never serialized. Side benefit: value-proportional points no longer encode cohort-count information, so the T-03-10 accepted offline-brute-force leak actually SHRINKS (points now directly reveal a value ratio, not a rank position that can be inverted by probing).

### Baseline re-lock (must ship in the same phase — red smokes are BY DESIGN otherwise)

- `src/lib/rankMath.ts` + `rankMath.test.ts` — the executable spec's locked values (74.25, 49.5, 99, 51…) re-derive from the new formula; SQL must agree to the decimal via `smoke-rank.mjs` (27/27 exact-value contract re-locked).
- `scripts/smoke-promotion.mjs` — top-6-by-points ordering can shift; re-baseline expected values.
- `src/features/dashboard/presentation.ts` — tier bands D-01/D-02 re-calibrate against the new point distribution (this is precisely what the dummy seed calibrates — feature 4 exists to serve feature 3).

---

## 5. Dummy-Data Seed Workflow — apply-seed.mjs, never migrations

### Where it lives

| Piece | Location | Notes |
|-------|----------|-------|
| Seed SQL | `supabase/seeds/dummy/seed.sql` (subfolder) | Hand-authored ~5 players per class with realistic spreads/outliers, owner-reviewed; hash-pin.mjs generates bcrypt hashes; rows carry `char_class`/`char_function` + `status='validated'` submissions + `submission_stats` |
| Purge SQL | `supabase/seeds/dummy/purge.sql` | Reversibility by **sentinel handle prefix** (`dummy-%`); zero migration footprint |
| Runner | existing `scripts/apply-seed.mjs` | Takes ANY .sql file → Management API legacy `/v1/projects/{ref}/database/query` (the /api/v1/* HTML-page trap is documented in the script). Both seed and purge go through it |

### Architectural rules

- **Seeding the LIVE project is Management-API-only** (apply-seed.mjs, proven live in plan 01-01). NOT via Supabase Auth (no auth users exist in this architecture), NOT via `supabase db reset` (local-only by definition).
- **Keep dummy files OUT of `supabase/seeds/` direct children** — `config.toml:72` sets `db.seed sql_paths = ["./seeds/*.sql"]`, a flat non-recursive glob that auto-applies every direct child on each local `db reset`. A `dummy/` subfolder stays opt-in (verify once during implementation).
- **Service-level SQL bypasses RLS** exactly like every existing seed (`classes.sql`, `stat_catalog.sql`, `whitelist.sql` precedent) — the seed rows are ordinary members/rows and participate in the active-member cohorts (0011 D-07), which is the entire point: calibrate displays around realistic cohort shapes.
- **Purge delete order is FK-mandated:** `submission_stats → submissions` is `on delete cascade` (0001:28) but `submissions → members` has NO cascade (0001:21, default NO ACTION). Delete `submissions where member_id in (select id from members where discord_handle like 'dummy-%')` FIRST (cascading their stats), then the `members` rows. Reversed order fails on FK violations.

---

## Migration Sequencing (0012+) and Phase Cohesion

| Migration | Contents | Must ship atomically with | Risk if split |
|-----------|----------|---------------------------|---------------|
| **0012** — whitelist | `pin_hash` nullable + `add_member` RPC (+ EXECUTE hygiene, optional sentinel guard) | `verify-pin` null-branch + `setup-pin` deployed | Migration alone is INERT (no pinless rows exist until `add_member` is called) — so the safe order is **0012 → deploy both functions → first `add_member` use**. Deploying functions after any pinless row exists = 500 on that member's login |
| **0013** — rank v2 + home data | Formula swap in `my_report` + `class_top5` + `get_promotion` (full-copy create-or-replace, 0011 style), **plus** `last_validated_at` folded into the same `my_report` rewrite | `rankMath.ts`/test re-baseline, `smoke-rank.mjs` + `smoke-promotion.mjs` expected values, tier bands D-01/D-02 | Any split between SQL and spec/smoke baselines = red smokes by design. Folding `last_validated_at` into the same `my_report` copy avoids TWO full-body rewrites in one milestone (0011 precedent: copy the whole body, one behavioral delta per rewrite is the review discipline — but two sequential rewrites of the same 120-line body doubles review surface for no isolation gain) |
| — (not a migration) | dummy seed + purge | apply-seed.mjs runs | Never a migration: seeds must be reversible and must not replay on `db reset`/`db push` |

**Recommended sequencing:** 0012 + functions first (auth surface stabilizes), then 0013 + baselines (biggest smoke surface), then seed → calibrate displays → purge before release. Seed is independent and can interleave after 0013.

## What Does NOT Change (v1.0 invariants preserved)

- **RLS model:** every table stays RLS-enabled; no new member-facing policy in any direction; the 42P17 discipline holds (no new policy subqueries `members`).
- **Session shape & JWT claims:** `NeoFootSession` unchanged; claims remain exactly `{ role: 'authenticated', member_id, member_role }`, HS256 + kid, 7-day TTL, `NEFOOT_JWT_SECRET` — **key 6f7657c3 must never be revoked** (STATE.md blocker; revocation kills every session instantly). `setup-pin` reuses the same secret/kid.
- **Claim contract (0006 lesson):** `member_role` = guild role, `role` = PostgREST role-switch — `setup-pin` mints both identically.
- **Append-only submissions:** no v1.1 feature writes to or overwrites real submissions; officer validation flows untouched.
- **Aggregates-only member surface:** `my_report` stays the single member read; `get_promotion` stays the ONE sanctioned individual-values view; both payloads stay closed (additive scalar only in `my_report`).
- **SECURITY DEFINER gates:** verbatim staff/member gate + live-active check copied into `add_member`; EXECUTE hygiene on every new function.
- **Column-level security on `members`:** `pin_hash`/`role` remain ungranted — setup writes via the service-role admin client only.
- **All rank math in Postgres; client renders verbatim** (AGENTS.md non-negotiable) — the home tab's best-stats strip sorts, never recomputes.

## Risks to Architectural Invariants + Mitigations

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | `verify-pin` 500s on pinless members (`compareSync` throws on null) | HIGH — breaks login for exactly the new users | Null-branch BEFORE compare (line 148); deploy order 0012 → functions → first `add_member`; smoke-test the pinless path explicitly |
| 2 | `setup-pin` JWT drift (wrong jose major, missing claim, different TTL) → sessions that PostgREST rejects or RLS mis-reads | HIGH | Clone verify-pin's SignJWT block byte-for-byte; pin `npm:jose@4`; same env secrets; smoke: minted token must pass `fetchMe` |
| 3 | PIN-setup double-set race → second request overwrites a claimed PIN | MEDIUM | Conditional `where pin_hash is null` + trust returned count (CR-01 discipline); 0 rows ⇒ 401 |
| 4 | New rate-limit surface forgotten on `setup-pin` | MEDIUM | Reuse `pin_login_attempts` + `record_pin_failure` + `_shared/lockout.ts` verbatim — one mechanism, one truth (0003 constants stay in sync with the TS module) |
| 5 | Key-stat leak via the new scale (e.g. highlight selection correlating with keys) | HIGH | Formula identical for all 57 stats in `get_promotion` — property is structural, preserved by review; leak-diff probes re-run after 0013 |
| 6 | Red smoke matrices after the formula change read as regressions | LOW (by design) | Re-baseline all four baselines in the same phase/commit as 0013; document the new expected values as the contract |
| 7 | Seed purge violating append-only / forgetting purge before release | MEDIUM | Sentinel prefix scopes deletes to synthetic rows only (documented, narrow exception); `add_member` rejects `dummy-%`; purge file checked into `seeds/dummy/`; pre-launch checklist already tracks placeholder rotation (STATE.md) — add "purge dummy-%" to it |
| 8 | Nullable `pin_hash` widening an existing reader | LOW | Only `verify-pin` selects `pin_hash`; `fetchMe`/`fetchMembers` use explicit projections; column grants exclude it (0005) — no other reader exists to widen |
| 9 | Enumeration via `pin_setup_required` (exists-and-unclaimed oracle) | ACCEPTED | Narrower than the v1.0 enumeration it replaces; uniform dummy-compare latency; lockout applies; operational mitigation per STACK.md |

## Sources

- Local codebase (authoritative, read in full for this research) — **HIGH confidence**:
  - `supabase/migrations/0001_schema.sql` (pin_hash NOT NULL, FK cascade asymmetry), `0002_rls.sql` (no members INSERT policy), `0003_lockout_rpc.sql` (record_pin_failure), `0004_rls_active.sql` (live-active checks), `0005_registry_catalog.sql` (column-level security, staff policies), `0009_rank_engine.sql` (rank contract + gates), `0011_officer_tools_promotion.sql` (all five formula sites, RPC patterns, EXECUTE hygiene)
  - `supabase/functions/verify-pin/index.ts` + `_shared/lockout.ts` (compareSync line 148, DUMMY_HASH WR-01, lockout flow, SignJWT block)
  - `supabase/config.toml` (`db.seed` glob line 72, `deno_version = 2`)
  - `scripts/apply-seed.mjs`, `scripts/hash-pin.mjs`, `supabase/seeds/whitelist.sql` (seed tooling precedent)
  - `src/App.tsx` (Tab union line 20), `src/lib/api.ts` (restFetch, closed MyReport contract), `src/features/auth/session.ts` (NeoFootSession shape), `src/lib/rankMath.ts` (spec + locked values)
- `.planning/PROJECT.md` (Key Decisions — non-negotiable patterns), `.planning/STATE.md` (JWT key blocker, pre-launch actions) — **HIGH**
- `.planning/research/STACK.md` (v1.1 authoritative stack research — bcryptjs@3/jose@4 pins, migration 0012 shape, seed glob constraint; aligned, not re-derived) — **HIGH**
- Supabase official docs via Context7 (Edge Function patterns, service-role client usage) — carried over from STACK.md research, same day — **HIGH**
- `max_v = 0` edge handling and the exact dummy-cohort value distributions — **LOW/MEDIUM**, deliberately deferred to phase planning where the owner picks realistic spreads

---
*Architecture research for: NeoFoot v1.1 — Home, Whitelist & Fine Ranks*
*Researched: 2026-10-13*
