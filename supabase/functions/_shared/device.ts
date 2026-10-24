// NeoFoot device fingerprint — single source of truth (08.1-08, D-17 replacement).
//
// This value is the ONLY device identity used for session-device binding:
//   - The client computes SHA-256(navigator.userAgent)   (src/features/auth/session.ts)
//   - The server computes SHA-256(User-Agent header)      (this file)
//   - IP is deliberately EXCLUDED: the browser cannot read its public IP, so any
//     IP-derived value can never match the client, and mobile IPs rotate — an
//     IP-derived binding would log legitimate users out.
//
// The fingerprint is minted into the JWT `device_fp` claim at login (verify-pin)
// and at first access (setup-pin), and sent as `X-Device-Fingerprint` on every
// API request. assert_device_bound() (migration 0024) compares the two on the
// four privilege-mutating staff RPCs.
export const DEVICE_HEADER = 'x-device-fingerprint'
export const DEVICE_FP_CLAIM = 'device_fp'

/** SHA-256 hex of the User-Agent string — no trim, no IP, no lowercase. */
export async function computeDeviceFingerprint(ua: string | null): Promise<string> {
  const input = ua ?? ''
  const buf = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return hex
}

/** Device fingerprint derived from an incoming Edge Function request. */
export async function deviceFingerprintFromRequest(req: Request): Promise<string> {
  return computeDeviceFingerprint(req.headers.get('user-agent'))
}
