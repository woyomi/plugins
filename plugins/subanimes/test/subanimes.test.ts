import { describe, expect, it } from 'vitest'
import { DOMParser } from 'linkedom'
import { makeSubanimesSource } from '../src/subanimes.js'
import type { FetchFn, FetchResult } from '@woyomi/core'

;(globalThis as Record<string, unknown>).DOMParser = DOMParser

const subanimes = makeSubanimesSource()

// Real shapes captured from the live site (2026-08); trimmed to the relevant parts.
const SEARCH_JSON = JSON.stringify({
  status: 'success',
  data: [
    {
      name: 'Naruto',
      slug: 'naruto',
      url: '/anime/naruto',
      poster: 'https://anidb.00000120.xyz/content/animes/posters/180/2462.webp',
      year: 2002,
      type: 'Anime'
    },
    {
      name: 'Naruto Shippuden',
      slug: 'naruto-shippuden',
      url: '/anime/naruto-shippuden',
      poster: 'https://anidb.00000120.xyz/content/animes/posters/180/2461.webp',
      year: 2007,
      type: 'Anime'
    }
  ],
  is_recommended: false
})

const DETAIL_HTML = `
<div class="anime-header-bar"><div class="wrap"><h1>Naruto</h1></div></div>
<div class="left-info-col">
  <div class="poster-holder">
    <img src="https://anidb.00000120.xyz/content/animes/posters/180/2462.webp" class="stupidPoster" title="Assistir Naruto online" alt="Assistir Naruto online">
  </div>
  <div class="status-box status-completed">Completo</div>
  <div class="meta-details">
    <div class="meta-item"><span class="meta-label">Temporadas</span><span class="meta-val" id="animeSeasonsCount">—</span></div>
    <div class="meta-item"><span class="meta-label">Ano</span><span class="meta-val">2002</span></div>
  </div>
</div>
<div class="right-content-col">
  <div class="synopsis-box"><h3>Sinopse</h3><span class="desc">Momentos antes do nascimento de Naruto Uzumaki, um enorme demônio conhecido como o Kyuubi atacou o vilarejo da folha oculta Konoha.</span></div>
</div>
<div class="genres-row"><span class="genre-tag">Action &amp; Adventure</span><span class="genre-tag">Animação</span><span class="genre-tag">Sci-Fi &amp; Fantasy</span></div>`

const DETAIL_AIRING_HTML = DETAIL_HTML.replace(
  'status-box status-completed">Completo<',
  'status-box status-airing">Em lançamento<'
).replace('<h1>Naruto</h1>', '<h1>One Piece</h1>')

// Jujutsu Kaisen runs two seasons on the site; the last entry exercises a
// custom episode title (names are "Episódio N" for everything else).
const EPISODES_JSON = JSON.stringify({
  data: {
    episodes: [
      { id: 66069, number: 1, season: 1, name: 'Episódio 1', title: 'Episódio 1', slug: 'jujutsu-kaisen-1x1', is_filler: false, url: '/ep/jujutsu-kaisen-1-episodio-1' },
      { id: 66070, number: 2, season: 1, name: 'Episódio 2', title: 'Episódio 2', slug: 'jujutsu-kaisen-1x2', is_filler: false, url: '/ep/jujutsu-kaisen-1-episodio-2' },
      { id: 66091, number: 23, season: 2, name: 'A origem da obediência', title: 'A origem da obediência', slug: 'jujutsu-kaisen-2x23', is_filler: false, url: '/ep/jujutsu-kaisen-2-episodio-23' }
    ],
    counts: { episodes: 47 }
  }
})

// Two audio variants (one button each) + the iframe duplicating the first player.
const EPISODE_PAGE_HTML = `
<div class="player-tabs">
  <button class="player-tab-btn active" onclick="switchPlayer(this, 'https://00000410.xyz/player/index.php?data=0055c3d5d8b6eff2a2334944dff14405')"> DUBLADO </button>
  <button class="player-tab-btn " onclick="switchPlayer(this, 'https://00000410.xyz/player/index.php?data=26e5f52fb8c6201ef7f2850042b6b72e')"> LEGENDADO </button>
</div>
<iframe src="https://00000410.xyz/player/index.php?data=0055c3d5d8b6eff2a2334944dff14405"></iframe>`

const MASTER_DUB = `#EXTM3U
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=1755223,RESOLUTION=1280x720,FRAME-RATE=23.974,CODES="avc1.64001f,mp4a.40.2"
https://00000410.xyz/m3/b0JRaCtrOTM2cWZYSkY4MlRvbHU3MXR3OWYvZnpEdGdMN0dNT2tYM3JNeXg1UUtyOC9rSVFDWDFYWXhvVTV1S29ZdktPem9CQktxdGlhYm1wbGNIR29STjA3NVQ
#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=57180,RESOLUTION=1280x720,CODES="avc1.64001f",URI="https://00000410.xyz/m3/iframe-only-token"`

const MASTER_LEG = `#EXTM3U
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=535658,RESOLUTION=848x480,FRAME-RATE=23.974,CODES="avc1.42c01e,mp4a.40.2",VIDEO-RANGE=SDR
https://00000410.xyz/m3/M3BrY0dOMTJHUTdveWU2N3NPOFBVeTQ4L1pMM0NBVCs0VDU2YXhHUFM5NDRyL0F0YUFmVDdGQUFsQUJCaDN4bFZpVmdXcHVtRU9sOURzUHdWRVAweDZnZHNlRzZPWUkrWWY3dnpoS2JIbGJtaURsdHlHU1lQ
`

const HOME_HTML = `
<div id="slider-lancamentos" class="homeSlider-container swiper">
  <div class="swiper-wrapper"><div class="swiper-slide">
    <a href="/anime/a-returner-s-magic-should-be-special" class="homeSlider-item">
      <div class="poster-holder"><img src="https://anidb.00000120.xyz/content/animes/posters/180/4419.webp" alt="A Returner’s Magic Should Be Special"></div>
      <div class="info"><div class="title">A Returner’s Magic Should Be Special</div></div>
    </a>
  </div></div>
</div>
<div id="slider-novos" class="homeSlider-container swiper">
  <div class="swiper-wrapper"><div class="swiper-slide">
    <a href="/anime/x-men-97" class="homeSlider-item">
      <div class="poster-holder"><img src="https://anidb.00000120.xyz/content/animes/posters/180/4434.webp" alt="X-Men 97"></div>
      <div class="info"><div class="title">X-Men &#039;97</div></div>
    </a>
  </div></div>
</div>
<div id="slider-completos" class="homeSlider-container swiper">
  <div class="swiper-wrapper"><div class="swiper-slide">
    <a href="/anime/my-hero-academia" class="homeSlider-item">
      <div class="poster-holder"><img src="https://anidb.00000120.xyz/content/animes/posters/180/4429.webp" alt="My Hero Academia"></div>
      <div class="info"><div class="title">My Hero Academia</div></div>
    </a>
  </div></div>
</div>`

function fixtureFetch(routes: Record<string, string>): FetchFn {
  return async (url): Promise<FetchResult> => {
    const key = Object.keys(routes).find((k) => url.includes(k))
    if (!key) return { status: 404, headers: {}, body: 'not found' }
    return { status: 200, headers: { 'content-type': 'application/json' }, body: routes[key]! }
  }
}

/** Wrap a FetchFn, recording every URL seen (for asserting constructed request URLs). */
function recordingFetch(inner: FetchFn): { fetch: FetchFn; urls: string[] } {
  const urls: string[] = []
  const fetch: FetchFn = async (url, init) => {
    urls.push(url)
    return inner(url, init)
  }
  return { fetch, urls }
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

describe('subanimes source', () => {
  it('searches via the JSON API and maps name/poster/url', async () => {
    const rec = recordingFetch(fixtureFetch({ '/api/search': SEARCH_JSON }))
    const res = await subanimes.search({ ...ctx, fetch: rec.fetch }, 'naruto', 1)
    expect(rec.urls).toEqual(['https://subanimes.org/api/search?query=naruto'])
    expect(res.hasNextPage).toBe(false)
    expect(res.items.map((m) => m.mediaId)).toEqual(['naruto', 'naruto-shippuden'])
    expect(res.items[0]).toMatchObject({
      id: 'subanimes/naruto',
      title: 'Naruto',
      type: 'anime',
      sourceId: 'subanimes',
      coverUrl: 'https://anidb.00000120.xyz/content/animes/posters/180/2462.webp'
    })
  })

  it('urlencodes search terms and returns empty results for queries under 3 chars without fetching', async () => {
    const rec = recordingFetch(fixtureFetch({ '/api/search': SEARCH_JSON }))
    const short = await subanimes.search({ ...ctx, fetch: rec.fetch }, '  na  ', 1)
    expect(short.items).toEqual([])
    expect(rec.urls).toEqual([])
    await subanimes.search({ ...ctx, fetch: rec.fetch }, 'one piece', 1)
    expect(rec.urls).toEqual(['https://subanimes.org/api/search?query=one%20piece'])
  })

  it('parses media details: title, cover, status-completed, synopsis and genres', async () => {
    const m = await subanimes.getMedia({ ...ctx, fetch: fixtureFetch({ '/anime/naruto': DETAIL_HTML }) }, 'naruto')
    expect(m.title).toBe('Naruto')
    expect(m.type).toBe('anime')
    expect(m.coverUrl).toBe('https://anidb.00000120.xyz/content/animes/posters/180/2462.webp')
    expect(m.status).toBe('completed')
    expect(m.synopsis).toContain('Kyuubi')
    expect(m.tags).toEqual(['Action & Adventure', 'Animação', 'Sci-Fi & Fantasy'])
  })

  it('maps the status-airing class to ongoing', async () => {
    const m = await subanimes.getMedia({ ...ctx, fetch: fixtureFetch({ '/anime/one-piece': DETAIL_AIRING_HTML }) }, 'one-piece')
    expect(m.status).toBe('ongoing')
    expect(m.title).toBe('One Piece')
  })

  it('parses episodes with numbers, seasons and stable ids, dropping default titles', async () => {
    const eps = await subanimes.getEpisodes({ ...ctx, fetch: fixtureFetch({ '/anime/jujutsu-kaisen/data': EPISODES_JSON }) }, 'jujutsu-kaisen')
    expect(eps).toHaveLength(3)
    expect(eps[0]).toMatchObject({ number: 1, season: 1, mediaId: 'jujutsu-kaisen', lang: 'pt-br' })
    expect(eps[0]?.id).toBe('subanimes/jujutsu-kaisen/1x1')
    expect(eps[0]?.title).toBeUndefined() // "Episódio 1" is not repeated as a title
    expect(eps[2]).toMatchObject({ number: 23, season: 2, title: 'A origem da obediência' })
    expect(eps[2]?.id).toBe('subanimes/jujutsu-kaisen/2x23')
  })

  it('resolves one hls stream per audio variant with /m3/ urls and quality labels', async () => {
    const media = {
      id: 'subanimes/naruto',
      mediaId: 'naruto',
      sourceId: 'subanimes',
      title: 'Naruto',
      type: 'anime' as const
    }
    const episode = { id: 'subanimes/naruto/1x1', mediaId: 'naruto', number: 1, season: 1, lang: 'pt-br' }
    const rec = recordingFetch(
      fixtureFetch({
        '/ep/naruto-1-episodio-1': EPISODE_PAGE_HTML,
        '/hls/0055c3d5d8b6eff2a2334944dff14405/master.txt': MASTER_DUB,
        '/hls/26e5f52fb8c6201ef7f2850042b6b72e/master.txt': MASTER_LEG
      })
    )
    const streams = await subanimes.getStreams!({ ...ctx, fetch: rec.fetch }, media, episode)
    // the episode page URL is derived from the anime slug + season + number
    expect(rec.urls[0]).toBe('https://subanimes.org/ep/naruto-1-episodio-1')
    expect(streams).toHaveLength(2) // the iframe duplicate must not add a third
    expect(streams[0]).toMatchObject({ kind: 'hls', quality: '720p • Dublado' })
    expect(streams[0]?.url).toMatch(/^https:\/\/00000410\.xyz\/m3\//)
    // manifest is served without ACAO; the app's network loader sends the declared
    // Referer so it can fetch the CORS-blocked /m3/ playlist natively
    expect(streams[0]?.headers).toEqual({ Referer: 'https://subanimes.org/' })
    expect(streams[1]).toMatchObject({ kind: 'hls', quality: '480p • Legendado' })
    expect(streams[1]?.url).toMatch(/^https:\/\/00000410\.xyz\/m3\//)
    expect(streams[0]?.url).not.toBe(streams[1]?.url)
  })

  it('skips a variant whose master playlist fails to resolve but keeps the others', async () => {
    const media = { id: 'subanimes/naruto', mediaId: 'naruto', sourceId: 'subanimes', title: 'Naruto', type: 'anime' as const }
    const episode = { id: 'subanimes/naruto/1x1', mediaId: 'naruto', number: 1, season: 1 }
    const streams = await subanimes.getStreams!(
      {
        ...ctx,
        fetch: fixtureFetch({
          '/ep/naruto-1-episodio-1': EPISODE_PAGE_HTML,
          // dub master.txt missing -> 404; only the legendado variant survives
          '/hls/26e5f52fb8c6201ef7f2850042b6b72e/master.txt': MASTER_LEG
        })
      },
      media,
      episode
    )
    expect(streams).toHaveLength(1)
    expect(streams[0]?.quality).toBe('480p • Legendado')
  })

  it('exposes homepage sections backed by the four sliders', async () => {
    const sections = await subanimes.getHomeSections!({ ...ctx, fetch: fixtureFetch({}) })
    expect(sections).toEqual([
      { id: 'lanca-hoje', title: 'Lança Hoje!' },
      { id: 'novos', title: 'Novos Animes' },
      { id: 'completos', title: 'Completos' },
      { id: 'populares', title: 'Populares' }
    ])
    const fetch = fixtureFetch({ 'subanimes.org/': HOME_HTML })
    const lancamento = await subanimes.getHomeSection!({ ...ctx, fetch }, 'lanca-hoje', 1)
    expect(lancamento.hasNextPage).toBe(false)
    expect(lancamento.items.map((m) => m.mediaId)).toEqual(['a-returner-s-magic-should-be-special'])
    expect(lancamento.items[0]?.title).toBe('A Returner’s Magic Should Be Special')
    expect(lancamento.items[0]?.coverUrl).toContain('4419.webp')
    const novos = await subanimes.getHomeSection!({ ...ctx, fetch }, 'novos', 1)
    expect(novos.items.map((m) => m.mediaId)).toEqual(['x-men-97'])
    expect(novos.items[0]?.title).toBe("X-Men '97")
    const completos = await subanimes.getHomeSection!({ ...ctx, fetch }, 'completos', 1)
    expect(completos.items.map((m) => m.mediaId)).toEqual(['my-hero-academia'])
    // sliders have no pagination
    const page2 = await subanimes.getHomeSection!({ ...ctx, fetch }, 'novos', 2)
    expect(page2).toMatchObject({ page: 2, hasNextPage: false, items: [] })
  })

  it('does not implement chapter content (video-only source)', async () => {
    await expect(subanimes.getChapterContent({ ...ctx, fetch: fixtureFetch({}) }, 'naruto', '1x1')).rejects.toThrow(
      'subanimes provides video streams, not chapter content'
    )
  })
})
