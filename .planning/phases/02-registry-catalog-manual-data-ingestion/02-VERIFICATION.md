---
phase: 02-registry-catalog-manual-data-ingestion
verified: 2026-10-09T15:57:33Z
status: passed
score: 12/12 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
notes: |
  Post-verification owner decision requested (escalation gate — does NOT block
  the phase goal, all must-haves verified): 02-REVIEW.md CR-01 (staff RLS
  policies lack the `active` check established by migration 0004 — a
  deactivated officer/owner keeps staff access until token expiry) and CR-02
  (repo's verify-pin references undeclared `discordHandle` at index.ts:58 —
  repo-vs-live drift; next `functions deploy` bricks all logins). Phase 1
  precedent fixed equivalent criticals via /gsd-code-review-fix before
  close-out; the owner can decide the same here. Neither finding fails a
  Phase 2 must-have; both are classified hardening debt in the report.
---

# Phase 2: Registry, Catalog & Manual Data Ingestion Verification Report

**Phase Goal:** Players can register and submit their stat data through a guided flow that works end-to-end even when OCR is unavailable — the ingestion data model and fix-up gate must be correct before OCR is layered on.
**Verified:** 2026-10-09T15:57:33Z
**Status:** passed
**Re-verification:** No — initial verification (no previous VERIFICATION.md existed)

## Goal Achievement

### Observable Truths

Merged from ROADMAP Phase 2 Success Criteria (contract) + PLAN frontmatter must-haves (02-01/02-02/02-03). Roadmap SCs are numbered 1–4; plan truths deduplicated into 5–12.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | (SC-1) Admin can register a character with name, class, function/role and add new classes as the game adds them | ✓ VERIFIED | `CharactersPage.tsx` inline edit (`handleSave` → `updateCharacter`, display_name/char_class/char_function) + `handleAddClass` → `createClass` with immediate dropdown refresh (lines 91–111); server side: 0005 column grants (UPDATE only on the 3 char columns) + 0006 staff policies on `member_role`; smoke checks 7/8/9 (officer class insert → 201, role PATCH denied, char PATCH re-read matches); owner UAT step 1 approved |
| 2 | (SC-2) Stat catalog covers all 3 groups with ~50+ stats labeled FLAT or PERCENTUAL | ✓ VERIFIED | `supabase/seeds/stat_catalog.sql`: exactly 57 tuples counted (general 15, quasi 26, special 16), each with `flat`/`percentual` value_type, re-runnable `on conflict do update`; smoke check 12 asserts 57 live rows; owner UAT walked all three groups' fields |
| 3 | (SC-3) Player completes guided flow with example shots beside inputs, manual entry/fix, submission rejected until mandatory review confirms | ✓ VERIFIED | `SubmitPage.tsx` 5-step flow (Personagem → Geral → Quasi → Especial → Revisão) with `/examples/*.svg` beside inputs (`StatGroupStep.tsx` lines 45–58); `ReviewStep.tsx` 3-checkbox gate — `Enviar` has `disabled={!allChecked \|\| submitting}` (line 128); server re-validates via `create_submission` RPC; owner UAT steps 2–4 approved (blank-field Continuar gating, 2-of-3 disabled, all-3 → `Envio registrado!`) |
| 4 | (SC-4) Submissions append-only — resubmission creates a new record, never overwrites | ✓ VERIFIED | 0005 RPC inserts only (no update/delete on submissions/submission_stats in ANY migration — grep across `supabase/migrations/*.sql` returns nothing); `HistoryList.tsx` renders own submissions with status, `Enviar novos status` restarts with fresh inputs; owner UAT step 5: two rows, both `Aguarda validação`, oldest untouched |
| 5 | pin_hash (and role writes) unreachable by any client credential | ✓ VERIFIED | 0005: `revoke select, insert, update, delete on members from anon, authenticated` + grant on 8 safe columns only; smoke checks 2/3/6/8 (member `select=*` denied, no pin_hash key in any response, officer role PATCH denied); `src/lib/api.ts` uses explicit projections only — no `select=*` anywhere in client code |
| 6 | Officers/owner read all members + update character fields server-side; members see only their own row | ✓ VERIFIED | 0006 drops/recreates the 3 staff policies reading `auth.jwt()->>'member_role'` (correct deployed claim — 0005's wrong-claim bug caught live by the smoke matrix); smoke checks 6 (officer ≥3 rows) + 9 (PATCH re-read matches); member own-row policy unchanged from 0002 |
| 7 | Classes table readable by authenticated, insertable only by officer/owner | ✓ VERIFIED | 0005 `authenticated_read_classes` + `staff_insert_classes` (claim fixed by 0006); smoke checks 4 (member reads, Assassin present) + 5 (member insert denied) + 7 (officer insert 201) |
| 8 | create_submission atomic, derives member_id from JWT only, accepts only catalog stat keys | ✓ VERIFIED | 0005 lines 46–76 read in full: `v_member := (auth.jwt()->>'member_id')::uuid` with `no_member_claim` guard, `unknown_stat_key` rejection, single-transaction insert into submissions + submission_stats; smoke checks 10 (unknown key rejected) + 11 (valid → uuid) |
| 9 | pt-BR stat values parse to canonical numbers with spike-identical rules | ✓ VERIFIED | `parseStatValue.ts` is a rule-for-rule port: `endsWith('%')`, `^\d{1,3}(\.\d{3})+,\d+$`, single-dot 3-digit-tail rule all present; 14 tests green; `formatStatValue` uses `Intl.NumberFormat('pt-BR')` |
| 10 | Personagens tab is staff-only UX; a member's direct API calls are refused by RLS | ✓ VERIFIED | `App.tsx`: `isStaff` gate on the button AND content (`showCharacters = tab === 'characters' && isStaff` — covers session-switch leak); enforcement is the 0006 staff policies (member reads get only own row — smoke-proven); owner UAT step 2 confirmed no tab for member |
| 11 | A member whose character is not registered (no char_class) sees the blocked state | ✓ VERIFIED | `SubmitPage.tsx` lines 169–178: `me.char_class === null` → role-scoped blocked copy (`Seu personagem ainda não foi registrado…`) |
| 12 | Screenshots never leave the player's device (no upload, no storage, no git) | ✓ VERIFIED | Grep gate `FormData|upload|storage` over `src/features/submit/*.tsx` returns NOTHING (re-run in this verification); only static `/examples/*.svg` reference images; `.secrets/` gitignored since Phase 1 |

**Score:** 12/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/0005_registry_catalog.sql` | classes table, char columns, column security, staff RLS, create_submission RPC | ✓ VERIFIED | All 9 plan gate strings present (`create table classes`, `char_function … check in ('tank','dps')`, full revoke, `staff_update_characters`, RPC + anon revoke). Numbered 0005 not 0003 — documented deviation (0003/0004 taken by Phase 1 review fixes; CLI rejects duplicates) |
| `supabase/migrations/0006_staff_claim_fix.sql` | corrective migration for the JWT claim contract | ✓ VERIFIED | Drops/recreates 3 staff policies reading `member_role` (addition beyond plan, required — plan SQL had the wrong claim) |
| `supabase/seeds/stat_catalog.sql` | 57-stat re-runnable upsert | ✓ VERIFIED | 57 tuples counted; `combat_power` present; `on conflict do update` |
| `supabase/seeds/classes.sql` | starter class list | ✓ VERIFIED | 15 tuples counted; `Assassin` present; `on conflict do nothing` |
| `scripts/apply-seed.mjs` | re-runnable seed applier | ✓ VERIFIED | Exists; Management API `/v1/projects/…/database/query` pattern |
| `scripts/smoke-rls.mjs` | 14-assertion live RLS matrix, committed + re-runnable | ✓ VERIFIED | Read in full: 12 PASS assertions + 2 cleanup lines, `RLS SMOKE PASSED` gate, exit non-zero on FAIL; re-read assertion for the PATCH (no 204 false positive); no token echoed |
| `src/lib/parseStatValue.ts` | parseStatValue + formatStatValue (pt-BR) | ✓ VERIFIED | Both exported; spike-identical rules; 14 tests green |
| `src/lib/api.ts` | REST client, 8 functions + ApiError, both headers | ✓ VERIFIED | All 8 exports present (`fetchCatalog`, `fetchClasses`, `fetchMe`, `fetchMembers`, `updateCharacter`, `createClass`, `createSubmission`, `fetchMySubmissions`); `apikey` + `Authorization: Bearer` on shared fetch; explicit member projection with explanatory comment; no supabase-js import; 7 tests green |
| `src/App.tsx` | tab shell (Painel / Personagens / Enviar Status) | ✓ VERIFIED | Phase 1 header preserved (`Olá`, role pill, `Sair`); `Personagens` gated on `member_role`; content-level staff re-check; `Enviar Status` for every role; Painel placeholder copy preserved |
| `src/features/admin/CharactersPage.tsx` | member table + inline edit + add-class form | ✓ VERIFIED | All Screen 2 strings present (`Salvar`, `Adicionar Classe`, `Nova classe`, `Classe "…" adicionada`, `Falha ao salvar`, `role="alert"`, loading/empty/error states); consumes api.ts only; no pin_hash reference |
| `src/features/submit/wizard.ts` | pure wizard logic | ✓ VERIFIED | Exports `buildStatsPayload`, `groupComplete`, `REQUIRED_GROUPS`, `WIZARD_GROUPS`; no React import; 13 tests green |
| `src/features/submit/StatGroupStep.tsx` | stat group inputs + example image + parse feedback | ✓ VERIFIED | `parseStatValue`/`formatStatValue` on blur, `Valor inválido — use números…` hint, `/examples/{group}.svg` side panel ≥128px on sm+ |
| `src/features/submit/ReviewStep.tsx` | mandatory review gate | ✓ VERIFIED | 3 `Revisei os valores…` checkboxes; `Enviar` `disabled={!allChecked \|\| submitting}`; confirmations reset on any input change (stale-confirmation guard); missingRequired defense rendering |
| `src/features/submit/HistoryList.tsx` | Minhas entradas | ✓ VERIFIED | `fetchMySubmissions`, pt-BR date formatter, status badges, `Você ainda não enviou status.`, `Enviar novos status` |
| `public/examples/{basic,general,quasi,special}.svg` | placeholder example shots | ✓ VERIFIED | All four exist, contain `Exemplo — …` text at the spike's 691×416 reference resolution. Intentional placeholder — owner-acknowledged pre-launch content swap (UAT step 8), not a stub in the wiring sense |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `src/lib/api.ts` | PostgREST /rest/v1 | raw fetch with apikey + `Authorization: Bearer ${session.access_token}` | ✓ WIRED | restFetch lines 54–62 — both headers on every call |
| migration 0005 `create_submission` | submissions + submission_stats (0001) | single-transaction insert, security invoker | ✓ WIRED | RPC inserts both tables in one function call; 0002 RLS still applies row-by-row |
| `src/lib/parseStatValue.ts` | ocr-spike.mjs parseValue | rule-identical port | ✓ WIRED | `endsWith('%')` + `\d{1,3}(\.\d{3})+,\d+` shapes present; 14 tests |
| `CharactersPage.tsx` | `src/lib/api.ts` | fetchMembers/fetchClasses/updateCharacter/createClass | ✓ WIRED | Imported at lines 12–19; all four called |
| `App.tsx` | `session.member_role` | tab visibility gate | ✓ WIRED | `isStaff` on both button and content render |
| `SubmitPage.tsx` | api.ts createSubmission | buildStatsPayload → POST /rpc/create_submission | ✓ WIRED | handleSubmit lines 125–146; result feeds createSubmission |
| `StatGroupStep.tsx` | parseStatValue.ts | parse on blur + formatStatValue preview | ✓ WIRED | Lines 10, 63; success/invalid hints under fields |
| `App.tsx` | SubmitPage | `Enviar Status` tab (all roles) | ✓ WIRED | Tab + `showSubmit` content branch render `<SubmitPage session={session} />` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| SubmitPage | me + catalog | `fetchMe` + `fetchCatalog` → live PostgREST | Yes (live, owner-UAT exercised) | ✓ FLOWING |
| StatGroupStep | inputs | parent state fed by 57-stat live catalog | Yes | ✓ FLOWING |
| HistoryList | rows | `fetchMySubmissions` → live submissions (RLS own-rows) | Yes (owner saw 2 rows) | ✓ FLOWING |
| CharactersPage | members + classes | `fetchMembers` + `fetchClasses` → live | Yes (officer saw 3 members live) | ✓ FLOWING |

Live-data claims rest on the committed, re-runnable `scripts/smoke-rls.mjs` (recorded PASS at execution, exit 0 with `RLS SMOKE PASSED`) and the owner's in-person browser UAT — independently corroborating evidence chains. Re-running the matrix requires owner-supplied `SUPABASE_ACCESS_TOKEN` (session env only, never committed — verified no token value in tree).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite green | `npx vitest run` | 75/75 passed (6 files) | ✓ PASS |
| TypeScript compiles | `npx tsc -b` | exit 0 | ✓ PASS |
| Production build | `npx vite build` | exit 0, 72 modules | ✓ PASS |
| pin_hash absent from client code paths | grep `pin_hash` over src/ | Only 2 explanatory comments in api.ts (no data path) | ✓ PASS |
| No upload path in submit feature | grep `FormData\|upload\|storage` over submit/*.tsx | Nothing | ✓ PASS |
| No submission update/delete in any migration | grep over supabase/migrations/*.sql | Nothing | ✓ PASS |
| Catalog seed = 57 tuples, 3 groups | counted | 15 general + 26 quasi + 16 special = 57 | ✓ PASS |
| Claimed task commits exist | `git log --oneline` | 285231f, 0692f35, 5a811d1, 64019ab, 3b0ac9b, c5cd150, ec67496, 820d35f, 91e4c25, 159fb7c all present | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| REG-01 | 02-02 | Admin registers character (name, class, function) | ✓ SATISFIED | CharactersPage inline edit + 0005 column grants + 0006 staff policy; officer PATCH live-proven (smoke check 9 re-read); owner UAT step 1 |
| REG-02 | 02-01, 02-02 | Class list extensible by admin | ✓ SATISFIED | Live staff-only insert (smoke checks 5/7) + add-class UI with immediate dropdown refresh; owner UAT step 1 |
| REG-03 | 02-01 | Catalog: 3 groups, ~50+ stats, FLAT/PERCENTUAL | ✓ SATISFIED | 57 stats seeded + live (smoke check 12), 15/26/16 per group, value_type labeled |
| INPT-01 | 02-03 | Guided 3-screenshot flow with example shots beside inputs | ✓ SATISFIED | 5-step wizard with example images per group; works with zero OCR; owner UAT steps 2–3 |
| INPT-03 | 02-03 | Mandatory review/fix-up gate before acceptance | ✓ SATISFIED | 3-checkbox gate disabling Enviar + server re-validation via RPC; owner UAT step 4 |
| INPT-04 | 02-01, 02-03 | Append-only immutable submissions | ✓ SATISFIED | RPC insert-only, no update/delete paths anywhere; two-row history owner-verified |

**Orphan check:** REQUIREMENTS.md maps exactly REG-01, REG-02, REG-03, INPT-01, INPT-03, INPT-04 to Phase 2 — identical to the union of plan frontmatter requirements. No orphans, no unmapped IDs. (INPT-02/OCR is Phase 5 by design.)

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `public/examples/*.svg` | — | Placeholder example shots | ℹ️ Info | Intentional and plan-specified; owner acknowledged at UAT step 8 and will swap real screenshots pre-launch. Goal (example shot beside every group) fully functional with placeholders |
| `SubmitPage.tsx` | 327–335 | Step-1 `Continuar` has no `disabled` on invalid `combat_power` (WR-03: silent step-2 block) | ⚠️ Warning | UX trap, not a must-have failure — optional field, no data corruption possible (unparseable optionals are dropped, never coerced) |
| `SubmitPage.tsx` / `CharactersPage.tsx` | 140–142 / 108–110, 147–148 | 401 on write paths shows generic retry copy instead of session copy (WR-04) | ⚠️ Warning | Misleading error UX on expired sessions; no security impact |
| (scan) | — | TODO/FIXME/console.log-stub/empty-return scans over all 22 phase files | ℹ️ Info | Only false positives (state label `todo`, "placeholder" in legitimate placeholder-account comments) |

### Code Review Findings — Goal-Impact Classification (02-REVIEW.md, 16 findings)

These are advisory findings, NOT plan must-haves. Classification per the goal-backward analysis:

| Finding | Severity in review | Affects Phase 2 goal? | Classification |
|---------|--------------------|-----------------------|----------------|
| **CR-01** — staff RLS policies (0005/0006) lack the `active` check that migration 0004 established; a deactivated officer/owner keeps staff access until JWT expiry (≤7 days) | Critical | **No** — no must-have truth or roadmap SC covers staff deactivation (removal flows are Phase 6; no deactivation path exists yet). But it violates the documented 0004 invariant and the AGENTS.md server-enforcement posture for the future removal mechanism | **Hardening debt — owner decision requested.** Recommended: corrective `0007` + smoke-matrix extension (fix pattern already drafted in 02-REVIEW.md), via `/gsd-code-review-fix` as Phase 1 did |
| **CR-02** — repo's `verify-pin/index.ts:58` references undeclared `discordHandle` (introduced by Phase 1 fix bd7b7ac); deployed function works (drift); next `functions deploy` from this tree returns 400 on every login | Critical | **No** — the LIVE flow works end-to-end (smoke matrix passed against the deployed function; owner UAT logged in repeatedly). The bug makes the pending owner action "redeploy verify-pin" a deploy-bricking hazard, not a current goal failure | **Hardening debt — owner decision requested.** Fix is a Phase 1 file; route via the 01 review-fix workflow. Blocks the standing "redeploy verify-pin" owner action until fixed |
| **WR-01/02** — `classes` default grants not revoked; `create_submission` anon EXECUTE revoke is a no-op vs PUBLIC | Warning | No — RLS currently blocks everything (fail-closed); single-layer-of-defense concern only | Hardening debt (corrective migration) |
| **WR-03** — step-1 Continuar ignores invalid combat_power | Warning | No — UX trap; optional field | Hardening debt (confirmed in code by this verification) |
| **WR-04–WR-07, IN-01–IN-07** — error-copy branching, cancel affordance, smoke data restore, input bounds, misc robustness | Warning/Info | No | Hardening debt |

None of the 16 findings falsifies a must-have truth, artifact, or key link. The two criticals are real (both confirmed by direct code read in this verification) and are surfaced for owner decision per the escalation-gate pattern; they do not block Phase 2 goal achievement.

### Human Verification Required

None — the phase's human-flow verification (owner browser UAT, 02-03 task 3) was performed and APPROVED in person on 2026-10-09: steps 1–5 and 8 walked manually (registration, member tab gating, guided entry with parse feedback, review gate, two-row append-only history, placeholder acknowledgment); steps 6–7 were dispositioned as covered by the automated live smoke matrix (member `select=*` denial, no pin_hash in any response, no upload path) — recorded honestly in 02-03-SUMMARY.md, and the equivalent guarantees re-confirmed by this verification's grep gates and the committed smoke script.

### Gaps Summary

No gaps. All 12 merged must-have truths verified against the codebase (existence, substance, wiring, data flow), all 6 phase requirement IDs satisfied with no orphans, all gates re-run green in this verification (vitest 75/75, tsc exit 0, vite build exit 0), all 10 claimed task commits present in git history, and both security grep gates (pin_hash, upload paths) re-confirmed.

**Owner decision requested (advisory, non-blocking):** whether to run `/gsd-code-review-fix` for review criticals CR-01 (staff `active` check — corrective migration 0007 pattern is drafted in 02-REVIEW.md) and CR-02 (verify-pin repo bug + repo-vs-live drift, which blocks the standing "redeploy verify-pin" owner action) before close-out, following the Phase 1 precedent.

---

_Verified: 2026-10-09T15:57:33Z_
_Verifier: OpenCode (gsd-verifier)_
