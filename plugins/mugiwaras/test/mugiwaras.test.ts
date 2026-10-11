import { describe, expect, it, vi } from 'vitest'
import { makeMugiwarasSource } from '../src/mugiwaras.js'
import type { FetchFn, FetchResult } from '@woyomi/core'

const mugiwaras = makeMugiwarasSource()

// Fixtures below are trimmed captures of the live JSON API
// (app.mugiwarasoficial.com/v1/www) on 2026-08-16.

const SEARCH_JSON = JSON.stringify({
  data: [
    {
      id: 'wrk_1776195280741',
      slug: 'one-piece',
      title: 'One Piece',
      coverUrl: 'https://aurora.snipercache.com/manga/one-piece/cover/1785954191353-one-piece.webp?sig=Zd9OgKaWvDjF_NJP4C578g&exp=1787499640',
      type: 'manga',
      status: 'published',
      publicationStatus: 'ongoing',
      chapterCount: 1190,
      isAdult: false,
      isFree: true,
      badge: '',
      titleOriginal: '',
      titleAlt: ''
    },
    {
      id: 'wrk_1785813310965',
      slug: 'one-piece-gakuen',
      title: 'One Piece Gakuen!!',
      coverUrl: 'https://aurora.snipercache.com/manga/one-piece-gakuen/cover/1785813310985-one-piece-gakuen.webp?sig=-gSYheb8ai4NQ7qHxQTVw&exp=1787499640',
      type: 'manga',
      status: 'published',
      publicationStatus: 'completed',
      chapterCount: 10,
      isAdult: false,
      isFree: true,
      badge: '',
      titleOriginal: 'ONE PIECE学園!!',
      titleAlt: ''
    }
  ],
  meta: { query: 'one piece', limit: 8, count: 2 }
})

const WORK_JSON = JSON.stringify({
  data: {
    id: 'wrk_1776195280741',
    slug: 'one-piece',
    title: 'One Piece',
    altTitles: ['ONE PIECE'],
    author: 'Eiichirou Oda',
    publisher: 'Eiichirou Oda',
    coverUrl: 'https://aurora.snipercache.com/manga/one-piece/cover/1785954191353-one-piece.webp?sig=iS3jnwg_Q8nuzucFZZo3iA&exp=1787499613',
    description: 'Quando criança, Monkey D. Luffy foi inspirado a se tornar um pirata ao ouvir as histórias do bucaneiro "Ruivo" Shanks...',
    tags: ['Ação', 'Aventura', 'Comédia', 'Fantasia'],
    type: 'manga',
    status: 'published',
    publicationStatus: 'ongoing',
    chapterCount: 1190,
    isAdult: false
  }
})

// The API lists chapters newest-first, paged; meta.totalPages drives pagination.
const CHAPTERS_PAGE1_JSON = JSON.stringify({
  data: [
    {
      id: 'chp_1786995678300',
      number: 1191,
      title: 'Ainda tem o Loki',
      publishedAt: '2026-08-17T19:41:18.300Z',
      access: 'free',
      isFree: true,
      isPremium: false,
      isLocked: false,
      kind: 'spoiler',
      isPreview: false
    },
    {
      id: 'chp_1786040622728',
      number: 1190,
      title: 'Aquele que cuja morte é comemorada',
      publishedAt: '2026-08-06T18:23:42.728Z',
      access: 'free',
      isFree: true,
      isPremium: false,
      isLocked: false,
      kind: 'chapter',
      isPreview: false
    },
    {
      id: 'chp_1784983277288',
      number: 1189,
      title: 'Capitulo 1189',
      publishedAt: '2026-07-25T12:41:17.288Z',
      access: 'free',
      isFree: true,
      isPremium: false,
      isLocked: false,
      kind: 'chapter',
      isPreview: false
    }
  ],
  meta: { page: 1, limit: 100, total: 5, totalPages: 2 }
})

const CHAPTERS_PAGE2_JSON = JSON.stringify({
  data: [
    {
      id: 'chp_1776806403844',
      number: 102.5,
      title: 'Extra: O make-up do Zoro',
      publishedAt: '2026-08-15T15:06:43.844Z',
      access: 'free',
      isFree: true,
      kind: 'chapter',
      isPreview: false
    },
    {
      id: 'chp_1776040622000',
      number: 1,
      title: 'Capitulo 1',
      publishedAt: '1997-07-22T00:00:00.000Z',
      access: 'free',
      isFree: true,
      kind: 'chapter',
      isPreview: false
    }
  ],
  meta: { page: 2, limit: 100, total: 4, totalPages: 2 }
})

const PAGES_JSON = JSON.stringify({
  data: {
    chapterId: '1189',
    pages: [
      { index: 2, imageUrl: 'https://aurora.snipercache.com/manga/one-piece/cap1189/page-0002-v1785078909859.webp?sig=hxVak0M53nMHTv4h_5oIwg&exp=1786895649', width: 800, height: 1200, isDouble: false },
      { index: 1, imageUrl: 'https://aurora.snipercache.com/manga/one-piece/cap1189/page-0001-v1785078909692.webp?sig=0j-uBmdjmou4bKtcbiQq9g&exp=1786895649', width: 800, height: 1200, isDouble: false }
    ]
  }
})

// Real `atfield` capture (2026-10) of /v1/www/works/one-piece/chapters/1189/pages:
// encrypted tokens plus the key the site serves and the URLs they decrypt to.
const REAL_TOKEN_KEY = 'SoCEMLs43mfOKs+dh74EuTxAvuLpCvHNaFzEjbT7ZQE='
const TOKEN_PAGES_JSON = JSON.stringify({
  data: {
    chapterId: '1189',
    pages: [
      {
        index: 2,
        imageUrl:
          'AQAAUQGtWuvim4llkyGovVSks6H4d01mdMbaHrbStHkSvgzDTzGVnfEUBRHSDg0LdQ0kYV3nApdkXmVypOwil0FtUKJAnhLRVOCWlJrScAsdeVIkuY1ram1QW7hwXpJd6T4Pv5tGGfWESiUGzfkRTMrHNPLgBWhM0_WitZkvFX8xHuk0OG27td863A',
        width: 0,
        height: 0,
        isDouble: false
      },
      {
        index: 1,
        imageUrl:
          'AQAAUQGHescgbhCoVnVzHpvTYphygda9wMxizshrC8Hxj5TCLTaXrC7Vici81TexIBJoBRZGL2lJlqLPC_NNBoIIS3vMOe5TU5y82Fojz4nxcg_aghfG0DlowG0_JySHqmJvuyJKKwGMqzpwuhoqsURWAttuqQaz_K6IleD_o7cHjCZvUoxayf3s9Q',
        width: 0,
        height: 0,
        isDouble: false
      }
    ]
  }
})
const REAL_TOKEN_URLS = [
  'https://aurora.snipercache.com/manga/one-piece/cap1189/page-0001-v1785078909692.webp?sig=gTlaJRV1RSTZZhMykzTjXA&exp=1791762957',
  'https://aurora.snipercache.com/manga/one-piece/cap1189/page-0002-v1785078909859.webp?sig=6MzXhUuhuJGNukkT5Pk2QQ&exp=1791762957'
]

/** A well-formed token with an arbitrary key version (never needs to decrypt). */
function craftToken(keyId: number, version: number): string {
  const bytes = new Uint8Array(17)
  bytes[0] = keyId
  bytes[1] = (version >>> 24) & 255
  bytes[2] = (version >>> 16) & 255
  bytes[3] = (version >>> 8) & 255
  bytes[4] = version & 255
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const HOME_JSON = JSON.stringify({
  data: {
    portalStatus: 'open',
    mostRead: [
      {
        id: 'wrk_1776195280741',
        slug: 'one-piece',
        title: 'One Piece',
        coverUrl: 'https://aurora.snipercache.com/manga/one-piece/cover/1785954191353-one-piece.webp?sig=2VLfpC0oKRxLgoWNT06bng&exp=1787499688',
        type: 'manga',
        status: 'published',
        publicationStatus: 'ongoing',
        chapterCount: 1190
      }
    ],
    recentUpdates: [
      {
        id: 'wrk_1776198355397',
        slug: 'spy-x-family',
        title: 'Spy x Family',
        coverUrl: 'https://aurora.snipercache.com/manga/spy-x-family/cover/1785954195598-spy-x-family.webp?sig=13XLTgvAETTZmaMjzfDLKQ&exp=1787499688',
        type: 'manga',
        status: 'published',
        publicationStatus: 'ongoing',
        chapterCount: 173,
        recentChapters: [{ id: 'chp_1786894018507', number: 173 }]
      }
    ],
    popular: [
      {
        id: 'wrk_1776260549043',
        slug: 'nanotecnologia',
        title: 'Nanotecnologia',
        coverUrl: 'https://aurora.snipercache.com/manhwa/nanotecnologia/cover/1.webp?sig=x&exp=1787499688',
        type: 'manhwa',
        status: 'published',
        publicationStatus: 'ongoing',
        chapterCount: 42
      }
    ]
  }
})

function fixtureFetch(routes: Record<string, string>): FetchFn {
  return async (url): Promise<FetchResult> => {
    const key = Object.keys(routes).find((k) => url.includes(k))
    if (!key) return { status: 404, headers: {}, body: 'not found' }
    return { status: 200, headers: { 'content-type': 'application/json' }, body: routes[key]! }
  }
}

const ctx = {
  cache: {
    async withCache<T>(_k: string, _t: number, compute: () => Promise<T>): Promise<T> {
      return compute()
    }
  },
  preferences: {
    async get() {
      return undefined
    },
    async getWithDefault<T>(_key: string, fallback: T): Promise<T> {
      return fallback
    },
    async set() {}
  }
}

describe('mugiwaras source', () => {
  it('trims and URL-encodes the search query', async () => {
    let called = ''
    const fetch: FetchFn = async (url) => {
      called = url
      return { status: 200, headers: { 'content-type': 'application/json' }, body: SEARCH_JSON }
    }
    await mugiwaras.search({ ...ctx, fetch }, ' one piece ', 1)
    expect(called).toBe('https://app.mugiwarasoficial.com/v1/www/search?q=one%20piece')
  })

  it('sends browser fetch-metadata headers so Cloudflare lets the API through', async () => {
    let sent: Record<string, string> = {}
    const fetch: FetchFn = async (_url, init) => {
      sent = init?.headers ?? {}
      return { status: 200, headers: { 'content-type': 'application/json' }, body: SEARCH_JSON }
    }
    await mugiwaras.search({ ...ctx, fetch }, 'one piece', 1)
    expect(sent['user-agent']).toContain('Mozilla/5.0')
    expect(sent['sec-fetch-dest']).toBe('empty')
    expect(sent['sec-fetch-mode']).toBe('cors')
    expect(sent['sec-fetch-site']).toBe('same-site')
    expect(sent.accept).toBe('application/json')
  })

  it('maps search cards (manhwa/manhua included as manga) with no pagination', async () => {
    const res = await mugiwaras.search({ ...ctx, fetch: fixtureFetch({ '/search?q=': SEARCH_JSON }) }, 'one piece', 1)
    expect(res.items.map((m) => m.mediaId)).toEqual(['one-piece', 'one-piece-gakuen'])
    expect(res.items[0]?.title).toBe('One Piece')
    expect(res.items[0]?.type).toBe('manga')
    expect(res.items[0]?.id).toBe('mugiwaras/one-piece')
    expect(res.items[0]?.coverUrl).toContain('one-piece.webp')
    // cover URLs are stripped of sig/exp for stable caching
    expect(res.items[0]?.coverUrl).not.toContain('sig=')
    expect(res.hasNextPage).toBe(false)
  })

  it('parses media details: synopsis, tags, status, alt titles', async () => {
    const m = await mugiwaras.getMedia({ ...ctx, fetch: fixtureFetch({ '/works/one-piece': WORK_JSON }) }, 'one-piece')
    expect(m.title).toBe('One Piece')
    expect(m.type).toBe('manga')
    expect(m.status).toBe('ongoing')
    expect(m.synopsis).toContain('Monkey D. Luffy')
    expect(m.tags).toEqual(['Ação', 'Aventura', 'Comédia', 'Fantasia'])
    expect(m.altTitles).toEqual(['ONE PIECE'])
    expect(m.coverUrl).toContain('one-piece.webp')
  })

  it('strips sig/exp from cover URLs so the cover hash is stable across calls', async () => {
    const m = await mugiwaras.getMedia({ ...ctx, fetch: fixtureFetch({ '/works/one-piece': WORK_JSON }) }, 'one-piece')
    expect(m.coverUrl).not.toContain('sig=')
    expect(m.coverUrl).not.toContain('exp=')
  })

  it('filters out spoiler chapters that have no readable pages', async () => {
    const eps = await mugiwaras.getEpisodes(
      {
        ...ctx,
        fetch: fixtureFetch({
          'chapters?limit=100&page=1': CHAPTERS_PAGE1_JSON,
          'chapters?limit=100&page=2': CHAPTERS_PAGE2_JSON
        })
      },
      'one-piece'
    )
    expect(eps.find((e) => e.number === 1191)).toBeUndefined()
  })

  it('walks all chapter-list pages and sorts episodes ascending', async () => {
    const eps = await mugiwaras.getEpisodes(
      {
        ...ctx,
        fetch: fixtureFetch({
          'chapters?limit=100&page=1': CHAPTERS_PAGE1_JSON,
          'chapters?limit=100&page=2': CHAPTERS_PAGE2_JSON
        })
      },
      'one-piece'
    )
    // page 1 has a spoiler chapter (1191) that is filtered out
    expect(eps).toHaveLength(4)
    expect(eps.map((e) => e.number)).toEqual([1, 102.5, 1189, 1190])
    expect(eps[0]?.id).toBe('mugiwaras/one-piece/1')
    expect(eps[3]?.id).toBe('mugiwaras/one-piece/1190')
    expect(eps[3]?.mediaId).toBe('one-piece')
    expect(eps[3]?.lang).toBe('pt-br')
  })

  it('keeps real chapter titles but drops "Capitulo N" placeholders', async () => {
    const eps = await mugiwaras.getEpisodes(
      {
        ...ctx,
        fetch: fixtureFetch({
          'chapters?limit=100&page=1': CHAPTERS_PAGE1_JSON,
          'chapters?limit=100&page=2': CHAPTERS_PAGE2_JSON
        })
      },
      'one-piece'
    )
    expect(eps.find((e) => e.number === 1190)?.title).toBe('Aquele que cuja morte é comemorada')
    expect(eps.find((e) => e.number === 1189)?.title).toBeUndefined()
    expect(eps.find((e) => e.number === 102.5)?.title).toBe('Extra: O make-up do Zoro')
    expect(eps.find((e) => e.number === 1189)?.publishedAt).toBe('2026-07-25T12:41:17.288Z')
  })

  it('returns chapter pages ordered by index', async () => {
    const content = await mugiwaras.getChapterContent(
      { ...ctx, fetch: fixtureFetch({ '/chapters/1189/pages': PAGES_JSON }) },
      'one-piece',
      'mugiwaras/one-piece/1189'
    )
    expect(content.type).toBe('pages')
    if (content.type !== 'pages') throw new Error('unreachable')
    expect(content.images).toHaveLength(2)
    expect(content.images[0]).toContain('page-0001')
    expect(content.images[1]).toContain('page-0002')
  })

  it('supplies the headers required by the page image CDN', async () => {
    const content = await mugiwaras.getChapterContent(
      { ...ctx, fetch: fixtureFetch({ '/chapters/1189/pages': PAGES_JSON }) },
      'one-piece',
      'mugiwaras/one-piece/1189'
    )
    if (content.type !== 'pages') throw new Error('unreachable')
    expect(content.headers).toEqual({
      Referer: 'https://mugiwarasoficial.org/',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
    })
  })

  it('resolves fractional chapter numbers from the episode id', async () => {
    let called = ''
    const fetch: FetchFn = async (url) => {
      called = url
      return { status: 200, headers: { 'content-type': 'application/json' }, body: PAGES_JSON }
    }
    await mugiwaras.getChapterContent({ ...ctx, fetch }, 'moby-dick', 'mugiwaras/moby-dick/102.5')
    expect(called).toBe('https://app.mugiwarasoficial.com/v1/www/works/moby-dick/chapters/102.5/pages')
  })

  it('throws when a chapter has no pages', async () => {
    const empty = JSON.stringify({ data: { chapterId: '1', pages: [] } })
    await expect(
      mugiwaras.getChapterContent({ ...ctx, fetch: fixtureFetch({ '/chapters/1/pages': empty }) }, 'one-piece', 'mugiwaras/one-piece/1')
    ).rejects.toThrow('no pages found')
  })

  it('walks the gate and decrypts atfield page tokens, caching the key', async () => {
    vi.useFakeTimers()
    try {
      let gateWalks = 0
      let keyHeaders: Record<string, string> = {}
      let callbackRedirect: string | undefined
      const fetch: FetchFn = async (url, init): Promise<FetchResult> => {
        if (url.includes('/gate-token')) {
          gateWalks++
          return { status: 200, headers: {}, body: JSON.stringify({ data: { token: 'gate-1', gateUrl: 'https://redenovax.example/jump/x' } }) }
        }
        if (url.includes('redenovax.example')) return { status: 200, headers: {}, body: 'ad' }
        if (url.includes('/gate/callback')) {
          callbackRedirect = (init as { redirect?: string } | undefined)?.redirect
          return {
            status: 307,
            headers: {
              location: 'https://mugiwarasoficial.org/manga/one-piece/1189',
              'set-cookie': 'mnx_gate_binding=bind1; Path=/; HttpOnly\nmnx_gate_h1=jwt1; Path=/; HttpOnly'
            },
            body: ''
          }
        }
        if (url.includes('/api/atfield/key')) {
          keyHeaders = init?.headers ?? {}
          return { status: 200, headers: {}, body: JSON.stringify({ v: 1, e: 20737, k: REAL_TOKEN_KEY }) }
        }
        return { status: 200, headers: {}, body: TOKEN_PAGES_JSON }
      }
      const first = mugiwaras.getChapterContent({ ...ctx, fetch }, 'one-piece', 'mugiwaras/one-piece/1189')
      await vi.advanceTimersByTimeAsync(10_000)
      const content = await first
      if (content.type !== 'pages') throw new Error('unreachable')
      expect(content.images).toEqual(REAL_TOKEN_URLS)
      expect(callbackRedirect).toBe('manual')
      expect(keyHeaders.cookie).toBe('mnx_gate_binding=bind1; mnx_gate_h1=jwt1')
      expect(keyHeaders.referer).toBe('https://mugiwarasoficial.org/manga/one-piece/1189')

      const second = await mugiwaras.getChapterContent({ ...ctx, fetch }, 'one-piece', 'mugiwaras/one-piece/1189')
      if (second.type !== 'pages') throw new Error('unreachable')
      expect(second.images).toEqual(REAL_TOKEN_URLS)
      expect(gateWalks).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('fails with a runtime hint when gate cookies cannot be read', async () => {
    vi.useFakeTimers()
    try {
      const pagesJson = JSON.stringify({
        data: { chapterId: '7', pages: [{ index: 1, imageUrl: craftToken(1, 99999), width: 0, height: 0, isDouble: false }] }
      })
      const fetch: FetchFn = async (url): Promise<FetchResult> => {
        if (url.includes('/gate-token')) return { status: 200, headers: {}, body: JSON.stringify({ data: { token: 'gate-2' } }) }
        // An older app or a browser runtime follows the 307 and exposes no cookies.
        if (url.includes('/gate/callback')) return { status: 200, headers: {}, body: '<html></html>' }
        return { status: 200, headers: {}, body: pagesJson }
      }
      const pending = mugiwaras.getChapterContent({ ...ctx, fetch }, 'one-piece', 'mugiwaras/one-piece/7')
      const assertion = expect(pending).rejects.toThrow('unreadable in this runtime')
      await vi.advanceTimersByTimeAsync(10_000)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })

  it('exposes the two non-redundant home sections and maps their items', async () => {
    const sections = await mugiwaras.getHomeSections!({ ...ctx, fetch: fixtureFetch({}) })
    expect(sections).toEqual([
      { id: 'recent-updates', title: 'Últimas atualizações' },
      { id: 'most-read', title: 'Mais lidos no momento' }
    ])
    const fetch = fixtureFetch({ '/home': HOME_JSON })
    const mostRead = await mugiwaras.getHomeSection!({ ...ctx, fetch }, 'most-read', 1)
    expect(mostRead.items.map((m) => m.mediaId)).toEqual(['one-piece'])
    const recent = await mugiwaras.getHomeSection!({ ...ctx, fetch }, 'recent-updates', 1)
    expect(recent.items.map((m) => m.title)).toEqual(['Spy x Family'])
  })

  it('returns an empty second home page and rejects unknown sections', async () => {
    const fetch = fixtureFetch({ '/home': HOME_JSON })
    const page2 = await mugiwaras.getHomeSection!({ ...ctx, fetch }, 'most-read', 2)
    expect(page2.items).toEqual([])
    await expect(mugiwaras.getHomeSection!({ ...ctx, fetch }, 'nope', 1)).rejects.toThrow('unknown homepage section')
  })
})
