// collect.mjs — tiny static server + results collector for the headless
// card-render check (round 5). Serves scripts/card-render-check/dist and
// captures the harness's POST /__results body to a file, because Edge 155's
// headless --dump-dom prints nothing.
//
// Usage: node collect.mjs <outFile> [port]
import http from 'node:http'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(here, 'dist')
const outFile = process.argv[2]
const port = Number(process.argv[3] ?? '4199')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' }

const server = http.createServer((req, res) => {
  if (req.method === 'POST') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      console.log(`${new Date().toISOString()} POST ${req.url} ${body.slice(0, 60)}`)
      if (req.url === '/__results') {
        try {
          writeFileSync(outFile, body)
        } catch {}
      }
      res.writeHead(204).end()
    })
    return
  }
  console.log(`${new Date().toISOString()} GET ${req.url}`)
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let file = path.join(dist, urlPath === '/' ? 'index.html' : urlPath)
  try {
    const data = readFileSync(file)
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' })
    res.end(data)
  } catch {
    res.writeHead(404).end('not found')
  }
})

server.listen(port, '127.0.0.1', () => console.log(`collector listening on ${port}`))
