import { describe, expect, it, vi } from 'vitest'
import { DOMParser } from 'linkedom'
import type { PluginRegistration, SourceContext } from '@woyomi/core'
import { makeMangapillSource } from '../src/mangapill.js'

;(globalThis as Record<string, unknown>).DOMParser = DOMParser
const source = makeMangapillSource()
// Trimmed structural fixtures from the public site, checked 2026-10-23.
const CARD = `<div><a href="/manga/4812/witch-craft-works"><img data-src="https://cdn.example/4812.jpg"></a><a href="/manga/4812/witch-craft-works"><div class="line-clamp-2">Witch Craft Works</div></a></div>`
const SEARCH = `<div class="grid">${CARD}</div><a class="btn btn-sm" href="/search?q=witch&page=2">Next</a>`
const MEDIA = `<div class="container"><div><div><img data-src="https://cdn.example/cover.jpg"></div><div>
<div><h1>Witch Craft Works</h1></div><div><p>A witch protects her classmate.</p></div>
<div class="grid"><div><label>Status</label><div>publishing</div></div></div>
<div><a href="/search?genre=Fantasy">Fantasy</a></div>
</div></div></div>
<div id="chapters"><div><a href="/chapters/4812-10002500/title-chapter-2-5">Chapter 2.5</a><a href="/chapters/4812-10001000/title-chapter-1">Chapter 1</a></div></div>`

function context(body: string, status = 200): SourceContext {
  return {
    fetch: vi.fn(async () => ({ status, headers: {}, body })),
    cache: { async withCache(_key, _ttl, compute) { return compute() } },
    preferences: { async get() { return undefined }, async getWithDefault(_key, fallback) { return fallback }, async set() {} }
  }
}

describe('MangaPill', () => {
  it('registers the English plugin', async () => {
    const register = vi.fn<(value: PluginRegistration) => void>()
    globalThis.__media_plugin_register = register
    try {
      await import('../src/index.js')
      expect(register.mock.calls[0]?.[0].manifest).toMatchObject({ id: 'mangapill', lang: 'en', version: '0.1.0', sourceIds: ['mangapill'] })
    } finally { delete globalThis.__media_plugin_register }
  })

  it('uses stable numeric IDs, lazy covers and encoded search queries', async () => {
    const ctx = context(SEARCH)
    const result = await source.search(ctx, 'witch & magic', 1)
    expect(result).toMatchObject({ page: 1, hasNextPage: true, items: [{ id: 'mangapill/4812', title: 'Witch Craft Works', coverUrl: 'https://cdn.example/4812.jpg' }] })
    expect(new URL(vi.mocked(ctx.fetch).mock.calls[0]![0]).searchParams.get('q')).toBe('witch & magic')
  })

  it('does not mistake Previous for Next on the last page', async () => {
    const html = SEARCH.replace('page=2', 'page=1').replace('>Next<', '>Previous<')
    expect((await source.search(context(html), 'witch', 2)).hasNextPage).toBe(false)
    expect((await source.search(context(''), '', 1)).items).toEqual([])
  })

  it('deduplicates latest cards and excludes external series URLs', async () => {
    const html = `<div class="grid">${CARD}${CARD}${CARD.replaceAll('/manga/', 'https://example.com/manga/')}</div>`
    expect((await source.search(context(html), '', 1)).items).toHaveLength(1)
  })

  it('maps details, status, synopsis and genres', async () => {
    const ctx = context(MEDIA)
    expect(await source.getMedia(ctx, '4812')).toMatchObject({ title: 'Witch Craft Works', status: 'ongoing', synopsis: 'A witch protects her classmate.', coverUrl: 'https://cdn.example/cover.jpg', tags: ['Fantasy'] })
    expect(vi.mocked(ctx.fetch).mock.calls[0]?.[0]).toBe('https://mangapill.com/manga/4812')
    expect((await source.getMedia(context(MEDIA.replace('publishing', 'finished')), '4812')).status).toBe('completed')
    await expect(source.getMedia(context('<p>Missing</p>'), '1')).rejects.toThrow('not found')
  })

  it('maps full chapter lists, decimal numbers and source-scoped IDs', async () => {
    const episodes = await source.getEpisodes(context(MEDIA), '4812')
    expect(episodes.map((e) => e.number)).toEqual([1, 2.5])
    expect(episodes[0]).toMatchObject({ id: 'mangapill/4812/4812-10001000', mediaId: '4812', lang: 'en' })
  })

  it('ignores duplicate and other-series chapter links', async () => {
    const html = MEDIA.replace('</div></div>', '<a href="/chapters/999-10001000/other">Chapter 1</a><a href="/chapters/4812-10001000/title">Chapter 1</a></div></div>')
    expect(await source.getEpisodes(context(html), '4812')).toHaveLength(2)
  })

  it('loads reader pages in DOM order with Referer and no URL caching', async () => {
    const ctx = context('<img src="/ad.jpg"><picture><img data-src="https://cdn.example/1.jpg"></picture><picture><img src="https://cdn.example/2.jpg"></picture>')
    const cache = vi.spyOn(ctx.cache, 'withCache')
    expect(await source.getChapterContent(ctx, '4812', 'mangapill/4812/4812-10001000')).toEqual({ type: 'pages', images: ['https://cdn.example/1.jpg', 'https://cdn.example/2.jpg'], headers: { referer: 'https://mangapill.com/' } })
    expect(cache).not.toHaveBeenCalled()
    expect(vi.mocked(ctx.fetch).mock.calls[0]?.[0]).toBe('https://mangapill.com/chapters/4812-10001000')
  })

  it('rejects absent and unsafe reader images', async () => {
    await expect(source.getChapterContent(context('<picture><img src="javascript:alert(1)"></picture>'), '1', '1-1')).rejects.toThrow('no reader images')
  })

  it('scopes Trending to its section even with a nested heading wrapper', async () => {
    const html = `<div><h4>New Chapters</h4><div class="grid">${CARD.replaceAll('4812', '999')}</div></div><section><div><h4>Trending Mangas</h4></div><div class="grid">${CARD}</div></section>`
    const result = await source.getHomeSection?.(context(html), 'trending', 1)
    expect(result?.items.map((m) => m.mediaId)).toEqual(['4812'])
    expect(result?.hasNextPage).toBe(false)
  })

  it('offers Latest and Trending, with no repeated page 2 home results', async () => {
    const ctx = context(SEARCH)
    expect((await source.getHomeSections?.(ctx))?.map((s) => s.id)).toEqual(['latest', 'trending'])
    expect((await source.getHomeSection?.(ctx, 'latest', 1))?.items).toHaveLength(1)
    expect(vi.mocked(ctx.fetch).mock.calls[0]?.[0]).toBe('https://mangapill.com/chapters')
    expect(await source.getHomeSection?.(ctx, 'latest', 2)).toEqual({ page: 2, hasNextPage: false, items: [] })
    expect(ctx.fetch).toHaveBeenCalledOnce()
    await expect(source.getHomeSection?.(ctx, 'missing', 1)).rejects.toThrow('unknown homepage section')
  })

  it('propagates HTTP failures', async () => {
    const ctx = context('error', 503)
    await expect(source.search(ctx, '', 1)).rejects.toThrow('HTTP 503')
    await expect(source.getMedia(ctx, '1')).rejects.toThrow('HTTP 503')
    await expect(source.getEpisodes(ctx, '1')).rejects.toThrow('HTTP 503')
    await expect(source.getChapterContent(ctx, '1', '1-1')).rejects.toThrow('HTTP 503')
  })
})
