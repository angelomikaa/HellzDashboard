// AnalysisSection — the statistical/audit surface of the staff Ranking page.
// It wraps the existing regression dashboard; the methodology and reference
// validation inside it are collapsed by default.
import { RegressionDashboard } from './RegressionDashboard'
import type { NeoFootSession } from '../auth/session'

export function AnalysisSection({ session }: { session: NeoFootSession }) {
  return (
    <div className="mt-4">
      <p className="text-sm text-muted">
        Análise exploratória dos envios validados: curvas por coorte, resíduos e a
        hipótese de buff de +35 p.p. em MATK%. O veredito é um sinal estatístico, nunca
        uma probabilidade de cheat.
      </p>
      <RegressionDashboard session={session} />
    </div>
  )
}
