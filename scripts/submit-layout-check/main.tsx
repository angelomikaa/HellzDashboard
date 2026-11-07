// Layout preview harness for the submit wizard (dev-only, not shipped).
// Renders the REAL components with fixture data so the desktop two-column
// screens can be inspected without a live session:
//   ?view=step1  — the whole SubmitPage (identity screen)
//   ?view=group  — StatGroupStep in the wide layout (Geral, 14 fields)
//   ?view=review — ReviewStep in the wide layout
import { createRoot } from 'react-dom/client'
import './preview.css'
import { SubmitPage } from '../../src/features/submit/SubmitPage'
import { StatGroupStep } from '../../src/features/submit/StatGroupStep'
import { ReviewStep } from '../../src/features/submit/ReviewStep'
import { OcrCapture } from '../../src/features/submit/OcrCapture'
import type { NeoFootSession } from '../../src/features/auth/session'
import { CATALOG } from './catalog'

const SESSION: NeoFootSession = {
  access_token: 'preview',
  member_id: 'preview',
  display_name: 'Same',
  member_role: 'member',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
}

const GROUP_INPUTS: Record<string, string> = {
  hp: '412.840',
  sp: '3.720',
  patk: '18.402',
  pdef: '9.118',
  matk: '44.907',
  mdef: '12.300',
  refine_patk: '1.204',
  refine_pdef: '950',
  refine_matk: '2.111',
  refine_mdef: '1.020',
  hp_recover: '812',
  sp_recover: '204',
  hit: '1.480',
  flee: '1.190',
}

const REVIEW_INPUTS: Record<string, string> = {
  combat_power: '842.190',
  ...GROUP_INPUTS,
  crit_dmg: '38,2',
  crit: '1.204',
  pdmg: '2.990',
  aspd: '412',
  max_sp_pct: '18,5',
  dmg_vs_medium: '40,69',
}

const PARAMS = new URLSearchParams(window.location.search)
const VIEW = PARAMS.get('view') ?? 'step1'
const GROUP = (PARAMS.get('group') ?? 'general') as 'general' | 'quasi' | 'special'
const GROUP_LABEL: Record<string, string> = { general: 'Geral', quasi: 'Quasi', special: 'Especial' }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-6xl rounded-lg border border-line bg-surface p-6 sm:p-8 xl:max-w-7xl">
      <h2 className="mb-6 text-xl font-semibold text-content">{title}</h2>
      {children}
    </section>
  )
}

function capture(captureKey: 'basic' | 'general' | 'quasi' | 'special') {
  return (
    <OcrCapture
      capture={captureKey}
      onOutcomes={() => {}}
      onReadFailed={() => {}}
      onRunStateChange={() => {}}
    />
  )
}

function App() {
  return (
    <div className="min-h-screen bg-dominant text-content">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        {VIEW === 'group' && (
          <Section title={`${GROUP_LABEL[GROUP]} — duas colunas`}>
            <StatGroupStep
              group={GROUP}
              entries={CATALOG.filter(
                (e) =>
                  e.group_name === GROUP &&
                  !(GROUP === 'general' && e.stat_key === 'combat_power') &&
                  !(GROUP === 'special' && (e.stat_key === 'rpdef' || e.stat_key === 'rmdef')),
              )}
              inputs={GROUP_INPUTS}
              onChange={() => {}}
              ocrRunning={false}
              failedFields={new Set()}
              ocrFilledFields={new Set()}
              averages={{}}
              layout="wide"
              capture={capture(GROUP)}
            />
          </Section>
        )}
        {VIEW === 'review' && (
          <Section title="Revisão — três colunas">
            <ReviewStep
              entries={CATALOG}
              inputs={REVIEW_INPUTS}
              allStepsVerified
              submitting={false}
              missingRequired={null}
              submitError={null}
              onSubmit={() => {}}
              onFixStat={() => {}}
              layout="wide"
            />
          </Section>
        )}
        {VIEW === 'step1' && <SubmitPage session={SESSION} />}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
