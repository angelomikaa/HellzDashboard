// collect.mjs — static server + result/PNG collector for the headless
// lineup-render check. Edge headless cannot dump a canvas, so the harness POSTs
// the PNG data URL back and this writes it to disk.
//
// Usage: node collect.mjs <outPng> [port]
import http from 'node:http'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(here, 'dist')
const outPng = process.argv[2] ?? path.join(here, 'lineup.png')
const port = Number(process.argv[3] ?? '4201')
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      if (req.url === '/__png') {
        const base64 = body.replace(/^data:image\/png;base64,/, '')
        writeFileSync(outPng, Buffer.from(base64, 'base64'))
        console.log(`wrote ${outPng}`)
      }
      if (req.url === '/__results') writeFileSync(path.join(here, 'results.json'), body)
      res.writeHead(204).end()
    })
    return
  }
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  const file = path.join(dist, urlPath === '/' ? 'index.html' : urlPath)
  try {
    const data = readFileSync(file)
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' })
    res.end(data)
  } catch {
    res.writeHead(404).end('not found')
  }
})

server.listen(port, '127.0.0.1', () => console.log(`collector listening on ${port}`))
