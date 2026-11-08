import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { after, before, test } from 'node:test'
import { once } from 'node:events'

let server
let base
before(async () => {
  server = spawn(process.execPath, [new URL('./serve-repo.mjs', import.meta.url).pathname], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe']
  })
  base = await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.once('exit', (code) => reject(new Error(`server exited: ${code}`)))
    server.stdout.on('data', (chunk) => {
      const url = /serving on (http:\/\/[^\s]+)/.exec(String(chunk))?.[1]
      if (url) resolve(url)
    })
  })
})
after(async () => {
  if (!server || server.exitCode !== null) return
  const exited = once(server, 'exit')
  server.kill()
  await exited
})

test('malformed URL paths return 400 without crashing the server', async () => {
  for (const path of ['/%ZZ', '/%E0%A4%A', '/%00']) {
    assert.equal((await fetch(`${base}${path}`)).status, 400)
  }
  assert.equal((await fetch(`${base}/`)).status, 200)
})

test('repo prefix only matches a whole path segment', async () => {
  for (const path of ['/', '/index.json', '/repo', '/repo/', '/repo/index.json']) {
    assert.equal((await fetch(`${base}${path}`)).status, 200, path)
  }
  assert.equal((await fetch(`${base}/repoindex.json`)).status, 404)
})

test('repository responses support cross-origin clients and preflight', async () => {
  const response = await fetch(`${base}/index.json`)
  assert.equal(response.headers.get('access-control-allow-origin'), '*')
  assert.equal((await fetch(base, { method: 'OPTIONS' })).status, 204)
})
