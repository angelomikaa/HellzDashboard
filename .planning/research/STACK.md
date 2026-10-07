# Stack Research

**Domain:** Guild stats web panel (OCR data entry + percentile ranking, single guild, EAFC-style cards)
**Project:** NeoFoot — Ragnarok Origin guild stats panel
**Researched:** 2026-10-07
**Overall confidence:** HIGH (versions verified against npm registry + official Supabase pricing page + Context7 for Tesseract.js)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| React | 19.3.0 | UI framework | User requirement; also the ecosystem default for component-heavy dashboard UIs. React 19 is current stable. | HIGH |
| TypeScript | 7.0.2 (latest tag) | Type safety | npm `latest` is now the TS 7 (native compiler) line. Vite only uses `tsc` for typechecking, so adoption risk is low. **Fallback:** if tooling/type-package friction appears, pin `typescript@5.9` — the JS-based line remains fully supported. | MEDIUM-HIGH |
| Vite + @vitejs/plugin-react | 8.3.3 / 6.1.2 | Build & dev server | The standard React SPA toolchain. Instant HMR, zero-config, static output deployable anywhere. No SSR needed for this app (no SEO, all behind a PIN). | HIGH |
| Tailwind CSS | 4.3.3 | Styling | Card-heavy, tiered-badge UI is exactly what utility CSS excels at. v4 is CSS-first config (`@import "tailwindcss"` in CSS, no `tailwind.config.js`). Fast to iterate on the EAFC card visuals. | HIGH |
| Supabase (supabase-js) | 2.117.2 | Postgres DB + Auth + Storage + Edge Functions | Validated against official pricing: Free tier includes **500 MB DB, 1 GB file storage, 5 GB egress, 50k MAU, 500k Edge Function invocations, unlimited API requests**. Postgres gives us window functions for percentiles; Storage holds the screenshots; Edge Functions host the PIN gate. This satisfies and exceeds the "free-tier storage like Supabase" constraint. | HIGH |

### OCR Approach (the critical domain decision)

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Tesseract.js | 7.0.0 | In-browser OCR of the 3 screenshots | Runs entirely in a Web Worker in the player's browser (WASM port of Tesseract). **Zero server cost, zero API keys, no upload latency for OCR** — only the corrected values get saved. Verified via Context7: v7 API is `createWorker('eng', oem, options)` + `worker.setParameters()` + `worker.recognize()`. | HIGH (capability) / MEDIUM (accuracy) |

**OCR tuning that matters (verified from official docs):**
- `tessedit_char_whitelist: '0123456789,.%'` — stat values are only digits, separators, and `%`; whitelisting dramatically reduces garbage reads.
- `user_defined_dpi` — set it (e.g. `'300'`) to silence the "Invalid resolution 0 dpi" warning and improve accuracy on mobile screenshots.
- `tessedit_pageseg_mode` — use `SINGLE_BLOCK` (default) for cropped stat rows; consider `SINGLE_LINE` if you crop per-row client-side.
- Init-only params (e.g. `load_number_dawg`) go in the `createWorker` config argument, **not** `setParameters`.
- **Preprocessing in canvas before `recognize()`:** grayscale → 2-3x upscale → binarize/contrast boost. Ragnarok Origin's stat screens use large clean fonts; this preprocessing + whitelist + the project's existing "manual fix-up before registration" requirement makes accuracy a solvable problem. The manual fix-up step is the safety net — OCR is a friction reducer, not the source of truth (the screenshots are).
- **Known friction:** Vite + tesseract.js worker bundling in production builds occasionally needs `workerPath`/`corePath` pointed at self-hosted or CDN copies. Do a production build test in the OCR phase early, not at the end.

### Supporting Libraries

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|------------|
| @tanstack/react-query | 5.104.1 | Server-state cache | All Supabase reads (rankings, aggregates, profiles). Handles loading/error states, refetch after submissions, and cache invalidation when admins toggle key stats. | HIGH |
| zod | 4.6.5 | Validate OCR output | Every OCR-read value passes through a per-stat zod schema (range checks, type FLAT vs PERCENTUAL) before it's allowed into the fix-up form or the DB. | HIGH |
| motion | 14.0.0 | Card animations | The EAFC card shine/flip/tier-reveal moments. (This is framer-motion's successor package — import as `motion/react`.) | HIGH |
| lucide-react | 1.52.0 | Icons | Delta badges (▲/▼ can be lucide arrows), nav, tier icons. | HIGH |
| shadcn/ui (optional) | current (Tailwind v4 compatible) | Inputs, dialogs, selects, toasts | Copy-paste components, not a dependency. The EAFC cards themselves are custom-built either way. Use it to save time on forms/admin dialogs; skip if the team prefers bespoke styling. | MEDIUM |
| Supabase CLI | latest | Local dev + DB migrations | Schema migrations as SQL files, `supabase db push`. Keeps the schema reproducible for a greenfield project. | HIGH |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Supabase CLI | Local Postgres + migrations + Edge Function dev | Run `supabase init` day one; commit the `supabase/migrations/` folder |
| ESLint (typescript-eslint) + Prettier | Code quality | Standard Vite React-TS template ships both |
| Vercel CLI / Git integration | Deploys | Auto-deploy on push to main |

## Auth Design: 4-Digit PIN (recommended pattern)

Supabase has no native PIN auth, so pick one of two patterns:

**Recommended — Edge Function gate + custom JWT (fits the "one shared panel PIN + officer elevation" model):**
1. PIN stored as a PBKDF2/bcrypt hash in a private table (owner sets it once).
2. Edge Function `verify-pin` compares hash, applies rate limiting (attempt counter table — 4-digit PIN = 10k combos, brute-forceable without it), and on success returns a JWT signed with the project's `SUPABASE_JWT_SECRET` carrying claims `{ role: "member" | "officer", exp }`.
3. Client stores the JWT (memory + localStorage with short exp), sends `Authorization: Bearer` on PostgREST calls; **RLS policies read the claims via `auth.jwt()->>'role'`**.
4. Officer grant = update the claim row / a second officer PIN. Owner manages via service-role admin screen.
- Supabase free tier explicitly includes Custom Access Token (JWT) support — verified on the official pricing page.
- **Confidence: MEDIUM** — the pattern is documented, but the exact PostgREST-accepts-custom-JWT + RLS-claims wiring should be a day-one spike in Phase 1. It's the one piece of the stack to validate before building anything on top.

**Fallback — Supabase Auth with synthetic identities:** one auth user per member (`nickname@guild.local`, password = per-player PIN), RLS via `auth.uid()`. More natural Supabase usage, but awkward to present as a single PIN gate, and only worth it if per-player login identity becomes a requirement later.

## Percentile & OVR Computation (where it lives)

**Compute in Postgres, read from the client.** Do not recompute in JS.

- Small dataset (single guild, ~15–30 players per class) makes window functions trivial: `rank() OVER (PARTITION BY class ORDER BY stat_value)` per stat → percentile points (top 1% = 99 mapping is a pure function of rank/n — EAFC-style).
- Overall rating (mean of 6 key stats, floor 51) computed in the same Postgres function, reading the admin-tweakable `key_stats` config table — so **key stats never leave the DB for members**, which is also the anti-gaming requirement.
- A `recompute_ranks()` Postgres function runs on new submissions (trigger) and on admin key-stat changes (admin-invoked RPC). Frontend stores only the snapshot; TanStack Query refetches.
- Delta badges = comparison against the player's previous submission row (keep submission history; deltas read the prior row).

## Installation

```bash
# Scaffold
npm create vite@latest neofoot -- --template react-ts

# Core
npm install react react-dom
npm install @supabase/supabase-js @tanstack/react-query tesseract.js zod

# UI
npm install tailwindcss @tailwindcss/vite motion lucide-react

# Dev dependencies
npm install -D typescript @vitejs/plugin-react @types/react @types/react-dom
npm install -D supabase eslint prettier
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Supabase free tier | Cloudflare (Pages + D1 + Workers) | D1 is SQLite, not Postgres — no native window functions in the same way, and you'd hand-roll auth/storage. More moving parts for zero cost gain at this scale. Only if Supabase's free-tier pause policy becomes intolerable (see Pitfall below). |
| Supabase free tier | Firebase | Firestore's percentiles/aggregates require client-side computation or Cloud Functions for everything; SQL fits this domain better. |
| Vite SPA on Vercel | Next.js | Only if SSR/SEO or a Node backend were needed — they aren't. Next adds build complexity and server coupling that Supabase already covers. |
| Vercel Hobby (free) | Cloudflare Pages (free) | Cloudflare Pages has unlimited bandwidth; use it if Vercel's Hobby limits bite. Both are zero-config for Vite SPAs. Guild panel is non-commercial, satisfying Vercel Hobby's terms. |
| Tesseract.js (client-side) | Google Cloud Vision / AWS Textract | Higher accuracy, but API keys, paid-tier management (free tiers are small), upload latency, and cost tracking — unnecessary when manual fix-up is already required. Revisit only if OCR accuracy proves unacceptable after preprocessing. |
| Tesseract.js | PaddleOCR (server-side, Python) | Best-in-class accuracy but introduces a whole non-TypeScript server to host and pay for. Wrong tradeoff for this project. |
| Postgres computation | Client-side JS percentile recompute | Never — duplicates the OVR/percentile logic, risks divergence from the DB, and would leak key stats to the client. |
| Tailwind v4 | Tailwind v3 | Only if following old tutorials — v3 config style is outdated; all current docs assume v4 CSS-first. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Create React App | Deprecated, unmaintained; officially superseded by framework tooling | Vite 8 |
| RLS-less tables + exposed anon key | The anon key ships in the client bundle; without RLS anyone can read/write all guild data (including individual player values, violating the privacy requirement) | RLS policies keyed on JWT claims from the PIN gate |
| OCR without whitelist/preprocessing | Raw Tesseract on busy game UI screenshots produces garbage; teams then blame OCR and switch stacks unnecessarily | `tessedit_char_whitelist` + `user_defined_dpi` + canvas preprocessing + manual fix-up |
| Storing every screenshot forever in Supabase Storage | 1 GB free cap; 3 images × resubmissions × 30 players adds up fast | Client-side resize/compress to ~200 KB JPEG, overwrite fixed per-player paths (keep only latest submission's shots) |
| Full account system (email+password per player) | Violates the low-friction PIN constraint; guild members won't register accounts | PIN gate + role claims |
| Storing the PIN in plaintext or in the client bundle | Trivially extractable | PBKDF2/bcrypt hash in a private table, verified only in an Edge Function |
| Node/Express custom backend | Supabase (PostgREST + Edge Functions) already provides the API layer; a custom server adds hosting cost and auth plumbing for zero benefit | Supabase client + RLS + Edge Functions |

## Stack Patterns by Variant

**If OCR accuracy proves too low after preprocessing:**
- Add per-stat-region cropping client-side (crop each stat line before OCR — massively boosts accuracy vs whole-screen reads)
- Then, only if still failing, add a server-side OCR Edge Function fallback — but keep Tesseract.js as the primary

**If per-player identity is needed later (e.g. officer-validated rosters by login):**
- Switch from shared-PIN JWT claims to Supabase Auth with synthetic identities; RLS moves from claims to `auth.uid()`

**If the free-tier pause (1 week inactivity) becomes a real problem:**
- A GitHub Actions cron hitting a cheap endpoint keeps the project warm, or upgrade to Pro ($25/mo); or migrate to Cloudflare

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| react@19.3 | vite@8 + @vitejs/plugin-react@6 | Current stable trio; the `react-ts` Vite template wires it correctly |
| tailwindcss@4.3 | vite@8 | Use `@tailwindcss/vite` plugin + `@import "tailwindcss"` in CSS; no `tailwind.config.js` |
| tesseract.js@7 | vite@8 | v6/v7 simplified API (`createWorker` replaces v4's `createWorker`+`loadLanguage`+`initialize` chain). Test production worker bundling early; may need explicit `workerPath`/`corePath` |
| typescript@7.0 | @types/* packages, vite@8 | `tsc` used only for typechecking under Vite; if friction appears, pin `typescript@5.9` |
| @tanstack/react-query@5 | react@19 | v5 supports React 19 |
| zod@4 | — | v4 API differs from v3 tutorials (e.g. `z.string().min()` mostly same, error handling changed) — use v4 docs |
| supabase-js@2.x | supabase CLI latest | Match CLI-project pairing during `supabase init` |

## Sources

- npm registry (`npm view <pkg> version`, 2026-10-07) — all library versions — **HIGH**
- https://supabase.com/pricing (official, fetched 2026-10-07) — Free tier limits (500 MB DB, 1 GB storage, 5 GB egress, 50k MAU, 500k Edge Function invocations, 1-week inactivity pause, Custom Access Token JWT included) — **HIGH**
- Context7 `/naptha/tesseract.js` (official repo docs) — v7 worker API, `setParameters`, `tessedit_char_whitelist`, `user_defined_dpi`, PSM modes, init-only params — **HIGH**
- TypeScript dist-tags via npm (`latest: 7.0.2`, `rc: 7.0.1-rc`) — TS 7 native line is current stable — **MEDIUM** (ecosystem-wide TS 7 friction not independently verified; fallback documented)
- Supabase custom-JWT + RLS-claims auth pattern — documented pattern, **MEDIUM** — flag: verify with a Phase 1 spike

---
*Stack research for: NeoFoot guild stats panel (Ragnarok Origin)*
*Researched: 2026-10-07*
