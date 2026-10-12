---
phase: 05-ocr-auto-read-layer
reviewed: 2026-10-12T00:00:00Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - .gitignore
  - package.json
  - scripts/copy-ocr-assets.mjs
  - scripts/ocr-browserport-harness.test.mjs
  - scripts/ocr-spike-structural.mjs
  - scripts/smoke-lifecycle.mjs
  - src/features/submit/CropOverlay.tsx
  - src/features/submit/HistoryList.tsx
  - src/features/submit/OcrCapture.test.ts
  - src/features/submit/OcrCapture.tsx
  - src/features/submit/ReviewStep.tsx
  - src/features/submit/StatGroupStep.tsx
  - src/features/submit/SubmitPage.tsx
  - src/features/submit/fieldValidation.ts
  - src/features/submit/ocr/index.ts
  - src/features/submit/ocr/locate.ts
  - src/features/submit/ocr/preprocess.test.ts
  - src/features/submit/ocr/preprocess.ts
  - src/features/submit/ocr/recognize.ts
  - src/features/submit/ocr/regions.ts
  - src/features/submit/ocr/sanity.test.ts
  - src/features/submit/ocr/sanity.ts
  - src/features/submit/ocr/structure.ts
  - src/features/submit/wizard.test.ts
  - src/features/submit/wizard.ts
  - src/lib/api.ts
  - supabase/migrations/0010_discard_lifecycle.sql
  - supabase/seeds/stat_catalog.sql
findings:
  critical: 1
  warning: 4
  info: 7
  total: 12
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-10-12T00:00:00Z
**Depth:** standard
**Files Reviewed:** 27
**Status:** issues_found

## Summary

The structural OCR port (structure.ts/locate.ts vs scripts/ocr-spike-structural.mjs) was verified function-by-function against the spike — the detection primitives, thresholds, rect clamping, order/label mode split, conflict resolution, and pill anchoring are faithful ports, and the 0010 `my_report`/`class_top5` bodies are exact copies of 0009 with precisely the claimed one-line cohort-filter change each (verified by diff). The wizard/OCR UI wiring (D-08/D-14/D-15/D-17 single-edit-path, replace-wholesale failure sets, lazy tesseract boundary) is sound.

The serious problem is server-side: `create_submission` performs **no numeric validation** on stat values, so one authenticated member can poison the rank cohort for their entire class (NaN/Infinity are storable, and pending rows are inside the cohort). Secondary issues: an ineffective EXECUTE revoke in 0010 that deviates from the project's own 0009 hygiene pattern, a worker/whitelist race reachable through step navigation during an in-flight read, a stale-measurement crop bug, and duplicate-stat-key nondeterminism.

## Critical Issues

### CR-01: create_submission accepts NaN/Infinity stat values — one submission can break my_report for the whole class cohort

**File:** `supabase/migrations/0010_discard_lifecycle.sql:104-106` (inherited from 0005:70-72)
**Issue:** The only input validation is `jsonb_typeof(p_stats) = 'array'` and stat-key existence. Values are cast blind: `(e->>'value')::numeric`. Postgres `numeric` accepts the strings `'NaN'` and `'Infinity'`, so a member sending `{"p_stats":[{"stat_key":"hp","value":"NaN"}]}` via direct REST (same access the smoke script uses) stores a non-finite value. Because the D-12 cohort filter (`status not in ('rejected','discarded')`) **includes pending rows**, the poisoned value immediately enters the cohort: `avg(value)` → NaN, `max(value)` → NaN (numeric NaN sorts above everything), and the `cb.value < o.value` / `ct.value = o.value` rank comparisons silently misbehave (NaN comparisons are false). Serializing NaN into the `jsonb_build_object` output then raises (or emits non-JSON), so `my_report()` — a core member-facing endpoint — fails for **every member of that class**, not just the offender, until an officer manually rejects the submission. This violates the project rule "missing input validation" / "non-whitelisted access blocked at the server": the whitelisted path itself is unvalidated. Unbounded finite magnitudes (e.g. `1e30` HP) similarly drag `class_average`/`best` for the whole cohort pre-validation, well past anything the client-side sanity ranges would allow.
**Fix:** Validate every element before the discard/insert, e.g.:

```sql
if exists (
  select 1 from jsonb_array_elements(p_stats) e
  where jsonb_typeof(e->'value') <> 'number'
     or (e->>'value')::numeric::text in ('NaN','Infinity','-Infinity')
     or abs((e->>'value')::numeric) > 1e9
) then
  raise exception 'invalid_stat_value';
end if;
```

(Adjust the magnitude bound per stat family, or reuse the sanity ranges as a shared DB-side table so client and server gates agree.)

## Warnings

### WR-01: Concurrent OCR reads share one worker whose whitelist is worker-global — reads can execute under the wrong whitelist

**File:** `src/features/submit/ocr/recognize.ts:74, 204-209` (reachable via `src/features/submit/OcrCapture.tsx:182-205` and `src/features/submit/SubmitPage.tsx:132, 325-327`)
**Issue:** `workerPromise` is a module-level singleton shared by every `OcrCapture` instance, and each `ocrRect` does `await worker.setParameters({ tessedit_char_whitelist })` before `recognize`. With two concurrent `readScreenshot` calls, the sequences `A.set(digits) → B.set(letters) → A.recognize → B.recognize` interleave (each `await` is an independent coroutine; nothing serializes set+recognize pairs), so a value crop can be OCR'd under the **letters** whitelist or a label crop under **digits** — corrupted reads, wrong pre-fills. The race is concretely reachable: start a read on step 2, press `Voltar` (no gate), start a read on step 1 — the unmounted step-2 instance's read is still in flight. Additionally `ocrRunningStep` is a single slot: step 2's `onRunStateChange(false)` resets it to `null` while step 1's read is running, re-enabling inputs mid-read (D-17 violation). Note `SubmitPage` never passes `disabled` to `OcrCapture`, so nothing cross-step blocks this.
**Fix:** Serialize reads at the module level (a simple promise-chain mutex around `readScreenshot`'s body), or create/terminate a worker per read. Also make `onRunStateChange` ref-counted (or pass the owning step and ignore stale completions) so one step's completion cannot clear another's running state.

### WR-02: CropOverlay measures the displayed size once — resizing the window while open descales the crop

**File:** `src/features/submit/CropOverlay.tsx:134-146, 191-195`
**Issue:** `imgSize` (canvas `clientWidth/Height`) and `box` are captured once in the mount effect. The canvas is CSS-constrained (`max-h-[80vh] max-w-full`), so a viewport resize or device orientation change while the overlay is open changes the displayed size but not the state. `handleConfirm` then computes `scaleX = bitmap.width / imgSize.w` from the **stale** display size while the box pixels correspond to the old layout — the cropped region no longer matches what the user drew/see, producing a silently wrong crop that feeds the read.
**Fix:** Re-measure on resize (a `ResizeObserver` on the canvas, or a `window` resize listener) and re-clamp/re-scale the box; or compute the scale factors from the canvas's *current* client size at confirm time and keep the box in normalized [0..1] coordinates.

### WR-03: 0010's `revoke execute ... from anon` is a no-op — the PUBLIC EXECUTE grant remains

**File:** `supabase/migrations/0010_discard_lifecycle.sql:110` (same gap in 0005:76)
**Issue:** Postgres grants `EXECUTE` to `PUBLIC` at function creation, and every role is implicitly a member of `PUBLIC`; revoking from `anon` alone removes nothing that `anon` effectively holds. The codebase's own established hygiene pattern (0009, "WR-02 lesson") is `revoke execute ... from public, anon; grant execute ... to authenticated;` — 0010 applies only the first half against `anon`, so unauthenticated callers can still invoke `create_submission`. Mitigated today by the `no_member_claim` raise (no writes occur), but it contradicts the project's non-negotiable "non-whitelisted access blocked at the server" rule and the 0009 precedent.
**Fix:** `revoke execute on function create_submission(jsonb) from public, anon; grant execute on function create_submission(jsonb) to authenticated;`

### WR-04: create_submission accepts duplicate stat_keys — "latest value" becomes nondeterministic

**File:** `supabase/migrations/0010_discard_lifecycle.sql:104-106` (consumer: `my_report` distinct-on at 153-158, 267-272)
**Issue:** The stats insert maps `jsonb_array_elements` row-by-row with no duplicate check, so `p_stats` containing `hp` twice inserts two `submission_stats` rows in the same submission. The cohort CTEs pick the latest per `(member_id, stat_key)` with `order by ... sub.submitted_at desc` — both duplicates share one `submitted_at`, so `DISTINCT ON` returns an **arbitrary** one. A member can inject ambiguity into their own cohort values via direct REST; the client can't produce it, but the server accepts it.
**Fix:** Either dedupe (`select distinct on (e->>'stat_key') ...` with a defined order) or reject: raise `duplicate_stat_key` when `(select count(distinct e->>'stat_key') from jsonb_array_elements(p_stats) e) <> jsonb_array_length(p_stats)`.

## Info

### IN-01: `scoreLabelPair` has a latent `o.includes('')` trap when a vocab label resolves empty

**File:** `src/features/submit/ocr/structure.ts:383-394, 406`
**Issue:** `matchLabel` looks up `GAME_LABELS[key] ?? ''`; for an empty expected label, `o.includes('')` is always true, scoring `85 - len` for **any** observed string. Unreachable with the shipped vocabulary (every grammar key has a label), but one future vocab edit away from silently matching garbage labels.
**Fix:** Guard in `scoreLabelPair`: `if (e === '') return -Infinity` (and/or make `GAME_LABELS` exhaustive with `satisfies Record<string, string>` keyed by the grammar unions).

### IN-02: Levenshtein floor (maxDist ≥ 2) lets 1–2 char noise labels match short vocab labels in label mode

**File:** `src/features/submit/ocr/structure.ts:390`
**Issue:** `maxDist = max(2, floor(0.25 * min(len)))` means a 1–2 char OCR noise read (e.g. `"sp"` misread) matches `"hp"` at score 75 — above the 0 acceptance floor. Spike-verbatim and only reachable in label mode (scroll mixtures), but it's the kind of misassignment the mandatory manual fix-up then has to catch.
**Fix:** Consider a per-pair length-relative floor (e.g. `maxDist = floor(0.25 * min(len))` with no absolute minimum of 2, or require `min(len) >= 3` for distance matching).

### IN-03: ImageBitmap leaks if the component unmounts while the crop overlay is open

**File:** `src/features/submit/OcrCapture.tsx:196, 207-224`
**Issue:** When `needsCrop` fires, the decoded bitmap is parked in `cropBitmap` state and only closed on confirm/cancel. Navigating away (unmount) while the modal is open skips both paths — no unmount cleanup closes it. GC eventually reclaims it, but the documented T-05-11 "bytes die with the read" invariant is only held on the happy paths.
**Fix:** Add a `useEffect` cleanup that closes `cropBitmap` on unmount (or close it in the parent's step-unmount path).

### IN-04: 403 responses surface the "check your connection" copy instead of the session copy

**File:** `src/lib/api.ts:66-70`
**Issue:** `restFetch` maps only 401 to `'unauthorized'`; a 403 (e.g. role/active revoked mid-session on a staff endpoint) becomes `'server'`, and `HistoryList`/`SubmitPage` render NETWORK_ERROR ("Verifique sua conexão") — misleading for a permission problem, though still enumeration-safe.
**Fix:** Map 403 to `'unauthorized'` as well (both call sites already render the same re-login copy), or add a third copy tier.

### IN-05: Constraint lookup takes an arbitrary match if several check constraints mention 'status'

**File:** `supabase/migrations/0010_discard_lifecycle.sql:31-37`
**Issue:** `select conname into cn ... ilike '%status%'` without `strict`/an aggregation silently picks the first row if `submissions` ever carries more than one status-related check constraint — the wrong constraint could be dropped without error.
**Fix:** Use `select conname into cn ... order by conname limit 1` with an explicit expectation, or better: match on the known definition (`pg_get_constraintdef(oid) ilike '%status%'` plus `array_length(...)`/count assertion) and raise if the match is not unique.

### IN-06: OCR asset availability silently depends on npm lifecycle hooks

**File:** `package.json:13-15`
**Issue:** `public/ocr/` is gitignored and regenerated only by the `predev`/`prebuild` hooks. Deploy pipelines that run `vite build` directly (or strip npm lifecycle scripts, e.g. some pnpm/CI configurations) ship without `/ocr/worker.min.js` and `/ocr/core/*` — the worker init rejects and every read lands in the D-18 failed state with no diagnostic. The graceful fallback exists, but the misconfiguration is invisible.
**Fix:** Invoke the copy inside the build script itself: `"build": "node scripts/copy-ocr-assets.mjs && tsc -b && vite build"` (keeps `predev` for DX).

### IN-07: smoke-lifecycle's .env loader doesn't strip quotes

**File:** `scripts/smoke-lifecycle.mjs:42-54`
**Issue:** `loadEnvFile` captures the raw value (`(.*)`), so a Vite-style quoted value (`VITE_SUPABASE_URL="https://…"`) yields a URL with literal quotes and every fetch fails with an opaque connection error.
**Fix:** Strip surrounding quotes after the match: `env[m[1]] = m[2].replace(/^["']|["']$/g, '')`.

---

_Positive notes (verified, not assumed):_ the structure.ts/locate.ts port matches the spike function-for-function (thresholds, run merging, rect clamping, order-mode key assignment including the single-column fallthrough to label mode, pill dominant-mass anchoring); the 0010 RPC bodies are exact 0009 copies with only the documented cohort-filter line changed; the lazy-import boundary (`import type` from `./ocr`, static data-only `regions` import) keeps tesseract out of the entry bundle; secrets/samples discipline (gitignored `.secrets/`, no image bytes in the repo, env-only management token) is respected throughout.

_Reviewed: 2026-10-12T00:00:00Z_
_Reviewer: OpenCode (gsd-code-reviewer)_
_Depth: standard_
