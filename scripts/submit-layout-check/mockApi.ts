// Dev-only stand-in for src/lib/api.ts (aliased by this harness' vite config).
// Every read resolves from static fixtures, so the layout preview renders the
// REAL SubmitPage without a session, a network or the live project. Everything
// else (types, errors, helpers) is re-exported from the real module — explicit
// exports below win over the star re-export.
import type {
  DefenseBaseline,
  MyIdentity,
  MyReport,
  StatCatalogEntry,
  SubmissionRow,
} from '../../src/lib/api'
import { AVERAGES, CATALOG } from './catalog'

export * from '../../src/lib/api.ts'

const IDENTITY: MyIdentity = {
  display_name: 'Same',
  char_id: '123456789012',
  char_class: 'High Wizard',
  char_function: 'mdps',
}

export async function fetchMyIdentity(): Promise<MyIdentity> {
  return IDENTITY
}

export async function fetchCatalog(): Promise<StatCatalogEntry[]> {
  return CATALOG
}

export async function fetchDefenseBaselines(): Promise<DefenseBaseline[]> {
  return []
}

export async function fetchMyReport(): Promise<MyReport> {
  return {
    char_class: IDENTITY.char_class,
    char_function: IDENTITY.char_function,
    ovr: { value: null, data_sufficient: false },
    last_validated_at: null,
    stats: CATALOG.map((entry) => ({
      ...entry,
      own_value: null,
      class_average: AVERAGES[entry.stat_key] ?? null,
      best: null,
      points: null,
      data_sufficient: true,
    })),
  }
}

export async function fetchMySubmissions(): Promise<SubmissionRow[]> {
  return []
}

export async function createSubmission(): Promise<void> {
  return
}
