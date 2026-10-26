# DISCORD-OAUTH-DESIGN — Verified Access (Phase 11) design brief

**Written:** 2026-10-26 · **Status:** pre-planning brief for `/gsd-plan-phase 11`
**Requirements:** DSCD-01..DSCD-06 (REQUIREMENTS.md "Verified Access — Claim Authorization & Discord OAuth")

> **⚠ SUPERSEDED TWICE, SAME DAY:** the Wave 0 stopgap described in §2 (migration 0032) was REVERTED by
> **0033_one_go_registration.sql** (owner: one-go registration), and 0033 was then EVOLVED by
> **0034_manual_first_access.sql** — the CURRENT contract: **the print is eliminated from Primeiro
> acesso entirely**. The player TYPES the identity (handle, nick, char ID, class) + PIN in one form,
> and EVERY first access is an officer-approved request (`claim` for an unclaimed registry row — the
> approval activates the PIN on it; `registration` for an unknown character). The auto-claim Edge
> function (setup-pin) and its RPCs are retired. §2 below is kept as history of what shipped and why;
> the 0032 machinery lives only in git history.
> **Consequence for Phase 11:** the officers ARE the identity check today (typed identity + their
> judgment against the roster/Discord). DSCD-01's guarantee holds — no unclaimed row is claimable
> without an officer decision — but it is entirely manual trust, which is exactly what the
> Discord↔character link must automate. This makes Phase 11 the security-critical phase, not a
> convenience phase.

---

## 1. The problem, precisely

A Basic-screen print proves *the character exists* — never *that the person holding the picture owns it*. The print, the nickname and the char ID are all public (cards are posted in Discord daily). Pre-0032, an unclaimed registry row was auto-claimable on a print match (`ready` → PIN setter), so anyone with a stolen card could set the victim's PIN first and take over the account. OCR accuracy is irrelevant to this threat: even a perfect read is a public-data read.

**Trust hierarchy decided with the owner (2026-10-26):**

1. The print = evidence + typo prevention (stats/class/ID read, officer review queue). **Never the identity anchor.**
2. Discord OAuth = proof of control of a Discord account. Strong, but proves nothing about *which character* that account plays.
3. The **Discord↔character link** = the real trust root. The guild bot has **roster/roles only** (owner-confirmed) — no mapping exists — so the link must be created **once per member with human confirmation**, after which it is the unspoofable anchor.

## 2. What 0032 changed — shipped 2026-10-26, REVERTED same day by 0033 (kept as history)

- `members.claim_authorized_at` / `claim_authorized_by` — the officer authorization stamp.
- `claim_pin_by_nickname` v2 raises `claim_not_authorized` (the server-side choke point — the PIN setter cannot be opened by a forged/stale client).
- `first-access` lookup answers `claim_review` / `claim_pending` for unclaimed rows; `ready` now REQUIRES the stamp.
- New `first-access` action `claim` → `create_claim_proof(p_nickname, p_char_id, p_char_class, p_proof_path)`: one pending `identity_proofs` row per member (re-send replaces it and returns `replaced_path` for server-side purge). No typed handle is sent — the officer contacts the **registry** handle, never a spoofable typed one.
- `review_identity` v3: Confirmar on an **unclaimed** row authorizes the claim; refusal refuses the claim but **keeps the registry row active** (a hijack attempt must never delete the real player's row). Claimed-member behaviour (D-05 deactivate) unchanged.
- `approve_request` v4: a registration approval sets the stamp (the officer just reviewed that print+handle — no double review). Staff PIN resets keep working because the stamp set at first claim is never cleared (reset = the player asked staff, 2026-10-23 owner rule).
- `staff_identity_queue` v2 exposes `pin_set`/`claim_authorized`; the Identidades board renders unclaimed rows as "first-access authorization" with a contact-the-owner hint.
- **Deploy order (non-negotiable):** 0032 → `first-access` + `setup-pin` functions → client bundle.

## 3. End state (Waves 1+)

### 3.1 Schema (one migration, next number after live head)

- `members.discord_user_id text unique` (Discord snowflake, stored as text; `null` = unlinked) + `discord_verified_at timestamptz`.
- Link audit: append-only `member_discord_links` (member_id, discord_user_id, action linked/unlinked/changed, decided_by, created_at) — mirrors `member_identity_history` discipline.
- Link request surface: reuse the claim pattern — `discord_link_requests` OR reuse `membership_requests` with a new `request_type` (decide at planning; note 0014's unique pending indexes are per `lower(discord_handle)` and per `char_id`, so a new type needs its own uniqueness story).
- Keep `discord_handle` as the staff-facing contact field; it stops being security-relevant.

### 3.2 The one-time link (the human step that makes OAuth safe)

1. Player signs in with Discord (OAuth) for the first time → the panel finds no `discord_user_id` → **no session**; they see "link this Discord to your character" and pick/confirm their nickname (print optional as evidence).
2. A link request lands in the officer queue (Validações), next to the claim proofs — same review ergonomics: the officer **DMs the registry handle** and confirms the person is the player.
3. Officer confirms → `discord_user_id` set → from then on OAuth login resolves the member directly; the print never gates anything again.
4. Link changes/unbinds are staff-only and audited. Owner OAuth recovery path: owner can unlink/relink (owner rule D-08 pattern).

**Bootstrap shortcut (decide at planning):** the officer who authorizes a 0032 claim may optionally record the Discord user at the same time (they are already talking to the person) — the link and the claim authorization become one review, cutting the second round trip for the migration cohort.

### 3.3 OAuth + role check (all server-side)

- Supabase Auth **Discord provider**, scope **`identify` only** (no `guilds`, no `email` — minimal surface; the client's guild list is never trusted).
- Guild check: Edge Function/server calls Discord `GET /guilds/{guild}/members/{user_id}` with the **bot token** (server env only), verifies membership + required role. Never client-claimed, never in the browser.
- Login contract: OAuth → resolve `auth.users.id` → `members` row via a link table (`auth_user_id` ↔ `member_id`) or direct column → check guild role → session.
- **Supabase "custom access token hook"** (Auth hook, a Postgres function) injects `member_id` + `member_role` claims into the access token → **every `auth.jwt()->>'member_id'` RLS policy (0002), RPC gate and `assert_device_bound` keep working with zero policy rewrites.** This replaces `_shared/session.ts` `mintSession` (hand-minted HS256 with `NEFOOT_JWT_SECRET`).
- Client: `@supabase/supabase-js` is already a dependency; `signInWithOAuth({ provider: 'discord' })` + session persistence replaces the PIN login path.

### 3.4 Open decisions to close at `/gsd-plan-phase 11` (owner gates)

| # | Decision | Options | Recommendation |
|---|----------|---------|----------------|
| D-11-1 | PIN fate once OAuth is mandatory | (a) hard removal, (b) recovery-only fallback | (b) first (recovery for lost Discord access), remove in a later release |
| D-11-2 | `assert_device_bound` (0024) under Supabase Auth | (a) port the claim into the hook (hook has no request headers — needs a different transport), (b) drop it and rely on step-up (0016/0017) for the four staff RPCs | (b) — step-up already exists for exactly these RPCs |
| D-11-3 | Outstanding hand-minted JWTs | (a) let the 7-day expiry drain them, (b) `NEFOOT_JWT_SECRET` rotation forces immediate re-login | (a) + rotation only if an incident demands it |
| D-11-4 | Link request surface | (a) new `discord_link_requests` table, (b) extend `membership_requests` | (a) — the 0014 pending-unique indexes don't fit link requests |
| D-11-5 | Required Discord role | which role(s) gate panel access | owner names the role; check server-side against it |
| D-11-6 | Bootstrap of the existing claimed roster | officers link on demand vs. bulk link pass | on demand (each member's next login) — matches the 0032 claim reviews already in flight |

### 3.5 Threat model after Phase 11

| Attack | Pre-0032 | After 0032 | After Phase 11 |
|---|---|---|---|
| Stolen card → claim someone's row | ✅ worked | ❌ officer refuses (DMs the registry handle) | ❌ needs the victim's Discord account |
| Guild member claims a teammate's character | ✅ worked | ⚠️ needs an officer mistake (fake DM story) | ❌ needs the teammate's Discord account |
| Officer-fooled link request (imposter) | n/a | n/a | ⚠️ residual: human review is the last line — mitigated by DMing the REGISTRY handle, never a typed one |
| PIN brute force | lockout | lockout | gone (no PIN) / recovery-only |

## 4. Migration risks to plan for

- **Never break RLS**: the custom access token hook must ship with a probe battery (every RPC gate + policy still answers correctly under an Auth-issued JWT).
- **Two session types will coexist** during rollout (hand-minted PIN sessions + Auth sessions). All gates key on claims, not token shape — keep it that way; add a claim marker to distinguish issuers for observability.
- **Free tier**: Supabase Auth + hooks are supported on the free tier; bot token lives in Edge Function env (`NEFOOT_DISCORD_BOT_TOKEN`), never in the client.
- **Deploy order**: migration → functions → client, same invariant as 0014/0020; the 0032 stopgap is already live-path independent of OAuth (it gates claims regardless of login method).
- **0032 makes the OAuth rollout pressure-free**: until every member is linked, the officer-authorized claim flow keeps the panel safe. No big-bang cutover needed.

## 5. Suggested wave structure (for the planner)

- Wave 1 — schema + link request/approval (officer-confirmed `discord_user_id`), link audit, staff surfaces.
- Wave 2 — Supabase Auth Discord provider + custom access token hook + RLS probe battery + bot-token role check Edge Function.
- Wave 3 — client login swap (Entrar com Discord), link-on-first-login flow, PIN recovery-only decision implementation.
- Wave 4 — live verification battery + owner walk (a real member links + logs in end to end; an unlinked account gets no session; a roleless member gets no session).
