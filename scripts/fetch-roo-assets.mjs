#!/usr/bin/env node
/**
 * fetch-roo-assets.mjs — self-host the official ROO class/job imagery into
 * public/assets/classes/ (plan 07.2-05, ASST-01 / D-15/D-16).
 *
 * Reads the committed manifest (src/assets/roo-manifest.json) and downloads
 * each file with a browser-like User-Agent. Since the 2026-10-23 ROOCDB swap
 * the source is roocdb.com (stable, un-hashed game-extracted URLs — per-job
 * Trans-2ª emblem icons + per-job full-body class art, see the manifest's
 * discovered/notes); `source.url` is resolved against `manifest.asset_base`
 * unless it is already absolute (http/https). Entries with a `local` source
 * are copied from the repo. Entries marked expected_missing with no source
 * are the DESIGNED missing state (D-16): recorded in the summary, never
 * fatal. The optional `manifest.misc` array fetches non-class assets (e.g.
 * the poring mascot) into their own out_dir.
 *
 * GENERATED-style loud-abort on catalog drift: the manifest's class set must
 * equal the canonical 15-class set in supabase/seeds/classes.sql — if the
 * catalog and the manifest ever diverge, this script refuses to run so the
 * drift gets fixed at the source instead of silently shipping wrong assets.
 *
 * Exit code is 0 even with missing files (missing art is a designed state);
 * only catalog drift, a missing manifest, or an unreadable seed abort (exit 1).
 *
 * The downloaded/copied files under public/assets/classes/ ARE committed to
 * git (D-15: self-hosted in the repo, like the brand assets). This is what
 * makes the canvas export taint-free (same-origin only) and immune to source
 * site redeploys/vanishing hotlinks.
 *
 * Re-runnable: safe to run any time to refresh the committed assets.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const MANIFEST = path.join(ROOT, 'src', 'assets', 'roo-manifest.json')
const SEED = path.join(ROOT, 'supabase', 'seeds', 'classes.sql')
const OUT_DIR = path.join(ROOT, 'public', 'assets', 'classes')

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function fail(message) {
  console.error(`[fetch-roo-assets] FAIL: ${message}`)
  process.exit(1)
}

if (!existsSync(MANIFEST)) fail(`missing manifest: ${MANIFEST}`)
if (!existsSync(SEED)) fail(`missing class seed: ${SEED}`)

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
const manifestClasses = manifest.classes.map((c) => c.class_name).sort()

// Catalog-drift gate: the manifest must cover EXACTLY the canonical class set.
const seedClasses = [...readFileSync(SEED, 'utf8').matchAll(/'([^']+)'/g)]
  .map((m) => m[1])
  .sort()
if (seedClasses.length === 0) fail('no class names parsed from the seed — parser drift?')
const sameSet =
  seedClasses.length === manifestClasses.length &&
  seedClasses.every((name, i) => name === manifestClasses[i])
if (!sameSet) {
  console.error('[fetch-roo-assets] CATALOG DRIFT between manifest and seed:')
  console.error('  seed:     ', seedClasses.join(', '))
  console.error('  manifest: ', manifestClasses.join(', '))
  fail('update src/assets/roo-manifest.json (or supabase/seeds/classes.sql) so both sets match')
}

mkdirSync(OUT_DIR, { recursive: true })

const rows = []
let okCount = 0
let missingCount = 0

for (const entry of manifest.classes) {
  for (const [fileName, source] of Object.entries(entry.files)) {
    const label = `${entry.class_name} → ${fileName}`
    try {
      if (typeof source.url === 'string') {
        // Absolute URLs pass through; manifest-relative ones resolve against asset_base.
        const target = /^https?:\/\//.test(source.url) ? source.url : manifest.asset_base + source.url
        const res = await fetch(target, {
          headers: { 'User-Agent': USER_AGENT, Accept: 'image/png,image/webp,image/*;q=0.8,*/*;q=0.5' },
        })
        const buf = Buffer.from(await res.arrayBuffer())
        // Cloudflare/CDN error pages can return 200 HTML — verify the image
        // magic: PNG (\x89PNG) or WebP (RIFF....WEBP).
        const isPng = buf.length > 8 && buf.subarray(1, 4).toString('ascii') === 'PNG'
        const isWebp =
          buf.length > 12 &&
          buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
          buf.subarray(8, 12).toString('ascii') === 'WEBP'
        if (!res.ok || (!isPng && !isWebp)) {
          rows.push({ label, status: 'MISSING', note: `HTTP ${res.status}${isPng || isWebp ? '' : ' (non-image body)'}` })
          missingCount++
          continue
        }
        const dest = path.join(OUT_DIR, fileName)
        writeDest(dest, buf)
        rows.push({ label, status: 'OK', note: `${(buf.length / 1024).toFixed(0)} KB` })
        okCount++
      } else if (typeof source.local === 'string') {
        const src = path.join(ROOT, source.local)
        if (!existsSync(src)) {
          rows.push({ label, status: 'MISSING', note: `local sample absent: ${source.local}` })
          missingCount++
          continue
        }
        copyFileSync(src, path.join(OUT_DIR, fileName))
        rows.push({ label, status: 'OK', note: `copied from ${source.local}` })
        okCount++
      } else {
        rows.push({ label, status: 'MISSING', note: source.reason ?? 'expected_missing (D-16 designed state)' })
        missingCount++
      }
    } catch (err) {
      // Network errors are the same designed-missing state (D-16): record and continue.
      rows.push({ label, status: 'MISSING', note: `network error: ${err instanceof Error ? err.message : String(err)}` })
      missingCount++
    }
  }
}

// Optional non-class assets (manifest.misc): poring mascot etc. Each entry is
// { file, url, out_dir } — resolved relative to the repo root and created on
// demand. Same designed-missing semantics as class files.
for (const entry of manifest.misc ?? []) {
  const label = `misc → ${entry.file}`
  try {
    const target = /^https?:\/\//.test(entry.url) ? entry.url : manifest.asset_base + entry.url
    const res = await fetch(target, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'image/png,image/webp,image/*;q=0.8,*/*;q=0.5' },
    })
    const buf = Buffer.from(await res.arrayBuffer())
    const isPng = buf.length > 8 && buf.subarray(1, 4).toString('ascii') === 'PNG'
    const isWebp =
      buf.length > 12 &&
      buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buf.subarray(8, 12).toString('ascii') === 'WEBP'
    if (!res.ok || (!isPng && !isWebp)) {
      rows.push({ label, status: 'MISSING', note: `HTTP ${res.status}` })
      missingCount++
      continue
    }
    const destDir = path.join(ROOT, entry.out_dir ?? 'public/assets/classes')
    mkdirSync(destDir, { recursive: true })
    writeDest(path.join(destDir, entry.file), buf)
    rows.push({ label, status: 'OK', note: `${(buf.length / 1024).toFixed(0)} KB` })
    okCount++
  } catch (err) {
    rows.push({ label, status: 'MISSING', note: `network error: ${err instanceof Error ? err.message : String(err)}` })
    missingCount++
  }
}

console.log('\n[fetch-roo-assets] summary (class → file):')
for (const row of rows) console.log(`  ${row.status === 'OK' ? '  ok ' : 'MISS'}  ${row.label}  (${row.note})`)
console.log(`\n[fetch-roo-assets] ${okCount} files in place, ${missingCount} missing (D-16: missing art is a designed state — ClassCrest renders the monogram fallback)`)
if (missingCount > 0) {
  console.log('[fetch-roo-assets] note: committed manifest documents reality; owner may supply missing files into public/assets/classes/ using the manifest naming scheme (see 07.2-05 user_setup).')
}

function writeDest(dest, buf) {
  writeFileSync(dest, buf)
}
