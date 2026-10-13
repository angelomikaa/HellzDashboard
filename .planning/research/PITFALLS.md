# Pitfalls Research — v1.1 Home, Whitelist & Fine Ranks

**Domain:** Additive features on a LIVE single-guild stats panel — new failure modes of whitelist/PIN-claim auth, a rank-scale change, a landing tab, and a dummy-data workflow, all landing on real production data
**Project:** Hellz / NeoFoot — Ragnarok Origin guild stats panel (v1.0 shipped 2026-10-13)
**Researched:** 2026-10-13
**Overall confidence:** HIGH — every pitfall is anchored to a specific verified location in the codebase (`verify-pin/index.ts`, `0001_schema.sql`, `0009/0011` RPC bodies, `apply-seed.mjs`, `config.toml`) or to the STACK.md v1.1 findings; operational judgments are marked MEDIUM.

**Scope note — v1.0 pitfalls largely retired:** OCR accuracy (structural reader + exact-value harness, shipped), greenfield schema/RLS design (proven by 5 live smoke matrices), PIN-auth identity/brute-force fundamentals (per-player bcrypt PINs + atomic `record_pin_failure` lockout, live), key-stat server-side hiding (RNK-02 leak-probes live), and free-tier limits (no screenshot storage, tiny EAV rows) are all shipped and proven — NOT re-researched. What v1.1 changes is the *operating regime*: every change lands on a LIVE system with REAL members, REAL sessions in the wild, and a locked rank contract. The failure modes below are new-surface failures, ordered by severity.

**v1.0 pitfalls that still bite (brief carryovers):** (1) key-stat hiding is a standing rule — the home tab's `my_report` extension and any new best-stats strip must stay a closed payload (RNK-02); (2) append-only — the whitelist removal path must flip `active`, never DELETE (see High-9); (3) WR-06 — credentials/hashes recoverable from git history feed directly into the placeholder-PIN pitfall below.

---

## Critical Pitfalls

### Critical-1: Seed rows pollute REAL members' ranks — and the new scale amplifies the damage

**What goes wrong:** The dummy workflow inserts ~5 fake players per class with `active=true` and `status='validated'` submissions. Every rank RPC (`my_report`, `class_top5`, `get_promotion`) computes cohorts over exactly that population (`0011`: cohort joins `members where ... m.active`, `latest` filters `status not in ('rejected','discarded')`). Seed rows are indistinguishable from real ones by construction. While seeded, real members' points/OVR silently shift — and under the v1.0 rank-percentile formula adding 5 members per cohort already rescales everyone (`n-1` changes). Under the NEW value-proportional formula the damage is worse: if dummy players hold the top values, `points = own/max*99` drags every real member down proportionally to the fake leader's headroom — a member at 60% of a seeded max drops to ~59 points regardless of how good they are among REAL players. Members log in and see their ranks tank with no explanation.

**Why it happens:** The seed's whole purpose is to make displays realistic — which means it must enter the same cohorts the live math reads. There is no flag, view, or gate separating "calibration data" from "production data"; `apply-seed.mjs` writes straight to the live project.

**Detection signal:** Any real member reporting rank drops during the calibration window; `get_promotion` showing `dummy-*` handles on Destaques; a `select count(*) from members where discord_handle like 'dummy-%'` returning nonzero after the intended purge.

**Mitigation / prevention:**
- Treat the seed window as a *scheduled, announced* distortion: owner announces the calibration window, then seed → calibrate bands → purge in one tight session. Do not leave the seed resident overnight.
- Rehearse the purge FIRST: run seed + purge against a local `db reset` before touching live, and keep the purge file's success check scripted (zero `dummy-%` rows in `members`, `submissions`, `submission_stats`, and `pin_login_attempts`).
- Decide deliberately whether to exclude `dummy-%` handles from cohort SQL during calibration (a temporary sentinel filter inside the RPCs) or accept polluted ranks. Excluding via SQL means editing three SECURITY DEFINER functions twice (add filter, remove filter) — more migration churn but zero member-visible distortion; accepting the distortion is simpler but must be owner-signed off. Decide in phase planning; do not drift into it implicitly.
- The Destaques promotion page is member-visible — dummy players will appear as top-5 EAFC cards during the window. Announce or exclude.

### Critical-2: The rank-scale migration invalidates every locked contract value — stale baselines must be re-locked IN-PHASE

**What goes wrong:** The v1.0 rank math is locked to the decimal in three places that must agree: `src/lib/rankMath.test.ts` (74.25, 49.5, 99, 0, 61, 75, 95), `scripts/smoke-rank.mjs` (exact-value live assertions: 74.25/49.5/99/0, OVR a=61/b=77/c=87, n=2 → null), and the SQL in `0009`/`0011` (three RPC bodies carrying the same formula). Changing to value-proportional points makes ALL of these wrong at once. The failure mode is not "tests go red" — red is the design working. The failure modes are: (a) shipping with red suites ignored, so future regressions hide inside known-failing noise; (b) re-locking the SQL but not the TS spec module (or vice versa), silently breaking the "SQL must agree to the decimal" contract that `smoke-rank.mjs` enforces; (c) forgetting `smoke-promotion.mjs` — top-6-by-points highlight ordering shifts when the points distribution compresses; (d) forgetting the tier bands (see High-6).

**Why it happens:** The contract is intentionally duplicated (TS spec ↔ SQL ↔ smoke) as a tamper-evident tripod; a formula change must be propagated to all three legs in the same phase, and the temptation is to update the SQL and "get back to features."

**Detection signal:** `vitest` red on `rankMath.test.ts`; `smoke-rank.mjs` exiting non-zero; `smoke-promotion.mjs` ordering assertions failing. Any of these still red at phase verification = incomplete phase.

**Mitigation / prevention:** Make "re-lock all three legs + re-baseline both smokes" an explicit must-have of the scale phase, not cleanup. Re-derive the new locked values by hand from the new formula's worked example (as 03-01 did) before touching SQL. Run the full smoke battery (`smoke-rank`, `smoke-promotion`, `smoke-rls`, `smoke-lifecycle`, `smoke-officer`) after the migration — the non-rank smokes should stay green and prove no collateral breakage.

### Critical-3: `verify-pin` 500s on a pinless member — the null-hash branch must precede the compare

**What goes wrong:** Today `verify-pin/index.ts:148` calls `bcrypt.compareSync(pin, member.pin_hash)` unconditionally, and `0001_schema.sql:6` declares `pin_hash text not null`. The moment migration 0012 makes the column nullable and `add_member` creates the first pinless row, any login attempt for that handle hits `compareSync(pin, null)` — which **throws** (verified bcryptjs 3 behavior, flagged in STACK.md) → unhandled → HTTP 500 on the login of exactly the members the feature is meant to serve. Worse placement bug: if the null branch is added *after* the success-path lockout reset or after the compare, the throw still happens; it must be before line 148.

**Why it happens:** The function was written under a NOT NULL invariant; the new schema quietly removes it.

**Detection signal:** Any `pin_setup_required`-era login returning 500; Edge Function logs showing a bcrypt TypeError for a member row that visibly exists.

**Mitigation / prevention:** Branch `if (member.pin_hash === null)` immediately after the active check and before ANY compare, returning the distinct `pin_setup_required` response. Keep the WR-01 timing discipline: the pinless path must still burn equal bcrypt time (dummy compare, result discarded) so the new response class doesn't become a latency oracle on top of its inherent enumeration (see High-5). Add a smoke probe: pinless ACTIVE handle → expect `pin_setup_required` (not 401, not 500); inactive pinless handle → expect uniform `invalid_credentials` (see High-5).

### Critical-4: Pre-existing placeholder-PIN whitelist rows are live known credentials AND dead-ends for the claim flow

**What goes wrong:** STATE.md carries the standing pre-launch action: "rotate placeholder whitelist rows/PINs before inviting real members (credentials/hashes recoverable from git history, WR-06)." v1.1's claim flow changes what "rotate" means. If migration 0012 only makes the column nullable and leaves existing placeholder rows with their known bcrypt hashes: (a) anyone who recovered a placeholder PIN from git history can log in as that member TODAY and forever — they never see `pin_setup_required` because their `pin_hash` is set; (b) the legitimate player logging in with their own handle gets a normal PIN prompt, not the claim flow — the feature silently doesn't apply to the very rows it was designed for. Conversely, if the migration nulls the hashes, it must not also strand members mid-session.

**Why it happens:** The placeholder rows were a Phase-1 bootstrap convenience; the claim-flow design naturally thinks about NEW rows and forgets the legacy ones.

**Detection signal:** Any `members` row predating v1.1 with a non-null `pin_hash` that the owner cannot vouch for; a player report of "I never got to choose my PIN."

**Mitigation / prevention:** Fold the placeholder-row conversion INTO migration 0012 (or an owner-run SQL step in the same phase): set `pin_hash = null` for the placeholder whitelist rows so they enter the claim flow, and record which rows were converted. Coordinate with the STATE.md owner action — after conversion, the WR-06 git-history exposure is moot (no known hash verifies anymore). Also clear their `pin_login_attempts` rows so stale failure counts don't greet first login.

### Critical-5: Purge failure modes — FK order, forgotten purge, and non-idempotent seed re-runs

**What goes wrong:** Three related seed-workflow failures. (a) **FK asymmetry (verified in `0001_schema.sql`):** `submission_stats → submissions` is `on delete cascade`, but `submissions → members` has NO cascade (NO ACTION). A purge that deletes dummy `members` first fails with FK violations; it MUST delete `submissions` (cascading their stats) before `members`. (b) **Forgotten purge:** the release ships with dummy players live on Destaques and distorting every cohort — the exact Critical-1 damage, but permanent. (c) **Re-run duplication:** `apply-seed.mjs` re-run on a non-idempotent seed file half-fails (`members.discord_handle` unique → 23505 mid-file) and can leave a partially applied seed; plain `insert`s on `submissions` have no natural key and duplicate silently. Note also `apply-seed.mjs` sends the file as ONE query string with no wrapping transaction unless the SQL itself provides one.

**Why it happens:** The purge is an "uninstall" nobody demos, and the seed script predates the requirement to be re-runnable.

**Detection signal:** FK error text (`violates foreign key constraint`) on purge; duplicate dummy rows after re-seed; `dummy-%` rows surviving into release checks.

**Mitigation / prevention:** Write the seed file idempotently: begin with `begin; delete ... where discord_handle like 'dummy-%'` (ordered: `submission_stats`→`submissions`→`members` via cascade, plus `pin_login_attempts`), then insert — making every run a clean replace and every abort recoverable. End with `commit;`. Script a post-purge verification query and make "zero dummy rows" a release checklist item alongside the existing owner pre-launch actions. Keep seed files OUT of `supabase/seeds/` direct children (config.toml `db.seed sql_paths = ["./seeds/*.sql"]` auto-applies every direct child on local `db reset` — a `dummy/` subfolder stays opt-in, per STACK.md).

---

## High Pitfalls

### High-1: PIN-claim squatting window — the accepted design constraint needs operational teeth

**What goes wrong (STACK.md accepted constraint, expanded):** Between officer-add and player-claim, `discord_handle` knowledge alone identifies the member: anyone who learns a freshly added handle can call `setup-pin` first and bind THEIR pin to the victim's identity — permanently, until an officer intervenes (there is no self-service PIN reset in scope). The whitelist model already trusts handle+PIN knowledge, so this is accepted — but the window is only as safe as the notification ritual around it.

**Why it happens:** Handle-only registration has no second factor; the design consciously trades it away.

**Detection signal:** A member reporting "my PIN was already set when I first logged in"; `setup-pin` returning success for a handle the officer added minutes ago.

**Mitigation / prevention (operational):** Officer notifies the player immediately upon adding (Discord DM with the handle); keep the add→claim window short; make the officer UI show unclaimed members prominently so stale unclaimed rows are visible. Server-side: once claimed, `setup-pin` on that handle must return the same uniform shape as every other claimed-handle response (no differential info). Add an officer-facing "unclaimed" indicator so squatting is discoverable. Optionally have `add_member` reject `dummy-%` handles (STACK.md sentinel) so the namespace stays clean.

### High-2: `pin_setup_required` is an enumeration leak — narrower than v1.0's uniform-401, but must be bounded

**What goes wrong:** v1.0's T-01-07 rule was: missing handle, inactive member, and wrong PIN all return the IDENTICAL 401 (no enumeration). The claim flow necessarily breaks uniformity: an ACTIVE handle with null `pin_hash` returns `pin_setup_required` while a non-whitelisted handle returns `invalid_credentials` — so probing the login endpoint now reveals (a) that a handle is whitelisted, and (b) that it's unclaimed. That's the accepted leak; the UNACCEPTED variants are: inactive members also returning `pin_setup_required` (would leak that a removed player was once whitelisted), or response-time differentials stacking on top of the status-code differential.

**Why it happens:** The player must learn they need to set a PIN — some signal is unavoidable. The danger is leaking more than that minimum.

**Detection signal:** Smoke probes: inactive member with null hash → must be `invalid_credentials` (never `pin_setup_required`); timing of the three response classes comparable.

**Mitigation / prevention:** The pinless branch order (Critical-3) must be: lockout check → member lookup → **active check → invalid_credentials for inactive** → **null-hash → pin_setup_required** → compare. Keep the dummy-compare timing equalization on the pinless path (WR-01 pattern extends, per STACK.md). Document the narrowed leak in the RPC/function comment the way T-03-10 documented the aggregates leak — accepted-leak discipline.

### High-3: Double-set PIN race — two concurrent `setup-pin` requests

**What goes wrong:** Two simultaneous setup requests (player double-clicks, or squatter races the player — see High-1) both read `pin_hash is null`, both bcrypt-hash, both UPDATE. A naive `update members set pin_hash = X where discord_handle = H` unconditionally lets the LAST writer win silently — the player who "lost" believes they chose their PIN but authenticates with the attacker's/duplicate's value.

**Why it happens:** Read-then-write is the classic TOCTOU; this project already learned it once (CR-01's lockout race, fixed with an atomic RPC).

**Detection signal:** A member whose chosen PIN doesn't log them in; two 200s in the Edge Function logs for the same handle within milliseconds.

**Mitigation / prevention:** The conditional write from STACK.md: `update ... set pin_hash = X where discord_handle = H and pin_hash is null` and trust only the RETURNED row count — 0 rows means someone claimed first → return `already_set` (uniform shape, don't reveal whether it was the player themselves). This is the same "trust only the returned count" discipline as CR-01 and `set_submission_status`'s `not_pending` (0011:156-159 is the exact in-repo precedent: zero-row UPDATEs must raise, never silently no-op).

### High-4: Lockout semantics on the setup surface — both bypass AND weaponization

**What goes wrong:** Two symmetric traps. (a) **Bypass:** if `setup-pin` doesn't check `isLocked`, the per-handle lockout (5 attempts / 15 min, `_shared/lockout.ts` + `record_pin_failure`) simply doesn't apply to the new endpoint — and the setup surface inherits login's 10k-keyspace sensitivity the moment any verification-like behavior creeps in (e.g., a future "confirm current PIN" step). Today it's the abuse-rate surface even without a brute-force win condition. (b) **Weaponization:** if `setup-pin` records failures via `record_pin_failure`, an attacker can deliberately burn 5 attempts against a FRESHLY ADDED, unclaimed handle — locking the real player OUT of their own claim flow for 15 minutes per burst (the lockout table is keyed by `discord_handle` and shared across endpoints).

**Why it happens:** "Reuse the proven lockout" (STACK.md, correct) is easy to implement as "also write failures" without thinking about who can trigger failure-counting.

**Detection signal:** `pin_login_attempts.locked_until` set for handles that never had a successful login; members unable to claim with no wrong-PIN history of their own.

**Mitigation / prevention:** `setup-pin` MUST check `isLocked` before doing anything (gate ordering mirrors `verify-pin:88-100`). For failure counting: count only genuine abuse signals on the setup path (malformed requests, attempts on already-claimed handles beyond a small allowance) and cap how they can lock a still-unclaimed handle — or don't record failures at all on setup and instead apply a coarse per-handle request rate. Decide explicitly in the phase plan; the wrong default either way is a live incident. On success (claim completed), reset the counter exactly like `verify-pin:150-159` does.

### High-5: Edge cases of the value-proportional formula — all-equal cohorts, max=0, ties at top, n=1, and the cohort-size gate

**What goes wrong:** The new `points = own/nullif(max_v,0)*99` has a different edge-case profile than the rank-percentile it replaces. (a) **All-equal values:** everyone IS the leader → everyone gets 99 (the old formula gave all-tied 49.5). An entire class tied at the top scores OVR 99 across the board — is that intended? (b) **max = 0:** `nullif` guards division, yielding null points — but an all-zero cohort (e.g., a percentual stat nobody has invested in) arguably means everyone is tied at the best. Null-for-everyone silently empties the home "best stats" strip. (c) **Ties at top:** multiple co-leaders all hold 99 — correct, but the top-end cuts (98/97/96/95) only differentiate the SUB-leader tail; verify the owner's mental model matches. (d) **MIN_COHORT_SIZE = 3:** the current contract nulls points below n=3 (`rankMath.ts:10`, D-12); the STACK.md formula draft doesn't mention the gate. Dropping it silently changes the contract AND makes single-member classes score 99-everything (own = max). Keeping it means small classes (post-purge!) show null points on the new home tab.

**Why it happens:** The formula is being chosen for the top-end feel; edges are where percentile and value-proportional scales disagree most.

**Detection signal:** Smoke fixtures with all-tied cohorts, all-zero cohorts, and n=1/n=2 cohorts — the re-locked `rankMath.test.ts` must contain vectors for each (the old suite already has all-tied and n-gate vectors as the pattern).

**Mitigation / prevention:** Decide and lock explicitly: retain MIN_COHORT_SIZE=3 (recommended — it's a live contract); define all-equal → all 99 as intended (it's the honest reading of "leader holds 99"); define max=0 → points null (data-insufficient, matching the existing `data_sufficient` pattern) and make the home tab render null-points gracefully. Clamp `own/max` at ≤1 by construction (own ≤ max always holds since max is the cohort max — but add a smoke assertion so a future cohort bug can't push points >99).

### High-6: Tier bands and the percentile phrase are calibrated to the OLD distribution — silent semantic drift

**What goes wrong:** Three client-side consumers assume points are a RANK percentile. (a) `presentation.ts` D-01 bands (35/60/85) and D-02 OVR bands (65/75/85) were calibrated on a roughly-even rank distribution; under value-proportional points the distribution compresses toward the top (a player at 70% of the leader across stats scores ~70 points/OVR ~85) — without re-calibration nearly everyone becomes gold/platinum and tiers stop discriminating. This is exactly what the dummy seed exists to calibrate — but only if the seed runs BEFORE the bands are frozen. (b) `percentilePhrase` (D-09/D-10/D-11, `presentation.ts:28-35`) renders "Você está entre os X% melhores/piores" FROM points — under the new scale points are value-relative, NOT a percentile: a player at 50 points is at 50% of the leader's VALUE, not the 50th percentile of the class. The phrase becomes factually wrong on every card. (c) The OVR floor-51 interaction: with rank-percentile points the worst player always approached 51 (points→0); with value-proportional points the floor is reached only by near-zero values, so the observed OVR range narrows upward — D-02's 65/75/85 edges almost certainly need to move.

**Why it happens:** The tier UI treats points as opaque (correctly, per RNK-02) — so a formula change upstream is invisible to the client code until someone looks at the rendered tiers.

**Detection signal:** Post-migration screenshots showing platinum saturation on Destaques; percentile phrases that contradict the visible rank ordering.

**Mitigation / prevention:** Sequence the scale phase as: migration → re-locked TS/SQL/smoke tripod (Critical-2) → seed the dummy cohort → owner calibrates D-01/D-02 edges against realistic spreads → purge. Decide the percentile phrase's fate explicitly with the owner: either compute and return a TRUE rank percentile alongside points in `my_report` (additive field, closed payload stays closed) or reword/reword-removal of the phrase. Do not let the phrase silently lie.

### High-7: Live-migration ordering and old JWTs in the wild

**What goes wrong:** v1.1 lands on a live project with real 7-day JWTs outstanding (STATE.md: key 6f7657c3 must never be revoked — revoking kills every session instantly). Ordering traps: (a) if `add_member` becomes callable before the updated `verify-pin`/new `setup-pin` are deployed, newly added pinless members hit the Critical-3 500 at their first login — the feature's first impression is a broken login; (b) if `setup-pin` is deployed before migration 0012, it UPDATEs against a NOT NULL column... which actually works (it sets a value), but its `pin_hash is null` guard matches nothing — silently returning `already_set`/0-row confusion for every claim; (c) `setup-pin` must mint token-for-token identical sessions to `verify-pin` (same `SignJWT` block, same kid/issuer/claims/7-day expiry — 0009's claim contract comment says "never violate"). Any drift (jose major, missing kid, different issuer) mints tokens that either fail PostgREST verification (member locked out) or succeed with subtly wrong claims (role enforcement gaps).

**Why it happens:** Three deployable artifacts (SQL migration, `verify-pin` patch, `setup-pin` new function) must land in a compatible order, and the secret env vars are project-level (shared — no new secrets needed, but also no isolation).

**Detection signal:** Claim-flow logins 500ing on fresh rows; `setup-pin` success responses whose tokens fail on the very next `/rpc/my_report` call.

**Mitigation / prevention:** Deploy order: (1) patch `verify-pin` + deploy `setup-pin` (both handle pinless rows gracefully even before any exist), (2) run migration 0012 (nullable + `add_member`), (3) enable the officer add UI. Rehearse locally with `db reset` first. Verify a `setup-pin`-minted token against every RPC the member UI calls (one smoke pass: claim → my_report → create_submission → get_promotion). Never touch the signing key. Old pre-v1.1 JWTs need nothing special: claim-shape semantics are unchanged, and the existing active-check gates keep validating them.

### High-8: `add_member` race and error-surface design

**What goes wrong:** (a) Two officers concurrently add the same handle → one INSERT wins, the other hits the `discord_handle` unique violation (23505) — if the RPC doesn't catch/translate it, the officer sees a raw Postgres error string in the UI. (b) An officer "re-adds" a previously REMOVED (active=false) member → unique violation, but the correct action is `set_member_active(true)` — if the error surface doesn't communicate this, officers "fix" it by creating a duplicate under a mangled handle (e.g., `name-2`), fragmenting the member's history (submissions point at the old row; the new row is rank-empty). (c) `add_member` must force `role='member'` and `active=true` server-side regardless of input (the `set_member_role`/`set_member_active` precedent: the RPC is the narrow write surface, no direct INSERT policy on `members`).

**Why it happens:** The unique constraint is the safety net, but the error path is where UX and security meet.

**Detection signal:** Raw `duplicate key value violates unique constraint "members_discord_handle_key"` shown in the officer UI; duplicate-looking handles appearing in `fetchMembers`.

**Mitigation / prevention:** In the RPC, catch the 23505 (`unique_violation` via `get stacked diagnostics` / `SQLERRM`) and raise a distinct `handle_exists` exception; the client maps it to "this handle already exists — if they were removed, reactivate them instead." Follow the 0011 RPC template verbatim: staff gate first (officer/owner claim + live active), role forced, `search_path = public`, EXECUTE hygiene (`revoke from public, anon; grant to authenticated`).

---

## Medium Pitfalls

### Medium-1: Stale-CTA timestamp semantics — validated-only, pending suppression, never-submitted, and null handling

**What goes wrong:** The CTA input is "days since last validated submission." Traps: (a) using `max(submitted_at)` over ALL statuses counts pending/rejected submissions as fresh — a rejected submission would hide staleness; (b) the inverse UX trap: a member whose submission sits PENDING in the officer queue for days sees "your data is stale, submit again" while their fresh data awaits validation — the CTA must suppress (or reword to "awaiting validation") when a pending submission exists; (c) never-submitted members have NULL `last_validated_at` — a naive `new Date(null)`/arithmetic path yields epoch-0 or Invalid Date, rendering "NaN days ago" or a permanently-stale banner; (d) day-counting by calendar subtraction in local time vs epoch diff — with ~7-day thresholds and Brazil having no DST (abolished 2019) this is minor, but compute `Date.now() - lastValidated > 7*864e5` on the ISO timestamptz string (PostgREST emits explicit-offset ISO; `new Date(iso)` parses it correctly) rather than comparing date strings.

**Detection signal:** A member with a pending submission seeing the stale banner; console `Invalid Date`; a member who submitted 6 days ago flagged stale because of a timezone offset boundary.

**Mitigation / prevention:** Fold `last_validated_at` (and ideally `has_pending`) into the `my_report` extension as computed SQL (`max(submitted_at) filter (where status='validated')`, `exists (... status='pending')`), keeping the member contract closed-payload. Client: three explicit states — never-submitted, pending-suppressed, stale-vs-fresh — each with distinct copy; guard nulls before arithmetic.

### Medium-2: Whitelist removal must stay `active=false` — a "cleaner" DELETE breaks append-only and FK reality

**What goes wrong:** v1.1 restates "removal stays role-differentiated as today." The temptation when adding `add_member` is to complete the lifecycle with a `remove_member` DELETE for symmetry. But `submissions → members` has no cascade (0001), so DELETE fails on any member with history; adding a cascade to make it "work" would destroy submission history (append-only violation, AGENTS.md non-negotiable) and rewrite cohort membership retroactively. The existing `set_member_active` RPC (0011:231-278) already implements role-differentiated removal with instant token revocation (every RPC gate + RLS policy re-checks `m.active` — proven live in Phase 6).

**Detection signal:** Any migration touching the `submissions.member_id` FK; any new "remove" RPC.

**Mitigation / prevention:** Reuse `set_member_active` unchanged; the v1.1 officer UI surfaces it as "removal from the whitelist." The only new semantics needed: the `add_member`↔reactivation interplay (High-8b) and cleared lockout state on reactivation.

### Medium-3: `apply-seed.mjs` operational failure modes on live

**What goes wrong:** The seed/purge both ride the Management API Run Query path (`api.supabase.com/v1/.../database/query`). Known failure modes (documented in the script + STATE.md): (a) the `/api/v1/*` HTML-page trap silently "succeeds" — only the legacy `/v1` endpoint is real; (b) the owner is scheduled to ROTATE the Supabase access token as a pre-launch action (STATE.md) — a stale token in the session env yields 401/403 mid-purge, and since the script `process.exit(1)`s on first file failure, a multi-file purge can stop half-done; (c) PowerShell JSON corruption (ConvertTo-Json `{"value": ...}` wrapping) — the script must run from Node, never pasted into PowerShell; (d) no transaction unless the SQL file wraps itself (see Critical-5c).

**Detection signal:** `APPLIED` log lines without the expected row counts; 401 after a token rotation; an HTML error page body in the failure log.

**Mitigation / prevention:** Single-file seed and single-file purge (each internally transactional) so partial application is impossible; verify token freshness BEFORE the calibration session; after purge, run the zero-dummy-rows verification query (Critical-5). This also un-blocks the pending catalog re-seed (STATE.md blocker) if done in the same session.

### Medium-4: Promotion page showing the stale scale during the rollout window

**What goes wrong:** The scale migration is compute-on-read — the instant it runs, `get_promotion`/`my_report` return new-scale values while clients may still run the cached SPA bundle with old D-01/D-02 bands (High-6a). Result: Destaques briefly mis-tiers everyone (most visibly, the platinum saturation artifact). Same window applies between "bands recalibrated" and "new bundle deployed."

**Detection signal:** Owner screenshots pre/post bundle deploy disagreeing on tiers for identical OVRs.

**Mitigation / prevention:** Single release: migration + frontend deploy together (the SPA is static — users pick up the new bundle on next reload; the skew window is one reload at most). Verify the promotion payload against the re-locked `smoke-promotion.mjs` immediately post-deploy. Accept and announce the minutes-scale skew rather than engineering a versioned-scale flag for a 15-person guild.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Whitelist / PIN claim | 500 on null hash (Critical-3), squatting (High-1), enumeration bounds (High-2), double-set race (High-3), lockout reuse semantics (High-4), placeholder rows (Critical-4) | Branch-order + conditional-update + isLocked-gate patterns; new smoke probes: pinless-active → `pin_setup_required`, pinless-inactive → uniform 401, double-setup → `already_set` |
| Rank scale | Stale tripods (Critical-2), formula edges (High-5), band/phrase drift (High-6) | Re-lock TS+SQL+smokes in-phase; seed-then-calibrate-bands; explicit owner decision on percentile phrase |
| Seed workflow | Rank pollution (Critical-1), FK-order/re-run/forgotten purge (Critical-5), apply-seed ops (Medium-3) | Idempotent transactional seed+purge, rehearsed locally, zero-dummy-rows release check |
| Home tab / CTA | Timestamp semantics (Medium-1), null-points rendering after purge (High-5d), closed payload discipline | Three explicit CTA states server-computed; null-safe render; additive my_report fields only |
| Live migration | Ordering (High-7), old JWTs, stale-scale window (Medium-4) | Functions-then-migration deploy order; single release; never revoke key 6f7657c3 |

## Sources

- Local codebase (HIGH — authoritative, read 2026-10-13): `supabase/functions/verify-pin/index.ts` (compareSync at :148, DUMMY_HASH WR-01 timing, lockout gate :88-100, success reset :150-159), `supabase/functions/_shared/lockout.ts` (5/15 constants), `supabase/migrations/0001_schema.sql` (pin_hash NOT NULL :6, FK cascade asymmetry :21-32), `0003_lockout_rpc.sql` (atomic `record_pin_failure`), `0009_rank_engine.sql` + `0011_officer_tools_promotion.sql` (rank formula in my_report/class_top5/get_promotion, cohort definitions, claim contract, `set_member_active`, EXECUTE hygiene), `src/lib/rankMath.ts`/`rankMath.test.ts` (locked values 74.25/49.5/99/51/61/75/95, MIN_COHORT_SIZE=3), `src/features/dashboard/presentation.ts` (D-01 35/60/85, D-02 65/75/85, percentilePhrase), `src/lib/api.ts` (closed-payload contracts, explicit projections), `src/features/auth/session.ts` (localStorage session shape), `scripts/apply-seed.mjs` (legacy `/v1` endpoint, Node-only, per-file exit), `scripts/smoke-rank.mjs` (exact-value fixtures), `supabase/config.toml` (`db.seed sql_paths` glob, `deno_version = 2`)
- `.planning/research/STACK.md` (v1.1, authoritative sibling research): bcryptjs null-hash throw, `pin_setup_required` enumeration acceptance, conditional-update race pattern, `dummy/` subfolder glob constraint, deploy-order implications — HIGH (codebase-verified)
- `.planning/STATE.md` + `.planning/PROJECT.md`: JWT key 6f7657c3 revocation danger, placeholder whitelist PIN rotation (WR-06), auth-gated catalog re-seed blocker, security non-negotiables — HIGH (project records)
- bcryptjs `compareSync` throwing on null/undefined hash inputs — MEDIUM (behavior consistent with the library's documented input validation and the STACK.md finding; re-verify with a 2-line runtime check during implementation)
- Management API `/v1` vs `/api/v1` endpoint behavior, PowerShell JSON corruption — HIGH (proven live in plan 01-01, recorded in apply-seed.mjs header)
- Brazil DST abolition (2019) relevant to CTA day-counting — MEDIUM (general knowledge; only affects a boundary already avoided by epoch-diff arithmetic)

---
*Pitfalls research for: NeoFoot v1.1 — Home, Whitelist & Fine Ranks*
*Researched: 2026-10-13*
