/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
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
  plugins: [supabaseEnv(), react(), tailwindcss()],
  test: {
    environment: 'node',
  },
})
