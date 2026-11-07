// Dev-only preview server for the submit wizard layout (owner request
// 2026-11-07). Renders the real components against fixture data — no Supabase
// project, no session, no network. Run: npx vite --config scripts/submit-layout-check/vite.config.mjs
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const mockApi = path.resolve(here, 'mockApi.ts')

export default defineConfig({
  root: here,
  publicDir: path.resolve(here, '../../public'),
  plugins: [
    tailwindcss(),
    react(),
    {
      // SubmitPage/HistoryList import '../../lib/api'; resolve that specifier
      // to the fixture module so the real page renders offline.
      name: 'preview-mock-lib-api',
      enforce: 'pre',
      resolveId(source, importer) {
        // Only rewrite the real app modules' relative `lib/api` imports; the
        // mock's own star re-export carries the .ts extension to stay out.
        if (!importer) return null
        return /(^|\/)lib\/api$/.test(source) ? mockApi : null
      },
    },
  ],
  server: { port: 5199, strictPort: true },
})
