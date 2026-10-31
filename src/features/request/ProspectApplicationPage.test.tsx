// Plan 08-04 task 2: the session-less prospect application wizard.
//
// Node-env Vitest only (no DOM): pure flow functions carry the behavioral
// assertions, and the SSR render pins the wizard shell/summary. createSubmission
// is mocked with a spy so the "never calls create_submission" guarantee is
// executable rather than a comment.
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { RequireAuth } from '../auth/RequireAuth'
import {
  FunctionError,
  createSubmission,
  type RequestAccessInput,
  type StatCatalogEntry,
} from '../../lib/api'
import type { GroupInputs } from '../submit/wizard'
import { applyOcrOutcomes } from '../submit/ocr/apply'
import { ProspectApplicationPage } from './ProspectApplicationPage'
import {
  PROSPECT_DUPLICATE_COPY,
  PROSPECT_NETWORK_COPY,
  PROSPECT_PENDING_COPY,
  buildProspectPayload,
  prospectCanContinue,
  prospectErrorCopy,
  prospectGroupEntries,
  prospectStepForMissing,
  submitProspectApplication,
  type ProspectDraft,
} from './requestFlow'

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>()
  return { ...actual, createSubmission: vi.fn(actual.createSubmission) }
})

const DRAFT: ProspectDraft = {
  handle: 'ahrya',
  char_id: '32980',
  nickname: 'Ahrya',
  char_class: 'Gypsy',
  char_function: 'dps',
  proof_data_url: 'data:image/jpeg;base64,AAAA',
}

/** 57 entries: combat_power + 56 required fields across the three groups. */
function catalogFixture(): StatCatalogEntry[] {
  const entries: StatCatalogEntry[] = [
    {
      stat_key: 'combat_power',
      label: 'Poder de Combate',
      label_short: 'PCB',
      group_name: 'general',
      value_type: 'flat',
    },
  ]
  const layout: Array<['general' | 'quasi' | 'special', number]> = [
    ['general', 20],
    ['quasi', 18],
    ['special', 18],
  ]
  for (const [group, count] of layout) {
    for (let index = 0; index < count; index++) {
      entries.push({
        stat_key: `${group}_${index}`,
        label: `${group} ${index}`,
        label_short: `${group[0].toUpperCase()}${index}`,
        group_name: group,
        value_type: 'flat',
      })
    }
  }
  return entries
}

const CATALOG = catalogFixture()

/** Every required stat parsed; combat_power left blank (optional). */
function fullInputs(): GroupInputs {
  const inputs: GroupInputs = {}
  for (const entry of CATALOG) {
    if (entry.stat_key !== 'combat_power') inputs[entry.stat_key] = '10'
  }
  return inputs
}

interface DepsStub {
  requestAccess: Mock<
    (input: RequestAccessInput) => Promise<{ request_id: string; status: 'pending' }>
  >
}

function deps(
  requestAccess: (input: RequestAccessInput) => Promise<{
    request_id: string
    status: 'pending'
  }> = async () => ({ request_id: 'req-9', status: 'pending' }),
): DepsStub {
  return { requestAccess: vi.fn(requestAccess) }
}

beforeEach(() => {
  vi.mocked(createSubmission).mockClear()
})

describe('prospectCanContinue — Continuar blocked until the group is complete', () => {
  it('step 1 always passes (combat_power is optional)', () => {
    expect(prospectCanContinue(CATALOG, 1, {})).toBe(true)
  })

  it('a group needs every required field parseable', () => {
    const general: GroupInputs = {}
    for (const entry of prospectGroupEntries(CATALOG, 'general')) general[entry.stat_key] = '10'
    expect(prospectCanContinue(CATALOG, 2, general)).toBe(true)
    // Quasi still empty -> step 3 blocked.
    expect(prospectCanContinue(CATALOG, 3, general)).toBe(false)
    expect(prospectCanContinue(CATALOG, 2, { ...general, general_0: 'abc' })).toBe(false)
  })
})

describe('prospectGroupEntries — combat_power belongs to step 1', () => {
  it('excludes combat_power and the other groups', () => {
    const general = prospectGroupEntries(CATALOG, 'general')
    expect(general.some((entry) => entry.stat_key === 'combat_power')).toBe(false)
    expect(general.every((entry) => entry.group_name === 'general')).toBe(true)
    expect(general.some((entry) => entry.stat_key === 'quasi_0')).toBe(false)
  })

  it('a Geral OCR read writes only Geral keys (shared applier)', () => {
    const displayed = prospectGroupEntries(CATALOG, 'general').map((entry) => entry.stat_key)
    const writes: string[] = []
    applyOcrOutcomes(
      displayed,
      [
        { stat_key: 'general_0', status: 'filled', raw: '1', value: 1 },
        { stat_key: 'quasi_0', status: 'filled', raw: '2', value: 2 },
      ],
      (statKey) => writes.push(statKey),
    )
    expect(writes).toContain('general_0')
    expect(writes).not.toContain('quasi_0')
    expect(writes).not.toContain('combat_power')
    expect(writes.every((statKey) => displayed.includes(statKey))).toBe(true)
  })
})

describe('buildProspectPayload — the live request-access contract', () => {
  it('sends the draft identity and the stats, never a PIN', () => {
    const payload = buildProspectPayload(DRAFT, [{ stat_key: 'patk', value: 10 }])
    expect(payload).toMatchObject({
      discord_handle: 'ahrya',
      request_type: 'prospect',
      char_id: '32980',
      nickname: 'Ahrya',
      char_class: 'Gypsy',
      char_function: 'dps',
      proof_data_url: 'data:image/jpeg;base64,AAAA',
    })
    expect('pin' in payload).toBe(false)
    expect('confirm_pin' in payload).toBe(false)
    expect(payload.stats).toEqual([{ stat_key: 'patk', value: 10 }])
  })
})

describe('submitProspectApplication — request-access only, never create_submission', () => {
  it('submits 56 stats when combat_power is blank and mints no session', async () => {
    const d = deps()
    const outcome = await submitProspectApplication(DRAFT, CATALOG, fullInputs(), d)
    expect(outcome).toEqual({ ok: true, requestId: 'req-9' })
    expect(d.requestAccess).toHaveBeenCalledTimes(1)
    const sent = d.requestAccess.mock.calls[0][0] as RequestAccessInput
    expect(sent.request_type).toBe('prospect')
    expect('pin' in sent).toBe(false)
    expect(sent.stats).toHaveLength(56)
    expect(createSubmission).not.toHaveBeenCalled()
  })

  it('accepts 57 stats when combat_power was captured too', async () => {
    const d = deps()
    const outcome = await submitProspectApplication(
      DRAFT,
      CATALOG,
      { ...fullInputs(), combat_power: '288115' },
      d,
    )
    expect(outcome.ok).toBe(true)
    expect((d.requestAccess.mock.calls[0][0] as RequestAccessInput).stats).toHaveLength(57)
  })

  it('blocks an incomplete payload with the missing labels and owning step', async () => {
    const d = deps()
    const inputs = fullInputs()
    delete inputs['quasi_0']
    const outcome = await submitProspectApplication(DRAFT, CATALOG, inputs, d)
    expect(outcome).toMatchObject({ ok: false, kind: 'missing' })
    if (outcome.ok === false && outcome.kind === 'missing') {
      expect(outcome.missingRequired).toContain('quasi 0')
      expect(prospectStepForMissing(CATALOG, outcome.missingRequired)).toBe(3)
    }
    expect(d.requestAccess).not.toHaveBeenCalled()
  })

  it('keeps the identity read-only contract: an unknown class never posts', async () => {
    const d = deps()
    const outcome = await submitProspectApplication(
      { ...DRAFT, char_class: 'Ninja' },
      CATALOG,
      fullInputs(),
      d,
    )
    expect(outcome).toMatchObject({ ok: false, kind: 'blocked', field: 'char_class' })
    expect(d.requestAccess).not.toHaveBeenCalled()
  })
})

describe('prospect error copy', () => {
  it('409 request_pending shows the in-analysis copy', async () => {
    const d = deps(async () => {
      throw new FunctionError(409, 'request_pending', 'request_pending')
    })
    const outcome = await submitProspectApplication(DRAFT, CATALOG, fullInputs(), d)
    expect(outcome).toEqual({
      ok: false,
      kind: 'blocked',
      message: PROSPECT_PENDING_COPY,
      field: undefined,
    })
    expect(PROSPECT_PENDING_COPY).toContain('solicitação em análise')
  })

  it('duplicate_char_id stays inline and points back to the identity summary', async () => {
    const d = deps(async () => {
      throw new FunctionError(400, 'duplicate_char_id', 'duplicate_char_id')
    })
    const outcome = await submitProspectApplication(DRAFT, CATALOG, fullInputs(), d)
    expect(outcome).toEqual({
      ok: false,
      kind: 'blocked',
      message: PROSPECT_DUPLICATE_COPY,
      field: 'char_id',
    })
    expect(PROSPECT_DUPLICATE_COPY).toContain('ID já está cadastrado')
  })

  it('maps unknown_class and network failures', () => {
    expect(prospectErrorCopy(new FunctionError(400, 'unknown_class', 'x')).field).toBe(
      'char_class',
    )
    const network = prospectErrorCopy(new FunctionError(0, 'network', 'x'))
    expect(network.message).toBe(PROSPECT_NETWORK_COPY)
  })

  it('a non-FunctionError failure uses the retry copy', async () => {
    const d = deps(async () => {
      throw new Error('boom')
    })
    const outcome = await submitProspectApplication(DRAFT, CATALOG, fullInputs(), d)
    expect(outcome).toMatchObject({ ok: false, kind: 'blocked', message: PROSPECT_NETWORK_COPY })
  })
})

describe('ProspectApplicationPage — shell renders the identity summary and steps', () => {
  it('shows all five steps, the read-only identity and the first capture', () => {
    const html = renderToStaticMarkup(
      <ProspectApplicationPage
        draft={DRAFT}
        initialCatalog={CATALOG}
        onBack={() => {}}
        onSubmitted={() => {}}
      />,
    )
    expect(html).toContain('Personagem')
    expect(html).toContain('Geral')
    expect(html).toContain('Quasi')
    expect(html).toContain('Especial')
    expect(html).toContain('Revisão')
    expect(html).toContain('Ahrya')
    expect(html).toContain('ID 32980')
    // the identity summary prints the pt-BR label for the class key (Gypsy)
    expect(html).toContain('Cigana')
    expect(html).toContain('Dano Físico')
    expect(html).toContain('prospect-combat-power')
    expect(html).toContain('Continuar')
    // Identity is read-only here — no second identity capture on the wizard.
    expect(html).not.toContain('submit-char-id')
  })

  it('renders the loading state when no catalog is injected', () => {
    const html = renderToStaticMarkup(
      <ProspectApplicationPage draft={DRAFT} onBack={() => {}} onSubmitted={() => {}} />,
    )
    expect(html).toContain('Carregando…')
    expect(html).not.toContain('Continuar')
  })
})

// The 08-04 handoff: RequireAuth owns the unauthenticated view machine, so the
// application view (and the request view carrying a submitted protocol) must
// render the 08-04 panels, not the retired 08-03 interim stub.
describe('RequireAuth — application handoff', () => {
  function stubStorage(): void {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    })
  }

  it('renders the prospect wizard for the application view', () => {
    stubStorage()
    const html = renderToStaticMarkup(
      <RequireAuth initialView={{ kind: 'application', draft: DRAFT }}>{() => null}</RequireAuth>,
    )
    expect(html).toContain('Carregando…')
    // The 08-03 interim panel is gone.
    expect(html).not.toContain('Aplicação iniciada')
  })

  it('returns to the request success panel with the submitted protocol', async () => {
    stubStorage()
    // RequestAccessPage is code-split (lazy): the first render starts the
    // module load and shows the fallback, so wait until the real view renders.
    const html = await vi.waitFor(() => {
      const markup = renderToStaticMarkup(
        <RequireAuth initialView={{ kind: 'request', handle: 'ahrya', requestId: 'req-1' }}>
          {() => null}
        </RequireAuth>,
      )
      if (markup.includes('Carregando…')) throw new Error('request view still loading')
      return markup
    }, { timeout: 5000 })
    expect(html).toContain('Solicitação enviada')
    expect(html).toContain('req-1')
  })
})
