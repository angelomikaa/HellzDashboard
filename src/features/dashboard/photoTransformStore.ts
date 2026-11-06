// photoTransformStore — the member's OWN crop framing (owner 2026-11-05:
// "dar zoom e arrastar a foto como quiser" inside the crop path).
//
// Persistence is DEVICE-LOCAL on purpose: the photo itself lives at real
// upload dimensions in the `card-photos` bucket and is only clipped for
// display, so there is nothing to bake into the object. The transform is a
// viewing preference, not member data: it never leaves the browser, never
// rides an RPC payload and cannot leak another member's framing.
//
// Keyed by the session's member id AND the stored object path, so a new photo
// (same member) starts from the measured cover fit instead of inheriting a
// pan that no longer applies.
import type { CardPhotoTransform } from '../export/cardAssets'
import { PHOTO_TRANSFORM_DEFAULT } from '../export/cardAssets'

const PREFIX = 'neofoot:card-photo-transform:'

/** Zoom bounds — the editor and the store agree on the same range. */
export const PHOTO_ZOOM_MIN = 1
export const PHOTO_ZOOM_MAX = 4

function keyFor(memberId: string, photoKey: string): string {
  return `${PREFIX}${memberId}:${photoKey}`
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/** Normalize any candidate into the editor's contract, or null when invalid. */
export function normalizePhotoTransform(value: unknown): CardPhotoTransform | null {
  if (typeof value !== 'object' || value === null) return null
  const t = value as Record<string, unknown>
  const zoom = typeof t.zoom === 'number' ? t.zoom : Number.NaN
  const x = typeof t.x === 'number' ? t.x : Number.NaN
  const y = typeof t.y === 'number' ? t.y : Number.NaN
  if (!Number.isFinite(zoom) || !Number.isFinite(x) || !Number.isFinite(y)) return null
  return {
    zoom: clamp(zoom, PHOTO_ZOOM_MIN, PHOTO_ZOOM_MAX),
    x: clamp(x, -1, 1),
    y: clamp(y, -1, 1),
  }
}

/** Read the stored framing. Corrupt/absent values self-heal to null (the
 *  measured cover fit) — never throws into render. */
export function loadPhotoTransform(
  memberId: string,
  photoKey: string,
): CardPhotoTransform | null {
  try {
    const raw = localStorage.getItem(keyFor(memberId, photoKey))
    if (!raw) return null
    return normalizePhotoTransform(JSON.parse(raw))
  } catch {
    return null
  }
}

/** Store (or clear, for a no-op) the member's framing. */
export function savePhotoTransform(
  memberId: string,
  photoKey: string,
  transform: CardPhotoTransform | null,
): void {
  try {
    const normalized = normalizePhotoTransform(transform)
    if (
      normalized === null ||
      (normalized.zoom === PHOTO_TRANSFORM_DEFAULT.zoom &&
        normalized.x === PHOTO_TRANSFORM_DEFAULT.x &&
        normalized.y === PHOTO_TRANSFORM_DEFAULT.y)
    ) {
      localStorage.removeItem(keyFor(memberId, photoKey))
      return
    }
    localStorage.setItem(keyFor(memberId, photoKey), JSON.stringify(normalized))
  } catch {
    // Storage disabled/quota — the framing still applies for this session.
  }
}

/** True when the transform is a no-op (nothing was repositioned). */
export function isDefaultTransform(t: CardPhotoTransform | null): boolean {
  return t === null || (t.zoom === 1 && t.x === 0 && t.y === 0)
}

/** The member id embedded in a `card-photos/<member-id>/card.jpg` storage
 *  path (the showcase payload carries the path, never the id directly). */
export function memberIdFromPhotoPath(path: string): string | null {
  const m = /card-photos\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i.exec(path)
  return m === null ? null : m[1]
}
