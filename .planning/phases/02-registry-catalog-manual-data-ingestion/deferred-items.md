# Phase 2 Deferred Items

Out-of-scope discoveries logged during plan execution (per executor scope
boundary — NOT auto-fixed, carried forward for routing).

| Found during | Item | Suggested routing |
|--------------|------|--------------------|
| 02-01 task 2 (live deploy + smoke) | **`supabase/functions/verify-pin/index.ts` line 58 has a latent ReferenceError**: `typeof discordHandle === 'string'` references an undefined variable (should be `body.discord_handle`). The *locally modified* function would throw → 500 on EVERY login request once redeployed. The currently LIVE deployed function is the pre-review-fix version, so logins still work — but the standing owner action "redeploy verify-pin" (STATE.md blocker, 01-REVIEW-FIX) MUST NOT be executed before fixing this line. Not fixed here: out of this plan's scope (02-01 touches no function code). | One-word fix + a login-path test before the verify-pin redeploy; route to next maintenance/review-fix pass or the 02-03 UAT prep. |
| 02-01 task 2 | PostgREST returns **204 even when a PATCH matches 0 rows** — any future smoke/UAT asserting officer PATCHes must re-read the row to prove effect (smoke-rls.mjs already does). | Carry as a testing convention for Phase 6 officer tooling. |
