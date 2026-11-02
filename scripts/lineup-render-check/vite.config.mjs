import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Isolated build for the headless lineup-render check. Root is this directory;
// publicDir points at the app's public/ so the harness draws with the REAL
// self-hosted class icons and fonts.
const here = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: here,
  publicDir: path.resolve(here, '../../public'),
  build: {
    outDir: path.resolve(here, 'dist'),
    emptyOutDir: true,
  },
})
