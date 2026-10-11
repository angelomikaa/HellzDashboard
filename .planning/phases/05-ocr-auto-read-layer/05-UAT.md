---
status: pending-owner-walk
phase: 05-ocr-auto-read-layer
source: [05-05-PLAN.md, 05-04-SUMMARY.md, 05-02-SUMMARY.md]
build_tested: "commit 8d7e6d3 — vite preview of the production-shaped dist (src tree identical to c95c794, the 05-04 wizard wiring)"
server: "http://localhost:4173 (vite preview — running)"
started: 2026-10-11T21:23:18Z
updated: 2026-10-11T21:23:18Z
---

# Phase 5 Owner UAT — OCR Auto-Read Layer (INPT-02 end-to-end)

**Purpose:** close INPT-02's three success criteria with the owner's eyes in a real browser using REAL guild screenshots (`.secrets/ocr-samples/` — sampbasic.png, sampideal1-3.png, common samples; D-09/D-10 discipline: they never enter git or the network).

**Automated gates:** re-run in one consolidated pass on 2026-10-11 (task 1 of 05-05) — all results recorded below before this walk.

---

## Automated Gate Results (task 1 — recorded 2026-10-11)

| # | Gate | Result | Evidence |
|---|------|--------|----------|
| 1 | `npx vitest run` (full suite) | **PASS** | 12 test files, **179/179 tests green** |
| 2 | `npx tsc -b` | **PASS** | clean, zero errors |
| 3 | `npm run build` | **PASS** | green; prebuild regenerated `public/ocr`; entry `index-C2Plt_5x.js` (302.53 kB) + lazy `ocr-DyKqMXa6.js` (20.53 kB) — same chunk hashes as the 05-04 proof (byte-stable tree) |
| 4 | `Test-Path dist/ocr/worker.min.js` / `dist/ocr/core/tesseract-core-simd-lstm.wasm` | **PASS** | True / True (self-hosted assets ship in dist) |
| 5 | `Select-String dist/assets/index-*.js -Pattern "createWorker"` | **PASS** | **0 matches** in the entry chunk (lazy-chunk proof; the dedicated `ocr-*.js` chunk holds the 1 match) |
| 6 | `Select-String src/features/submit/*.tsx,src/features/submit/ocr/*.ts -Pattern "FormData"` | **PASS** | **0 matches** (D-10 — no upload machinery of any kind) |
| 7 | `node scripts/smoke-lifecycle.mjs` | **AUTH-GATED** | pre-flight abort: `Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF` — zero live-data contact (see note) |
| 8 | `node scripts/smoke-rank.mjs` | **AUTH-GATED** | same pre-flight abort (see note) |

### Live-smoke disposition (gates 7–8)

`SUPABASE_ACCESS_TOKEN` is **not available in this session** (it is only ever a session env var — never on disk, never committed; 03-02/05-02 precedent). Both smokes abort loudly before touching any live data — an auth gate, not a failure.

The standing live evidence from **05-02 (2026-10-11)** remains valid and is the current disposition:

- migration **0010 pushed live** (dry-run confirmed it was the only pending migration)
- **LIFECYCLE SMOKE PASSED 11/11, twice consecutively** (no residue — pre-run + finally cleanup)
- **RANK SMOKE PASSED** (the 0009→0010 function replacement caused no rank regression)
- **nothing server-side has changed since**: 05-03 (wizard realignment) and 05-04 (OCR wiring) were client-only commits — no migrations, no function deploys

**OPTIONAL during the walk:** if the owner wants a fresh live re-run of either smoke, supply `SUPABASE_ACCESS_TOKEN` (+ `SUPABASE_PROJECT_REF` if not defaulted) as a session env var and OpenCode will run both — same discipline as 03-02/05-02. Otherwise the recorded 05-02 live evidence stands (02-03 "covered-by-automated-evidence" precedent).

**Preview server:** running the production-shaped build at **http://localhost:4173** (HTTP 200 verified).

---

## Owner Browser Walk — 11 steps (result: PENDING)

Use your real screenshots from `.secrets/ocr-samples/`. Expected behavior per step, from the locked 05-05 plan / 05-UI-SPEC:

### Step 1 — Login + wizard entry
- **expected:** Login as a whitelisted member → open **Enviar Status**. Every capture step shows the upload CTA `Faça upload dos seus status aqui`; **Continuar stays disabled** on every step until the step's verification checkbox is checked.
- **result:** pending
- **owner notes:** —

### Step 2 — Basic capture (step 1, Poder de Combate)
- **expected:** upload `sampbasic.png` (or your real basic header shot) → inputs show the skeleton (`Lendo captura…`, disabled) → **Poder de Combate pre-fills** → status line `Leitura concluída`. Check the step-1 checkbox → Continuar enables. Now change the combat_power value by hand → the checkbox **unchecks itself** (stale-confirmation reset); re-check it.
- **result:** pending
- **owner notes:** —

### Step 3 — Geral (step 2, 14 fields)
- **expected:** upload your general screenshot → **all 14 fields pre-fill** → fix at least one value manually (the checkbox unchecks) → re-check → Continuar.
- **result:** pending
- **owner notes:** —

### Step 4 — Quasi (step 3)
- **expected:** upload your quasi screenshot → fields pre-fill → check → Continuar.
- **result:** pending
- **owner notes:** —

### Step 5 — Especial (step 4, mandatory)
- **expected:** upload your special screenshot → fields pre-fill, and **`Dano vs Humanoide` (dmg_vs_demi_human) is BLANK** with the message `O valor não foi detectado na print - Por favor preencha o campo manualmente` (intentionally not in the region map) → fill it manually (message clears) → check → Continuar. A blank Especial field **BLOCKS** Continuar (Especial is mandatory).
- **result:** pending
- **owner notes:** —

### Step 6 — Revisão (step 5)
- **expected:** grouped summary with tap-to-fix; **NO checkboxes here**; Enviar enabled → submit → `Envio registrado!`.
- **result:** pending
- **owner notes:** —

### Step 7 — Re-upload semantics (replace-all-displayed, D-15)
- **expected:** start a new submission (`Enviar novos status`), upload a group shot, then upload a DIFFERENT shot of the same group → values are **replaced by the fresh read** (detected overwrite; failed/unmapped fields go blank + failure message).
- **result:** pending
- **owner notes:** —

### Step 8 — Crop trigger (D-05)
- **expected:** upload a FULL phone screenshot (with surrounding UI) on any step → the crop overlay appears (`Ajuste o recorte da captura`, aspect-locked box, drag + corner resize) → crop roughly to the panel → `Usar recorte` → the read proceeds. In a second attempt press `Enviar sem recortar` → the read is **CANCELLED**: no garbage pre-fill, fields stay blank, manual entry continues.
- **result:** pending
- **owner notes:** —

### Step 9 — Lifecycle (D-11)
- **expected:** submit once, then submit again with different values → **Minhas entradas** shows the first row as **Descartado** (muted) and the new one as **Aguarda validação**.
- **result:** pending
- **owner notes:** —

### Step 10 — DevTools (criterion 3 + D-10, T-05-15)
- **expected:** with the Network tab open: **(a)** NO image bytes are ever sent — the only requests are the panel's own API calls; **(b)** on FIRST upload only, the OCR chunk + `/ocr/worker.min.js` + a `/ocr/core/*.wasm` load — and none of these were loaded at page load before the first upload; **(c)** reload the page → Painel still makes **exactly one `/rpc/my_report` request** (no key-stat leak regression).
- **result:** pending
- **owner notes:** —

### Step 11 — Manual-only path (criterion 3)
- **expected:** start a new submission and complete it with **ZERO uploads** (type everything, including Especial) → submits fine.
- **result:** pending
- **owner notes:** —

---

## Deviations from Expected Behavior

*(none recorded yet — owner reports go here verbatim; each gets a disposition: accepted / needs-fix → becomes a gap plan and feeds /gsd-verify-work)*

## Verdict

**OWNER UAT: PENDING — awaiting the owner's walk of steps 1–11.**

Resume signal: type **"approved"** to accept, or describe any step that behaved differently (step number + what you saw). Optional: supply `SUPABASE_ACCESS_TOKEN` as a session env var for a fresh live smoke re-run (gates 7–8) during the same session.
