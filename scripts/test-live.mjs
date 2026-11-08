#!/usr/bin/env node
// Opt-in network smoke test; run after build:repo. Never part of offline tests.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(new URL('../plugins/animefire/package.json', import.meta.url))
const domRequire = createRequire(new URL('../plugins/animesonlinecc/package.json', import.meta.url))
const { DOMParser } = await import(pathToFileURL(domRequire.resolve('linkedom')).href)
globalThis.DOMParser = DOMParser
const corePath = process.env.WOYOMI_CORE
const { Engine, loadBundle } = await import(corePath ? pathToFileURL(resolve(corePath)).href : pathToFileURL(require.resolve('@woyomi/core')).href)
const index = JSON.parse(await readFile(resolve(root, 'repo/index.json'), 'utf8'))
const results = []

async function checkPlugin(plugin) {
  const code = await readFile(resolve(root, 'repo', plugin.file), 'utf8')
  assert.equal(createHash('sha256').update(code).digest('hex'), plugin.sha256)
  const registration = loadBundle(code)
  assert.equal(registration.manifest.id, plugin.id)
  const responses = new Map()
  const fetchSource = async (url, init = {}) => {
    if (init.mode === 'dom') throw new Error('DOM rendering requires a native host (not available in Node)')
    const key = JSON.stringify([url, init])
    if (responses.has(key)) return responses.get(key)
    const response = await fetch(url, {
      method: init.method, headers: init.headers, body: init.body,
      redirect: init.redirect, signal: AbortSignal.timeout(20_000)
    })
    const headers = Object.fromEntries(response.headers)
    const cookies = response.headers.getSetCookie()
    if (cookies.length) headers['set-cookie'] = cookies.join('\n')
    const result = { status: response.status, headers, body: await response.text() }
    responses.set(key, result)
    return result
  }
  for (const source of registration.sources) {
    for (const mode of ['direct', 'engine']) {
      const engine = new Engine({ fetch: fetchSource })
      engine.registerSource(source, plugin.id)
      const ctx = {
        fetch: fetchSource,
        cache: engine.cache,
        preferences: { get: async () => undefined, getWithDefault: async (_key, value) => value, set: async () => {} }
      }
      const call = (method, ...args) => mode === 'direct' ? source[method](ctx, ...args) : engine[method](source.id, ...args)
      const row = { plugin: plugin.id, source: source.id, mode, checks: {} }
      async function check(name, fn) {
        try {
          const value = await fn()
          row.checks[name] = { ok: true, count: Array.isArray(value) ? value.length : undefined }
          return value
        } catch (error) {
          row.checks[name] = { ok: false, error: String(error), cause: error.cause ? String(error.cause) : undefined }
        }
      }
      const search = await check('search', async () => {
        const result = await call('search', process.env.QUERY ?? (plugin.id === 'fliptru' ? 'a' : 'one'), 1)
        assert.ok(result.items.length, 'search returned no items')
        return result.items
      })
      let home
      if (source.getHomeSections && source.getHomeSection) {
        const sections = await check('sections', () => call('getHomeSections'))
        if (sections?.length) home = await check('home', async () => {
          const result = await call('getHomeSection', sections[0].id, 1)
          assert.ok(result.items.length, 'home returned no items')
          return result.items
        })
      }
      const media = search?.[0] ?? home?.[0]
      if (media) {
        row.mediaId = media.mediaId
        await check('details', async () => {
          const detail = await call('getMedia', media.mediaId)
          assert.ok(detail.title.trim(), 'empty title')
          assert.notEqual(detail.title, 'Untitled', 'detail parser returned a placeholder title')
          assert.equal(detail.id, media.id)
          return detail
        })
        const episodes = await check('episodes', async () => {
          const value = await call('getEpisodes', media.mediaId)
          assert.ok(value.length, 'no episodes')
          return value
        })
        if (episodes?.length) await check('content', async () => {
          row.episodeId = episodes[0].id
          if (source.getStreams) {
            const streams = await call('getStreams', media, episodes[0])
            assert.ok(streams.length, 'no streams')
            for (const stream of streams) assert.match(stream.url, /^https?:\/\//)
            return streams
          }
          const content = await call('getChapterContent', media.mediaId, episodes[0].id)
          assert.ok(content.type === 'pages' ? content.images.length : content.html.trim(), 'empty chapter')
          return content.type === 'pages' ? content.images : content
        })
      }
      results.push(row)
      console.log(JSON.stringify(row))
    }
  }
}

// Limit traffic to three independent sources at a time. Engine replays fetched
// responses so comparing host behavior does not double upstream traffic.
const queue = [...index.plugins].filter((plugin) => !process.env.PLUGINS || process.env.PLUGINS.split(',').includes(plugin.id))
await Promise.all(Array.from({ length: 3 }, async () => {
  while (queue.length) await checkPlugin(queue.shift())
}))
if (process.env.REPORT) await writeFile(process.env.REPORT, JSON.stringify(results, null, 2) + '\n')
if (results.some((row) => Object.values(row.checks).some((check) => !check.ok))) process.exitCode = 1
