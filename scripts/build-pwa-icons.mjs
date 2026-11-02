#!/usr/bin/env node
/**
 * Generate the PWA icons from public/favicon.svg.
 *
 * Run once (assets are committed):  node scripts/build-pwa-icons.mjs
 * The 192/512 icons are the standard install set; the maskable variant keeps
 * ~20% safe padding so Android's adaptive mask never crops the mark.
 */
import { readFileSync } from 'node:fs'
import sharp from 'sharp'

const svg = readFileSync('public/favicon.svg')
const BACKGROUND = '#141414'

async function render(size, logoRatio, out) {
  const logoSize = Math.round(size * logoRatio)
  const logo = await sharp(svg).resize(logoSize, logoSize, { fit: 'contain' }).png().toBuffer()
  await sharp({
    create: { width: size, height: size, channels: 4, background: BACKGROUND },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(out)
  console.log(`wrote ${out} (${size}x${size})`)
}

await render(192, 0.82, 'public/icon-192.png')
await render(512, 0.82, 'public/icon-512.png')
await render(512, 0.62, 'public/icon-maskable-512.png')
