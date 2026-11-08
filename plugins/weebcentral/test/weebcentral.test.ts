import { describe, expect, it, vi } from 'vitest'
import { DOMParser } from 'linkedom'
import type { FetchFn, PluginRegistration, SourceContext } from '@woyomi/core'
import { makeWeebcentralSource } from '../src/weebcentral.js'

;(globalThis as Record<string, unknown>).DOMParser = DOMParser

const source = makeWeebcentralSource()
const ID = '01J76XYC2K8QWFZZRYYCZMN6EF'
const CHAPTER = '01J76XYZ23Y995AGVDBTY9B9CB'

// Trimmed structural fixtures from the live endpoints, checked 2026-10-23.
const SEARCH_HTML = `
<article><section><a href="https://weebcentral.com/series/${ID}/Tongari-Booshi-No-Atorie">
  <article><picture>
    <source srcset="https://temp.compsci88.com/cover/normal/${ID}.webp">
    <img src="https://temp.compsci88.com/cover/fallback/${ID}.jpg" alt="Witch Hat Atelier cover">
  </picture></article>
  <article><div><div class="text-ellipsis truncate">Witch Hat Atelier</div></div></article>
</a></section><section><div><a href="/series/${ID}/Tongari-Booshi-No-Atorie">Witch Hat Atelier</a></div></section></article>`

const MEDIA_HTML = `<html><body><header><img src="/logo.png"></header><main>
<section x-data="{}"><section>
  <h1>Witch Hat Atelier</h1>
  <picture><source srcset="https://temp.compsci88.com/cover/normal/${ID}.webp"><img src="/fallback.jpg"></picture>
  <ul>
    <li><strong>Tags(s): </strong><span><a href="/search?included_tag=Fantasy">Fantasy</a>,</span></li>
    <li><strong>Type: </strong><a href="/search?included_type=Manga">Manga</a></li>
    <li><strong>Status: </strong><a href="/search?included_status=Ongoing">Ongoing</a></li>
  </ul>
</section><section>
  <h1>Witch Hat Atelier</h1>
  <ul>
    <li><strong>Description</strong><p>Coco wants to be a witch &amp; discover magic.</p></li>
    <li><strong>Associated Name(s)</strong><ul><li>Tongari Booshi no Atorie</li></ul></li>
  </ul>
</section></section></main></body></html>`

function chapter(id: string, title: string): string {
  return `<div x-data="{}"><a href="/chapters/${id}">
    <span><img src="/static/images/chapter-badge.svg"></span>
    <span class="grow flex items-center"><span>${title}</span><span>Last Read</span></span>
    <time datetime="2024-09-07T17:04:15.717Z"></time>
  </a></div>`
}

const IMAGES_HTML = `<img src="/advertisement.jpg"><section id="chapter-images" x-data="{ scrollDown() {} }">
  <img src="https://official.lowee.us/manga/Tongari-Booshi-No-Atorie/0002-001.png" alt="Page 1">
  <img src="https://official.lowee.us/manga/Tongari-Booshi-No-Atorie/0002-002.png" alt="Page 2">
</section>`

function context(body: string, status = 200): SourceContext {
  const fetch: FetchFn = vi.fn(async () => ({ status, headers: {}, body }))
  return {
    fetch,
    cache: { async withCache(_key, _ttl, compute) { return compute() } },
    preferences: {
      async get() { return undefined },
      async getWithDefault(_key, fallback) { return fallback },
      async set() {}
    }
  }
}

describe('Weeb Central', () => {
  it('registers a matching manifest and source', async () => {
    const register = vi.fn<(registration: PluginRegistration) => void>()
    globalThis.__media_plugin_register = register
    try {
      await import('../src/index.js')
      expect(register).toHaveBeenCalledOnce()
      const registration = register.mock.calls[0]![0]
      expect(registration.manifest).toMatchObject({ id: 'weebcentral', version: '0.1.0', sourceIds: ['weebcentral'], lang: 'en' })
      expect(registration.sources[0]?.id).toBe('weebcentral')
    } finally {
      delete globalThis.__media_plugin_register
    }
  })

  it('maps cards to stable series IDs without title slugs', async () => {
    const result = await source.search(context(SEARCH_HTML), 'witch hat', 1)
    expect(result).toEqual({ page: 1, hasNextPage: false, items: [{
      id: `weebcentral/${ID}`, mediaId: ID, sourceId: 'weebcentral', title: 'Witch Hat Atelier', type: 'manga',
      coverUrl: `https://temp.compsci88.com/cover/normal/${ID}.webp`
    }] })
  })

  it('normalizes unsupported search punctuation and paginates by 32', async () => {
    const ctx = context(`${SEARCH_HTML}<button hx-get="/search/data?offset=64">Load More</button>`)
    const result = await source.search(ctx, 'witch-hat!', 2)
    const [url, init] = vi.mocked(ctx.fetch).mock.calls[0]!
    const params = new URL(url).searchParams
    expect(params.get('text')).toBe('witch hat')
    expect(params.get('offset')).toBe('32')
    expect(params.get('display_mode')).toBe('Full Display')
    expect(params.get('sort')).toBe('Best Match')
    expect(init?.headers?.['user-agent']).toBeTruthy()
    expect(result.hasNextPage).toBe(true)
  })

  it('returns empty results and ignores unrelated buttons', async () => {
    expect(await source.search(context('<p>No results</p><button>Help</button>'), 'missing', 1))
      .toEqual({ page: 1, hasNextPage: false, items: [] })
  })

  it('deduplicates cards and ignores off-site series links', async () => {
    const html = SEARCH_HTML + SEARCH_HTML + SEARCH_HTML.replaceAll('https://weebcentral.com/series/', 'https://example.com/series/')
    expect((await source.search(context(html), '', 1)).items).toHaveLength(1)
  })

  it('falls back to img covers and the older unstyled title container', async () => {
    const html = `<article><section><a href="/series/${ID}"><img src="/cover.jpg"><div>Title &amp; More</div></a></section></article>`
    expect((await source.search(context(html), '', 1)).items[0]).toMatchObject({ title: 'Title & More', coverUrl: 'https://weebcentral.com/cover.jpg' })
  })

  it('loads metadata using the slug-free series route', async () => {
    const ctx = context(MEDIA_HTML)
    expect(await source.getMedia(ctx, ID)).toMatchObject({
      mediaId: ID, title: 'Witch Hat Atelier', status: 'ongoing',
      synopsis: 'Coco wants to be a witch & discover magic.',
      altTitles: ['Tongari Booshi no Atorie'], tags: ['Fantasy', 'Manga'],
      coverUrl: `https://temp.compsci88.com/cover/normal/${ID}.webp`
    })
    expect(vi.mocked(ctx.fetch).mock.calls[0]?.[0]).toBe(`https://weebcentral.com/series/${ID}`)
  })

  it.each([['Complete', 'completed'], ['Hiatus', 'hiatus'], ['Canceled', 'cancelled'], ['Unknown', undefined]])
    ('maps status %s', async (raw, expected) => {
      expect((await source.getMedia(context(MEDIA_HTML.replaceAll('Ongoing', raw)), ID)).status).toBe(expected)
    })

  it('allows missing optional metadata but rejects missing series content', async () => {
    const result = await source.getMedia(context('<main><h1>Title</h1></main>'), ID)
    expect(result.coverUrl).toBeUndefined()
    expect(result.synopsis).toBeUndefined()
    expect(result.tags).toEqual([])
    await expect(source.getMedia(context('<h1>Access denied</h1>'), ID)).rejects.toThrow('not found')
  })

  it('loads the full chapter list, keeps decimals and sorts oldest first', async () => {
    const ctx = context(chapter('NEW', 'Chapter 90.5') + chapter(CHAPTER, 'Chapter 2') + chapter('FIRST', 'Chapter 1'))
    const episodes = await source.getEpisodes(ctx, ID)
    expect(episodes.map((e) => e.number)).toEqual([1, 2, 90.5])
    expect(episodes[1]).toMatchObject({ id: `weebcentral/${ID}/${CHAPTER}`, mediaId: ID, title: 'Chapter 2', lang: 'en', publishedAt: '2024-09-07T17:04:15.717Z' })
    expect(vi.mocked(ctx.fetch).mock.calls[0]?.[0]).toBe(`https://weebcentral.com/series/${ID}/full-chapter-list`)
  })

  it('preserves specials and repeated chapter numbers across seasons', async () => {
    const ctx = context(chapter('S2', 'Season 2 Chapter 1') + chapter('S1', 'Season 1 Chapter 1') + chapter('SPECIAL', 'Prologue'))
    const episodes = await source.getEpisodes(ctx, ID)
    expect(episodes).toHaveLength(3)
    expect(episodes.map((e) => e.season)).toEqual([undefined, 1, 2])
    expect(episodes.every((e) => Number.isFinite(e.number))).toBe(true)
  })

  it('deduplicates by chapter ID, not chapter number', async () => {
    const html = chapter(CHAPTER, 'Chapter 2') + chapter(CHAPTER, 'Chapter 2') + chapter('OTHER', 'Chapter 2')
    expect(await source.getEpisodes(context(html), ID)).toHaveLength(2)
    expect(await source.getEpisodes(context(''), ID)).toEqual([])
  })

  it.each([CHAPTER, `weebcentral/${ID}/${CHAPTER}`])('loads ordered reader images for %s', async (episodeId) => {
    const ctx = context(IMAGES_HTML)
    expect(await source.getChapterContent(ctx, ID, episodeId)).toEqual({
      type: 'pages',
      images: [1, 2].map((n) => `https://official.lowee.us/manga/Tongari-Booshi-No-Atorie/0002-00${n}.png`),
      headers: { referer: 'https://weebcentral.com/' }
    })
    expect(vi.mocked(ctx.fetch).mock.calls[0]?.[0]).toBe(`https://weebcentral.com/chapters/${CHAPTER}/images?is_prev=False&reading_style=long_strip`)
  })

  it('rejects missing reader images and unsafe image schemes', async () => {
    await expect(source.getChapterContent(context('<img src="/logo.jpg">'), ID, CHAPTER)).rejects.toThrow('no reader images')
    const html = '<section x-data="scroll"><img src="javascript:alert(1)"></section>'
    await expect(source.getChapterContent(context(html), ID, CHAPTER)).rejects.toThrow('no reader images')
  })

  it('offers Latest and Popular sections', async () => {
    expect(await source.getHomeSections?.(context(''))).toEqual([{ id: 'latest', title: 'Latest' }, { id: 'popular', title: 'Popular' }])
  })

  it.each([['latest', 'Latest Updates'], ['popular', 'Popularity']])('loads the %s section', async (id, sort) => {
    const ctx = context(SEARCH_HTML)
    const result = await source.getHomeSection?.(ctx, id, 3)
    const params = new URL(vi.mocked(ctx.fetch).mock.calls[0]![0]).searchParams
    expect(params.get('sort')).toBe(sort)
    expect(params.get('offset')).toBe('64')
    expect(result?.items).toHaveLength(1)
    expect(result?.page).toBe(3)
  })

  it('rejects unknown sections without making a request', async () => {
    const ctx = context('')
    await expect(source.getHomeSection?.(ctx, 'missing', 1)).rejects.toThrow('unknown homepage section')
    expect(ctx.fetch).not.toHaveBeenCalled()
  })

  it('propagates HTTP errors for every network operation', async () => {
    const ctx = context('Forbidden', 403)
    await expect(source.search(ctx, '', 1)).rejects.toThrow('HTTP 403')
    await expect(source.getMedia(ctx, ID)).rejects.toThrow('HTTP 403')
    await expect(source.getEpisodes(ctx, ID)).rejects.toThrow('HTTP 403')
    await expect(source.getChapterContent(ctx, ID, CHAPTER)).rejects.toThrow('HTTP 403')
  })
})
