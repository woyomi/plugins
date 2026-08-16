import { describe, expect, it } from 'vitest'
import { DOMParser } from 'linkedom'
import { makeBetteranimeSource } from '../src/betteranime.js'
import type { FetchFn, FetchResult } from '@woyomi/core'

;(globalThis as Record<string, unknown>).DOMParser = DOMParser

const betteranime = makeBetteranimeSource()

// Real fragment of GET /?s=one+piece (three result cards).
const SEARCH_HTML = `
<div class="result-item"><article><div class="image"><div class="thumbnail animation-2"><a href="https://betteranime.io/animes/one-piece-dublado-online-hd/"><img src="https://betteranime.io/wp-content/uploads/2025/09/68d193b0deee6-150x150.webp" alt="One Piece Dublado" /><span class="tvshows">TV</span></a></div></div><div class="details"><div class="title"><a href="https://betteranime.io/animes/one-piece-dublado-online-hd/">One Piece Dublado</a></div><div class="meta"><span class="year">1999</span></div><div class="contenido"><p>Monkey D. Luffy tem o sonho de encontrar o famoso tesouro One Piece...</p></div></div></article></div>
<div class="result-item"><article><div class="image"><div class="thumbnail animation-2"><a href="https://betteranime.io/animes/one-piece/"><img src="https://betteranime.io/wp-content/uploads/2025/09/68d193b6749c9-150x150.webp" alt="One Piece" /><span class="tvshows">TV</span></a></div></div><div class="details"><div class="title"><a href="https://betteranime.io/animes/one-piece/">One Piece</a></div><div class="meta"><span class="year">1999</span></div><div class="contenido"><p>Monkey D. Luffy tem o sonho de encontrar o lendário tesouro One Piece...</p></div></div></article></div>
<div class="result-item"><article><div class="image"><div class="thumbnail animation-2"><a href="https://betteranime.io/animes/one-piece-gyojin-tou-hen/"><img src="https://betteranime.io/wp-content/uploads/2025/08/67a5a309ec975-150x150.webp" alt="One Piece: Gyojin Tou-hen" /><span class="tvshows">TV</span></a></div></div><div class="details"><div class="title"><a href="https://betteranime.io/animes/one-piece-gyojin-tou-hen/">One Piece: Gyojin Tou-hen</a></div><div class="meta"><span class="year">2024</span></div><div class="contenido"><p>Uma versão condensada e remasterizada da Saga da Ilha dos Homens-Peixe...</p></div></div></article></div>`

// Real fragment of GET /animes/naruto-shippuden/ (header, genres and info tab).
const MEDIA_HTML = `
<div class="sheader"> <div class="poster"> <img width="198" height="300" itemprop="image" src="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='http://example.invalid'%3E%3C/svg%3E" alt="Naruto Shippuden" data-lazy-src="https://betteranime.io/wp-content/uploads/2025/09/68c19edde8793-198x300.webp"><noscript><img width="198" height="300" itemprop="image" src="https://betteranime.io/wp-content/uploads/2025/09/68c19edde8793-198x300.webp" alt="Naruto Shippuden"></noscript> </div> <div class="data"> <h1>Naruto Shippuden</h1> <div class="meta-row"> <span class="row row-audio row-audio-legend"> <i class="fas fa-microphone"></i> <b>Legendado</b> </span> <span class="row row-quality">HD</span> </div> </div>
<div class="sgeneros"> <a href="https://betteranime.io/categorias/acao/" rel="tag">Ação</a><a href="https://betteranime.io/categorias/arte-marcial/" rel="tag">Arte Marcial</a><a href="https://betteranime.io/categorias/aventura/" rel="tag">Aventura</a><a href="https://betteranime.io/categorias/comedia/" rel="tag">Comédia</a><a href="https://betteranime.io/categorias/super-poder/" rel="tag">Super Poder</a> </div> </div>
<div id="info" class="sbox fixidtab"> <h2>Sinopse</h2> <div class="wp-content"> <p>Naruto retorna após treinamento com Jiraiya para encontrar seus amigos mais fortes.</p> </div> <div class="custom_fields"> <b class="variante">Título original</b> <span class="valor">Naruto Shippuden</span> </div> <div class="custom_fields"> <b class="variante">Temporadas</b> <span class="valor">1</span> </div> </div>`

// Real fragment of GET /animes/dandadan-dublado/: two seasons, each restarting at episode 1,
// with season-2 slugs that cannot be derived from the anime slug.
const EPISODES_HTML = `
<div id='episodes' class='sbox fixidtab'><div id='serie_contenido'><div id='seasons'><div class='se-c'><div class='se-q'><span class='se-t se-o'>1</span><span class='title'>Temporada 1 <i>Jan. 01, 2024</i></span></div><div class='se-a' style="display:block"><ul class='episodios'><li class='mark-1'><div class='imagen'><div class='contentImg' data-thumb='https://betteranime.io/wp-content/uploads/2025/08/687d56071f53c.webp' data-miniature-b64='L21pbmlhdHVyZXMvNjg3ZDU2MDVhYTliZS53ZWJw'><div class='coverImg'></div><img width="853" height="480" src="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='http://example.invalid'%3E%3C/svg%3E" data-lazy-src="https://betteranime.io/wp-content/uploads/2025/08/687d56071f53c.webp"></div></div><div class='episodiotitle' style='padding-left: 110px'><a href='https://betteranime.io/episodios/dandadan-dublado-episodio-1/'>1 - Episódio</a> <span class='timeAgo' data-time='2025-08-11T17:24:54+00:00'></span></div></li></ul></div></div><div class='se-c'><div class='se-q'><span class='se-t'>2</span><span class='title'>Temporada 2 <i>Jan. 01, 2025</i></span></div><div class='se-a'><ul class='episodios'><li class='mark-1'><div class='imagen'><div class='contentImg' data-thumb='https://betteranime.io/wp-content/uploads/2025/08/687d5a651a896.webp'><div class='coverImg'></div><img width="853" height="480" src="https://betteranime.io/wp-content/uploads/2025/08/687d5a651a896.webp"></div></div><div class='episodiotitle' style='padding-left: 110px'><a href='https://betteranime.io/episodios/dandadan-2-dublado-episodio-1/'>1 - Episódio</a> <span class='timeAgo' data-time='2025-08-11T17:29:12+00:00'></span></div></li></ul></div></div></div></div>`

// Real fragment of an episode page's player option list (li#player-option-1).
const OPTION_HTML = `
<ul id='playeroptionsul' class='ajax_mode'><li id='player-option-1' class='dooplay_player_option' data-type='tv' data-post='35214' data-nume='1'><i class='fas fa-play-circle'></i><span class='title'>Blog</span><span class='loader'></span></li></ul>`

// Real first line of the /jwplayer/ embed page returned by doo_player_ajax.
const JWPLAYER_HTML = `<!DOCTYPE html><html lang="pt-BR"> <head> <title>JW Player</title> </head><body>
<script type="text/javascript">var jw = {"file":"https:\/\/www.blogger.com\/video.g?token=AD6v5dwefqvSHtbVc0tmPpMYvDtAvimvVEGdWFlfLMU8HkpcMRwJwiBZR4bggNb2a7q-42hSR9Img9Kc20U72YVZxIfpLb4I-e0Z6OKMpQMymUO0EHh5aekBFH4EsyGH4udMyG9fZjnn","image":"https:\/\/betteranime.io\/wp-content\/uploads\/2025\/09\/68bc75f6a130b.webp","episode_id":10406}
// more player bootstrap code follows
</script></body></html>`

const BLOGGER_TOKEN = 'AD6v5dwefqvSHtbVc0tmPpMYvDtAvimvVEGdWFlfLMU8HkpcMRwJwiBZR4bggNb2a7q-42hSR9Img9Kc20U72YVZxIfpLb4I-e0Z6OKMpQMymUO0EHh5aekBFH4EsyGH4udMyG9fZjnn'

const EMBED_URL = `https://betteranime.io/jwplayer/?source=${encodeURIComponent(
  `https://www.blogger.com/video.g?token=${BLOGGER_TOKEN}`
)}&id=35214&type=blogger`

const AJAX_EMBED_JSON = JSON.stringify({ embed_url: EMBED_URL, type: 'blogger' })

// Real batchexecute (WcwnYd) response body: )]}'-prefixed chunked frames with two googlevideo mp4s.
const BATCHEXECUTE_BODY = String.raw`)]}'

2575
[["wrb.fr","WcwnYd","[1,null,[[\"https://rr2---sn-gxqxuxaxn0a-hb4l.googlevideo.com/videoplayback?expire\u003d1786924993\u0026ei\u003dQd-BaqzFH8vby9YP6auPkA8\u0026ip\u003d132.255.18.176\u0026id\u003de9ed28851de2c11a\u0026itag\u003d18\u0026source\u003dblogger\u0026requiressl\u003dyes\u0026mime\u003dvideo/mp4\u0026dur\u003d1368.235\u0026sparams\u003dexpire,ei,ip,id,itag,source,requiressl\u0026sig\u003dAE0s2JYwRAIgdRhcq9NGYt0A9fP7iZ2ga61WlbPnejSpi5GrQxOBh30\",[18]],[\"https://rr2---sn-gxqxuxaxn0a-hb4l.googlevideo.com/videoplayback?expire\u003d1786924993\u0026ei\u003dQd-BaqzFH8vby9YP6auPkA8\u0026ip\u003d132.255.18.176\u0026id\u003de9ed28851de2c11a\u0026itag\u003d22\u0026source\u003dblogger\u0026requiressl\u003dyes\u0026mime\u003dvideo/mp4\u0026dur\u003d1368.235\u0026sparams\u003dexpire,ei,ip,id,itag,source,requiressl\u0026sig\u003dAE0s2JYwRQIgMSLY4BwY_hJtv7A7kBZ3N1qK5S22SUKJFJxaKmPP\",[22]]],\"https://i9.ytimg.com/vi_blogger/6e0ohR3iwRo/1.jpg\",\"BLOGGER-video-e9ed28851de2c11a-8763\",\"e9ed28851de2c11a\",false]",null,null,null,"generic"]]
57
[["di",145],["af.httprm",145,"8595282222335957081",18]]
26
[["e",4,null,null,2672]]`

// Real fragments of the homepage: latest-episodes grid and the TV Shows grid.
const HOME_HTML = `
<div class="animation-2 items normal episodes-grid"><article class="item se episodes" id="post-35214"> <a href="https://betteranime.io/episodios/kimi-wo-aisuru-ki-wa-nai-to-itta-jiki-koushaku-sama-ga-nazeka-dekiai-shitekimasu-episodio-7/"> <div class="contentImg" data-thumb="https://betteranime.io/wp-content/uploads/2026/08/6a80b206ac43e.webp" data-miniature-b64="L21pbmlhdHVyZXMvNmE4MGIyMDcxYTQ3Yi53ZWJw" > <div class="coverImg"></div> </div> <div class="info"> <div class="infoData"> <h3>Episódio 7</h3> <span class="timeAgo" data-time="2026-08-15T18:38:42+00:00"></span> </div> <p class="hidden-text">Kimi wo Aisuru Ki wa Nai to Itta Jiki Koushaku-sama ga Nazeka Dekiai shitekimasu </p> </div> </a></article></div>
<div id="dt-tvshows" class="items normal"><article id="post-34945" class="item tvshows"><div class="poster"><img width="185" height="278" src="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='http://example.invalid'%3E%3C/svg%3E" alt="KAMUI: He&#8217;s Behind You" data-lazy-src="https://betteranime.io/wp-content/uploads/2026/08/6a5931ddb6056-185x278.webp"><noscript><img width="185" height="278" src="https://betteranime.io/wp-content/uploads/2026/08/6a5931ddb6056-185x278.webp"></noscript><div class="rating">0</div><a href="https://betteranime.io/animes/kamui-hes-behind-you/"><div class="see play3"></div></a></div><div class="data"><h3><a href="https://betteranime.io/animes/kamui-hes-behind-you/">KAMUI: He&#8217;s Behind You</a></h3> <span>Jan. 01, 2026</span></div></article></div>`

function fixtureFetch(routes: Record<string, string>): FetchFn {
  return async (url): Promise<FetchResult> => {
    const key = Object.keys(routes).find((k) => url.includes(k))
    if (!key) return { status: 404, headers: {}, body: 'not found' }
    return { status: 200, headers: { 'content-type': 'text/html' }, body: routes[key]! }
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

describe('betteranime source', () => {
  it('searches via the WordPress ?s= endpoint with the query encoded', async () => {
    let called = ''
    const fetch: FetchFn = async (url) => {
      called = url
      return { status: 200, headers: { 'content-type': 'text/html' }, body: SEARCH_HTML }
    }
    await betteranime.search({ ...ctx, fetch }, '  One Piece  ', 1)
    expect(called).toBe('https://betteranime.io/?s=One%20Piece')
  })

  it('parses search cards with covers and no pagination', async () => {
    const res = await betteranime.search({ ...ctx, fetch: fixtureFetch({ '/?s=': SEARCH_HTML }) }, 'one piece', 1)
    expect(res.items.map((m) => m.mediaId)).toEqual(['one-piece-dublado-online-hd', 'one-piece', 'one-piece-gyojin-tou-hen'])
    expect(res.items[0]?.title).toBe('One Piece Dublado')
    expect(res.items[0]?.type).toBe('anime')
    expect(res.items[1]?.coverUrl).toContain('68d193b6749c9-150x150.webp')
    expect(res.hasNextPage).toBe(false)
  })

  it('parses media details, synopsis, and genres', async () => {
    const m = await betteranime.getMedia({ ...ctx, fetch: fixtureFetch({ '/animes/naruto-shippuden': MEDIA_HTML }) }, 'naruto-shippuden')
    expect(m.title).toBe('Naruto Shippuden')
    expect(m.type).toBe('anime')
    expect(m.synopsis).toContain('Naruto retorna após treinamento')
    expect(m.tags).toEqual(['Ação', 'Arte Marcial', 'Aventura', 'Comédia', 'Super Poder'])
    // the poster src is an SVG placeholder; the real cover comes from data-lazy-src
    expect(m.coverUrl).toContain('68c19edde8793-198x300.webp')
  })

  it('fetches media detail with a trailing slash (the site 301s without one)', async () => {
    let called = ''
    const fetch: FetchFn = async (url) => {
      called = url
      return { status: 200, headers: { 'content-type': 'text/html' }, body: MEDIA_HTML }
    }
    await betteranime.getMedia({ ...ctx, fetch }, 'naruto-shippuden')
    expect(called).toBe('https://betteranime.io/animes/naruto-shippuden/')
  })

  it('parses seasons with per-season numbering and keeps whole episode slugs as ids', async () => {
    const eps = await betteranime.getEpisodes({ ...ctx, fetch: fixtureFetch({ '/animes/dandadan-dublado': EPISODES_HTML }) }, 'dandadan-dublado')
    expect(eps).toHaveLength(2)
    expect(eps[0]).toMatchObject({ number: 1, season: 1, mediaId: 'dandadan-dublado', lang: 'pt-br' })
    expect(eps[0]?.id).toBe('betteranime/dandadan-dublado/dandadan-dublado-episodio-1')
    expect(eps[0]?.title).toBe('Episódio')
    expect(eps[0]?.publishedAt).toBe('2025-08-11T17:24:54+00:00')
    expect(eps[0]?.imageUrl).toContain('687d56071f53c.webp')
    // season 2 restarts at 1 under a different slug, so only the whole slug disambiguates
    expect(eps[1]).toMatchObject({ number: 1, season: 2 })
    expect(eps[1]?.id).toBe('betteranime/dandadan-dublado/dandadan-2-dublado-episodio-1')
  })

  it('fetches the episode list with a trailing slash', async () => {
    let called = ''
    const fetch: FetchFn = async (url) => {
      called = url
      return { status: 200, headers: { 'content-type': 'text/html' }, body: EPISODES_HTML }
    }
    await betteranime.getEpisodes({ ...ctx, fetch }, 'dandadan-dublado')
    expect(called).toBe('https://betteranime.io/animes/dandadan-dublado/')
  })

  it('resolves the player via doo_player_ajax and the Blogger RPC, highest quality first', async () => {
    const media = {
      id: 'betteranime/kimi-wo-aisuru-ki-wa-nai-to-itta-jiki-koushaku-sama-ga-nazeka-dekiai-shitekimasu',
      mediaId: 'kimi-wo-aisuru-ki-wa-nai-to-itta-jiki-koushaku-sama-ga-nazeka-dekiai-shitekimasu',
      sourceId: 'betteranime',
      title: 'Kimi wo Aisuru Ki wa Nai to Itta Jiki Koushaku-sama ga Nazeka Dekiai shitekimasu',
      type: 'anime' as const
    }
    const episode = {
      id: 'betteranime/kimi-wo-aisuru-ki-wa-nai-to-itta-jiki-koushaku-sama-ga-nazeka-dekiai-shitekimasu/kimi-wo-aisuru-ki-wa-nai-to-itta-jiki-koushaku-sama-ga-nazeka-dekiai-shitekimasu-episodio-7',
      mediaId: media.mediaId,
      number: 7
    }
    const calls: Array<{ url: string; body?: string; headers?: Record<string, string> }> = []
    const fetch: FetchFn = async (url, init): Promise<FetchResult> => {
      calls.push({ url, body: init?.body, headers: init?.headers })
      if (url.includes('/episodios/')) {
        return { status: 200, headers: { 'content-type': 'text/html' }, body: OPTION_HTML }
      }
      if (url.includes('admin-ajax.php')) {
        return { status: 200, headers: { 'content-type': 'application/json' }, body: AJAX_EMBED_JSON }
      }
      if (url.includes('/jwplayer/')) {
        return { status: 200, headers: { 'content-type': 'text/html' }, body: JWPLAYER_HTML }
      }
      if (url.includes('batchexecute')) {
        return { status: 200, headers: { 'content-type': 'application/json' }, body: BATCHEXECUTE_BODY }
      }
      return { status: 404, headers: {}, body: 'not found' }
    }
    const streams = await betteranime.getStreams!({ ...ctx, fetch }, media, episode)

    // episode page -> doo_player_ajax POST with the option's data-post/nume/type
    const ajax = calls.find((c) => c.url.includes('admin-ajax.php'))
    expect(ajax?.body).toBe('action=doo_player_ajax&post=35214&nume=1&type=tv')
    expect(ajax?.headers?.['X-Requested-With']).toBe('XMLHttpRequest')
    // -> jwplayer embed page -> Blogger RPC carrying the token from var jw
    const rpc = calls.find((c) => c.url.includes('batchexecute'))
    expect(calls.some((c) => c.url.includes('/jwplayer/'))).toBe(true)
    expect(rpc?.body).toContain(BLOGGER_TOKEN)
    // the RPC frame must be wrapped in the extra envelope array ([[[...]]]);
    // two-level nesting is answered with `er`/400 despite HTTP 200
    expect(rpc?.body).toContain('f.req=%5B%5B%5B%22WcwnYd%22')

    // itag 22 (720p) ranks above itag 18 (360p); googlevideo needs no Referer
    expect(streams).toHaveLength(2)
    expect(streams[0]).toMatchObject({ kind: 'mp4', quality: '720p' })
    expect(streams[0]?.url).toContain('itag=22')
    expect(streams[0]?.url).toContain('googlevideo.com/videoplayback')
    expect(streams[0]?.headers).toBeUndefined()
    expect(streams[1]).toMatchObject({ kind: 'mp4', quality: '360p' })
    expect(streams[1]?.url).toContain('itag=18')
  })

  it('throws a descriptive error when every player option fails to resolve', async () => {
    const media = { id: 'betteranime/x', mediaId: 'x', sourceId: 'betteranime', title: 'X', type: 'anime' as const }
    const episode = { id: 'betteranime/x/x-episodio-1', mediaId: 'x', number: 1 }
    await expect(betteranime.getStreams!({ ...ctx, fetch: fixtureFetch({ '/episodios/': OPTION_HTML }) }, media, episode)).rejects.toThrow(
      /no playable streams found \(1 player\(s\), 1 failed\)/
    )
  })

  it('provides two home sections parsed from the homepage grids', async () => {
    const sections = await betteranime.getHomeSections!({ ...ctx, fetch: fixtureFetch({}) })
    expect(sections).toEqual([
      { id: 'ultimos-episodios', title: 'Últimos episódios' },
      { id: 'animes-recentes', title: 'Animes recentes' }
    ])
    const fetch = fixtureFetch({ '/home/': HOME_HTML })
    const ultimos = await betteranime.getHomeSection!({ ...ctx, fetch }, 'ultimos-episodios', 1)
    // episode cards link to /episodios/<slug>-episodio-N; the media id is the anime slug
    expect(ultimos.items.map((m) => m.mediaId)).toEqual([
      'kimi-wo-aisuru-ki-wa-nai-to-itta-jiki-koushaku-sama-ga-nazeka-dekiai-shitekimasu'
    ])
    expect(ultimos.items[0]?.title).toBe('Kimi wo Aisuru Ki wa Nai to Itta Jiki Koushaku-sama ga Nazeka Dekiai shitekimasu')
    expect(ultimos.items[0]?.coverUrl).toContain('6a80b206ac43e.webp')
    const recentes = await betteranime.getHomeSection!({ ...ctx, fetch }, 'animes-recentes', 1)
    expect(recentes.items.map((m) => m.mediaId)).toEqual(['kamui-hes-behind-you'])
    expect(recentes.items[0]?.title).toBe('KAMUI: He’s Behind You')
    expect(recentes.items[0]?.coverUrl).toContain('6a5931ddb6056-185x278.webp')
    // no per-section pagination exists on the homepage
    await expect(betteranime.getHomeSection!({ ...ctx, fetch: fixtureFetch({ '/home/': HOME_HTML }) }, 'nope', 1)).rejects.toThrow(
      /unknown homepage section/
    )
  })

  it('refuses chapter content (video-only source)', async () => {
    await expect(betteranime.getChapterContent({ ...ctx, fetch: fixtureFetch({}) }, 'x', 'y')).rejects.toThrow(
      'betteranime provides video streams, not chapter content'
    )
  })
})
