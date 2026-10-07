# Architecture Research

**Domain:** Guild stat-tracking web panel (Ragnarok Origin, single guild, OCR-based input)
**Researched:** 2026-10-07
**Confidence:** HIGH (architecture patterns are well-established; Supabase and Tesseract.js specifics verified against official docs)

## Standard Architecture

Stat-tracking panels for game guilds (the family this project belongs to: FIFA/EAFC stat-card sites, WoW guild progression trackers, MMO stat dashboards) almost universally converge on the same shape: **a thin client-side SPA + a Backend-as-a-Service (Postgres with row-level security) + one client-side compute pipeline for data ingestion**. Because NeoFoot is single-guild (tens of users, not thousands), the correct architecture is the simplest version of this pattern — one React SPA talking directly to Supabase, with all security enforced by Postgres RLS and all rank math in Postgres functions. No custom API layer, no servers to manage.

### System Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                     CLIENT (React SPA + TypeScript)                │
├────────────────────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌───────────────┐ ┌──────────────┐ ┌──────────────┐  │
│  │ PIN Gate │ │ Submit Wizard │ │ Improvement  │ │  Promotion   │  │
│  │ /Session │ │ (3-shot OCR)  │ │ Screen       │ │  Page        │  │
│  └────┬─────┘ └───────┬───────┘ └──────┬───────┘ └──────┬───────┘  │
│       │               │                │                │          │
│  ┌────┴───────────────┴────────────────┴────────────────┴───────┐  │
│  │              Officer Panel (validate/remove/key stats)        │  │
│  └──────────────────────────────┬────────────────────────────────┘  │
│                                 │                                   │
│  ┌──────────────────────────────┴────────────────────────────────┐  │
│  │  OCR Pipeline (client-side, Tesseract.js WASM worker)         │  │
│  │  image → preprocess → region recognize → parse → fix-up form  │  │
│  └──────────────────────────────┬────────────────────────────────┘  │
│                                 │                                   │
│  ┌──────────────────────────────┴────────────────────────────────┐  │
│  │  Data access layer: Supabase JS client + TanStack Query       │  │
│  │  (server state cache, mutations, invalidation)                │  │
│  └──────────────────────────────┬────────────────────────────────┘  │
└─────────────────────────────────┼───────────────────────────────────┘
                                  │ HTTPS (anon key + custom JWT)
┌─────────────────────────────────┼───────────────────────────────────┐
│                     SUPABASE (BaaS, free tier)  ▼                    │
├────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Edge Function: /pin-login (only server-side code needed)    │  │
│  │  verifies PIN hash → issues Supabase-signed JWT with claims  │  │
│  │  { member_id, role: member|officer|owner }                    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Postgres + RLS                                               │  │
│  │  members · submissions · submission_stats · stat_catalog      │  │
│  │  class_key_stats (SELECT restricted to officers)              │  │
│  │  RPCs: compute_ranks() · compute_overall() · guild_average()  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Storage bucket: submission screenshots (RLS-protected,       │  │
│  │  officers read for audit, members write their own)            │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| PIN Gate / Session | Verify 4-digit PIN, hold session, enforce role (member vs officer vs owner) | Edge Function checks bcrypt/argon2-hashed PIN in `members`, returns Supabase-signed JWT; client calls `supabase.auth.setSession()`; RLS reads claims from `auth.jwt()` |
| Submit Wizard | Collect 3 screenshots (General / Quasi / Special), run OCR, let player fix failed reads, upload | Multi-step React form; Tesseract.js worker with per-stat-line `rectangle` regions; low-confidence fields highlighted; block submit until all fields valid |
| OCR Pipeline | Screenshot → structured stat values | Tesseract.js v6 (WASM, in-browser, Web Worker): canvas preprocess (scale/crop/contrast) → region-based `recognize` with character whitelist (`0-9.,%`) → parser maps text to `stat_catalog` keys → confidence scores per field |
| Rank Engine | Per-stat percentile points (top 1% = 99), OVR from 6 key stats, floor of 51 | Postgres RPC functions (`percentile_cont`, window functions over latest validated submissions per class); members only ever receive computed values, never the key-stat config |
| Stat Cards / Improvement Screen | Show player value, guild average, best-in-guild, percentile position, delta badges, tier colors | React components fed by one RPC ("my report"); tiers bronze/silver/gold/platinum derived from percentile bands |
| Promotion Page | EAFC-style cards for top players | Reads a public-to-guild RPC ("top players per class by OVR"); shows key stats visually — key-stat identity stays hidden, only computed numbers shown |
| Officer Panel | Validate/reject submissions, remove players/registers, manage 6 key stats per class | Same SPA behind role claim; `class_key_stats` writes gated by RLS (`role = 'officer' OR role = 'owner'`); owner-only role elevation |
| Data access layer | All Supabase I/O, caching, optimistic updates | `@supabase/supabase-js` + TanStack Query; typed DB client generated via `supabase gen types` |

## Recommended Project Structure

```
src/
├── app/                   # Router, layout, PIN gate / session bootstrap
│   ├── routes/            # Dashboard, Submit, Improvement, Promotion, Officer
│   └── guards/            # Role-aware route guards (member/officer/owner)
├── features/
│   ├── auth/              # PIN login form, session store, role helpers
│   ├── submit/            # 3-step wizard, image capture UI, fix-up form
│   │   └── ocr/           # Tesseract worker setup, region maps, parsers
│   │       ├── regions.ts     # per-screenshot stat-line rectangles
│   │       ├── recognize.ts   # worker lifecycle + recognize calls
│   │       └── parse.ts       # text → stat values, confidence flags
│   ├── stats/             # Stat cards, tiers, delta badges (shared UI)
│   ├── improvement/       # My report page (aggregates only)
│   ├── promotion/         # EAFC card grid, top players
│   └── officer/           # Validation queue, player removal, key-stat editor
├── lib/
│   ├── supabase.ts        # Typed client, session handling
│   ├── queries.ts         # TanStack Query hooks wrapping RPCs
│   └── types.ts           # Generated DB types + domain types
└── supabase/
    ├── migrations/        # Schema + RLS policies, versioned
    └── functions/pin-login/  # Edge Function (sole server-side code)
```

### Structure Rationale

- **features/ by domain, not by layer:** each feature (submit, improvement, promotion) owns its UI + hooks; stat cards and badges live in `features/stats/` because three pages share them.
- **ocr/ isolated under submit/:** the OCR pipeline is the most fragile, most-iterated code. Isolating region maps, worker setup, and parsers means a game UI update only touches `regions.ts` and `parse.ts`.
- **supabase/ inside the repo:** migrations and the Edge Function are versioned with the code they serve; `supabase gen types` keeps `lib/types.ts` in lockstep with schema.

## Architectural Patterns

### Pattern 1: Postgres RLS with Custom-Claim JWTs (PIN auth)

**What:** The 4-digit PIN is not a native Supabase auth method. The standard pattern for PIN/code-gated apps: an Edge Function verifies the PIN against a stored hash and mints a Supabase-signed JWT carrying custom claims (`member_id`, `role`). The client sets that session, and every RLS policy reads the claims via `auth.jwt()`.
**When to use:** Any shared-secret / low-friction auth where full accounts are intentionally avoided.
**Trade-offs:** Slightly custom (no Supabase Auth UI, no password reset); refresh/expiry must be handled by the Edge Function issuing a reasonable TTL. In exchange: zero account friction for guild members, and security lives entirely in RLS — the anon key alone grants nothing.

```sql
-- Example: members can only read their own rows; aggregates come from RPCs
alter table members enable row level security;

create policy "own row read/update" on members
for select using (
  (select auth.jwt()->>'member_id') = id::text
);

create policy "officers read all members" on members
for select using (
  (select auth.jwt()->>'role') in ('officer', 'owner')
);

-- Key stats are hidden from members (anti-gaming requirement)
create policy "officers manage key stats" on class_key_stats
for all using ((select auth.jwt()->>'role') in ('officer', 'owner'));
-- no member SELECT policy at all → members cannot read it, period
```

### Pattern 2: Client-Side OCR with Region Maps and Confidence Flags

**What:** Run Tesseract.js entirely in the browser (WebAssembly, Web Worker) against known rectangular regions of each stat screen, with a character whitelist for numbers/percentages. Every parsed field carries a confidence score; fields below threshold are flagged for mandatory manual correction before submit.
**When to use:** Fixed-layout mobile game screenshots — the UI is stable, so region coordinates are reliable.
**Trade-offs:** First-load cost (~2–4 MB of WASM + language data, cacheable); region coordinates break when the game updates its UI. In exchange: **zero server CPU** — this matters because Supabase Edge Functions are capped at **2s CPU time and 256 MB RAM per request** (official limits), which rules out server-side Tesseract on the free tier.

```typescript
// Worker created once per session, reused for all 3 screenshots
const worker = await createWorker('eng', 1, { logger: onProgress });
await worker.setParameters({
  tessedit_char_whitelist: '0123456789.,%+',
});

// Per stat line, not whole image: far better accuracy
const { data } = await worker.recognize(image, {
  rectangle: { top, left, width, height }, // from regions.ts
});
const parsed = parseStatLine(data.text, data.confidence);
// parsed.confidence < THRESHOLD → field flagged for mandatory fix-up
```

### Pattern 3: Compute-on-Read Rank Engine (RPCs, not stored ranks)

**What:** Percentiles, OVR, guild averages, and "best in guild" are computed inside Postgres functions over the set of **latest validated submissions per member per class**, not materialized at submit time. Key-stat weights are read by the RPC directly from `class_key_stats` — the config never crosses the API boundary to members.
**When to use:** Small populations (tens of members) where the computation is cheap and admin tweaks (changing key stats, officers validating) should take effect instantly.
**Trade-offs:** Recomputes on every dashboard load (negligible at this scale — `percentile_cont` over a few hundred rows is single-digit milliseconds). In exchange: no invalidation bugs, admin key-stat changes apply immediately, and delta badges are a simple comparison against the member's previous validated submission.

```sql
-- Sketch: OVR = mean of 6 key-stat percentile points, floored at 51
create function member_overall(p_member uuid) returns int
language sql stable security definer as $$
  with ks as (
    select stat_key from class_key_stats
    where class = (select class from members where id = p_member)
  ),
  pts as (
    select percentile_point_over_latest(value) as p
    from submission_stats join ks using (stat_key)
    ...
  )
  select greatest(51, round(avg(p)))::int from pts;
$$;
-- SECURITY DEFINER + explicit role checks inside, because the RPC
-- must read class_key_stats that members cannot select directly
```

## Data Flow

### Submission Flow (the core loop)

```
Player photographs 3 stat screens (General / Quasi / Special)
    ↓
Submit Wizard ← example shots displayed beside each input
    ↓
OCR Pipeline (client-side): preprocess → region recognize → parse
    ↓
Fields with low OCR confidence flagged → player MUST fix before submit
    ↓
Upload original screenshots → Supabase Storage (officer audit trail)
    ↓
INSERT submission (status: pending) + submission_stats
    ↓
Officer validates or rejects (officer panel, RLS-gated)
    ↓ status = validated
Rank engine (RPCs) sees new latest-validated set
    ↓
Dashboard / Improvement screen / Promotion page reflect new ranks,
delta badges computed vs previous validated submission
```

### State Management

```
Supabase Postgres (source of truth)
    ↓ (RPCs via supabase-js)
TanStack Query cache  ←→  mutations (submit, validate, key-stat toggle)
    ↓ (subscribe / invalidate)
React components (cards, badges, wizard state stays local)
```

- **Server state** (ranks, reports, validation queue) lives entirely in TanStack Query; invalidated after mutations (e.g., officer validates → invalidate dashboard queries).
- **Local state** (wizard step, OCR results before submit, fix-up edits) stays in component state — never persisted until the submission is complete.

### Key Data Flows

1. **Ingestion flow:** screenshot → client OCR → player-verified values → Storage + `submissions`. The player is the verification gate; OCR never writes directly.
2. **Aggregation flow:** latest validated submissions → RPC (percentiles, OVR, averages) → per-member "my report" / per-guild "top players". Members receive **aggregates only** — no individual players' values cross the API to them (enforced by which RPCs exist and RLS on base tables).
3. **Admin flow:** owner/officer actions (validate, remove, key-stat toggle, elevation) → RLS-guarded writes → instant effect on the compute-on-read rank engine.
4. **Delta flow:** improvement screen compares current validated submission against the member's previous validated submission (per stat, flat and % values) → ▲/▼ badges.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0–150 users (target: one guild) | Nothing needed. Single SPA + free-tier Supabase; compute-on-read RPCs; client-side OCR. |
| 1k–10k users (multi-guild, if ever) | Materialize rank snapshots (nightly job or on-validate trigger); add server-side OCR queue; move key-stat computation into a scheduled recalc. |
| 100k+ users | Out of scope by design (single-guild product). Would require real partitioning, CDN caching of report pages, batch rank jobs. |

### Scaling Priorities

1. **First bottleneck (theoretical):** OCR first-load weight on mobile — mitigated by caching worker/language data (Service Worker or long-lived HTTP cache) and lazy-loading the OCR bundle only on the submit route.
2. **Second bottleneck (theoretical):** Supabase free-tier limits — 50 MB max upload per file (screenshots are far below), 500 MB database, Edge Function 2s CPU. None are approached at guild scale; watch storage growth if original screenshots accumulate (compress/downscale on upload).

## Anti-Patterns

### Anti-Pattern 1: Running OCR in an Edge Function

**What people do:** Upload the screenshot to a Supabase Edge Function and run Tesseract/Wasm server-side "so the client stays light."
**Why it's wrong:** Supabase Edge Functions are capped at **2 seconds CPU time and 256 MB memory per request** (official runtime limits). Tesseract on a phone screenshot routinely exceeds this; the function will fail with resource-limit errors, and the free tier's 150 s wall-clock won't save CPU-bound work.
**Do this instead:** Client-side Tesseract.js with region-based recognition; the player's manual fix-up is the accuracy gate. Upload only the original image for audit.

### Anti-Pattern 2: Materializing Ranks at Submit Time

**What people do:** Compute percentiles/OVR once when a submission is validated and store the numbers.
**Why it's wrong:** Admin-tweakable key stats mean the OVR definition changes over time — stored ranks silently go stale; every tweak needs a backfill job. Delta logic also breeds bugs when rank snapshots and raw data drift apart.
**Do this instead:** Compute-on-read RPCs. At guild scale the cost is milliseconds, and key-stat changes apply instantly and retroactively.

### Anti-Pattern 3: Exposing `class_key_stats` to Members (or Computing OVR Client-Side)

**What people do:** Fetch the key-stat config and compute OVR/percentiles in React "for simplicity."
**Why it's wrong:** Directly defeats the anti-gaming requirement — members could see (and even if key names were hidden, reverse-engineer through API responses) which stats drive their OVR, then skew builds. Client-side math also means every client computes slightly different numbers.
**Do this instead:** Key-stat config readable by officers only (RLS); all rank math in `SECURITY DEFINER` RPCs that check roles internally; members receive only computed outputs.

### Anti-Pattern 4: One Wide Table Per Screenshot Type

**What people do:** Create `general_stats`, `quasi_stats`, `special_stats` tables with a column per stat.
**Why it's wrong:** Ragnarok Origin updates its stat screen regularly (the Special screen is already cropped inconsistently — that's why the flow takes a wider shot). Every game update becomes a migration; rank RPCs become dynamic-SQL contortions.
**Do this instead:** One `submission_stats` table keyed by `stat_key`, validated against a `stat_catalog` table that defines known stats (label, group, value type). New game stats = catalog row, not migration.

### Anti-Pattern 5: Trusting OCR Output Silently

**What people do:** Accept whatever OCR parsed and submit, letting errors pollute the guild's aggregate data.
**Why it's wrong:** One misread CRIT value (e.g., "1,000" vs "10,000") skews guild averages and percentiles for the whole class; the corruption is invisible until someone audits screenshots.
**Do this instead:** Per-field confidence thresholds with mandatory fix-up before submit, plus the officer validation step as the second gate — both are already in the requirements; the architecture just needs to make the confidence flag a first-class part of the submission payload.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Supabase (Postgres) | `@supabase/supabase-js` v2, typed via `supabase gen types typescript` | RLS on every table; RPCs for all aggregation; migrations via Supabase CLI |
| Supabase (Storage) | S3-compatible bucket via supabase-js; RLS policies on `storage.objects` | Members write to their own folder (`member_id/` prefix); officers read for audit; downscale images client-side before upload |
| Supabase (Edge Functions) | Single function: `pin-login` (Deno runtime, TypeScript) | Verifies PIN hash, mints signed JWT with custom claims; free tier is ample — this is the only server-side code |
| Tesseract.js | npm dependency, WASM + `eng` language data, Web Worker | Region-based recognition with digit/percent whitelist; worker created once and reused across the 3 screenshots; bundle lazy-loaded |
| Hosting (SPA) | Vercel / Netlify / Cloudflare Pages — static deploy of Vite build | No server needed; env vars for Supabase URL + anon key (safe to ship — RLS is the security boundary) |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| UI features ↔ Data layer | TanStack Query hooks only | Features never call supabase-js directly — one place to swap/patch queries |
| Submit wizard ↔ OCR pipeline | Promise-based `recognize()` calls with region maps | OCR returns `{ value, confidence }`; wizard owns the fix-up state machine |
| Frontend ↔ Rank engine | Postgres RPCs (`member_report`, `top_players`, `guild_average`) | Rank math never duplicated in TypeScript |
| Auth ↔ Everything | JWT claims read by RLS; role helpers in `features/auth` | Route guards are UX only — real enforcement is RLS |
| Officer panel ↔ Base tables | Direct RLS-guarded selects/mutations | Only feature allowed to touch `submissions` status and `class_key_stats` |

## Suggested Build Order (Dependencies Between Components)

```
1. Supabase foundation: schema + RLS + pin-login Edge Function
      ↓  (everything needs auth + tables)
2. Data ingestion, manual-only: stat_catalog + submit form (no OCR yet)
      ↓  (ranks need real submissions to compute against)
3. Rank engine: percentile + OVR + average RPCs (compute-on-read)
      ↓  (cards need computed numbers)
4. Dashboard + improvement screen + stat cards + delta badges
      ↓  (core value delivered; OCR is a friction improvement, parallelizable)
5. OCR pipeline layered onto the submit wizard (region maps, fix-up flow)
      ↓  (officer tools need pending submissions to exist)
6. Officer panel (validate/remove) + promotion page + owner elevation
```

**Build order rationale:**
- **Auth-first** (step 1): RLS shapes every later query; retrofitting security is the classic rewrite cause.
- **Manual entry before OCR** (step 2 before 5): the ingestion data model and fix-up form must exist and be correct first — OCR is a pre-fill accelerator bolted onto an already-working form. This also de-risks the most fragile component: if OCR proves unreliable on real screenshots, the product still ships.
- **Rank engine before dashboards** (step 3 before 4): cards and badges are pure presentations of RPC outputs; building them first means mocking data by hand.
- **Officer panel last** (step 6): it requires the full submission lifecycle to exist; the promotion page rides the same rank RPCs from step 3.

## Sources

- Supabase Edge Functions runtime limits (2s CPU, 256MB RAM, 150s free wall-clock, 20MB/5MB bundle) — official docs via Context7 (`supabase/supabase`, guides/functions/limits.mdx) — **HIGH confidence**
- Supabase Storage: 50MB max file (free), RLS policies on `storage.objects`, image transformations — official docs via Context7 — **HIGH confidence**
- Supabase RLS policy patterns (profiles example, `auth.jwt()` claims) — official docs/examples via Context7 — **HIGH confidence** for mechanics; the custom-claim PIN pattern itself is a standard composition — **MEDIUM confidence**
- Tesseract.js v6: `createWorker`, worker reuse, `rectangle` region recognition, character whitelist, browser image formats — official API docs via Context7 (`naptha/tesseract.js`) — **HIGH confidence**
- Stat-tracking panel architecture family (EAFC card sites, guild trackers): thin SPA + BaaS + client ingestion — training-data pattern consensus, consistent with all verified component docs — **MEDIUM confidence**

---
*Architecture research for: NeoFoot guild stats panel (Ragnarok Origin)*
*Researched: 2026-10-07*
