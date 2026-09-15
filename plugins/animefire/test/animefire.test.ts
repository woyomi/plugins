import { describe, expect, it } from 'vitest'
import { makeAnimefireSource } from '../src/animefire.js'
import type { FetchFn, FetchResult } from '@woyomi/core'

const animefire = makeAnimefireSource()

// Representative shapes modeled on https://api.animefire.io responses (2026-09);
// trimmed to the relevant parts (quality lists vary per episode).
const SEARCH_JSON = JSON.stringify({
  data: [
    {
      id: 'eU7t5IvcNKU',
      title: 'Naruto',
      audio: 'Dublado & Legendado',
      poster_src: 'https://image.tmdb.org/t/p/original/aWR1IFE7zpUF0ANqvBPMomyRVgZ.jpg',
      status: 'completed'
    },
    {
      id: 'V2Q_qcvaKhb',
      title: 'Naruto Shippuden',
      audio: 'Dublado & Legendado',
      poster_src: 'https://image.tmdb.org/t/p/original/nRJmByfK9XdtOY73VArcN8KpKVs.jpg',
      status: 'completed'
    }
  ],
  meta: { current_page: 1, last_page: 3, total: 67, per_page: 30 }
})

const SEARCH_LAST_PAGE_JSON = JSON.stringify({
  data: [
    {
      id: 'aaR8yQjuBBQ',
      title: 'Boruto: Naruto O Filme',
      audio: 'Dublado & Legendado',
      poster_src: 'https://image.tmdb.org/t/p/original/1k6iwC4KaPvTBt1JuaqXy3noZRY.jpg',
      status: 'completed'
    }
  ],
  meta: { current_page: 3, last_page: 3, total: 67, per_page: 30 }
})

const MEDIA_JSON = JSON.stringify({
  data: {
    format: 'tv',
    hero: {
      id: 'eU7t5IvcNKU',
      titles: { BR: 'Naruto', JP: 'Naruto' },
      synopsis: 'Momentos antes do nascimento de Naruto Uzumaki...',
      poster_src: 'https://image.tmdb.org/t/p/original/aWR1IFE7zpUF0ANqvBPMomyRVgZ.jpg',
      status: 'completed',
      audio: 'Dublado & Legendado',
      genres: ['Ação', 'Aventura']
    },
    seasons: [{ title: null, number: 1, first_episode_number: 1 }],
    episodes: [
      {
        id: 'WCrJufyJmQn',
        title: 'Naruto Uzumaki Chegando!',
        audio: 'Dublado & Legendado',
        season: 1,
        number: 1,
        still_src: 'https://image.tmdb.org/t/p/original/8sJecAyt0dMR6a2Ay5IyviJ1nvi.jpg'
      },
      {
        id: '5y0jBDHTS7V',
        title: 'Meu Nome é Konohamaru!',
        audio: 'Dublado & Legendado',
        season: 1,
        number: 2,
        still_src: 'https://image.tmdb.org/t/p/original/yhV06qj1fxwMQetUz7TeUCxHz8Q.jpg'
      }
    ]
  }
})

const AIRING_MEDIA_JSON = JSON.stringify({
  data: {
    format: 'tv',
    hero: {
      id: 'mwO4XgC4IGb',
      titles: {
        BR: "The Oblivious Saint Can't Contain Her Power",
        JP: 'Mujikaku Seijo wa Kyou mo Muishiki ni Chikara wo Tare Nagasu'
      },
      synopsis: 'Lady Carolina...',
      poster_src: 'https://image.tmdb.org/t/p/original/xrgC96oAFYSSjCysOg8oCAVzVSg.jpg',
      status: 'airing',
      audio: 'Legendado',
      genres: ['Drama', 'Fantasia']
    },
    seasons: [{ title: null, number: 1, first_episode_number: 1 }],
    episodes: []
  }
})

const EPISODE_JSON = JSON.stringify({
  data: {
    id: 'WCrJufyJmQn',
    anime: { id: 'eU7t5IvcNKU', title: 'Naruto' },
    title: 'Naruto Uzumaki Chegando!',
    audio: 'Dublado & Legendado',
    season: 1,
    number: 1,
    streams: [
      {
        audio: 'dublado',
        url: 'https://akumast.net/i/mqkkYJoeiFt51sJd_EHf7WKer_cMMgvzRNKbIyr1hxdQSNMgqB5i0jmpqSw94JvgiD7-G_7cxCk/m.jpg',
        qualities: ['480p']
      },
      {
        audio: 'legendado',
        url: 'https://akumast.net/i/_SRtYx4WTF_gG-FD7ViW8EIoS1Y8IiqqQpJUvT46e5ixgA6PFTXHM040D3y4zJGB/m.jpg',
        qualities: ['480p', '720p', '1080p']
      }
    ]
  }
})

const HOME_JSON = JSON.stringify({
  data: {
    carousels: [
      {
        key: 'new-episodes',
        title: 'Novos episódios',
        sub: 'Direto do forno',
        items: [
          {
            id: 'mbXq3Z3H_1B',
            title: 'Red River',
            audio: 'Legendado',
            season: 1,
            number: 10,
            poster_src: 'https://image.tmdb.org/t/p/original/oD8VpMBVPorNso6y4TEKZBnfn92.jpg'
          }
        ]
      },
      {
        key: 'most-liked',
        title: 'Mais curtidos',
        sub: 'Tem feito sucesso',
        items: [
          {
            id: 'ov64ogULzyS',
            title: 'Mushoku Tensei: Jobless Reincarnation',
            audio: 'Dublado & Legendado',
            poster_src: 'https://image.tmdb.org/t/p/original/gLKOYIMyKlUHW0SVdskhgf9C0yy.jpg',
            status: 'airing'
          }
        ]
      },
      {
        key: 'new-animes',
        title: 'Novidades',
        sub: 'Só coisa nova',
        items: [
          {
            id: 'rhCrJm9M5FH',
            title: 'Tefuda ga Oome no Victoria',
            audio: 'Legendado',
            poster_src: 'https://image.tmdb.org/t/p/original/tefuda.webp',
            status: 'airing'
          }
        ]
      }
    ],
    hero: { items: [] }
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

describe('animefire source', () => {
  it('searches via /animes/pesquisar with q + page and maps opaque ids', async () => {
    let called = ''
    const fetch: FetchFn = async (url) => {
      called = url
      return { status: 200, headers: { 'content-type': 'application/json' }, body: SEARCH_JSON }
    }
    const res = await animefire.search({ ...ctx, fetch }, 'naruto', 1)
    expect(called).toBe('https://api.animefire.io/animes/pesquisar?q=naruto&page=1')
    expect(res.items.map((m) => m.mediaId)).toEqual(['eU7t5IvcNKU', 'V2Q_qcvaKhb'])
    expect(res.items[0]).toMatchObject({
      id: 'animefire/eU7t5IvcNKU',
      title: 'Naruto',
      type: 'anime',
      sourceId: 'animefire'
    })
    expect(res.items[0]?.coverUrl).toContain('aWR1IFE7zpUF0ANqvBPMomyRVgZ.jpg')
    expect(res.hasNextPage).toBe(true)
  })

  it('urlencodes search terms and reports hasNextPage from meta', async () => {
    let called = ''
    const fetch: FetchFn = async (url) => {
      called = url
      return { status: 200, headers: { 'content-type': 'application/json' }, body: SEARCH_JSON }
    }
    await animefire.search({ ...ctx, fetch }, 'one piece', 2)
    expect(called).toBe('https://api.animefire.io/animes/pesquisar?q=one%20piece&page=2')
    const last = await animefire.search(
      { ...ctx, fetch: fixtureFetch({ '/animes/pesquisar': SEARCH_LAST_PAGE_JSON }) },
      'naruto',
      3
    )
    expect(last.hasNextPage).toBe(false)
    expect(last.items[0]?.mediaId).toBe('aaR8yQjuBBQ')
  })

  it('returns no results without fetching for blank queries', async () => {
    let called = 0
    const fetch: FetchFn = async () => {
      called++
      return { status: 200, headers: {}, body: '{}' }
    }
    const res = await animefire.search({ ...ctx, fetch }, '   ', 1)
    expect(res).toEqual({ page: 1, hasNextPage: false, items: [] })
    expect(called).toBe(0)
  })

  it('parses media details, status, and genres from /anime', async () => {
    const m = await animefire.getMedia(
      { ...ctx, fetch: fixtureFetch({ '/anime/eU7t5IvcNKU': MEDIA_JSON }) },
      'eU7t5IvcNKU'
    )
    expect(m.title).toBe('Naruto')
    expect(m.type).toBe('anime')
    expect(m.status).toBe('completed')
    expect(m.synopsis).toContain('Momentos antes')
    expect(m.tags).toEqual(['Ação', 'Aventura'])
    expect(m.coverUrl).toContain('aWR1IFE7zpUF0ANqvBPMomyRVgZ.jpg')
  })

  it('maps airing status to ongoing and keeps the BR title', async () => {
    const m = await animefire.getMedia(
      { ...ctx, fetch: fixtureFetch({ '/anime/mwO4XgC4IGb': AIRING_MEDIA_JSON }) },
      'mwO4XgC4IGb'
    )
    expect(m.title).toBe("The Oblivious Saint Can't Contain Her Power")
    expect(m.status).toBe('ongoing')
  })

  it('fetches media detail from the JSON API', async () => {
    let called = ''
    const fetch: FetchFn = async (url) => {
      called = url
      return { status: 200, headers: { 'content-type': 'application/json' }, body: MEDIA_JSON }
    }
    await animefire.getMedia({ ...ctx, fetch }, 'eU7t5IvcNKU')
    expect(called).toBe('https://api.animefire.io/anime/eU7t5IvcNKU')
  })

  it('parses the episode list with opaque ids', async () => {
    const eps = await animefire.getEpisodes(
      { ...ctx, fetch: fixtureFetch({ '/anime/eU7t5IvcNKU': MEDIA_JSON }) },
      'eU7t5IvcNKU'
    )
    expect(eps).toHaveLength(2)
    expect(eps[0]).toMatchObject({ number: 1, season: 1, mediaId: 'eU7t5IvcNKU', lang: 'pt-br' })
    expect(eps[0]?.id).toBe('animefire/eU7t5IvcNKU/WCrJufyJmQn')
    expect(eps[0]?.title).toBe('Naruto Uzumaki Chegando!')
    expect(eps[0]?.imageUrl).toContain('8sJecAyt0dMR6a2Ay5IyviJ1nvi.jpg')
  })

  it('resolves episode streams with structured audio, highest quality first, with referer headers', async () => {
    const media = {
      id: 'animefire/eU7t5IvcNKU',
      mediaId: 'eU7t5IvcNKU',
      sourceId: 'animefire',
      title: 'Naruto',
      type: 'anime' as const
    }
    const episode = { id: 'animefire/eU7t5IvcNKU/WCrJufyJmQn', mediaId: 'eU7t5IvcNKU', number: 1, season: 1 }
    let called = ''
    const fetch: FetchFn = async (url) => {
      called = url
      return { status: 200, headers: { 'content-type': 'application/json' }, body: EPISODE_JSON }
    }
    const streams = await animefire.getStreams!({ ...ctx, fetch }, media, episode)
    expect(called).toBe('https://api.animefire.io/episode/WCrJufyJmQn')
    expect(streams).toHaveLength(2)
    expect(streams[0]?.quality).toBe('1080p')
    expect(streams[0]?.audio).toBe('Legendado')
    expect(streams[0]?.kind).toBe('hls')
    expect(streams[0]?.url).toContain('akumast.net')
    expect(streams[0]?.headers).toEqual({ Referer: 'https://animefire.io/' })
    expect(streams[1]?.quality).toBe('480p')
    expect(streams[1]?.audio).toBe('Dublado')
  })

  it('throws when an episode has no playable streams', async () => {
    const media = {
      id: 'animefire/eU7t5IvcNKU',
      mediaId: 'eU7t5IvcNKU',
      sourceId: 'animefire',
      title: 'Naruto',
      type: 'anime' as const
    }
    const episode = { id: 'animefire/eU7t5IvcNKU/missing', mediaId: 'eU7t5IvcNKU', number: 1 }
    await expect(
      animefire.getStreams!(
        { ...ctx, fetch: fixtureFetch({ '/episode/': JSON.stringify({ data: { id: 'missing', streams: [] } }) }) },
        media,
        episode
      )
    ).rejects.toThrow('no playable streams')
  })

  it('exposes home sections from /home, skipping the episode-only carousel', async () => {
    const sections = await animefire.getHomeSections!({ ...ctx, fetch: fixtureFetch({ '/home': HOME_JSON }) })
    expect(sections).toEqual([
      { id: 'most-liked', title: 'Mais curtidos' },
      { id: 'new-animes', title: 'Novidades' }
    ])
    const fetch = fixtureFetch({ '/home': HOME_JSON })
    const liked = await animefire.getHomeSection!({ ...ctx, fetch }, 'most-liked', 1)
    expect(liked.items.map((m) => m.mediaId)).toEqual(['ov64ogULzyS'])
    expect(liked.items[0]?.title).toBe('Mushoku Tensei: Jobless Reincarnation')
    expect(liked.items[0]?.coverUrl).toContain('gLKOYIMyKlUHW0SVdskhgf9C0yy.jpg')
    expect(liked.hasNextPage).toBe(false)
    const fresh = await animefire.getHomeSection!({ ...ctx, fetch }, 'new-animes', 1)
    expect(fresh.items.map((m) => m.mediaId)).toEqual(['rhCrJm9M5FH'])
    await expect(animefire.getHomeSection!({ ...ctx, fetch }, 'unknown', 1)).rejects.toThrow(
      'unknown homepage section'
    )
    const page2 = await animefire.getHomeSection!({ ...ctx, fetch }, 'most-liked', 2)
    expect(page2).toEqual({ page: 2, hasNextPage: false, items: [] })
  })
})
