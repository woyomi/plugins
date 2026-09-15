#!/usr/bin/env node
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, normalize } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const repoDir = join(root, 'repo')
const port = Number(process.env.PORT || 8787)
const host = process.env.HOST || '0.0.0.0'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.txt': 'text/plain; charset=utf-8'
}

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', '*')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`)
  let pathname = decodeURIComponent(url.pathname)

  if (pathname.startsWith('/repo')) {
    pathname = pathname.slice(5)
  }
  if (!pathname || pathname === '/') {
    pathname = '/index.json'
  }

  const safePath = normalize(pathname).replace(/^(\.\.[\/\\])+/, '')
  const filePath = join(repoDir, safePath)

  try {
    const s = await stat(filePath)
    if (!s.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not Found')
      return
    }
    const ext = safePath.slice(safePath.lastIndexOf('.'))
    const contentType = MIME[ext] || 'application/octet-stream'
    const data = await readFile(filePath)
    res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': data.length })
    res.end(data)
    console.log(`[${new Date().toISOString()}] 200 ${req.method} ${req.url} -> ${safePath}`)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
    console.log(`[${new Date().toISOString()}] 404 ${req.method} ${req.url} (not found: ${filePath})`)
  }
})

server.listen(port, host, () => {
  console.log(`Plugin repository serving on http://${host}:${port}`)
  console.log(`Accessible at:`)
  console.log(`  - http://127.0.0.1:${port}/`)
  console.log(`  - http://127.0.0.1:${port}/index.json`)
  console.log(`  - http://127.0.0.1:${port}/repo`)
  console.log(`  - http://127.0.0.1:${port}/repo/index.json`)
})
