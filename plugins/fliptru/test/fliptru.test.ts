import { describe, expect, it, vi } from 'vitest'
import { DOMParser } from 'linkedom'
import type { FetchFn, PluginRegistration, SourceContext } from '@woyomi/core'
import { makeFliptruSource } from '../src/fliptru.js'

;(globalThis as Record<string, unknown>).DOMParser = DOMParser
const source = makeFliptruSource()
// Trimmed live response shapes, including the current hyphenated reader class.
const CARD = `<a class="comic-card" href="/comic/sense-life?origin=most-pop-list" data-title="Sense Life" style="background-image: url(https://media.fliptru.com.br/cover.png)"></a>`
const LD = { '@type': 'ComicSeries', name: 'Sense Life', description: 'Uma aventura brasileira.', image: 'https://media.fliptru.com.br/cover.png', genre: 'Aventura' }
const MEDIA = `<h1>Fallback title</h1><script type="application/ld+json">${JSON.stringify(LD)}</script>`
const chapter = (id: string) => `<div class="chapter-list-item"><a href="/comic/sense-life/${id}?origin=chapter-list">${id} - Uma aventura</a></div>`
const next = (url: string) => `<div id="chapters-load-more"><a data-url="${url}">Carregar mais</a></div>`

function context(body: string, status = 200): SourceContext {
  return {
    fetch: vi.fn(async () => ({ status, headers: {}, body })),
    cache: { async withCache(_key, _ttl, compute) { return compute() } },
    preferences: { async get() { return undefined }, async getWithDefault(_key, fallback) { return fallback }, async set() {} }
  }
}

describe('Fliptru', () => {
  it('registers the Brazilian Portuguese plugin', async () => {
    const register = vi.fn<(value: PluginRegistration) => void>()
    globalThis.__media_plugin_register = register
    try {
      await import('../src/index.js')
      expect(register.mock.calls[0]?.[0].manifest).toMatchObject({ id: 'fliptru', lang: 'pt-br', version: '0.1.0', sourceIds: ['fliptru'] })
    } finally { delete globalThis.__media_plugin_register }
  })

  it('maps JSON search results, removes author suffixes and rejects non-comic links', async () => {
    const results = [{ label: 'Sense Life - @Glitch_Tellend', url: '/comic/sense-life/info' }, { label: 'User', url: '/users/someone' }, { label: 'External', url: 'https://example.com/comic/other/info' }]
    const ctx = context(JSON.stringify([...results, results[0]]))
    expect(await source.search(ctx, 'sense & life', 1)).toMatchObject({ page: 1, hasNextPage: false, items: [{ mediaId: 'sense-life', title: 'Sense Life' }] })
    expect((await source.search(ctx, 'sense', 2)).items).toEqual([])
    expect(ctx.fetch).toHaveBeenCalledOnce()
    expect(new URL(vi.mocked(ctx.fetch).mock.calls[0]![0]).searchParams.get('term')).toBe('sense & life')
  })

  it('uses paginated browse for blank searches and resolves CSS covers', async () => {
    const ctx = context(`${CARD}${CARD}<div id="loadMoreComics"><a href="?page=3">More</a></div>`)
    expect(await source.search(ctx, '', 2)).toMatchObject({ page: 2, hasNextPage: true, items: [{ mediaId: 'sense-life', coverUrl: LD.image }] })
    expect(vi.mocked(ctx.fetch).mock.calls[0]?.[0]).toBe('https://fliptru.com.br/comics/all?page=2')
    expect((await source.search(context(''), '', 1)).items).toEqual([])
  })

  it('handles quoted CSS URLs and h3 card titles', async () => {
    const html = `<a class="comic-card" href="/comic/sense-life" style="background:url('https://media.fliptru.com.br/cover.png')"><h3>Sense Life</h3></a>`
    expect((await source.search(context(html), '', 1)).items[0]).toMatchObject({ title: 'Sense Life', coverUrl: LD.image })
  })

  it('maps ComicSeries structured metadata', async () => {
    expect(await source.getMedia(context(MEDIA), 'sense-life')).toMatchObject({ id: 'fliptru/sense-life', title: LD.name, synopsis: LD.description, coverUrl: LD.image, tags: ['Aventura'] })
  })

  it('falls back to HTML metadata when JSON-LD is malformed or unrelated', async () => {
    const html = '<script type="application/ld+json">{broken</script><script type="application/ld+json">{"@type":"BreadcrumbList"}</script><h1>Title</h1><meta property="og:image" content="https://cdn.example/cover.jpg"><meta property="og:description" content="Synopsis">'
    expect(await source.getMedia(context(html), 'comic')).toMatchObject({ title: 'Title', synopsis: 'Synopsis', coverUrl: 'https://cdn.example/cover.jpg', tags: [] })
    await expect(source.getMedia(context(''), 'missing')).rejects.toThrow('not found')
  })

  it('follows every chapter fragment page, deduplicates and sorts numbers', async () => {
    const ctx = context('')
    const fetch: FetchFn = vi.fn(async (url) => ({ status: 200, headers: {}, body: url.includes('page=2') ? chapter('002') + chapter('010') : chapter('001') + chapter('002') + next('/comic/sense-life/chapters?order=asc&page=2') }))
    ctx.fetch = fetch
    const episodes = await source.getEpisodes(ctx, 'sense-life')
    expect(episodes.map((e) => e.number)).toEqual([1, 2, 10])
    expect(episodes[0]).toMatchObject({ id: 'fliptru/sense-life/001', mediaId: 'sense-life', lang: 'pt-br' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('keeps decimal chapter slugs and ignores other-series links', async () => {
    const html = chapter('002.5') + chapter('001') + chapter('003').replaceAll('sense-life', 'other')
    expect((await source.getEpisodes(context(html), 'sense-life')).map((e) => e.number)).toEqual([1, 2.5])
  })

  it('detects repeated pagination URLs rather than looping', async () => {
    await expect(source.getEpisodes(context(next('/comic/sense-life/chapters?order=asc')), 'sense-life')).rejects.toThrow('repeated a page')
  })

  it.each(['https://example.com/comic/sense-life/chapters?page=2', '/comic/other/chapters?page=2', 'javascript:alert(1)'])('rejects untrusted pagination %s', async (url) => {
    await expect(source.getEpisodes(context(next(url)), 'sense-life')).rejects.toThrow('invalid chapter pagination URL')
  })

  it.each(['comic-page-image', 'comic_page_image'])('reads %s markup with lazy and plain images', async (className) => {
    const ctx = context(`<img src="/ad.jpg"><div class="${className}"><img src="https://cdn.example/1.png"><img data-src="https://cdn.example/2.png"><img src="https://cdn.example/1.png"></div>`)
    const cache = vi.spyOn(ctx.cache, 'withCache')
    expect(await source.getChapterContent(ctx, 'sense-life', 'fliptru/sense-life/001')).toEqual({ type: 'pages', images: ['https://cdn.example/1.png', 'https://cdn.example/2.png'], headers: { referer: 'https://fliptru.com.br/' } })
    expect(cache).not.toHaveBeenCalled()
    expect(vi.mocked(ctx.fetch).mock.calls[0]?.[0]).toBe('https://fliptru.com.br/comic/sense-life/001')
  })

  it('reports missing or login-restricted chapters instead of returning blank pages', async () => {
    await expect(source.getChapterContent(context('<h1>Entrar</h1>'), 'sense-life', '001')).rejects.toThrow('may require login')
    await expect(source.getChapterContent(context('<div class="comic-page-image"><img src="javascript:alert(1)"></div>'), 'sense-life', '001')).rejects.toThrow('no reader images')
  })

  it('provides recent and popular discovery without repeating the popular list', async () => {
    const ctx = context(CARD)
    expect((await source.getHomeSections?.(ctx))?.map((s) => s.id)).toEqual(['latest', 'popular'])
    expect((await source.getHomeSection?.(ctx, 'popular', 1))?.items).toHaveLength(1)
    expect(await source.getHomeSection?.(ctx, 'popular', 2)).toEqual({ page: 2, hasNextPage: false, items: [] })
    expect(ctx.fetch).toHaveBeenCalledOnce()
    expect((await source.getHomeSection?.(ctx, 'latest', 2))?.items).toHaveLength(1)
    await expect(source.getHomeSection?.(ctx, 'missing', 1)).rejects.toThrow('unknown homepage section')
  })

  it('propagates HTTP errors', async () => {
    const ctx = context('error', 403)
    await expect(source.search(ctx, 'sense', 1)).rejects.toThrow('HTTP 403')
    await expect(source.getMedia(ctx, 'sense-life')).rejects.toThrow('HTTP 403')
    await expect(source.getEpisodes(ctx, 'sense-life')).rejects.toThrow('HTTP 403')
    await expect(source.getChapterContent(ctx, 'sense-life', '001')).rejects.toThrow('HTTP 403')
  })
})
