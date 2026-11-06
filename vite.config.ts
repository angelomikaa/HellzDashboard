/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'

// The client reads import.meta.env.VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY,
// and Vite only inlines variables prefixed with `VITE_` at BUILD time. The
// Vercel <-> Supabase integration (and most platform dashboards) names them
// SUPABASE_URL / SUPABASE_ANON_KEY instead, which the client bundle cannot see
// — the build then inlines `undefined/functions/v1/...` and `apikey: void 0`,
// every request fails, and the UI can only show the generic "não foi possível
// conectar ao servidor" copy. That is a silent, total outage that looks like a
// network problem (it is exactly what shipped to Vercel).
//
// So: accept either naming, aliasing the platform names onto the VITE_ names
// before Vite loads the env, and refuse to build when nothing is available.
const SUPABASE_ENV_ALIASES: Record<string, string[]> = {
  VITE_SUPABASE_URL: ['SUPABASE_URL'],
  VITE_SUPABASE_ANON_KEY: ['SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY'],
}

// The owner's card.svg embeds a full class portrait as a base64 placeholder
// (the design file is ~3.4 MB). The app ALWAYS paints the member's own photo
// over that area and the parser never reads the image, so the payload is dead
// weight in the bundle. Blank the data URI before the `?raw` import resolves:
// same geometry, same layers, ~0.5% of the bytes. The source file stays
// untouched (it is the owner's design artifact).
function cardAssetSlim(): Plugin {
  return {
    name: 'neofoot:card-asset-slim',
    enforce: 'pre',
    load(id) {
      if (!id.includes('card.svg?raw')) return null
      const raw = id.slice(0, id.length - '?raw'.length)
      // Vite passes an absolute path; vitest/vite-node can pass a file:// URL
      // (and Windows paths may carry a leading slash).
      let filePath = raw.startsWith('file:') ? fileURLToPath(raw) : raw
      if (/^\/[A-Za-z]:/.test(filePath)) filePath = filePath.slice(1)
      const svg = readFileSync(filePath, 'utf8')
      const slim = svg.replaceAll(/xlink:href="data:[^"]*"/g, 'xlink:href=""')
      return `export default ${JSON.stringify(slim)}`
    },
  }
}

function supabaseEnv(): Plugin {
  return {
    name: 'neofoot:supabase-env',
    // Runs before Vite resolves the env, so the aliased values are exposed to
    // import.meta.env exactly like native VITE_ variables.
    config(_config, { command, mode }) {
      const fileEnv = loadEnv(mode, process.cwd(), '')
      const read = (key: string) => (process.env[key] ?? fileEnv[key] ?? '').trim()

      for (const [target, alternatives] of Object.entries(SUPABASE_ENV_ALIASES)) {
        if (read(target) !== '') continue
        for (const alternative of alternatives) {
          const value = read(alternative)
          if (value !== '') {
            process.env[target] = value
            break
          }
        }
      }

      if (command === 'build') {
        const missing = Object.keys(SUPABASE_ENV_ALIASES).filter((key) => read(key) === '')
        if (missing.length > 0) {
          throw new Error(
            `Missing required environment variable(s): ${missing.join(', ')}.\n` +
              'Accepted sources: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, or ' +
              'SUPABASE_URL / SUPABASE_ANON_KEY (Vercel Supabase integration), in the ' +
              'Production AND Preview scopes or in a local .env file.\n' +
              'Without them the generated bundle calls "undefined/functions/v1/..." and the ' +
              'app shows the generic connection error.',
          )
        }
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [supabaseEnv(), cardAssetSlim(), react(), tailwindcss()],
  test: {
    // Two projects so the default loop stays fast: `npm test` runs the unit
    // suite (src + the credential smoke), while `npm run test:ocr` runs the
    // exhaustive OCR harness (real samples through tesseract, ~7 minutes).
    // `npm run test:all` runs both — the phase gate.
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.{ts,tsx}', 'scripts/smoke-config.test.mjs'],
        },
      },
      {
        test: {
          name: 'ocr',
          environment: 'node',
          include: ['scripts/ocr-*.test.mjs'],
          testTimeout: 600_000,
        },
      },
    ],
  },
})
