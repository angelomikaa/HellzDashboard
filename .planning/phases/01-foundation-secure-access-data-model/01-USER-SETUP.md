# Phase 01: User Setup Required

**Generated:** 2026-10-08
**Phase:** 01-foundation-secure-access-data-model
**Status:** Incomplete

Complete these items for local development and CLI deploys to function. OpenCode automated
everything possible (project linked, schema + seed pushed to `thdxyxsjafimxgxpmpqs`);
these items require human access to the Supabase dashboard.

## Environment Variables

| Status | Variable | Source | Add to |
|--------|----------|--------|--------|
| [x] | `SUPABASE_PROJECT_REF` | Already known: `thdxyxsjafimxgxpmpqs` (project linked) | `.env` (optional, used by scripts) |
| [ ] | `VITE_SUPABASE_URL` | Supabase Dashboard → Project Settings → API → Project URL | `.env` |
| [ ] | `VITE_SUPABASE_ANON_KEY` | Supabase Dashboard → Project Settings → API → anon public key | `.env` |
| [ ] | `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API → service_role key (**server-side only** — never in the client bundle or `.env.example`) | `.env` (only if running server-side scripts locally) |
| [ ] | `SUPABASE_ACCESS_TOKEN` | Supabase Dashboard → Account → Access Tokens (needed for non-TTY `supabase db push` / `supabase link`) | shell session or local secret store — **do not commit** |

Note: `.env` and `.secrets/` are gitignored (D-10/D-11). `.env.example` ships only the two
`VITE_*` vars.

## Account Setup

- [x] **Create Supabase project** — done: `thdxyxsjafimxgxpmpqs` (schema + whitelist seed already applied).

## Dashboard Configuration

- [ ] **Rotate placeholder whitelist rows before inviting real members**
  - Location: edit `supabase/seeds/whitelist.sql` (replace `owner-handle` / `officer-handle` /
    `member-handle` and their PINs), then re-apply via the SQL Editor or Management API
  - Hash each real PIN with: `node scripts/hash-pin.mjs <pin>`
  - Current placeholder rows all use PIN `1234` — for proving the pipeline is live only
- [ ] **Share real PINs with members out-of-band** (e.g. Discord DM, per D-03) — never in git

## Verification

After completing setup, verify with:

```bash
# 1. Copy .env.example to .env and fill VITE_* values, then:
npm run dev          # app should serve at http://localhost:5173

# 2. Schema reachable (service_role key required):
#    GET https://thdxyxsjafimxgxpmpqs.supabase.co/rest/v1/members?select=id&limit=1
#    with headers apikey + Authorization: Bearer <service_role key> -> HTTP 200

# 3. Anon key CANNOT list members (RLS deny-all until Plan 01-02 policies):
#    same GET with the anon key -> HTTP 200 with []
```

Expected results:
- Dev server starts without the "Missing VITE_SUPABASE_URL" error
- service-role GET returns 200; anon GET returns an empty array

---

**Once all items complete:** Mark status as "Complete" at top of file.
