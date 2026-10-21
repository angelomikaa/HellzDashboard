# Phase 8 — Deferred Items (discovered during execution)

Items found while executing Phase 8 that are **out of scope** for the plan that found them.
Do not fix them inside a plan that does not own the affected files.

| # | Found in | Item | Why deferred | Suggested owner |
|---|----------|------|--------------|-----------------|
| 1 | 08-02 | `record_pin_failure` (migration 0003) returns `o_failed_count = 0` on the **first** failure of a handle because the `INSERT ... ON CONFLICT` branch returns the column default instead of 1. Practical effect: a handle with no prior row locks on the **6th** wrong PIN, not the 5th (the counter itself is persisted correctly from the second attempt on). | Pre-existing since 0003; fixing needs a migration/function replacement (Rule 4 — architectural), not an Edge Function change. 08-02 only proved that the 409 unclaimed branch and the request-access `previous_pin` path do record failures. | A future security-hardening migration (`record_pin_failure` v2 returning `1` on insert), then re-run `smoke-identity.mjs` probe 16c/16x which currently assert two calls + `failed_count = 1`. |
| 2 | 08-02 | Supabase's HTTP gateway rejects very large function payloads (a 3 MB binary → ~4 MB base64 body) with **503 and no JSON body**, before the Edge Function's own `proof_too_large` check runs. | Platform behavior, not application code. The functions still return 413 for any body under the gateway cap whose decoded JPEG exceeds 2 MB (proved with a 2.3 MB image / ~3.07 MB body). | Document the effective client-side cap (≤2 MB JPEG) in the first-access/request UI plan; no server change. |
