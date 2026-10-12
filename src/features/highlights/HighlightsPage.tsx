// Destaques promotion page — PLACEHOLDER ONLY (06-04): an interface stub so
// App.tsx's tab wiring typechecks in this plan. Plan 06-05 (next wave) owns
// this file and REPLACES the body entirely with the real EAFC card page fed
// by fetchPromotion.
import type { NeoFootSession } from '../auth/session'

export function HighlightsPage(_props: { session: NeoFootSession }) {
  return <p className="text-sm text-muted">Carregando…</p>
}
