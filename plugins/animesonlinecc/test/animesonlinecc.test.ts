import { describe, expect, it } from 'vitest'
import { DOMParser } from 'linkedom'
import { makeAnimesonlineccSource } from '../src/animesonlinecc.js'
import type { FetchFn, FetchResult } from '@woyomi/core'

;(globalThis as Record<string, unknown>).DOMParser = DOMParser

const animesonlinecc = makeAnimesonlineccSource()

// --- fixtures trimmed from live pages (animesonlinecc.to, Dooplay theme) ---

const SEARCH_HTML = `
<div id="archive-content" class="animation-2 items2"><article class="item se tvshows" id="post-38625"><div class="poster"> <a href="https://animesonlinecc.to/anime/naruto-shippuden/"><img src="https://animesonlinecc.to/wp-content/uploads/2019/09/ic9Gb4Zz09ns3JPYHdax8u5kt0n-185x278.jpg" alt="Naruto Shippuden"></a><div class="rating"><span class="icon-star2"></span> 8.1</div></div><div class="data"><h3> <a href="https://animesonlinecc.to/anime/naruto-shippuden/">Naruto Shippuden</a></h3></div></article></div>
<div id="archive-content" class="animation-2 items2"><article class="item se tvshows" id="post-14317"><div class="poster"> <a href="https://animesonlinecc.to/anime/naruto/"><img src="https://animesonlinecc.to/wp-content/uploads/2019/06/lTVhwFcSHqN0Xv8HLxDHILtrwfX-185x278.jpg" alt="Naruto Clássico Dublado"></a><div class="rating"><span class="icon-star2"></span> 7.7</div></div><div class="data"><h3> <a href="https://animesonlinecc.to/anime/naruto/">Naruto Clássico Dublado</a></h3></div></article></div>`

const MEDIA_HTML = `
<div id="single" class="dtsingle"><div class="content"><div class="sheader">
<div class="poster"> <img src="https://animesonlinecc.to/wp-content/uploads/2019/09/ic9Gb4Zz09ns3JPYHdax8u5kt0n-185x278.jpg" alt="Naruto Shippuden"></div>
<div class="data"><h1>Naruto Shippuden Todos os Episodios Online</h1>
<div class="extra"> <span class="date">2007</span></div>
<div class="sgeneros"> <a href="https://animesonlinecc.to/genero/acao/" rel="tag">Ação</a><a href="https://animesonlinecc.to/genero/dublado/" rel="tag">Dublado</a><a href="https://animesonlinecc.to/genero/letra-n/" rel="tag">Letra N</a></div></div></div>
<div class="resumotemp"><div class="wp-content"><p>Naruto Shippuden Todos os Episodios Online, Assistir Naruto Shippuden Anime Completo, Assistir Naruto Shippuden Dublado Online.<br/> Naruto Shippuuden ocorre 2 anos e meio após Naruto ter ficado para treinar com Jiraiya. Após seu retorno, Naruto descobre que seus amigos shinobi&#8217;s o superaram na classificação.</p></div></div>`

const EPISODES_HTML = `
<div class="tempep"><h2>Temporadas e Episodios</h2><div id="serie_contenido"><div id="seasons"><div class="se-c">
<div class="se-q"> <span class="se-t se-o">1</span> <span class="title">Temporada  1 </span></div>
<div class="se-a" style='display:block'><ul class="episodios">
<li><div class="imagen"><a href="https://animesonlinecc.to/episodio/naruto-shippuden-episodio-1/"><img src="https://animesonlinecc.to/wp-content/uploads/2019/09/lFg0YnHI7sJkPSv38a8ctE96sqr-300x170.jpg"></a></div><div class="numerando">Ep - 1</div><div class="episodiotitle"> <a href="https://animesonlinecc.to/episodio/naruto-shippuden-episodio-1/">Episodio 1</a> <span class="date">Feb. 15, 2007</span></div></li>
<li><div class="imagen"><a href="https://animesonlinecc.to/episodio/naruto-shippuden-episodio-2/"><img src="https://animesonlinecc.to/wp-content/uploads/2019/09/zbvJ4ts4JJmqP6koMNlLzBX6qiJ-300x170.jpg"></a></div><div class="numerando">Ep - 2</div><div class="episodiotitle"> <a href="https://animesonlinecc.to/episodio/naruto-shippuden-episodio-2/">Episodio 2</a> <span class="date">Feb. 15, 2007</span></div></li>
</ul></div></div></div></div></div>`

const EPISODE_PAGE_HTML = `
<div id="playex" class="player_sist"><div class="playex">
<div id="option-1" class="play-box-iframe fixidtab"> <iframe class="metaframe rptss" allow="autoplay" src="https://www.blogger.com/video.g?token=TOKENDOBLADO" frameborder="0" allowfullscreen></iframe></div>
<div id="option-2" class="play-box-iframe fixidtab"> <iframe class="metaframe rptss" allow="autoplay" src="https://www.blogger.com/video.g?token=TOKENLEGENDADO" frameborder="0" allowfullscreen></iframe></div>
</div></div>
<nav class="player"><ul class="options"><li><ul class="idTabs sourceslist scrolling">
<li><a class="options" href="#option-1"> <b class="icon-play_arrow"> </b> Dublado </a></li>
<li><a class="options" href="#option-2"> <b class="icon-play_arrow"> </b> Legendado </a></li>
</ul></li></ul></nav>`

const HOME_HTML = `
<div id="seaload" class="load_modules">Loading..</div><div id="dt-seasons" class="animation-2 items"><div id="archive-content" class="animation-2 items2"><article class="item se tvshows" id="post-2489"><div class="poster"> <a href="anime/darling-in-the-franxx/"><img src="wp-content/uploads/2019/07/oO5tirWYxuCw9stgxKmTqBqBFoe-185x278.jpg" alt="Darling in the Franxx"></a></div><div class="data"><h3> <a href="anime/darling-in-the-franxx/">Darling in the Franxx</a></h3></div></article></div></div>
<header><h2>Últimos Episódios</h2> <span><a href="https://animesonlinecc.to/episodio/" class="see-all">Ver Mais</a></span></header><div id="epiload" class="load_modules">Loading..</div><div id="blog" class="items"><article class="item se episodes"><div class="poster"> <a href="https://animesonlinecc.to/episodio/black-torch-episodio-7/"><img src="https://animesonlinecc.to/wp-content/uploads/2026/08/v5iYrBms75S6oYdKfPUTOoyArx7-300x170.jpg" alt="Black Torch Episodio 7"></a> <span class="quality">Legendado</span></div><div class="eptitle"><h3> <a href="https://animesonlinecc.to/episodio/black-torch-episodio-7/">Black Torch Episodio 7</a></h3></div></article></div>
<header><h2>Animes Recentes</h2> <span><a href="https://animesonlinecc.to/anime/" class="see-all">Ver Mais</a></span></header><div id="tvload" class="load_modules">Loading..</div><div id="dt-tvshows" class="items"><article id="post-95975" class="item tvshows"><div class="poster"> <a href="https://animesonlinecc.to/anime/ibitte-konai-gibo-to-gishi/"><img src="https://animesonlinecc.to/wp-content/uploads/2026/07/iwdGrS0q99q3jkrJr8HVLtLcmpG-185x278.jpg" alt="Ibitte Konai Gibo to Gishi"></a></div><div class="data"><h3> <a href="https://animesonlinecc.to/anime/ibitte-konai-gibo-to-gishi/">Ibitte Konai Gibo to Gishi</a></h3></div></article></div>`

const ANIMES_ARCHIVE_HTML = `
<div id="archive-content" class="animation-2 items"><article class="item se tvshows" id="post-96427"><div class="poster"> <a href="https://animesonlinecc.to/anime/seihantai-na-kimi-to-boku-2/"><img src="https://animesonlinecc.to/wp-content/uploads/2026/08/6a47U294gkx6u1nHnOOLjrNBFBU-185x278.jpg" alt="Seihantai na Kimi to Boku 2"></a> <span class="quality">HD</span></div><div class="data"><h3> <a href="https://animesonlinecc.to/anime/seihantai-na-kimi-to-boku-2/">Seihantai na Kimi to Boku 2</a></h3></div></article></div>
<div class="pagination"><span>Pagina 1 de 1950</span><span class="current">1</span><a href='https://animesonlinecc.to/anime/page/2/' class="inactive">2</a><a class='arrow_pag' href="https://animesonlinecc.to/anime/page/2/"><i class='icon-caret-right'></i></a></div>`

/**
 * Builds a realistic batchexecute reply for one player token: XSSI prefix, chunked
 * `<size>\n<json>` frames, the WcwnYd payload double-encoded as a JSON string, plus a
 * trailing noise frame to prove the frame scanner skips unrelated chunks.
 */
function rpcResponse(streams: Array<[string, number]>): string {
  const payload = JSON.stringify([
    1,
    null,
    streams.map(([url, itag]) => [url, [itag]]),
    ['https://i9.ytimg.com/vi_blogger/thumb.jpg', 'BLOGGER-video-d3e5fadd70c9b186-9802', 'd3e5fadd70c9b186', false]
  ])
  const frame = JSON.stringify([['wrb.fr', 'WcwnYd', payload]])
  const noise = JSON.stringify([['wrb.fr', 'OtherRpc', '[null]']])
  return [")]}'\n", `${frame.length}\n${frame}`, `${noise.length}\n${noise}`, ''].join('\n')
}

const RPC_BY_TOKEN: Record<string, string> = {
  TOKENDOBLADO: rpcResponse([
    ['https://rr1---sn-gxqxuxaxn0a-hb4e.googlevideo.com/videoplayback?itag=13&mime=video/3gpp&clen=11001936', 13],
    ['https://rr1---sn-gxqxuxaxn0a-hb4e.googlevideo.com/videoplayback?itag=18&mime=video/mp4&clen=244000000', 18]
  ]),
  TOKENLEGENDADO: rpcResponse([
    ['https://rr2---sn-gxqxuxaxn0a-hb4l.googlevideo.com/videoplayback?itag=18&mime=video/mp4&clen=250000000', 18],
    ['https://rr2---sn-gxqxuxaxn0a-hb4l.googlevideo.com/videoplayback?itag=22&mime=video/mp4&clen=520000000', 22]
  ])
}

function fixtureFetch(routes: Record<string, string>): FetchFn {
  return async (url): Promise<FetchResult> => {
    const key = Object.keys(routes).find((k) => url.includes(k))
    if (!key) return { status: 404, headers: {}, body: 'not found' }
    return { status: 200, headers: { 'content-type': 'text/html' }, body: routes[key]! }
  }
}

/** Fetch stub that also captures the batchexecute POST bodies and answers per token. */
function rpcCaptureFetch(rpcBodies: string[]): FetchFn {
  return async (url, init): Promise<FetchResult> => {
    if (url.includes('batchexecute')) {
      const body = init?.body ?? ''
      rpcBodies.push(body)
      const token = Object.keys(RPC_BY_TOKEN).find((t) => body.includes(t))
      if (!token) return { status: 200, headers: {}, body: rpcResponse([]) }
      return { status: 200, headers: {}, body: RPC_BY_TOKEN[token]! }
    }
    if (url.includes('/episodio/naruto-shippuden-episodio-1')) {
      return { status: 200, headers: {}, body: EPISODE_PAGE_HTML }
    }
    return { status: 404, headers: {}, body: 'not found' }
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

describe('animesonlinecc source', () => {
  it('encodes the query into the /search/ route', async () => {
    let called = ''
    const fetch: FetchFn = async (url) => {
      called = url
      return { status: 200, headers: { 'content-type': 'text/html' }, body: SEARCH_HTML }
    }
    await animesonlinecc.search({ ...ctx, fetch }, '  naruto shippuden  ', 1)
    expect(called).toBe('https://animesonlinecc.to/search/naruto%20shippuden')
  })

  it('parses search cards with covers from img src', async () => {
    const res = await animesonlinecc.search({ ...ctx, fetch: fixtureFetch({ '/search/': SEARCH_HTML }) }, 'naruto', 1)
    expect(res.items.map((m) => m.mediaId)).toEqual(['naruto-shippuden', 'naruto'])
    expect(res.items[0]?.title).toBe('Naruto Shippuden')
    expect(res.items[1]?.title).toBe('Naruto Clássico Dublado')
    expect(res.items[0]?.type).toBe('anime')
    expect(res.items[0]?.coverUrl).toContain('ic9Gb4Zz09ns3JPYHdax8u5kt0n')
    expect(res.hasNextPage).toBe(false)
  })

  it('parses media details, stripping the SEO title suffix and pre-<br> synopsis junk', async () => {
    const m = await animesonlinecc.getMedia(
      { ...ctx, fetch: fixtureFetch({ '/anime/naruto-shippuden/': MEDIA_HTML }) },
      'naruto-shippuden'
    )
    expect(m.title).toBe('Naruto Shippuden')
    expect(m.type).toBe('anime')
    expect(m.coverUrl).toContain('ic9Gb4Zz09ns3JPYHdax8u5kt0n-185x278.jpg')
    expect(m.synopsis).toMatch(/^Naruto Shippuuden ocorre/)
    expect(m.synopsis).not.toContain('Assistir')
    expect(m.tags).toEqual(['Ação', 'Dublado'])
  })

  it('fetches detail and episode pages with the trailing slash the site requires', async () => {
    const called: string[] = []
    const fetch: FetchFn = async (url) => {
      called.push(url)
      return { status: 200, headers: { 'content-type': 'text/html' }, body: MEDIA_HTML }
    }
    await animesonlinecc.getMedia({ ...ctx, fetch }, 'naruto-shippuden')
    await animesonlinecc.getEpisodes({ ...ctx, fetch }, 'naruto-shippuden')
    expect(called).toEqual(['https://animesonlinecc.to/anime/naruto-shippuden/', 'https://animesonlinecc.to/anime/naruto-shippuden/'])
  })

  it('parses the episode list with numbers from numerando', async () => {
    const eps = await animesonlinecc.getEpisodes(
      { ...ctx, fetch: fixtureFetch({ '/anime/naruto-shippuden/': EPISODES_HTML }) },
      'naruto-shippuden'
    )
    expect(eps).toHaveLength(2)
    expect(eps[0]).toMatchObject({ number: 1, mediaId: 'naruto-shippuden', season: 1, lang: 'pt-br' })
    expect(eps[0]?.id).toBe('animesonlinecc/naruto-shippuden/1')
    expect(eps[1]?.number).toBe(2)
  })

  it('resolves blogger RPC streams for every server option, best quality first', async () => {
    const media = {
      id: 'animesonlinecc/naruto-shippuden',
      mediaId: 'naruto-shippuden',
      sourceId: 'animesonlinecc',
      title: 'Naruto Shippuden',
      type: 'anime' as const
    }
    const episode = { id: 'animesonlinecc/naruto-shippuden/1', mediaId: 'naruto-shippuden', number: 1 }
    const rpcBodies: string[] = []
    const streams = await animesonlinecc.getStreams!({ ...ctx, fetch: rpcCaptureFetch(rpcBodies) }, media, episode)
    // both player options were resolved through the batchexecute RPC
    expect(rpcBodies).toHaveLength(2)
    // the RPC frame must be wrapped in the extra envelope array ([[[...]]]);
    // two-level nesting is accepted by the endpoint but answered with `er`/400
    expect(rpcBodies[0]).toContain('f.req=%5B%5B%5B%22WcwnYd%22')
    expect(rpcBodies.some((b) => b.includes('TOKENDOBLADO'))).toBe(true)
    expect(rpcBodies.some((b) => b.includes('TOKENLEGENDADO'))).toBe(true)
    // 4 total streams (2 per server option); 720p (top tier) first, equal-tier ties
    // keep insertion (server) order, so assert on the leading stream + the full set
    const scores = streams.map((s) => Number(/(\d{3,4})p/.exec(s.quality ?? '')?.[1] ?? 0))
    expect(scores[0]).toBe(Math.max(...scores))
    expect(streams.map((s) => s.quality).sort()).toEqual(
      ['144p (Dublado)', '360p (Dublado)', '360p (Legendado)', '720p (Legendado)'].sort()
    )
    expect(streams[0]?.quality).toBe('720p (Legendado)')
    expect(streams[0]?.kind).toBe('mp4')
    expect(streams[0]?.url).toContain('itag=22')
    expect(streams[0]?.url).toContain('googlevideo.com/videoplayback')
  })

  it('throws a diagnostic error when the episode page has no players', async () => {
    const media = { id: 'animesonlinecc/x', mediaId: 'x', sourceId: 'animesonlinecc', title: 'X', type: 'anime' as const }
    const episode = { id: 'animesonlinecc/x/1', mediaId: 'x', number: 1 }
    const fetch: FetchFn = async () => ({ status: 200, headers: {}, body: '<div id="playex"></div>' })
    await expect(animesonlinecc.getStreams!({ ...ctx, fetch }, media, episode)).rejects.toThrow(/no playable streams/)
  })

  it('provides home sections scoped to the right carousels', async () => {
    const sections = await animesonlinecc.getHomeSections!({ ...ctx, fetch: fixtureFetch({}) })
    // homepage lists must map to anime/manga entries only (no episode links)
    expect(sections).toEqual([{ id: 'animes-recentes', title: 'Animes recentes' }])
    const fetch = fixtureFetch({ 'animesonlinecc.to/': HOME_HTML })
    const recentes = await animesonlinecc.getHomeSection!({ ...ctx, fetch }, 'animes-recentes', 1)
    // the "most viewed" carousel (#archive-content) must not leak into Animes Recentes
    expect(recentes.items.map((m) => m.mediaId)).toEqual(['ibitte-konai-gibo-to-gishi'])
    expect(recentes.items[0]?.title).toBe('Ibitte Konai Gibo to Gishi')
  })

  it('paginates home sections through the /anime/ archive', async () => {
    let called = ''
    const fetch: FetchFn = async (url) => {
      called = url
      return { status: 200, headers: { 'content-type': 'text/html' }, body: ANIMES_ARCHIVE_HTML }
    }
    const res = await animesonlinecc.getHomeSection!({ ...ctx, fetch }, 'animes-recentes', 2)
    expect(called).toBe('https://animesonlinecc.to/anime/page/2/')
    expect(res.page).toBe(2)
    expect(res.hasNextPage).toBe(true)
    expect(res.items[0]?.title).toBe('Seihantai na Kimi to Boku 2')
  })
})
