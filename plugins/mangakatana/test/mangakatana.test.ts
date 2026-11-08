import { describe, expect, it, vi } from 'vitest'
import { DOMParser } from 'linkedom'
import type { PluginRegistration, SourceContext } from '@woyomi/core'
import { makeMangakatanaSource } from '../src/mangakatana.js'

;(globalThis as Record<string, unknown>).DOMParser = DOMParser

const source = makeMangakatanaSource()
// Structural fixtures trimmed from live responses on 2026-10-23.
const CARD = `<div class="item"><img src="/cover.jpg"><div class="text"><h3><a href="https://mangakatana.com/manga/witch.16743">Witch</a><span> - 3 chapter(s)</span></h3></div></div>`
const SEARCH = `<div id="book_list">${CARD}</div><a class="next page-numbers" href="/page/2">Next</a>`
const MEDIA = `<link rel="canonical" href="https://mangakatana.com/manga/witch.16743">
<div class="media"><div class="cover"><img src="/witch.jpg"></div></div>
<h1 class="heading">Witch</h1><div class="alt_name">ウ・ィ・ッ・チ ; W.i.t.c.h.</div>
<div class="value status">Completed</div><div class="summary"><p>A magical adventure.</p><p>Five friends.</p></div>
<div class="genres"><a>Fantasy</a><a>Adventure</a></div>
<div class="chapters"><table><tbody>
<tr><td><div class="chapter"><a href="/manga/witch.16743/c3">Chapter 3</a></div></td><td><div class="update_time">Sep-03-2018</div></td></tr>
<tr><td><div class="chapter"><a href="/manga/witch.16743/c1">Chapter 1</a></div></td><td><div class="update_time">Sep-03-2018</div></td></tr>
</tbody></table></div>
<aside><div class="chapter"><a href="/manga/other.123/c1">Chapter 1</a></div></aside>`

function context(body: string, status = 200): SourceContext {
  return {
    fetch: vi.fn(async () => ({ status, headers: {}, body })),
    cache: { async withCache(_key, _ttl, compute) { return compute() } },
    preferences: { async get() { return undefined }, async getWithDefault(_key, fallback) { return fallback }, async set() {} }
  }
}

describe('MangaKatana', () => {
  it('registers its English source', async () => {
    const register = vi.fn<(value: PluginRegistration) => void>()
    globalThis.__media_plugin_register = register
    try {
      await import('../src/index.js')
      expect(register.mock.calls[0]?.[0].manifest).toMatchObject({ id: 'mangakatana', version: '0.1.0', lang: 'en', sourceIds: ['mangakatana'] })
    } finally { delete globalThis.__media_plugin_register }
  })

  it('parses cards without the chapter-count suffix and follows pagination', async () => {
    const ctx = context(SEARCH)
    const result = await source.search(ctx, 'witch & magic', 2)
    expect(result).toMatchObject({ page: 2, hasNextPage: true, items: [{ id: 'mangakatana/witch.16743', title: 'Witch', coverUrl: 'https://mangakatana.com/cover.jpg' }] })
    const url = new URL(vi.mocked(ctx.fetch).mock.calls[0]![0])
    expect(url.pathname).toBe('/page/2')
    expect(url.searchParams.get('search')).toBe('witch & magic')
    expect(url.searchParams.get('search_by')).toBe('book_name')
  })

  it('handles empty results, duplicate cards and off-site links', async () => {
    expect((await source.search(context('<p>No results</p>'), '', 1)).items).toEqual([])
    const html = `<div id="book_list">${CARD}${CARD}${CARD.replace('https://mangakatana.com', 'https://example.com')}</div>`
    expect((await source.search(context(html), '', 1)).items).toHaveLength(1)
  })

  it('handles a search redirect to a single series', async () => {
    const result = await source.search(context(MEDIA), 'witch', 1)
    expect(result.hasNextPage).toBe(false)
    expect(result.items[0]?.mediaId).toBe('witch.16743')
    await expect(source.search(context(MEDIA.replace('rel="canonical"', 'rel="other"')), 'witch', 1)).rejects.toThrow('no series URL')
  })

  it('maps details, alternate titles, synopsis, cover and status', async () => {
    expect(await source.getMedia(context(MEDIA), 'witch.16743')).toMatchObject({
      title: 'Witch', status: 'completed', altTitles: ['ウ・ィ・ッ・チ', 'W.i.t.c.h.'],
      synopsis: 'A magical adventure.\n\nFive friends.', tags: ['Fantasy', 'Adventure'], coverUrl: 'https://mangakatana.com/witch.jpg'
    })
    expect((await source.getMedia(context(MEDIA.replace('Completed', 'Ongoing')), 'witch.16743')).status).toBe('ongoing')
    await expect(source.getMedia(context('<h1>Missing</h1>'), 'missing')).rejects.toThrow('not found')
  })

  it('reads only this series chapter table, oldest first, with ISO dates', async () => {
    const episodes = await source.getEpisodes(context(MEDIA), 'witch.16743')
    expect(episodes.map((e) => e.number)).toEqual([1, 3])
    expect(episodes[0]).toMatchObject({ id: 'mangakatana/witch.16743/c1', lang: 'en', publishedAt: '2018-09-03' })
  })

  it('preserves decimal chapters and volume numbering', async () => {
    const html = MEDIA.replace('>Chapter 3<', '>Vol.02 Chapter 1.5<').replace('>Chapter 1<', '>Vol.01 Chapter 1<')
    const episodes = await source.getEpisodes(context(html), 'witch.16743')
    expect(episodes.map((e) => e.season)).toEqual([1, 2])
    expect(episodes.map((e) => e.number)).toEqual([1, 1.5])
  })

  it('extracts the array used by data-src rather than an unrelated array', async () => {
    const html = `<script>var ad=['https://ads.example/ad.jpg']; var pages=['https://images.example/1.jpg','https://images.example/2.jpg',]; obj.attr('data-src', pages[i]);</script>`
    const ctx = context(html)
    expect(await source.getChapterContent(ctx, 'witch.16743', 'mangakatana/witch.16743/c1')).toEqual({
      type: 'pages', images: ['https://images.example/1.jpg', 'https://images.example/2.jpg'], headers: { referer: 'https://mangakatana.com/' }
    })
    expect(vi.mocked(ctx.fetch).mock.calls[0]?.[0]).toBe('https://mangakatana.com/manga/witch.16743/c1')
  })

  it('supports renamed variables, double quotes and escaped slashes without eval', async () => {
    const html = '<script>const $pages = ["https:\\/\\/images.example/1.jpg"]; obj.attr("data-src", $pages[i]);</script>'
    expect(await source.getChapterContent(context(html), 'witch.16743', 'c1')).toMatchObject({ images: ['https://images.example/1.jpg'] })
  })

  it('rejects absent images and unsafe image schemes', async () => {
    await expect(source.getChapterContent(context('<script>throw new Error("not evaluated")</script>'), 'witch.16743', 'c1')).rejects.toThrow('no reader images')
    await expect(source.getChapterContent(context(`<script>var p=['javascript:alert(1)']; obj.attr('data-src',p[i]);</script>`), 'witch.16743', 'c1')).rejects.toThrow('no reader images')
  })

  it('does not cache expiring reader URLs', async () => {
    const ctx = context(`<script>var p=['https://images.example/1.jpg']; obj.attr('data-src',p[i]);</script>`)
    const cache = vi.spyOn(ctx.cache, 'withCache')
    await source.getChapterContent(ctx, 'witch.16743', 'c1')
    expect(cache).not.toHaveBeenCalled()
  })

  it.each([['latest', '/page/3'], ['directory', '/manga/page/3']])('loads %s discovery', async (id, path) => {
    const ctx = context(SEARCH)
    expect((await source.getHomeSection?.(ctx, id, 3))?.items).toHaveLength(1)
    expect(vi.mocked(ctx.fetch).mock.calls[0]?.[0]).toBe(`https://mangakatana.com${path}`)
  })

  it('labels the alphabetical directory honestly and rejects unknown sections', async () => {
    expect((await source.getHomeSections?.(context('')))?.map((s) => s.id)).toEqual(['latest', 'directory'])
    await expect(source.getHomeSection?.(context(''), 'popular', 1)).rejects.toThrow('unknown homepage section')
  })

  it('propagates HTTP failures', async () => {
    const ctx = context('error', 500)
    await expect(source.search(ctx, '', 1)).rejects.toThrow('HTTP 500')
    await expect(source.getMedia(ctx, 'witch.16743')).rejects.toThrow('HTTP 500')
    await expect(source.getEpisodes(ctx, 'witch.16743')).rejects.toThrow('HTTP 500')
    await expect(source.getChapterContent(ctx, 'witch.16743', 'c1')).rejects.toThrow('HTTP 500')
  })
})
