#!/usr/bin/env node
/**
 * Merge every plugin's dist into a single statically hostable repo/ dir:
 *
 *   repo/index.json          merged from each plugins/<name>/dist/index.json
 *   repo/<id>.plugin.js      bundle
 *   repo/<id>.plugin.json    sidecar manifest (+ sha256)
 *
 * Host repo/ on any static file server (GitHub Pages, object storage, ...)
 * and add its URL in the app's Plugins screen. `pnpm repo` runs the plugin
 * builds first; this script only merges.
 */
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const outDir = join(root, 'repo')
await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })

const pluginDirs = (await readdir(join(root, 'plugins'), { withFileTypes: true }))
  .filter((e) => e.isDirectory())
  .map((e) => join(root, 'plugins', e.name, 'dist'))

const merged = []
for (const dist of pluginDirs) {
  let index
  try {
    index = JSON.parse(await readFile(join(dist, 'index.json'), 'utf8'))
  } catch {
    console.warn(`skip ${dist} (no index.json — run pnpm build first)`)
    continue
  }
  for (const plugin of index.plugins ?? []) {
    if (!plugin.file) continue
    await cp(join(dist, plugin.file), join(outDir, plugin.file))
    const manifest = plugin.file.replace(/\.plugin\.js$/, '.plugin.json')
    await cp(join(dist, manifest), join(outDir, manifest))
    merged.push(plugin)
  }
}

await writeFile(join(outDir, 'index.json'), JSON.stringify({ plugins: merged }, null, 2))
console.log(`repo/index.json lists ${merged.length} plugin(s) -> ${outDir}`)
