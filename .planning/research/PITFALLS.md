# Pitfalls Research

**Domain:** OCR-based guild stat tracking panel (Ragnarok Origin screenshots → web rankings)
**Researched:** 2026-10-07
**Confidence:** MEDIUM (OCR-on-game-screenshots claims are LOW/MEDIUM — needs early prototype; Supabase free-tier limits verified HIGH against official docs)

## Critical Pitfalls

### Pitfall 1: OCR accuracy collapse on mobile game screenshots

**What goes wrong:**
Tesseract.js (the only realistic in-browser OCR option) reads garbage on Ragnarok Origin stat screens: stylized game fonts, small digit glyphs, dark/gradient backgrounds, overlapping UI decorations, and thousands separators (`1.234.567` in Portuguese locale) get misread as letters, swapped digits (5↔S, 1↔l, 0↔O), or merged numbers. A naive "upload screenshot → trust OCR" flow produces silently wrong stats — worse than an error, because a wrong CRIT value corrupts rankings and no one notices.

**Why it happens:**
Tesseract was trained on printed documents, not game UI. Developers test OCR on a clean screenshot once, it half-works, and they ship it. Also, running OCR on the full screenshot instead of cropped regions mixes stat labels with values and destroys accuracy.

**How to avoid:**
- Never OCR the full image. Crop to known rectangles (the panel already prescribes 3 fixed screenshot types — General, Quasi, Special — so each has a predictable layout). Tesseract.js supports `rectangle: {top, left, width, height}` per recognize call (verified, HIGH confidence).
- Preprocess before recognition: grayscale → upscale 2–3x (nearest/lanczos) → binarize with a threshold. This alone typically doubles digit accuracy on dark game UIs.
- Set `tessedit_char_whitelist: '0123456789.,'` for value fields — you only ever read numbers (verified, HIGH confidence).
- Use Tesseract's per-word confidence scores (`word.confidence` in the result tree, verified) to auto-flag any field below ~85 confidence for manual fix-up — the project's "failed OCR captures are manually fixed" rule should be *confidence-triggered*, not user-judged.
- Run sanity-range validation per stat (e.g., HP must be 5- to 7-digits; CRIT RES % can't be 9,999; parsed value must differ from the stat label). Reject nonsense before it enters the DB.
- **Build an OCR spike/prototype phase FIRST.** If Tesseract accuracy on real guild screenshots is below ~70% field-level, pivot to manual entry with side-by-side example images (the project already shows example shots) — manual entry with good UX beats OCR with 30% garbage. This is the single biggest technical unknown in the project.

**Warning signs:**
- More than ~25% of submissions require manual fixes on multiple fields.
- Players complain their stats "look wrong" after registration.
- OCR round-trip test on 10 real screenshots produces inconsistent values for the same stat.

**Phase to address:**
OCR intake phase — but validate feasibility in a Phase 1 spike before committing the architecture to OCR.

---

### Pitfall 2: Percentile math is meaningless at guild sample sizes

**What goes wrong:**
"Top 1% = 99 points" is an EAFC concept built on *millions* of players. In a guild of 15–40 players, "top 1%" is zero or one person, and naive percentile formulas produce absurd results: the best player of 15 gets 99 while second place gets 7, or everyone clusters at 50. Also, every new submission reshuffles everyone's percentile → all delta badges and points churn simultaneously, making the panel feel unstable and random.

**Why it happens:**
Developers reach for the textbook percentile (CDF interpolation) or a linear mapping without thinking about n=15. The EAFC feel is copied without its statistical foundation.

**How to avoid:**
- Use **rank-based percentile**: `points = (count_of_players_below / (n - 1)) × 99`, which guarantees the best player of any sample gets 99 and the worst gets 0, with even distribution between. This preserves the "99 = top of the class" feel at any n.
- Handle ties explicitly (equal values → equal points; average ranks are the standard choice).
- Decide the churn policy deliberately: recompute points on every submission (live rankings, churny) vs. snapshot weekly/officer-triggered (stable). For a small guild, **snapshot or on-submit recompute both work — but delta badges should compare raw stat values between a player's own submissions (as specified), never percentile positions**, or badge noise becomes unbearable.
- With small n, "bottom 30% of Assassins" = ~4 players. Show rank ("7th of 15") alongside percentile — it's more honest and more motivating at this scale.
- Define the formula in one place (a pure TypeScript function) with unit tests, not inline in components.

**Warning signs:**
- Points distribution is bimodal or everyone has ~50.
- A single new submission changes 10+ players' points dramatically.
- Players dispute their percentile ("I'm clearly better than X but we have the same score").

**Phase to address:**
Rankings/computation phase — write the formula spec + tests before any UI shows points.

---

### Pitfall 3: 4-digit PIN auth has no identity and is trivially brute-forceable

**What goes wrong:**
A single shared 4-digit PIN (10,000 combinations) gives access but zero identity: the server can't tell *who* submitted stats, so anyone with the PIN (which lives in guild chat) can submit fake stats as any player. A shared officer PIN means any member who learns it can delete other players' registrations. And an unthrottled PIN check is brute-forced in minutes.

**Why it happens:**
"Keep friction low" gets interpreted as "one shared password." The panel conflates *access control* (who can enter) with *identity* (who is this submission from).

**How to avoid:**
- **Per-player PINs, not one shared PIN.** A 4-digit PIN per player turns the PIN into identity: entering `PIN + selecting your name` (or just PIN, if PINs are unique) authenticates as that player. Officer PINs are per-officer too. Owner grants officer role in the DB, not by sharing a special PIN.
- **Hash PINs.** Store bcrypt/argon2 hashes, never plaintext — even for 4 digits. A leaked DB dump must not leak everyone's PIN.
- **Rate-limit PIN attempts** server-side (e.g., 5 attempts → 15-minute lockout, tracked in a table or enforced in a Supabase RPC / Edge Function). Client-side throttling is trivially bypassed.
- Enforce everything with **Supabase Row Level Security**. The anon key ships in the browser bundle — RLS is the only real access control. Sessions via signed JWT (Supabase can issue custom tokens via RPC, or use a lightweight session table + Edge Function).
- Never trust a client-supplied player identity: the authenticated session *is* the player.

**Warning signs:**
- Any API call that accepts `player_id` as a parameter from the client.
- PIN stored as a plain string in the DB.
- Officer actions performed from the client with a client-checked "isAdmin" flag and no RLS policy.

**Phase to address:**
Auth/security phase — but the data model phase must set up RLS-ready schema and per-player identity from day one (retrofitting RLS is painful).

---

### Pitfall 4: "Hidden key stats" enforced only in the UI = stat skewing still possible

**What goes wrong:**
The anti-gaming design (key stats hidden from members) fails if implemented client-side: if the API returns all stat columns and React merely hides the key ones, any member can open DevTools and read the key stats — then pump exactly those 6 stats. Similarly, if the OVR is computed in the browser from raw stats, the formula and key-stat selection are fully exposed. Aggregates also leak: "guild average + best in guild" per class reveals individual top values in a 15-person guild.

**Why it happens:**
Frontend devs default to "fetch everything, filter in the UI." Security-in-visibility is security theater.

**How to avoid:**
- Enforce hiding **server-side**: expose a view (or RLS policy with column restrictions / a Postgres view with `security_invoker = false`) that omits key-stat raw values from member queries. Members query the view; admins query the base table.
- Compute OVR **in the database** (Postgres function) so the key-stat list and weights never leave the server for member requests.
- Store the key-stat configuration (which 6 stats per class) in a table readable only by admins via RLS.
- Accept that aggregates leak *some* info (avg + top value in a tiny guild ≈ identifying the top player) — mitigate by showing rounded averages and "top value" only as tier context, or only on the officer-facing screen. The improvement screen's "best in guild" value is a known, accepted leak — document it as a conscious tradeoff.
- Note: the delta-badge + re-submit loop lets a determined player bisect which stats move their OVR (submit, watch which badge moves). This is inherent to the design; officer screenshot validation is the real control. Keep officer validation of submissions as a required step for ranking eligibility.

**Warning signs:**
- Any component receives full stat rows and hides columns in render.
- OVR computed in `useMemo` from fetched raw stats.
- Members can hit the base table directly via the anon key.

**Phase to address:**
Data model + rankings phases (server-side compute), verified in the security phase.

---

### Pitfall 5: Free-tier backend limits — pausing, 500MB read-only, and screenshot storage

**What goes wrong:**
Supabase free tier (verified against official docs, HIGH confidence): **projects pause after 7 days of inactivity** (panel returns errors until manually restored), **500MB database size triggers read-only mode** (writes fail — submissions silently break), **1GB file storage**, **5GB egress/month**, limit of 2 active projects. Screenshot-heavy flows die fast: 3 screenshots × ~3MB × 30 players × resubmissions ≈ 270MB+ of images — blowing the 1GB storage and contributing to egress. A dead backend mid-season is the most likely "the panel is down" incident.

**Why it happens:**
Greenfield projects test with 3 rows and never model realistic volume; the pause-after-inactivity behavior surprises teams that don't ping their project.

**How to avoid:**
- **Don't store full screenshots.** Store only the OCR'd/corrected values (tiny rows) + optionally a compressed, downscaled thumbnail (e.g., 480px WebP, ~30–80KB) for officer validation. That keeps you under 100MB forever. If officers need the original for dispute review, keep only the *latest* submission's images and delete older ones.
- Schedule a weekly keep-alive (a cron hitting a cheap RPC or Edge Function) OR accept the pause and document a "restore ritual" (login to Supabase dashboard → restore, 30 seconds) for the owner. With a guild panel, usage is probably weekly anyway — verify actual traffic patterns.
- Store **raw stats, compute OVR/percentiles on read** — this also avoids storing historical derived data that goes stale when admins tweak key stats.
- Handle the 540 "project paused" error gracefully in the UI with a message for the owner, not a silent failure.
- RLS policies + indexes count toward the 500MB — negligible here, but avoid unbounded log tables.

**Warning signs:**
- Any code path uploading original screenshots to Supabase Storage.
- Database size > 100MB in the Supabase dashboard.
- First "project paused" error report from a guildmate.

**Phase to address:**
Data model phase (storage decisions) + deployment/ops phase (keep-alive, error handling).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Wide table with 40+ hardcoded stat columns | Simple queries, fast start | Every new stat / admin tweak = migration; key-stat config can't be a table | Never — use a normalized `stat_definitions` + `stat_values` (EAV-style) or JSONB values with a definitions table |
| Computing OVR/percentiles in React | No DB functions needed | Exposes formula + key stats; recomputation drift; can't enforce server-side | Never (see Pitfall 4) |
| Storing OVR/points at submission time | Fast dashboards | Admin key-stat changes make historical OVRs inconsistent; migrations on every tweak | Only if you snapshot *and* version the key-stat config; on-read compute is simpler |
| Skipping RLS "until later" | Faster MVP | Retrofitting RLS across all tables + views is a full security phase by itself; data leaks in the meantime | Never |
| Client-side-only officer check | Quick to build | Anyone can delete registrations via the anon key | Never |
| String-typed stat values ("1.234.567", "12.5%") | No parsing step | Impossible to rank/aggregate; locale bugs compound | Never — parse to numbers at intake, store `value` (numeric) + `value_type` (FLAT/PERCENTUAL) separately |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Tesseract.js | OCR the whole screenshot; trust raw output; no confidence check | Crop rectangles per stat group, preprocess (grayscale/scale/threshold), whitelist digits, threshold word confidence for auto-flagging |
| Tesseract.js (WASM) | Loading worker + language data on every page load; blocking UI thread | Create worker once (app-level singleton); language data ~10MB — cache it; use `createWorker('eng', 1, {...})` with SIMD core |
| Supabase Storage | Storing original screenshots; public buckets for private data | Downscaled thumbnails in a bucket with RLS-backed access; originals not stored (or latest-only) |
| Supabase Auth | Trying to use Supabase Auth (email/OTP) for PIN login; fighting the framework | PIN auth is custom: an RPC `authenticate(pin)` returning a signed session or a session row; don't force-fit Supabase Auth providers |
| Postgres RLS | Assuming policies on tables suffice when using views | Views need explicit `security_invoker` consideration; column-hiding views must not be queryable back to base table via the anon role |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Recomputing all percentiles client-side on every dashboard render | Slow dashboards, janky UI, formula duplicated everywhere | Compute in DB (function or materialized view refreshed on submission) | ~30+ players × 40+ stats |
| Full-table scans on stat_values without composite indexes | Dashboards slow as submissions accumulate | Index `(player_id, submitted_at)` and `(stat_id)`; guild is small but delta queries compound | ~500+ submissions |
| Loading OCR WASM + traineddata (~10MB) synchronously at app start | Blank screen, high bounce on mobile | Lazy-load worker only on the submission screen; show a loader | Immediately on mobile connections |
| Storing every screenshot version on resubmission | Storage quota exhaustion | Store values only; images latest-only with cleanup | ~100–200 submissions |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Shared 4-digit PIN as sole auth | No identity; forged submissions; trivial brute force | Per-player PINs, hashed, rate-limited server-side (Pitfall 3) |
| Plaintext PIN storage | DB dump leaks every member's PIN | bcrypt/argon2 hashes |
| Officer actions without RLS | Any member can delete players/registrations | RLS policies + per-officer identity; role granted in DB by owner |
| Key stats returned by API, hidden in UI | Members read key stats via DevTools → pump exactly those stats → anti-gaming defeated | Server-side column-hiding view + DB-computed OVR (Pitfall 4) |
| Members querying other players' raw values | Privacy breach; also enables target-browsing | RLS: members read own rows + aggregates view only; officers read all |
| No validation that submissions belong to the guild | Rival-guild players pollute rankings (officers must "block access from other guilds" — this must be enforced, not just manual) | Officer validation gate before a submission counts for rankings; guild roster table |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| OCR failure = "retake screenshot" loop | Members give up on registration | Confidence-flag specific fields; inline edit boxes beside the screenshot crop so one misread field is a 2-second fix, not a retake |
| Example screenshots from a different game version/language than members' clients | OCR + manual entry both degrade; members confused about which screen to shoot | Example shots taken from the *same* client/language the guild uses (Portuguese), with red-box annotations of crop regions |
| Delta badges comparing percentile position instead of raw values | Points churn makes effort look random | Compare raw stat values vs. player's own last submission (as PROJECT.md specifies); show points changes separately and rarely |
| First submission shows a confusing empty/zero delta | Feels broken | Show "baseline" label or hide the badge entirely on first submission |
| Promotion page exposing individual key stats | Conflicts with "members see aggregates only"; enables gaming | Decide explicitly with the owner: promotion cards show class + overall + tier, not the underlying key-stat values |

## "Looks Done But Isn't" Checklist

- [ ] **OCR intake:** Often missing confidence-triggered manual fix-up — verify every low-confidence field is flagged, not just total-OCR failures
- [ ] **Percentiles:** Often missing tie handling and the n-1 rank formula — verify best player of a 5-person sample gets 99, ties get equal points
- [ ] **OVR floor of 51:** Often missing edge case where key stat set changes — verify OVR recomputes consistently and never dips below 51 after admin tweaks
- [ ] **Key-stat hiding:** Often missing server-side enforcement — verify member API responses contain no key-stat raw values (test with the anon key + DevTools)
- [ ] **Delta badges:** Often missing first-submission baseline handling and corrected-resubmission semantics — verify a corrected submission doesn't create a fake "improvement" badge
- [ ] **Officer validation:** Often missing guild-membership check — verify a submission from a non-rostered player can't rank
- [ ] **Free tier:** Often missing pause/read-only handling — verify UI shows a friendly error on HTTP 540 and on write failures

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| OCR accuracy too low | MEDIUM | Pivot to manual entry with side-by-side example images (already designed in); keep OCR as optional autofill if partially accurate |
| Corrupted stat values entered | LOW | Officers can edit/delete registrations (already in requirements); add a "bulk revalidate" tool for officers |
| Percentile formula wrong after launch | LOW | Formula is one pure function — fix + recompute; communicate the correction to the guild |
| Key stats leaked / ranks pumped | MEDIUM | Rotate key-stat set, delete/waive inflated submissions, officer validation made mandatory for ranking |
| PIN compromised / forged submissions | LOW | Per-player PIN rotation (owner resets via DB); hashed storage means server can reset but not reveal |
| Supabase project paused | LOW | Owner restores from dashboard (30s); add keep-alive cron to prevent recurrence |
| 500MB read-only mode hit | MEDIUM | Delete old screenshots/logs, vacuum, upgrade to Pro ($25/mo) if recurring |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. OCR accuracy collapse | Phase 1 spike (feasibility) → OCR intake phase | Round-trip test: 10 real screenshots, >90% field accuracy or pivot decision documented |
| 2. Percentile math at small n | Rankings/computation phase | Unit tests: best-of-5 = 99, ties equal, distribution not bimodal |
| 3. PIN auth identity + brute force | Data model phase (schema) → Auth/security phase | Attempt-limit lockout works; DB stores hashes only; no client-supplied player_id trusted |
| 4. Hidden key stats enforced server-side | Data model + rankings phases | Anon-key query returns no key-stat values; OVR computed in DB |
| 5. Free-tier limits | Data model (storage decisions) → deployment/ops phase | DB < 100MB with realistic data; 540 error handled in UI; keep-alive or restore ritual documented |
| EAV/normalized stat schema | Data model phase | Adding a new stat requires zero migrations (insert a definition row) |
| Officer validation gate | Data model + dashboard phases | Non-rostered submission can't rank |

## Sources

- Supabase official docs — Free plan limits, project pausing, database size, HTTP 540 error (via Context7, sourced from supabase/supabase GitHub: `plans.ts`, `free-project-pausing.mdx`, `database-size.mdx`) — HIGH confidence
- Tesseract.js official docs — `rectangle` option, `tessedit_char_whitelist`, per-word confidence structure, preprocessing examples (via Context7, sourced from naptha/tesseract.js GitHub `docs/api.md`, `docs/examples.md`) — HIGH confidence on API
- Tesseract accuracy on stylized game UI / small digit glyphs — known engine limitation (Tesseract is document-trained) — MEDIUM confidence, flagged for Phase 1 spike validation
- EAFC Ultimate Team percentile model mechanics — community knowledge — LOW confidence on exact formulas; the rank-based adaptation recommendation is a design judgment, not a copy
- Small-sample percentile behavior (n-1 rank method, tie handling) — standard statistics — HIGH confidence

---
*Pitfalls research for: NeoFoot — Ragnarok Origin guild stats panel*
*Researched: 2026-10-07*
