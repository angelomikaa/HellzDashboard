// ProofImage — the staff preview of one identity proof (IDEN-03, D-05). The
// proof lives in a private bucket, and an <img> tag cannot send the gateway
// headers, so the bytes are fetched with fetchIdentityProof and shown as an
// object URL that is revoked when the preview unmounts or the path changes.
import { useEffect, useState } from 'react'
import { fetchIdentityProof } from '../../lib/api'
import type { NeoFootSession } from '../auth/session'

export function ProofImage({ session, path }: { session: NeoFootSession; path: string }) {
  // undefined = loading, null = unavailable, string = object URL.
  const [url, setUrl] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    let alive = true
    let objectUrl: string | null = null
    void fetchIdentityProof(session, path).then((blob) => {
      if (!alive) return
      if (blob === null) {
        setUrl(null)
        return
      }
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    })
    return () => {
      alive = false
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
    }
  }, [session, path])

  if (url === undefined) return <p className="text-sm text-muted">Carregando comprovante…</p>
  if (url === null) return <p className="text-sm text-muted">Comprovante indisponível.</p>
  return (
    <img src={url} alt="Comprovante de identidade" className="max-h-64 w-full object-contain" />
  )
}
