# Deferred Items — Phase 07.1

## From owner gate round 5 (fix commit 747bc8a)

**Pre-existing `animate-pulse` on OCR-running inputs (D-05 adjacency, out of scope)**
- **Files:** `src/features/submit/SubmitPage.tsx` (~line 426), `src/features/submit/StatGroupStep.tsx` (~line 111)
- **Observation:** Both OCR-reading inputs toggle Tailwind's `animate-pulse` (an opacity keyframe loop) while OCR runs. D-05 says "static glows only — no animated pulses", but this is a phase-05 functional loading indicator (not a neon glow), it predates 07.1, and previous gate rounds passed it (the D-05 gate greps for `@keyframes`/`animation` declarations in src, which a utility class name does not match). Per the scope-boundary rule it was NOT touched this round.
- **Suggested resolution:** If the owner wants strict static-only compliance, replace the pulse with a static state (e.g. muted placeholder + "Lendo…" status text) in a future polish round. Owner decision required.
