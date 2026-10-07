# Project Research Summary

**Project:** NeoFoot — Ragnarok Origin guild stats web panel
**Domain:** Internal guild tool — OCR data entry + percentile ranking, single guild, EAFC-style cards
**Researched:** 2026-10-07
**Confidence:** MEDIUM-HIGH (stack/architecture verified against official docs; OCR accuracy and auth wiring flagged for early spikes)

## Executive Summary

NeoFoot is a single-guild stat-tracking panel for Ragnarok Origin: members submit 3 screenshots of their stat screens (General / Quasi / Special), OCR pre-fills the values, a mandatory manual fix-up gate guarantees correctness, and Postgres computes EAFC-style percentiles and an OVR from 6 admin-tweakable, member-hidden key stats. Expert consensus for this product family (EAFC card sites, WoW guild trackers, MMO dashboards) converges on the simplest possible shape: **a thin React SPA + Supabase (Postgres + RLS + Storage + one Edge Function), with all rank math in Postgres and all security in RLS** — no custom backend, no servers to manage.

The recommended stack is React 19 + TypeScript + Vite + Tailwind v4 + Supabase free tier (limits verified: 500 MB DB, 1 GB storage, 50k MAU, 500k Edge Function invocations), with Tesseract.js v7 running client-side in a Web Worker (zero server cost — Supabase Edge Functions' 2s CPU cap rules out server-side OCR), TanStack Query for server state, and zod for OCR-output validation. Percentiles and OVR are computed **on-read** in Postgres RPCs so admin key-stat changes apply instantly and the key-stat config never crosses the API boundary to members.

The two biggest risks are (1) **OCR accuracy collapse** on stylized game-UI screenshots — mitigated by region-based recognition (never whole-image), digit whitelisting, canvas preprocessing, confidence-triggered fix-up, and an early spike: if field accuracy is below ~70% on real guild screenshots, pivot to manual entry (the fix-up form ships identically either way, so the launch is never bet on OCR); and (2) **the PIN auth model** — Pitfall research strongly recommends **per-player PINs** (hashed, rate-limited server-side) for identity and anti-forgery, while PROJECT.md's model describes a single shared panel PIN + officer elevation. This conflict must be resolved at requirements time; whichever is chosen, RLS-ready schema and rate limiting are day-one concerns. Secondary risks: percentile math degenerating at guild sample sizes (n=15–40) and Supabase free-tier pausing/limits.

## Key Findings

### Recommended Stack

All versions verified against the npm registry and official Supabase/Tesseract.js docs (2026-10-07). Full detail in [STACK.md](./STACK.md).

**Core technologies:**
- **React 19.3 + Vite 8 + TypeScript** — standard SPA toolchain; no SSR needed (no SEO, everything behind a PIN). Fallback: pin `typescript@5.9` if the TS 7 native-compiler line causes tooling friction.
- **Tailwind CSS 4.3** — CSS-first config (`@import "tailwindcss"`, no config file); ideal for iterating on EAFC card visuals.
- **Supabase free tier (supabase-js 2.x)** — Postgres (window functions for percentiles) + Storage (officer audit trail) + Edge Function (PIN gate). Exceeds the free-tier storage constraint.
- **Tesseract.js 7.0** — in-browser OCR in a Web Worker. Requires `tessedit_char_whitelist` (digits/percent), `user_defined_dpi`, region cropping, and canvas preprocessing (grayscale → 2-3x upscale → binarize). Test production worker bundling (`workerPath`/`corePath`) early.
- **TanStack Query 5 + zod 4 + motion + lucide-react** — server-state cache, OCR-output validation, card animations, icons. shadcn/ui optional for forms/admin dialogs.

**Auth design:** Edge Function `verify-pin` compares a bcrypt/PBKDF2 hash, applies server-side rate limiting (4-digit PIN = 10k combos, brute-forceable without it), and returns a custom JWT with claims `{ member_id, role: member|officer|owner }`; RLS policies read claims via `auth.jwt()`. **This is the one stack piece to spike before building anything on top.**

**Computation:** Percentile + OVR live entirely in Postgres (compute-on-read RPCs). Never recompute in JS — it duplicates logic, risks drift, and leaks key stats to the client.

### Expected Features

Full detail in [FEATURES.md](./FEATURES.md). The core loop: register → submit → see standing → improve → resubmit.

**Must have (table stakes, all P1):**
- PIN auth + guild-member whitelist + officer elevation — the trust boundary
- Class/function definitions + character registry — foundation for all comparisons
- Stat catalog (3 groups, FLAT/PERCENTUAL value types) — foundation for OCR + key-stat config
- Guided 3-screenshot upload with example shots + wider "Special" shot option
- OCR auto-read (region-based) + **mandatory manual fix-up gate** before acceptance
- Immutable stat storage per submission — the source of truth
- Per-stat percentile within class+function (top 1% = 99 pts, with "insufficient data" state)
- OVR from 6 admin-tweakable key stats per class, floor of 51, **keys hidden server-side**
- Own dashboard (mobile-first stat cards) + improvement screen (player vs class average vs best, aggregates only)
- Delta badges vs last submission (with "first submission" baseline state)
- Tiered stat cards (bronze/silver/gold/platinum) + officer validation queue

**Should have (v1.x, after validation):** shareable card image export (PNG), submission history/progression trends, officer guild-health dashboard, OCR confidence surfacing, admin self-service catalog additions.

**Defer (v2+) / anti-features:** multi-guild tenancy, chat/announcements, real-time game sync (no RO Origin API; scraping violates ToS), fully automatic OCR with zero review, full account system, public leaderboards, formula-builder UI. Deploy a second instance instead of building multi-tenancy if demand appears.

**Landscape takeaway:** No existing product combines personalized improvement coaching + admin-tweakable rating math + a guild-internal privacy model. NeoFoot's moat is the **improvement screen + hidden key stats**; EAFC cards and shareable exports are the spread mechanism. (Competitor rows are training-data-derived, LOW confidence.)

### Architecture Approach

Full detail in [ARCHITECTURE.md](./ARCHITECTURE.md). A thin client-side SPA talking directly to Supabase; security enforced by Postgres RLS; rank math in Postgres functions; OCR runs entirely in the player's browser.

**Major components:**
1. **PIN Gate / Session** — Edge Function verifies hashed PIN, mints custom-claim JWT; RLS reads claims. Route guards are UX only; real enforcement is RLS.
2. **OCR Pipeline (client-side, under `features/submit/ocr/`)** — image → preprocess → region-based `recognize` with whitelist → parse → fix-up form. Isolated so game UI updates only touch `regions.ts`/`parse.ts`.
3. **Rank Engine (Postgres RPCs)** — `compute_ranks()`/`compute_overall()` over latest validated submissions per class; `SECURITY DEFINER` with internal role checks so key stats never leave the DB.
4. **Officer Panel** — validation queue, player removal, key-stat editor; the only feature touching submission status and `class_key_stats`.

**Key anti-patterns to avoid:** OCR in an Edge Function (2s CPU cap — will fail); materializing ranks at submit time (goes stale on key-stat tweaks); exposing `class_key_stats` to members or computing OVR client-side; one wide table per screenshot type (use `submission_stats` keyed by `stat_key` against a `stat_catalog`); trusting OCR output silently.

### Critical Pitfalls

Full detail in [PITFALLS.md](./PITFALLS.md).

1. **OCR accuracy collapse on game screenshots** — never OCR full images; crop rectangles, preprocess, whitelist digits, confidence-threshold (~85) auto-flagging, sanity-range validation per stat. **Validate with a Phase 1 spike: round-trip test on 10 real guild screenshots; pivot to manual entry if field accuracy < ~70%.**
2. **Percentile math meaningless at guild sample sizes (n=15–40)** — use rank-based percentile `(count_below / (n-1)) × 99`, explicit tie handling, show rank ("7th of 15") alongside percentile, and make delta badges compare **raw stat values** between a player's own submissions, never percentile positions. Define the formula in one pure function with unit tests.
3. **PIN auth: identity + brute force** — per-player PINs (hashed, never plaintext), server-side rate limiting (5 attempts → lockout), RLS on every table; never trust client-supplied player identity. ⚠️ *Conflicts with PROJECT.md's shared-PIN model — resolve at requirements time.*
4. **Hidden key stats enforced only in UI** — enforce server-side (RLS/views omitting key-stat values); OVR computed in DB; accept and document the known aggregate leak ("best in guild" in a tiny guild ≈ identifying the top player).
5. **Free-tier limits** — don't store full screenshots (compressed thumbnails only, latest-only, ~30–80 KB); weekly keep-alive cron or documented restore ritual; handle HTTP 540 (project paused) gracefully in the UI.

## Implications for Roadmap

Based on the dependency chains (ARCHITECTURE.md build order + FEATURES.md MVP recommendation), suggested phase structure:

### Phase 1: Foundation — Supabase schema, RLS, and PIN auth
**Rationale:** Auth-first: RLS shapes every later query; retrofitting security is the classic rewrite cause. The data model must set up RLS-ready schema and per-player identity from day one.
**Delivers:** Migrations for `members`/`submissions`/`submission_stats`/`stat_catalog`/`class_key_stats` (EAV-style, append-only submissions), RLS policies, `verify-pin` Edge Function + custom JWT, rate limiting. Plus the **OCR feasibility spike** (round-trip test on 10 real screenshots → go/no-go decision documented).
**Addresses:** PIN auth + whitelist + officer elevation (FEATURES P1)
**Avoids:** Pitfalls 3 (PIN identity/brute force), 4 (partly — server-side enforcement foundation), and de-risks Pitfall 1 early

### Phase 2: Data ingestion, manual-only — registry, catalog, submit wizard
**Rationale:** Ranks need real submissions to compute against; the ingestion data model and fix-up form must exist and be correct before OCR is layered on. This is the project's explicit de-risking strategy: the panel is usable even on days OCR fails.
**Delivers:** Character registry, class/function definitions, stat catalog, guided 3-screenshot upload with examples, manual entry + fix-up form (no OCR yet), image upload to Storage (compressed, latest-only).
**Addresses:** Character registry, stat catalog, guided upload (P1)
**Avoids:** Pitfall 5 (storage bloat), EAV debt pattern

### Phase 3: Rank engine — percentile + OVR Postgres RPCs
**Rationale:** Cards and badges are pure presentations of RPC outputs; building them first means mocking data by hand. Formula spec + unit tests before any UI shows points.
**Delivers:** `compute_ranks()` (rank-based percentile, top 1% = 99), `compute_overall()` (mean of 6 key stats, floor 51, read from `class_key_stats`), guild averages — all compute-on-read `SECURITY DEFINER` RPCs with internal role checks.
**Addresses:** Per-stat percentile, OVR (P1)
**Avoids:** Pitfall 2 (small-n percentile), Pitfall 4 (key-stat exposure)

### Phase 4: Member-facing value loop — dashboard, improvement screen, delta badges, tier cards
**Rationale:** Core value delivered here ("my standing" + "what to fix"); everything hangs off Phase 3 RPCs.
**Delivers:** Mobile-first own dashboard with stat cards, improvement screen (player vs class average vs best, aggregates only), delta badges with first-submission baseline state, bronze→platinum tiered cards.
**Addresses:** Own dashboard, improvement screen, delta badges, tier cards (P1)
**Avoids:** Pitfall 2 (delta badges compare raw values), UX pitfalls (baseline handling)

### Phase 5: OCR pipeline layered onto the submit wizard
**Rationale:** OCR is a pre-fill accelerator bolted onto an already-working form — the highest-friction, most-iterated component, de-risked by Phase 1's spike and by shipping manual entry first.
**Delivers:** Tesseract.js worker setup (lazy-loaded, cached, session singleton), region maps per screenshot type, canvas preprocessing, confidence-triggered fix-up integration, production-build bundling test.
**Addresses:** OCR auto-read + manual fix-up gate (P1)
**Avoids:** Pitfall 1 (accuracy collapse — full mitigation), performance traps (lazy-load WASM)

### Phase 6: Trust + celebration — officer panel, promotion page, owner tooling
**Rationale:** Officer tools need the full submission lifecycle to exist; the promotion page rides the same rank RPCs from Phase 3.
**Delivers:** Officer validation queue (approve/reject, remove players, block non-guild members), key-stat editor (exactly 6 per class), owner role elevation, promotion page with EAFC-style top-player cards, free-tier ops (keep-alive, HTTP 540 handling).
**Addresses:** Officer validation queue, promotion page (P1)
**Avoids:** Pitfall 5 (free-tier ops), security mistakes (RLS-gated officer actions)

### Phase Ordering Rationale

- **Auth/security before everything:** every table, query, and policy depends on the JWT-claims + RLS model; the custom-JWT wiring is the one stack piece to spike day one.
- **Manual ingestion before OCR:** both STACK and ARCHITECTURE research independently recommend this ordering — the fix-up form and data model are identical with or without OCR, so the launch is never bet on OCR accuracy.
- **Rank engine before dashboards:** cards/badges/promotion are all pure presentations of RPC outputs.
- **Officer panel last:** it requires pending submissions to exist and completes the validation loop that makes ranks trustworthy.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** Custom JWT + PostgREST/RLS-claims wiring — documented pattern but MEDIUM confidence; day-one spike required. Also: resolve the shared-PIN vs per-player-PIN conflict before schema design.
- **Phase 5:** OCR region maps need real guild screenshots (same client/language as members, Portuguese locale with `1.234.567` thousand separators); production worker bundling on Vite needs a build test. Inherits Phase 1's spike results.
- **Phase 3:** Percentile formula spec (rank-based, tie handling, insufficient-data states) should be written and unit-tested before UI work — niche domain, no copy-paste reference.

Phases with standard patterns (skip research-phase):
- **Phase 2:** CRUD forms + file upload + Supabase Storage — well-documented, established patterns.
- **Phase 4:** React + TanStack Query dashboard rendering — extremely well-documented.
- **Phase 6:** Standard moderation UI + static deploy; Supabase ops are documented.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified against npm registry; Supabase limits against official pricing; Tesseract.js API via official docs. TS 7 line is the one MEDIUM-confidence item (fallback documented). |
| Features | HIGH (project-internal) | Sourced from PROJECT.md + verified tooling. Competitor landscape is LOW confidence (training data only, no websearch available). |
| Architecture | HIGH | Well-established pattern family; Supabase/Tesseract specifics verified against official docs. Pattern-family consensus itself is MEDIUM. |
| Pitfalls | MEDIUM | Supabase free-tier limits HIGH (official docs); OCR-on-game-screenshots claims LOW/MEDIUM — needs the Phase 1 spike. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Shared PIN vs per-player PIN:** STACK research assumes the shared-PIN + officer-elevation model (per PROJECT.md); PITFALLS research strongly recommends per-player PINs for identity and anti-forgery. **Resolve at requirements time** — it changes the schema (identity model) and the login UX.
- **Tesseract field accuracy on real guild screenshots:** the single biggest technical unknown. Handle via the Phase 1 spike with a documented go/no-go pivot (manual entry with side-by-side examples is the designed fallback).
- **Custom JWT + PostgREST/RLS wiring:** documented but not independently verified end-to-end; day-one spike in Phase 1 before building on top.
- **Storage decision nuance:** STACK/ARCHITECTURE store compressed originals (latest-only) for officer audit; PITFALLS recommends values + tiny thumbnail only. Recommend: compressed thumbnail (~30–80 KB WebP, latest-only) — decide the exact policy during Phase 2 planning.
- **Compute trigger nuance:** STACK suggests recompute-on-submission triggers; ARCHITECTURE recommends compute-on-read. Both work at this scale; **compute-on-read is the cleaner pattern** (no invalidation bugs, instant admin tweaks) — adopt it.
- **Competitor landscape:** stale training data, no websearch available. Only matters if a direct comparison informs a feature decision — verify during phase research if needed.
- **OCR confidence threshold (~85) and sanity-range rules per stat:** need real-data calibration during Phase 5.

## Sources

### Primary (HIGH confidence)
- npm registry (`npm view <pkg> version`, 2026-10-07) — all library versions
- https://supabase.com/pricing — free tier limits (500 MB DB, 1 GB storage, 5 GB egress, 50k MAU, 500k Edge Function invocations, 1-week inactivity pause, Custom Access Token JWT)
- Context7 `/naptha/tesseract.js` — v7 worker API, `setParameters`, `tessedit_char_whitelist`, `user_defined_dpi`, PSM modes, `rectangle` regions, word-level confidence
- Context7 `/supabase/supabase` — Edge Function limits (2s CPU, 256 MB RAM), Storage RLS + 50 MB file limit, RLS policy patterns (`auth.jwt()`), project pausing / HTTP 540 / database size
- PROJECT.md — NeoFoot project context, requirements, decisions

### Secondary (MEDIUM confidence)
- TypeScript 7 native-compiler line as npm `latest` — ecosystem friction not independently verified; fallback to `typescript@5.9` documented
- Supabase custom-JWT + RLS-claims PIN auth pattern — documented composition, MEDIUM confidence, Phase 1 spike flagged
- Stat-tracking panel architecture family (thin SPA + BaaS + client ingestion) — training-data pattern consensus, consistent with all verified component docs
- Tesseract accuracy on stylized game UI / small digit glyphs — known engine limitation, flagged for spike validation

### Tertiary (LOW confidence)
- EAFC Ultimate Team percentile model mechanics — community knowledge; the rank-based adaptation is a design judgment, not a copy
- Competitor landscape (Enjin/Shivtr, Raider.IO, poe.ninja, FUTBIN, PvPoke) — training data only, no websearch tool available; establishes landscape shape, not exact parity
- Scribe.js as an alternative OCR with improved recognition model — unverified, relevant only if Tesseract accuracy proves insufficient

---
*Research completed: 2026-10-07*
*Ready for roadmap: yes*
