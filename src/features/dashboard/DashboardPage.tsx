// DashboardPage — the Painel composition (04-UI-SPEC § Layout & Grid,
// CMP-01). Owns the page's data calls on mount, compute-on-read — no
// polling, no caching, no refresh button. Switching tabs unmounts this page
// (App renders conditionally), so returning to Painel refetches; that IS
// the refresh mechanism.
//
// 07.2-03 (D-01/D-02/D-07/D-08): the mount effect now fetches my_report and
// my_card IN PARALLEL (plus the member's own screenshot for the D-08
// download photo chain) — a my_card or photo failure must NOT kill the page
// (it degrades into a nullable myCard and the grouped view renders
// regardless); only an 'unauthorized' session error surfaces SESSION_ERROR
// per the page's existing contract. Above the unchanged 57-stat grouped
// view, the my_card payload renders as the EAFC key-stat hero strip
// (KeyStatCard) with the member's OWN card download (D-08 — same
// buildCardPlan/downloadCard export contract as the Destaques showcase).
//
// Security posture (AGENTS.md / 04-UI-SPEC hard rules): the my_report and
// my_card responses are rendered VERBATIM — this page never derives, hints
// at, or requests additional key-stat data (my_card carries ONLY the
// sanctioned 07.2 D-03 reveal, closed-typed in api.ts), never queries other
// individuals (aggregates only — the RPCs are the sanctioned boundary), and
// never computes points/OVR client-side: they arrive opaque and are
// presentation inputs exclusively.
//
// The Tab type is imported TYPE-ONLY from App (erased at build time — no
// runtime cycle with App's value import of this module).
import { useEffect, useMemo, useState } from 'react'
import {
  ApiError,
  fetchCardPhoto,
  fetchMyCard,
  fetchMyReport,
  type MyCard,
  type MyReport,
} from '../../lib/api'
import { GROUP_LABELS, GROUP_ORDER, type GroupKey } from '../../lib/groups'
import type { NeoFootSession } from '../auth/session'
import type { Tab } from '../../App'
import { StatCard } from './StatCard'
import { KeyStatCard } from './KeyStatCard'
import { OvrHero, ovrTierFor } from './OvrHero'
import { TierLegend } from './TierLegend'
import { FocusStrip } from './FocusStrip'
import { CollapsibleGroup } from './CollapsibleGroup'
import { CardPhotoUpload } from './CardPhotoUpload'
import { keyStatStripModel, priorityKeySet } from './keyStatStrip'
import { formatStatValue } from '../../lib/parseStatValue'
import { crestSrcFor } from '../assets/ClassCrest'
import { TIER_BORDER_DISPLAY } from './tierDisplay'
import { cardFilename, downloadCard, type CardExportData } from '../export/cardExport'

// Enumeration-safe pt-BR copy (KeyStatsPage pattern): raw server text is
// never rendered — errors map to one of two fixed strings.
const NETWORK_ERROR =
  'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
const SESSION_ERROR = 'Sua sessão expirou ou você não tem permissão. Entre novamente.'
const EMPTY_TITLE = 'Nenhum status enviado ainda'
const EMPTY_BODY =
  'Envie seus status para ver seus cards, sua posição na classe e o que melhorar.'
const STRIP_EXPLAINER =
  'Seus stats-chave aparecem aqui assim que a configuração da sua classe estiver completa.'
const DOWNLOAD_ERROR = 'Não foi possível gerar o card. Tente novamente.'

export function DashboardPage({
  session,
  onNavigate,
}: {
  session: NeoFootSession
  onNavigate: (tab: Tab) => void
}) {
  // null report = still loading; error holds the mapped pt-BR copy.
  // null myCard = still loading OR the my_card fetch failed (degrade — the
  // grouped view renders regardless; only the strip hides itself).
  // openGroups per D-05: Geral open by default, Quasi/Especial collapsed —
  // the page owns this state so focus jumps can expand a target group.
  const [report, setReport] = useState<MyReport | null>(null)
  const [myCard, setMyCard] = useState<MyCard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openGroups, setOpenGroups] = useState<Record<GroupKey, boolean>>({ general: true, quasi: false, special: false })

  // The member's own screenshot (07.2-05 round 7 photo consistency): an
  // object URL over the stored blob feeds the D-08 download's photo area —
  // same fallback chain as the on-page CardPhotoUpload preview (member
  // screenshot → class portrait → ASST-01 monogram).
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)

  // Mount-only fetches with a cancelled flag (KeyStatsPage pattern): the
  // three reads are independent surfaces, so a my_card or photo failure is
  // caught into null (the page still renders) while ONLY an unauthorized
  // my_report/my_card session error kills the page with SESSION_ERROR.
  useEffect(() => {
    let cancelled = false
    let photoObjectUrl: string | null = null
    Promise.all([
      fetchMyReport(session),
      // 07.2 D-08: the member's own card data (sanctioned D-03 reveal).
      fetchMyCard(session).catch((err: unknown) => {
        if (err instanceof ApiError && err.kind === 'unauthorized') throw err
        return null
      }),
      // The member's stored screenshot for the download's photo area —
      // BLOB → object URL (T-072-13: never a cross-origin URL, the export
      // canvas can never be tainted). Any failure degrades to the class
      // portrait via crestSrcFor.
      fetchCardPhoto(session).catch(() => null),
    ])
      .then(([r, card, photoBlob]) => {
        if (cancelled) return
        setReport(r)
        setMyCard(card)
        if (photoBlob !== null) {
          photoObjectUrl = URL.createObjectURL(photoBlob)
          setPhotoUrl(photoObjectUrl)
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(
          err instanceof ApiError && err.kind === 'unauthorized' ? SESSION_ERROR : NETWORK_ERROR,
        )
      })
    return () => {
      cancelled = true
      if (photoObjectUrl !== null) URL.revokeObjectURL(photoObjectUrl)
    }
  }, [session])

  function toggleGroup(g: GroupKey) {
    setOpenGroups((prev) => ({ ...prev, [g]: !prev[g] }))
  }

  // Focus jump (D-16): expand the target group first, then after the render
  // commit (requestAnimationFrame) smooth-scroll to the card and focus it —
  // the StatCard wrapper carries tabIndex={-1}, so this is programmatic
  // focus only (cards are never in the tab order) and shows the accent ring.
  function handleFocusJump(statKey: string, group: GroupKey) {
    setOpenGroups((prev) => ({ ...prev, [group]: true }))
    requestAnimationFrame(() => {
      const el = document.getElementById(`stat-${statKey}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el?.focus()
    })
  }

  // D-08 export assembly (07.2-05 export contract): the SAME closed
  // CardExportData the Destaques showcase and the CardPhotoUpload preview
  // build — identity + the 6 key stats (label_short + formatted own_value +
  // opaque points), ZERO averages. null while the card/OVR is insufficient
  // ('— dados insuficientes' has no card to celebrate) — the download
  // button is disabled in exactly that state.
  const exportData: CardExportData | null = useMemo(() => {
    if (myCard === null || myCard.char_class === null || myCard.ovr.value === null) return null
    return {
      name: session.display_name,
      charClass: myCard.char_class,
      charFunction: myCard.char_function,
      ovr: Math.round(myCard.ovr.value),
      stats: myCard.key_stats.map((k) => ({
        label_short: k.label_short,
        value: k.own_value === null ? '—' : formatStatValue(k.own_value, k.value_type),
        points: k.points,
      })),
      photoSrc: photoUrl ?? crestSrcFor(myCard.char_class),
      monogramLetter: myCard.char_class.charAt(0).toUpperCase(),
    }
  }, [myCard, photoUrl, session.display_name])

  // Same generating/failure affordances as the showcase download
  // (PromotionCard): disabled + 'Gerando…', inline enumeration-safe
  // role=alert copy, never raw errors.
  const [generating, setGenerating] = useState(false)
  const [downloadFailed, setDownloadFailed] = useState(false)

  async function handleDownloadCard(): Promise<void> {
    if (exportData === null) return
    setGenerating(true)
    setDownloadFailed(false)
    try {
      // Current export contract (07.2-05 round 7+): transparent PNG,
      // hellz-<nome>.png — via the shared cardFilename slugifier.
      await downloadCard(exportData, cardFilename(session.display_name))
    } catch {
      setDownloadFailed(true)
    } finally {
      setGenerating(false)
    }
  }

  const loading = report === null && error === null
  // The strip state machine (keyStatStrip.ts, unit-locked): hidden /
  // explainer / cards-in-server-order.
  const strip = keyStatStripModel(myCard)

  // Owner checkpoint round 4 (LAYOUT): OVR + the key-stat mini cards are ONE
  // wide strip, and the strip carries the OVR tier color. The tier helper is
  // shared with OvrHero so both halves can never diverge (D-02 bands).
  const ovrTier = report === null ? null : ovrTierFor(report.ovr)

  // Render priority (UI-SPEC state matrix): error > loading > empty >
  // success. The empty state (D-13) replaces EVERYTHING below the fold —
  // no hero, no strip, no legend, no grayed grid — message + CTA only.
  return (
    <section aria-busy={loading}>
      {error !== null ? (
        <p role="alert" aria-live="polite" className="text-sm font-semibold text-destructive">
          {error}
        </p>
      ) : report === null ? (
        <p className="text-base text-muted">Carregando…</p>
      ) : report.stats.every((s) => s.own_value === null) ? (
        <section className="rounded-lg border border-line bg-surface p-6 text-center">
          <h2 className="text-xl font-semibold text-content">{EMPTY_TITLE}</h2>
          <p className="mt-2 text-base text-muted">{EMPTY_BODY}</p>
          <button
            type="button"
            onClick={() => onNavigate('submit')}
            className="mt-6 h-11 rounded-md bg-accent px-4 text-base font-semibold text-accent-foreground hover-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Enviar Status
          </button>
        </section>
      ) : (
        <>
          {/* Owner checkpoint rounds 4-7: the member's own player card (sized
              like a Destaques card), the OVR summary and the 6 EAFC key-stat
              mini cards (my_card key_stats IN SERVER ORDER) share ONE wide
              strip — tier border on the strip, card left, OVR + key cards
              stacked beside it. The tier legend keeps decoding the colors
              just under the strip. */}
          <section
            aria-label="Resumo do personagem"
            className={`mt-4 rounded-lg border-2 bg-dominant p-3 ${
              ovrTier !== null ? TIER_BORDER_DISPLAY[ovrTier] : 'border-line'
            }`}
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-6">
              {/* Owner checkpoint round 7: the own-card preview is now sized
                  like a Destaques card (≈a third of the content column) and
                  the actions joined it as an icon strip over the photo area
                  (CardPhotoUpload owns the hover overlay and its data calls). */}
              <CardPhotoUpload
                session={session}
                className="mx-auto w-40 shrink-0 sm:w-48 lg:mx-0 lg:w-64 xl:w-72"
                onDownload={
                  exportData === null
                    ? undefined
                    : () => {
                        void handleDownloadCard()
                      }
                }
                downloading={generating}
                downloadError={downloadFailed ? DOWNLOAD_ERROR : null}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-4 lg:justify-between lg:py-1">
                <OvrHero
                  ovr={report.ovr}
                  displayName={session.display_name}
                  charClass={report.char_class}
                  charFunction={report.char_function}
                  layout="strip"
                />
                {strip.kind !== 'hidden' &&
                  (strip.kind === 'cards' ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                      {strip.stats.map((k) => (
                        <KeyStatCard key={k.stat_key} stat={k} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted">{STRIP_EXPLAINER}</p>
                  ))}
                {/* Owner checkpoint round 11: foco de melhoria moved INSIDE
                    the hero column — identity, key stats and the improvement
                    loop now read as one block beside the card.
                    07.2 D-07: foco = the stats most behind the class average
                    among key ∪ relevant (priorityKeySet from my_card; empty
                    set when the my_card fetch failed — improvementFocus
                    returns [] and the strip self-hides). */}
                <FocusStrip
                  stats={report.stats}
                  priorityKeys={priorityKeySet(myCard)}
                  onJump={handleFocusJump}
                />
              </div>
            </div>
          </section>
          <div className="flex justify-end">
            <TierLegend />
          </div>
          {GROUP_ORDER.map((group) => (
            <CollapsibleGroup
              key={group}
              groupName={group}
              label={GROUP_LABELS[group]}
              open={openGroups[group]}
              onToggle={toggleGroup}
            >
              {report.stats
                .filter((s) => s.group_name === group)
                .map((s) => (
                  <StatCard key={s.stat_key} stat={s} />
                ))}
            </CollapsibleGroup>
          ))}
        </>
      )}
    </section>
  )
}
