// Personagens — officer/owner character registry (02-UI-SPEC Screen 2, read
// side). The tab itself is UX-only gating (AGENTS.md / T-02-09): enforcement
// is the staff RLS policies from 02-01 — a member's tampered client gets only
// their own row back and every write is refused server-side. This page
// consumes ONLY the explicit safe projection in api.ts: the PIN hash column is
// ungranted at the DB (migration 0005), so it can never appear in any payload
// this file touches — and it is never named or referenced here.
import { useEffect, useState } from 'react'
import { ApiError, fetchClasses, fetchMembers, type MemberRow } from '../../lib/api'
import type { NeoFootSession } from '../auth/session'

// Enumeration-safe pt-BR copy (UI contract): never expose HTTP codes, gateway
// internals, or which check failed.
const NETWORK_ERROR =
  'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
const SESSION_ERROR = 'Sua sessão expirou ou você não tem permissão. Entre novamente.'

const ROLE_LABELS: Record<'member' | 'officer' | 'owner', string> = {
  member: 'Membro',
  officer: 'Oficial',
  owner: 'Proprietário',
}

const FUNCTION_LABELS: Record<'dps' | 'tank', string> = {
  dps: 'DPS',
  tank: 'Tank',
}

export function CharactersPage({ session }: { session: NeoFootSession }) {
  const [data, setData] = useState<{ members: MemberRow[]; classes: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [members, classes] = await Promise.all([
          fetchMembers(session),
          fetchClasses(session),
        ])
        if (!cancelled) setData({ members, classes })
      } catch (err) {
        if (cancelled) return
        setError(
          err instanceof ApiError && err.kind === 'unauthorized' ? SESSION_ERROR : NETWORK_ERROR,
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [session])

  return (
    <section className="rounded-lg border border-line bg-surface p-6">
      <h2 className="text-xl font-semibold text-content">Personagens</h2>
      <p className="mt-1 text-sm text-muted">Registre nome, classe e função de cada membro.</p>

      {error !== null ? (
        <p role="alert" aria-live="polite" className="mt-6 text-sm font-semibold text-destructive">
          {error}
        </p>
      ) : data === null ? (
        <p className="mt-6 text-base text-muted">Carregando…</p>
      ) : data.members.length === 0 ? (
        <p className="mt-6 text-center text-base text-muted">
          Nenhum membro na lista branca ainda.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-sm font-semibold text-muted">
                <th scope="col" className="py-2 pr-4">
                  Personagem
                </th>
                <th scope="col" className="py-2 pr-4">
                  Discord
                </th>
                <th scope="col" className="py-2 pr-4">
                  Papel
                </th>
                <th scope="col" className="py-2 pr-4">
                  Classe
                </th>
                <th scope="col" className="py-2">
                  Função
                </th>
              </tr>
            </thead>
            <tbody>
              {data.members.map((member) => (
                <tr key={member.id} className="border-t border-line">
                  <td className="py-3 pr-4 text-base text-content">{member.display_name}</td>
                  <td className="py-3 pr-4 text-sm text-muted">{member.discord_handle}</td>
                  <td className="py-3 pr-4">
                    <span className="rounded-full border border-line px-2 py-0.5 text-sm font-semibold text-muted">
                      {ROLE_LABELS[member.role]}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-base text-content">
                    {member.char_class ?? '—'}
                  </td>
                  <td className="py-3 text-base text-content">
                    {FUNCTION_LABELS[member.char_function]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
