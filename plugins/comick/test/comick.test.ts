import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeComickSource } from '../src/comick.js'
import type { FetchFn, FetchResult, Media } from '@woyomi/core'

const comick = makeComickSource()

// ---------------------------------------------------------------------------
// Fixtures — shapes captured from the live comick.art API (2026-08).
// ---------------------------------------------------------------------------

/** /api/search page 1 — Laravel cursor paginator, 50 per page. */
const searchPage1Fixture = {
  data: [
    {
      id: 116362,
      hid: 'EmBc4vZ',
      title: 'Solo-fessional: Solo Katsu Danshi to Bocchi Joshi no Koubou-sen',
      slug: 'solo-fessional-solo-katsu-danshi-to-bocchi-joshi-no-koubou-sen',
      default_thumbnail: 'https://cdn1.comicknew.pictures/solo-fessional-solo-katsu-danshi-to-bocchi-joshi-no-koubou-sen/cover',
      status: 1,
      country: 'jp',
      lang: 'en'
    },
    {
      id: 27095,
      hid: '71gMd0vF',
      title: 'Solo Leveling',
      slug: '00-solo-leveling',
      default_thumbnail: 'https://cdn1.comicknew.pictures/00-solo-leveling/covers/48810d64.webp',
      status: 2,
      country: 'kr',
      lang: 'en'
    }
  ],
  path: 'https://comick.art/api/search',
  per_page: 50,
  next_cursor: 'CURSOR_TOKEN_PAGE1',
  prev_cursor: null
}

/** /api/search last page — no next_cursor means no following page. */
const searchLastPageFixture = {
  data: [
    {
      hid: 'zzTOP',
      title: 'Solo Leveling (Novel)',
      slug: 'solo-leveling-novel',
      default_thumbnail: 'https://cdn1.comicknew.pictures/solo-leveling-novel/cover'
    }
  ],
  per_page: 50,
  next_cursor: null
}

const searchEmptyFixture = {
  data: [],
  path: 'https://comick.art/api/search',
  per_page: 50,
  next_cursor: null
}

/** `#comic-data` payload from the comic detail page. */
const comicDataFixture = {
  id: 27095,
  hid: '71gMd0vF',
  title: 'Solo Leveling',
  slug: '00-solo-leveling',
  status: 2,
  translation_completed: false,
  default_thumbnail: 'https://cdn1.comicknew.pictures/00-solo-leveling/covers/48810d64.webp',
  desc: '10 years ago, after “the Gate” that connected the real world with the monster world opened…<br><br>Some <b>ordinary</b> people received the power to hunt dungeons. &amp; they level up alone.',
  country: 'KR',
  content_rating: '',
  md_comic_md_genres: [
    { md_genres: { name: 'Others', slug: 'others' } },
    { md_genres: { name: 'Action', slug: 'action' } },
    { md_genres: { name: 'Adventure', slug: 'adventure' } },
    { md_genres: { name: 'Fantasy', slug: 'fantasy' } }
  ],
  md_titles: [
    { id: 599438, title: '我独自升级', lang: 'zh' },
    { id: 599440, title: '我獨自升級', lang: 'zh-hk' }
  ]
}

const comicDetailHtml = `<!DOCTYPE html><html lang="en"><body>
<header>Comick</header>
<script>window.__navigation = {}</script>
<script id="comic-data">${JSON.stringify(comicDataFixture)}</script>
</body></html>`

/** /api/comics/{slug}/chapter-list — 60 per page, `pagination.last_page` drives the loop. */
const chapterListPage1Fixture = {
  data: [
    {
      hid: '5N_wGCXG',
      chap: '200.5',
      vol: null,
      lang: 'en',
      title: null,
      created_at: '2025-08-11T18:30:10.000000Z',
      group_name: ['Asura Scans']
    },
    {
      hid: 'GMhAHmIL',
      chap: '200',
      vol: null,
      lang: 'en',
      title: 'Epilogue 21: Series Finale',
      created_at: '2024-05-12T19:11:17.289Z',
      group_name: ['Official']
    },
    {
      // same chapter number as above, different group — must be deduped
      hid: 'dup_hid_1',
      chap: '200',
      vol: null,
      lang: 'en',
      title: 'Chapter 200 (fan release)',
      created_at: '2024-05-12T20:00:00.000000Z',
      group_name: ['Another Group']
    },
    {
      hid: 'rwd968fk',
      chap: '199',
      vol: '10',
      lang: 'en',
      title: 'Side Story 21',
      created_at: '2024-04-01T10:00:00.000000Z',
      group_name: []
    }
  ],
  pagination: { current_page: 1, per_page: 60, last_page: 2, total: 5 }
}

const chapterListPage2Fixture = {
  data: [
    {
      hid: 'P_ysNE3VbnLbwN',
      chap: '0',
      vol: null,
      lang: 'en',
      title: null,
      created_at: '2018-09-01T00:00:00.000000Z',
      group_name: []
    }
  ],
  pagination: { current_page: 2, per_page: 60, last_page: 2, total: 5 }
}

/** `#sv-data` payload from the chapter reader page — absolute image URLs. */
const svDataFixture = {
  chapter: {
    hid: 'GMhAHmIL',
    chap: '200',
    lang: 'en',
    group_name: ['Official'],
    images: [
      { h: 1742, w: 760, name: 'image 1', s: null, url: 'https://cdn1.comicknew.pictures/00-solo-leveling/0_200.0/en/9877320d/0.webp' },
      { h: 1500, w: 760, name: 'image 2', s: null, url: 'https://cdn1.comicknew.pictures/00-solo-leveling/0_200.0/en/9877320d/1.webp' },
      { h: 1400, w: 760, name: 'image 3', s: null, url: 'https://cdn1.comicknew.pictures/00-solo-leveling/0_200.0/en/9877320d/2.webp' }
    ]
  },
  chapterLangList: ['en', 'pt-br']
}

const chapterPageHtml = `<!DOCTYPE html><html lang="en"><body>
<div id="images"></div>
<script id="sv-data">${JSON.stringify(svDataFixture)}</script>
</body></html>`

const topFixture = {
  data: [
    {
      id: 121243,
      title: 'The Demonic Supreme Sword',
      slug: 'the-demonic-supreme-sword',
      country: 'cn',
      default_thumbnail: 'https://cdn1.comicknew.pictures/the-demonic-supreme-sword/covers/9c0f.webp',
      content_rating: 'safe'
    }
  ]
}

const latestFixture = {
  data: Array.from({ length: 100 }, (_, i) => ({
    id: 54_500 + i,
    slug: `latest-comic-${i}`,
    title: `Latest Comic ${i}`,
    default_thumbnail: `https://cdn1.comicknew.pictures/latest-comic-${i}/cover`
  }))
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/**
 * Route by longest substring match so `cursor=` beats `/api/search` and
 * `page=2` beats `page=1`. String bodies are served as HTML.
 */
function fixtureFetch(routes: Record<string, unknown>): FetchFn {
  const entries = Object.entries(routes)
  return async (url): Promise<FetchResult> => {
    const match = entries
      .filter(([key]) => url.includes(key))
      .sort((a, b) => b[0].length - a[0].length)[0]
    if (!match) return { status: 404, headers: {}, body: `no fixture for ${url}` }
    const isHtml = typeof match[1] === 'string'
    return {
      status: 200,
      headers: { 'content-type': isHtml ? 'text/html' : 'application/json' },
      body: isHtml ? (match[1] as string) : JSON.stringify(match[1])
    }
  }
}

const ctx = {
  cache: {
    async withCache<T>(_key: string, _ttl: number, compute: () => Promise<T>): Promise<T> {
      return compute()
    }
  },
  preferences: {
    async getWithDefault<T>(key: string, fallback: T): Promise<T> {
      return (prefOverrides[key] as T | undefined) ?? fallback
    },
    async get() {
      return undefined
    },
    async set() {}
  }
}

/** test-time overrides consulted by the shared ctx.preferences fixture */
const prefOverrides: Record<string, unknown> = {}

beforeEach(() => {
  delete prefOverrides.chapterLang
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('comick source', () => {
  it('maps search results and flags the next page via next_cursor', async () => {
    const res = await comick.search({ ...ctx, fetch: fixtureFetch({ 'q=solo': searchPage1Fixture }) }, 'solo', 1)
    expect(res.items).toHaveLength(2)
    const m = res.items[0]!
    expect(m.id).toBe('comick/solo-fessional-solo-katsu-danshi-to-bocchi-joshi-no-koubou-sen')
    expect(m.mediaId).toBe('solo-fessional-solo-katsu-danshi-to-bocchi-joshi-no-koubou-sen')
    expect(m.sourceId).toBe('comick')
    expect(m.title).toBe('Solo-fessional: Solo Katsu Danshi to Bocchi Joshi no Koubou-sen')
    expect(m.type).toBe('manga')
    expect(m.coverUrl).toContain('cdn1.comicknew.pictures')
    // covers 403 without the comick origin as Referer; the app's image loader
    // reads this `headers` field (same convention as chapter page images)
    expect((m as Media & { headers?: Record<string, string> }).headers).toEqual({ Referer: 'https://comick.art/' })
    expect(res.hasNextPage).toBe(true)
    expect(res.page).toBe(1)
  })

  it('threads the cursor into page 2 and stops when next_cursor is null', async () => {
    const fetch = fixtureFetch({ 'q=solo': searchPage1Fixture, 'cursor=': searchLastPageFixture })
    const spy = vi.fn(fetch)
    await comick.search({ ...ctx, fetch: spy }, 'solo', 1)
    const page2 = await comick.search({ ...ctx, fetch: spy }, 'solo', 2)
    const urls = spy.mock.calls.map(([u]) => String(u))
    expect(urls[0]).not.toContain('cursor=')
    expect(urls[1]).toContain('cursor=CURSOR_TOKEN_PAGE1')
    expect(page2.items[0]?.title).toBe('Solo Leveling (Novel)')
    expect(page2.hasNextPage).toBe(false)
  })

  it('returns an empty page for queries shorter than the upstream 3-char minimum', async () => {
    const spy = vi.fn(fixtureFetch({ '/api/search': searchPage1Fixture }))
    const res = await comick.search({ ...ctx, fetch: spy }, 'so', 1)
    expect(res).toEqual({ page: 1, hasNextPage: false, items: [] })
    expect(spy).not.toHaveBeenCalled()
  })

  it('returns empty results when the API finds nothing', async () => {
    const res = await comick.search({ ...ctx, fetch: fixtureFetch({ 'q=zzz': searchEmptyFixture }) }, 'zzz', 1)
    expect(res.items).toEqual([])
    expect(res.hasNextPage).toBe(false)
  })

  it('maps comic detail: status, origin + genre tags, cleaned synopsis, alt titles', async () => {
    const m = await comick.getMedia({ ...ctx, fetch: fixtureFetch({ '/comic/00-solo-leveling': comicDetailHtml }) }, '00-solo-leveling')
    expect(m.id).toBe('comick/00-solo-leveling')
    expect(m.title).toBe('Solo Leveling')
    expect(m.coverUrl).toBe('https://cdn1.comicknew.pictures/00-solo-leveling/covers/48810d64.webp')
    expect(m.status).toBe('completed') // numeric status 2
    expect(m.tags).toEqual(['Manhwa', 'Others', 'Action', 'Adventure', 'Fantasy']) // country KR -> Manhwa
    expect(m.synopsis).not.toContain('<')
    expect(m.synopsis).toContain('level up alone')
    expect(m.altTitles).toEqual(['我独自升级', '我獨自升級'])
  })

  it('maps chapters: numbers, seasons, dedupe across groups, ascending order', async () => {
    const eps = await comick.getEpisodes(
      { ...ctx, fetch: fixtureFetch({ 'page=1': chapterListPage1Fixture, 'page=2': chapterListPage2Fixture }) },
      '00-solo-leveling'
    )
    expect(eps.map((e) => e.number)).toEqual([0, 199, 200, 200.5])
    expect(eps.every((e) => e.lang === 'en')).toBe(true)
    expect(eps.every((e) => e.mediaId === '00-solo-leveling')).toBe(true)
    const vol10 = eps.find((e) => e.number === 199)
    expect(vol10?.season).toBe(10)
    const finale = eps.find((e) => e.number === 200)
    expect(finale?.title).toBe('Epilogue 21: Series Finale')
    expect(finale?.id).toBe('comick/00-solo-leveling/GMhAHmIL:200:en')
    expect(finale?.publishedAt).toBe('2024-05-12T19:11:17.289Z')
  })

  it('pages through the chapter list until pagination.last_page', async () => {
    const fetch = fixtureFetch({ 'page=1': chapterListPage1Fixture, 'page=2': chapterListPage2Fixture })
    const spy = vi.fn(fetch)
    const eps = await comick.getEpisodes({ ...ctx, fetch: spy }, '00-solo-leveling')
    const urls = spy.mock.calls.map(([u]) => String(u))
    expect(urls).toHaveLength(2)
    expect(urls[0]).toContain('/api/comics/00-solo-leveling/chapter-list?lang=en&page=1')
    expect(urls[1]).toContain('page=2')
    expect(eps).toHaveLength(4) // 4 entries on page 1 minus 1 group duplicate, plus 1 on page 2
  })

  it('honors the chapterLang preference in the chapter-list request', async () => {
    prefOverrides.chapterLang = 'pt-br'
    const fetch = fixtureFetch({ 'lang=pt-br': chapterListPage1Fixture })
    const spy = vi.fn(fetch)
    await comick.getEpisodes({ ...ctx, fetch: spy }, '00-solo-leveling')
    expect(spy.mock.calls[0]?.[0]).toContain('lang=pt-br')
  })

  it('builds the reader URL from the episode id and maps page images in order', async () => {
    const fetch = fixtureFetch({ '-chapter-': chapterPageHtml })
    const spy = vi.fn(fetch)
    const content = await comick.getChapterContent({ ...ctx, fetch: spy }, '00-solo-leveling', 'comick/00-solo-leveling/GMhAHmIL:200:en')
    expect(spy.mock.calls[0]?.[0]).toBe('https://comick.art/comic/00-solo-leveling/GMhAHmIL-chapter-200-en')
    expect(content).toEqual({
      type: 'pages',
      images: [
        'https://cdn1.comicknew.pictures/00-solo-leveling/0_200.0/en/9877320d/0.webp',
        'https://cdn1.comicknew.pictures/00-solo-leveling/0_200.0/en/9877320d/1.webp',
        'https://cdn1.comicknew.pictures/00-solo-leveling/0_200.0/en/9877320d/2.webp'
      ],
      // CDN images 403 without the site Referer (pages headers, core >= 0.2.0)
      headers: { Referer: 'https://comick.art/' }
    })
  })

  it('rejects malformed episode ids instead of fetching garbage URLs', async () => {
    const spy = vi.fn(fixtureFetch({}))
    await expect(
      comick.getChapterContent({ ...ctx, fetch: spy }, '00-solo-leveling', 'comick/00-solo-leveling/GMhAHmIL')
    ).rejects.toThrow('malformed episode id')
    expect(spy).not.toHaveBeenCalled()
  })

  it('lists Popular and Latest home sections and maps them', async () => {
    const sections = await comick.getHomeSections?.({ ...ctx, fetch: fixtureFetch({}) })
    expect(sections?.map((s) => s.id)).toEqual(['popular', 'latest'])
    const popular = await comick.getHomeSection?.(
      { ...ctx, fetch: fixtureFetch({ '/api/comics/top': topFixture }) },
      'popular',
      1
    )
    expect(popular?.items[0]?.title).toBe('The Demonic Supreme Sword')
    expect(popular?.hasNextPage).toBe(false)
    const popularPage2 = await comick.getHomeSection?.({ ...ctx, fetch: fixtureFetch({}) }, 'popular', 2)
    expect(popularPage2?.items).toEqual([])
  })

  it('flags the Latest section next page using the full-page heuristic', async () => {
    const res = await comick.getHomeSection?.({ ...ctx, fetch: fixtureFetch({ '/api/chapters/latest': latestFixture }) }, 'latest', 1)
    expect(res?.items).toHaveLength(100)
    expect(res?.hasNextPage).toBe(true)
  })

  it('throws on HTTP error', async () => {
    const fetch: FetchFn = async () => ({ status: 503, headers: {}, body: 'unavailable' })
    await expect(comick.search({ ...ctx, fetch }, 'solo', 1)).rejects.toThrow(/HTTP 503/)
    await expect(comick.getMedia({ ...ctx, fetch }, '00-solo-leveling')).rejects.toThrow(/HTTP 503/)
  })
})
