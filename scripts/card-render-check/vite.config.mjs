import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Isolated build for the headless card-render check (scripts/card-render-check).
// Root is this directory; publicDir points at the app's public/ so the
// harness draws with the REAL self-hosted class portraits and Orbitron
// woff2 files. Output goes to ./dist (gitignored).
const here = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: here,
  publicDir: path.resolve(here, '../../public'),
  build: {
    outDir: path.resolve(here, 'dist'),
    emptyOutDir: true,
  },
})
