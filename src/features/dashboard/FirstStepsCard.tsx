// FirstStepsCard — the Painel's empty state (no validated stats yet).
//
// Three audiences share one card: a member who never submitted, one waiting
// for an officer, and one whose last submission was rejected. The copy names
// the current step instead of showing a generic "nothing here", which is where
// new members used to ask officers what to do next.
import type { Tab } from '../../App'

export function FirstStepsCard({
  hasPending,
  hasRejected,
  onNavigate,
}: {
  hasPending: boolean
  hasRejected: boolean
  onNavigate: (tab: Tab) => void
}) {
  const title = hasPending
    ? 'Envio em análise'
    : hasRejected
      ? 'Vamos tentar de novo'
      : 'Comece por aqui'
  const body = hasPending
    ? 'Um oficial vai revisar suas capturas. Quando o envio for validado, seu card, OVR e pontos aparecem aqui.'
    : hasRejected
      ? 'Seu último envio foi rejeitado. Confira as capturas e envie novamente para um oficial revisar.'
      : 'Você ainda não tem status validados. O caminho é curto:'

  return (
    <section className="rounded-lg border border-line bg-surface p-6">
      <h2 className="text-xl font-semibold text-content">{title}</h2>
      <p className="mt-2 text-base text-muted">{body}</p>

      <ol className="mt-4 flex list-decimal flex-col gap-2 pl-5 text-base text-content">
        <li>
          Envie as capturas (<span className="text-muted">Basic, Geral, Quasi e Especial</span>) em{' '}
          <strong className="font-semibold">Enviar Status</strong>.
        </li>
        <li>
          Um oficial valida os valores — até lá o envio fica{' '}
          <span className="text-muted">pendente</span>.
        </li>
        <li>
          Seu card, o OVR e o <span className="text-muted">foco de melhoria</span> aparecem neste
          Painel.
        </li>
      </ol>

      <button
        type="button"
        onClick={() => onNavigate('submit')}
        className="mt-6 h-11 rounded-md bg-accent px-4 text-base font-semibold text-accent-foreground hover-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {hasPending ? 'Ver meu envio' : 'Enviar Status'}
      </button>
    </section>
  )
}
