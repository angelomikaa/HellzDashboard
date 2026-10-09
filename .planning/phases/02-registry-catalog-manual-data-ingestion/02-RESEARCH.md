# Phase 2 Research: Registry, Catalog & Manual Data Ingestion

**Phase:** 02-registry-catalog-manual-data-ingestion
**Researched:** 2026-10-09 (planner-integrated research — yolo mode, no dedicated researcher session)
**Question answered:** "What do I need to know to PLAN Phase 2 well?"

**Requirements in scope:** REG-01, REG-02, REG-03, INPT-01, INPT-03, INPT-04 (INPT-02 = OCR, Phase 5)

---

## 1. What already exists (Phase 1 outputs Phase 2 builds on)

| Asset | Contract |
|-------|----------|
| `supabase/migrations/0001_schema.sql` | 6 tables live in project `thdxyxsjafimxgxpmpqs`: `members` (discord_handle unique, pin_hash, role member/officer/owner, active, display_name), `stat_catalog` (stat_key pk, label, group_name general/quasi/special, value_type flat/percentual), `submissions` (status pending/validated/rejected), `submission_stats` (EAV, unique(submission_id, stat_key), FK→catalog), `class_key_stats` (deny-all), `pin_login_attempts` |
| `supabase/migrations/0002_rls.sql` | members own-row select; submissions/submission_stats own select+insert, **no update/delete policies (append-only by absence)**; stat_catalog select-all-authenticated; class_key_stats + pin_login_attempts deny-all |
| Custom JWT | `verify-pin` issues HS256 JWT with claims `{ member_id, role }`; PostgREST RLS matches via `auth.jwt()->>'member_id'` and `auth.jwt()->>'role'`. **The /functions/v1 AND PostgREST gateways require BOTH `apikey` and `Authorization: Bearer` headers** (proven live, 01-02) |
| Frontend | `src/features/auth/` (LoginPage/RequireAuth/session.ts — session shape `{ access_token, member_id, display_name, member_role, expires_at }`, localStorage key `nefoot_session`), `src/lib/supabase.ts` (env client, **currently unused by app flows — login uses raw fetch**), QueryClientProvider wired in `main.tsx` |
| Deployment | `supabase link` + `supabase db push` (env `SUPABASE_ACCESS_TOKEN`); seeds via **Management API legacy `/v1` Run Query endpoint, invoked from Node** (PowerShell ConvertTo-Json corrupts long strings — always Node) |
| OCR spike | **GO** (222/222 fields). `scripts/ocr-regions.json` holds the owner-eye-validated stat field keys per screenshot; `scripts/ocr-spike.mjs` exports `parseValue()` — the canonical pt-BR parse rules |
| UI design system | `01-UI-SPEC.md`: dark tokens (`bg-dominant #0D1117`, `surface #161B22`, `line #30363D`, `accent #E3B341`, `content`, `muted`, `destructive`), 44px touch targets, 16/14/20/28px type scale, pt-BR copy, a11y patterns (`label htmlFor`, `role="alert" aria-live="polite"`, `focus-visible:ring-accent`, `aria-busy`) |

## 2. Stat catalog content (REG-03) — validated source

The OCR spike's region maps were calibrated against **real guild screenshots and eye-validated by the owner** — the field keys there are the ground-truth stat list. Cross-referenced with PROJECT.md's stat structure:

- **general (15):** hp, sp, patk, pdef, matk, mdef, refine_patk, refine_pdef, refine_matk, refine_mdef, hp_recover, sp_recover, hit, flee + **combat_power** (from the spike-endorsed "basic" header screen — reconciled as a catalog stat so Phase 5 can OCR-fill it; entered manually on the wizard intro step in Phase 2)
- **quasi (26):** aspd, mspd, variable_ct, variable_ct_pct, fixed_ct, fixed_ct_pct, healing_done, healing_taken, crit, crit_res, crit_dmg, crit_dmg_res, pdmg, pdmg_r, mdmg, mdmg_r, ignore_pdef, ignore_pdef_pct, ignore_mdef, ignore_mdef_pct, pdmg_bonus, mdmg_bonus, pve_dmg_reduction, pve_dmg_bonus, pvp_dmg_reduction, pvp_dmg_bonus
- **special (16):** max_sp_pct, equip_patk_pct, equip_matk_pct, equip_pdef_pct, equip_mdef_pct, global_cd_pct, dmg_vs_small, dmg_vs_medium, dmg_vs_large, dmg_vs_brute, dmg_vs_demi_human, dmg_reduction_vs_small, dmg_reduction_vs_medium, dmg_reduction_vs_large, dmg_reduction_vs_brute, dmg_reduction_vs_demi_human

**Total: 57 stats ≥ 50 required.** value_type: `percentual` iff key ends in `_pct` OR is a % damage modifier (pdmg_bonus, mdmg_bonus, pve_dmg_reduction, pve_dmg_bonus, pvp_dmg_reduction, pvp_dmg_bonus, dmg_vs_*, dmg_reduction_vs_*); everything else `flat`. Negative values are real (variable_ct_pct −33,38%, global_cd_pct −10,00%) — never reject negatives.

## 3. Decisions investigated

### 3.1 Screenshot storage → NONE in Phase 2 (closes the STATE.md Phase 2 blocker)

The STATE.md blocker ("compressed thumbnail ~30–80 KB WebP latest-only vs full originals — decide during Phase 2 planning") resolves to: **no server-side screenshot storage at all in v1 ingestion.**

- D-10 established the owner's stance: member screenshots never enter git or Supabase Storage.
- Phase 2's flow needs the screenshot only *at the player's fingertips* (shown beside inputs as a reference while typing). A client-side `FileReader`/object URL, never uploaded, satisfies INPT-01. Example shots shown in the UI are *panel-provided reference images* (static assets), not member data.
- Phase 5 OCR is client-side (Tesseract.js) — it also never needs uploads.
- Officer validation (Phase 6) reviews parsed values; if visual evidence is ever wanted, add a latest-only WebP-thumbnail bucket **then**, scoped by per-member storage RLS. Documented, deferred deliberately.

### 3.2 Character registry shape → columns on `members`, not a new table

D-02 locked **1 Discord handle = 1 character**. A separate `characters` table would be a 1:1 table with zero multi-tenancy payoff. Migration 0003 adds `members.char_class` (FK→ new `classes` table) + `members.char_function` (`tank`|`dps`, per REG-01's exact wording — extensible by one-line migration if the guild later needs more).

`classes(class_name text pk)` + admin-insert (REG-02). Ragnarok Origin adds classes over time; REG-02 wants UI extensibility, which RLS can grant safely (`role in ('officer','owner')`), unlike `stat_catalog` writes which stay service-role (CAT-01 self-service is v2).

### 3.3 Officer/admin member access → column-level security (closes a Phase 1 gap)

**Gap found:** 0002's `member_select_own` lets a member SELECT their own row *including `pin_hash`* (PostgREST would return it). Phase 2 makes officers list ALL members — that must never include `pin_hash`.

Fix (standard Postgres, works with PostgREST):
```sql
revoke select, insert, update, delete on members from anon, authenticated;
grant select (id, discord_handle, display_name, role, active, char_class, char_function, created_at)
  on members to authenticated;
grant update (display_name, char_class, char_function) on members to authenticated;
```
Plus RLS: `staff_select_all_members` (select, `auth.jwt()->>'role' in ('officer','owner')`) and `staff_update_characters` (update, same check). Role and pin_hash columns become **unreachable by any client credential** — even a compromised officer JWT cannot escalate.

**Critical PostgREST nuance:** with column grants, `select=*` FAILS (permission denied on pin_hash). All client queries MUST project explicit columns, e.g. `select=id,discord_handle,display_name,role,char_class,char_function`. The plans specify this everywhere.

### 3.4 Atomic submission insert → Postgres RPC `create_submission(jsonb)`

Two-call insert (submission, then stats) risks orphaned half-submissions; append-only means no cleanup path. PostgREST nested inserts exist but are unproven in this repo. Chosen: a small `security invoker` PL/pgSQL function in migration 0003 that:
1. derives `member_id` from `auth.jwt()` only (client cannot choose it),
2. rejects unknown stat_keys ( FK to catalog would too, but gives a clean error),
3. inserts submission + all submission_stats in ONE transaction.

`security invoker` = the existing RLS insert policies still apply row-by-row (defense in depth). Called via `POST /rest/v1/rpc/create_submission` with `{ "p_stats": [{ "stat_key": "...", "value": 123 }, ...] }` — values arrive as canonical numbers (parsed client-side).

### 3.5 Data access layer → raw-fetch REST client (matches the proven contract)

`supabase-js` is installed but **no app flow uses it** — LoginPage talks to `/functions/v1/verify-pin` with raw fetch. 01-02 proved the PostgREST gateway contract with raw fetch + both headers. A thin `src/lib/api.ts` (raw fetch, `{ apikey, Authorization: Bearer session.access_token }`) keeps every Phase 2 call on the exact proven pattern and sidesteps supabase-js session-management quirks with foreign JWTs. TanStack Query is wired in `main.tsx` and available for caching the catalog/classes.

### 3.6 pt-BR value parsing → port the spike's `parseValue`

`scripts/ocr-spike.mjs` exports the battle-tested rules (trim → strip trailing `%` → sign → `\d.,` charset → mixed separators `1.234.567,89` → `1234567.89` / single comma `12,34` → 12.34 / single dot with 3-digit tail = thousands). Port verbatim to `src/lib/parseStatValue.ts` (TS) with the same test cases; add `formatStatValue(n, value_type)` using `Intl.NumberFormat('pt-BR')` for the review-step preview. Manual entry uses the SAME parser so Phase 5 OCR output and human typing are normalized identically.

### 3.7 Capture-count reconciliation (PROJECT.md note)

INPT-01 locks 3 stat uploads (General, Quasi, Special). The spike-endorsed 4th "basic" header capture (job, nickname, combat power) reconciles as: header example shot shown on the wizard **intro step**; job/nickname are admin-registered (REG-01) not player-typed; `combat_power` is a manual optional input on the intro step backed by the catalog (Phase 5 OCR-fills it later). No capture-count change to INPT-01.

## 4. Pitfalls & constraints

- **PowerShell JSON:** seed application must be Node (`fetch`), never `Invoke-RestMethod`/`ConvertTo-Json` (01-01 proven failure).
- **Legacy Management API:** `https://api.supabase.com/v1/projects/{ref}/database/query` — the `/api/v1/*` GETs serve HTML and silently "succeed".
- **Sign the JWT headers on EVERY PostgREST call** — missing `Authorization` → empty results (RLS sees no claims), missing `apikey` → 401.
- **Do NOT touch `class_key_stats`** — it stays deny-all until Phase 3 (RNK-02).
- **`status` starts `pending`** — Phase 6's officer validation flips it; Phase 2 must NOT add any update path to submissions.
- **Free tier:** no new external services; everything is schema + SPA. No storage bucket.
- **Vitest runs node-env (no DOM)** — component tests are NOT feasible without adding testing libraries; keep tests pure-logic (parse, payload build, RLS behavior via live API smoke).
- **Example images:** placeholders are committed SVGs in `public/examples/`; the owner replaces them with real example screenshots before launch (owner action, listed in plan 02-03's checkpoint).

## 5. Validation Architecture

**Infrastructure:** Vitest 5 (devDep installed; `src/features/auth/session.test.ts` proves node-env pattern). Add `"test": "vitest run"` to package.json in 02-01 (currently no test script).

**Layers:**
1. **Pure unit (vitest):** `parseStatValue` (spike-identical cases incl. negatives, `%`, mixed separators), `buildStatsPayload` (required general+quasi, percent/type consistency, canonical numbers).
2. **Live API smoke (Node script, run during deploy task):** RLS matrix — anon→`[]`; member→own safe columns only (NO `pin_hash` key in response); member PATCH on `role` → permission denied; officer→all members safe columns; officer insert class→201; member insert class→denied; `create_submission` valid→uuid, unknown stat_key→error, other member's id ignored (JWT-derived).
3. **Human UAT (checkpoint, 02-03):** owner walks register-character→submit→resubmit in a real browser, confirms append-only history and DevTools leak-check.

**Sampling:** full vitest suite after every task commit (~5 s); live smoke after the deploy task; manual matrix at phase end. No watch-mode.

**Out of scope (validated elsewhere):** OCR behavior (Phase 5), rank math (Phase 3), officer validation queue UI (Phase 6).

## 6. Open items surfaced to the owner (no CONTEXT.md this phase)

Phase 2 was planned **without a CONTEXT.md** (yolo-mode run; `/gsd-discuss-phase 2` was not executed). Planner-discretion decisions that the owner should ratify at the 02-03 checkpoint or by reading this file:
- P2D-A: no server-side screenshot storage in v1 (§3.1)
- P2D-B: `char_function` limited to `tank`/`dps` (§3.2)
- P2D-C: General+Quasi wizard fields required, Special fields optional (EAV stores what was captured; Phase 3 percentiles are per-stat)
- P2D-D: catalog labels ship as franchise-universal acronyms/pt-BR short forms; owner can correct any label via one UPDATE seed before launch
- P2D-E: combat_power entered manually on intro step (header-screen reconciliation, §3.7)

---
*Phase 2 research complete — planning may proceed.*
