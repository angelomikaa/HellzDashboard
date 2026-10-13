---
status: complete
phase: 06-trust-celebration-officer-tools-promotion-page
source: [06-07-PLAN.md, 06-UI-SPEC.md, 06-02-SUMMARY.md, 06-04-SUMMARY.md, 06-05-SUMMARY.md, 06-06-SUMMARY.md]
build_tested: "vite preview of the production dist — see the Environment Note below (first attempt hit a STALE dist; re-walked on a fresh `npm run build` with all Phase 6 markers present)"
server: "http://localhost:4173 (vite preview — always run `npm run build` before `npm run preview`; see How to resume)"
started: 2026-10-13T00:45:00Z
updated: 2026-10-13T01:15:00Z
---

# Phase 6 Owner UAT — Trust, Celebration & Officer Tools (AUTH-03/AUTH-04/AUTH-05/SHWC-02 end-to-end)

**Purpose:** close Phase 6's security-critical surfaces with the owner's eyes in a real browser: the Validações officer queue (AUTH-05), the Destaques EAFC promotion page incl. the RNK-02 DevTools leak proof (SHWC-02/T-06-05), the Personagens owner/staff controls (AUTH-03/AUTH-04, D-08), owner-only class creation (D-09), and the D-06 wording ratification.

**Automated gates:** re-run in one consolidated pass on 2026-10-13 (task 1 of 06-07) — all 7 gates green (recorded below) before this walk.

---

## Automated Gate Results (task 1 — recorded 2026-10-13)

| # | Gate | Result | Evidence |
|---|------|--------|----------|
| 1 | `npm test` (full suite) | **PASS** | **284/284 tests green** |
| 2 | `npx tsc -b` | **PASS** | clean, zero errors |
| 3 | `node scripts/smoke-officer.mjs` | **PASS** | **OFFICER 39/39** (staff queue CRUD, role grant/revoke D-10, deactivation kill-switch, zero residue) |
| 4 | `node scripts/smoke-promotion.mjs` | **PASS** | **PROMOTION 21/21** (member-boundary get_promotion, ZERO key-stat leak-diff + D-13 hiding) |
| 5 | `node scripts/smoke-rls.mjs` | **PASS** | **RLS PASSED** (check 7 now green — officer class insert policy flipped by 0011) |
| 6 | `node scripts/smoke-rank.mjs` | **PASS** | **RANK PASSED** (no 0011 cohort-supersession regression; 27/27 exact-value contract held) |
| 7 | `node scripts/smoke-lifecycle.mjs` | **PASS** | **LIFECYCLE 11/11** (discard-status contract intact; zero residue) |

All 7 commands exit 0 — the phase gate for the walk was met.

---

## Owner Browser Walk — 14 steps (result: OWNER UAT: APPROVED 2026-10-13)

**Owner verdict (verbatim): "all approved - lets procede"** — all 14 steps PASS. D-06 wording ratified: **KEEP "Rejeitado"** as shipped.

### Validações (AUTH-05) — officer session

### Step 1 — Queue visibility + ordering
- **expected:** Validações tab visible; open — pending submissions listed newest-first with player name, class, function, date.
- **result:** PASS
- **owner notes:** —

### Step 2 — Read-only 57-value review
- **expected:** tap a row — expands showing all 57 values grouped Geral/Quasi/Especial, read-only (no inputs anywhere).
- **result:** PASS
- **owner notes:** —

### Step 3 — Reject flow with locked copy
- **expected:** tap Rejeitar — confirm modal with the locked copy; confirm — row leaves the queue, success line `Envio rejeitado.` appears.
- **result:** PASS
- **owner notes:** —

### Step 4 — Rejected player view + rank revert
- **expected:** as the rejected PLAYER — history shows the rejection status label, Painel ranks reverted to the last validated submission (compute-on-read).
- **result:** PASS
- **owner notes:** —

### Step 5 — Validate flow
- **expected:** back as officer — tap Validar on another pending row, confirm — row leaves; that player's Painel now counts the validated values.
- **result:** PASS
- **owner notes:** —

### Destaques (SHWC-02) — ordinary member session

### Step 6 — Per-class EAFC cards
- **expected:** Destaques tab visible; open — one section per class with top-5 EAFC cards: big tier-colored OVR, function badge (Tank/DPS), name, class, and 6 highlight facets with points chips.
- **result:** PASS
- **owner notes:** —

### Step 7 — No key-stat labeling
- **expected:** NO card shows any 'key stat'/'principal' labeling or ordering explanation — just tier colors.
- **result:** PASS
- **owner notes:** —

### Step 8 — DevTools leak proof (T-06-05)
- **expected:** DevTools Network: exactly ONE /rpc/get_promotion request; response contains no key-stat config fields (no is_key-like keys; highlight stat_keys do NOT match the class's key set).
- **result:** PASS
- **owner notes:** —

### Personagens owner controls (AUTH-03/AUTH-04) — owner session

### Step 9 — Controles column (D-08 matrix)
- **expected:** Conceder oficial/Revogar oficial + Remover/Reativar on member AND officer rows; owner's own row shows '—'.
- **result:** PASS
- **owner notes:** —

### Step 10 — Grant/revoke with next-login copy
- **expected:** grant an officer on a member, revoke again — success copy `Efetivo no próximo login.` both times; role-change modals confirm with 'Conceder oficial'/'Revogar oficial' buttons.
- **result:** PASS
- **owner notes:** —

### Step 11 — Remove/reactivate a member
- **expected:** remove an ordinary member → confirm modal → row goes dim (opacity); member's next login FAILS; reactivate → login works again.
- **result:** PASS
- **owner notes:** —

### Personagens staff controls — officer session (D-08)

### Step 12 — Officer-differentiated controls
- **expected:** officer sees Remover/Reativar on ordinary member rows (remove → confirm → row dims; reactivate works) — but NO Conceder/Revogar buttons anywhere, '—' on officer and owner rows, and the Nova classe form ABSENT.
- **result:** PASS
- **owner notes:** —

### Owner add-class (D-09)

### Step 13 — Owner-only class creation
- **expected:** back as the OWNER, add a class — works.
- **result:** PASS
- **owner notes:** —

### D-06 wording ratification (step 14 — MANDATORY decision)

### Step 14 — History label: "Rejeitado" vs "Rejeitada"
- **expected:** owner decision — KEEP the shipped "Rejeitado" (grammatical agreement with the row subject "Envio de …", per UI-SPEC) or FLIP to CONTEXT D-06's literal "Rejeitada" (one-line change either way).
- **result:** PASS — **DECISION: KEEP "Rejeitado"** (owner approved the shipped wording without requesting the flip). No code change; `STATUS_LABELS.rejected` stays as-is.
- **owner notes:** —

---

## Environment Note (documented, NOT a defect)

**Stale dist/ on the first walk attempt.** The first UAT walk served a `dist/` built at 19:20 — BEFORE the Phase 6 UI plans (06-04/06-05/06-06) — so `npm run preview` served the Phase 5 app and the walk could not proceed meaningfully. Root-caused by the orchestrator: `vite preview` serves whatever `dist/` contains and never rebuilds.

**Fix:** a fresh `npm run build` (green) — the new bundle carries all Phase 6 markers (`destaques`, `get_promotion`, `Envio rejeitado`, `Efetivo no pr`), and the re-walk on the fresh build passed all 14 steps above.

**Lesson (recorded in STATE.md as a standing decision):** Phase 6 UI plans were verified via `tsc -b` + `npm test` only; preview-based UAT ALWAYS requires a fresh `npm run build` before `npm run preview`. This is an environment/process note, not a product defect — no code was changed for it.

---

## Dispositions

- **No defects found** — zero fix rounds needed; the walk passed on the first fresh-build pass.
- **D-06:** ratified as shipped — "Rejeitado" kept (STATUS_LABELS.rejected unchanged).
- **T-06-05** (get_promotion leak): closed by owner-witnessed DevTools proof (step 8) complementing the 06-02 automated leak-diff smoke.
- **T-06-01..04** (staff/owner boundaries): each walked with real role sessions (steps 1–13); server-side enforcement was already smoke-proven in 06-02 — this walk is the human-witnessed complement.

---

## How to resume

*(COMPLETED 2026-10-13 — walk APPROVED; kept for history.)*

1. Run `npm run build` (fresh dist — mandatory, see the Environment Note), then `npm run preview` (http://localhost:4173).
2. Walk steps 1–14 above with real sessions (officer / rejected player / member / owner / officer).
3. Reply **"approved"** with the D-06 wording call, or report the step numbers + observed behavior.
4. The continuation session fills the verdicts in this file, writes 06-07-SUMMARY.md, and the phase verification chain (/gsd-verify-work → /gsd-transition) runs.
