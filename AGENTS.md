# AGENTS.md — NeoFoot

## Project

NeoFoot — a web panel for a single Ragnarok Origin guild. Players submit character stats via 3 screenshots per character (OCR auto-read + mandatory manual fix-up). The panel stores stats immutably, computes per-stat percentile ranks (EAFC Ultimate Team feel: rank-based points, top ≈ 99) and an overall rating (OVR) from 6 admin-tweakable key stats per class (floor of 51, hidden from members server-side), shows tiered stat cards (bronze/silver/gold/platinum), per-stat comparisons vs class average/best, and a promotion page for top players. Access is a per-player 4-digit PIN (hashed) with officer elevation.

- **Core value:** each player sees where they stand vs same class/function and what to improve.
- **Current focus:** Phase 1 — Foundation — Secure Access & Data Model.
- See `.planning/PROJECT.md` for full context, `.planning/ROADMAP.md` for phases.

## Tech Stack

- Frontend: TypeScript + React 19 + Vite + Tailwind CSS v4
- Backend: Supabase free tier (Postgres + RLS + Edge Functions + Storage)
- OCR: Tesseract.js client-side (region-based, digit/percent whitelist, preprocessing)
- All rank math in Postgres RPCs; all access control in RLS — never UI-only

## GSD Workflow (Mandatory)

This project uses GSD (Get Shit Done) for planning and execution. State lives in `.planning/`.

1. **Never skip planning.** Each phase is planned via `/gsd-plan-phase N` before execution.
2. **Follow ROADMAP.md.** Phases and requirement mappings are there. Don't invent scope.
3. **Requirements live in REQUIREMENTS.md** with REQ-IDs (AUTH-01, REG-01, ...). Traceability maps requirements to phases.
4. **After phase execution**, run `/gsd-verify-work` to confirm must-haves were delivered, then `/gsd-transition`.
5. **Atomic commits.** Commit each unit of work immediately with clear messages.
6. **Read `.planning/STATE.md`** at session start for current position, blockers, and decisions.
7. **Security rules (non-negotiable):**
   - Key-stat config must never appear in member-facing API responses (server-side filtering, RLS, SECURITY DEFINER RPCs with internal role checks).
   - Members see aggregates only — never other individuals' values.
   - PINs stored hashed; rate-limit PIN attempts server-side.
   - RLS policies on every table; non-whitelisted access blocked at the server.
8. **Submissions are append-only** — never overwrite past submissions.
