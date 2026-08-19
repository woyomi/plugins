import { describe, expect, it } from 'vitest'
import { DOMParser } from 'linkedom'
import { makeAnimesOrionSource } from '../src/animesorion.js'
import type { FetchFn, FetchResult } from '@woyomi/core'

;(globalThis as Record<string, unknown>).DOMParser = DOMParser

const animesorion = makeAnimesOrionSource()

// --- fixtures trimmed from https://animesorion.cc/ live HTML (2026-08) ---

const SEARCH_HTML = `
<div class="search-page">
  <div class="result-item">
    <article>
      <div class="image">
        <div class="thumbnail animation-2">
          <a href="https://animesorion.cc/animes/boruto-naruto-next-generations/">
            <img src="https://image.tmdb.org/t/p/w92/n4OLeeHqP4tpdvDxiloV65N6M5h.jpg" alt="Boruto: Naruto Next Generations" />
            <span class="tvshows">Anime</span>
          </a>
        </div>
      </div>
      <div class="details">
        <div class="title"><a href="https://animesorion.cc/animes/boruto-naruto-next-generations/">Boruto: Naruto Next Generations</a></div>
        <div class="meta"><span class="rating">IMDb 7.86</span><span class="year">2017</span></div>
        <div class="contenido"><p>Boruto Uzumaki, filho de Naruto Uzumaki, o Sétimo Hokage...</p></div>
      </div>
    </article>
  </div>
  <div class="result-item">
    <article>
      <div class="image">
        <div class="thumbnail animation-2">
          <a href="https://animesorion.cc/filmes/naruto-shippuden-filme-8-boruto-naruto-o-filme/">
            <img src="https://image.tmdb.org/t/p/w92/sDiq2Y8wQNC5HsIAAamk27kxQiv.jpg" alt="Naruto Shippuden Filme 8" />
            <span class="movies">Filme</span>
          </a>
        </div>
      </div>
      <div class="details">
        <div class="title"><a href="https://animesorion.cc/filmes/naruto-shippuden-filme-8-boruto-naruto-o-filme/">Naruto Shippuden – Filme 8: Boruto – Naruto O Filme</a></div>
        <div class="meta"><span class="rating">IMDb 7.7</span><span class="year">2015</span></div>
      </div>
    </article>
  </div>
</div>`

const MEDIA_HTML = `
<div class="sheader">
  <div class="poster">
    <img itemprop="image" src="https://image.tmdb.org/t/p/w185/a8BknzvFVK5EZ83rKg1a83iwaj0.jpg" alt="One-Punch Man">
  </div>
  <div class="data">
    <h1>One-Punch Man</h1>
    <div class="extra"> <span class="date" itemprop="dateCreated">Oct. 05, 2015</span> <span></span> </div>
    <div class="sgeneros">
      <a href="https://animesorion.cc/genero/acao/" rel="tag">Ação</a><a href="https://animesorion.cc/genero/comedia/" rel="tag">Comédia</a><a href="https://animesorion.cc/genero/seinen/" rel="tag">Seinen</a>
    </div>
  </div>
</div>
<div id="info" class="sbox fixidtab">
  <h2>Sinopse</h2>
  <div class="wp-content">
    Tudo sobre um jovem chamado Saitama parece mediano, seu expressão sem vida, sua cabeça calva e físico inexpressivo. No entanto, este homem de aparência comum não tem um problema comum…
    <ul class="wp-tags"><li><a href="https://animesorion.cc/tag/animes-dublado/" rel="tag">Anime Dublado</a></li><li><a href="https://animesorion.cc/tag/blu-ray/" rel="tag">Blu-ray</a></li></ul>
    <div id="dt_galery" class="galeria"><div class="g-item"><img src="https://image.tmdb.org/t/p/w300/3AXL.jpg" alt="One-Punch Man"></div></div>
  </div>
</div>`

const EPISODES_HTML = `
<div id="seasons">
  <div class="se-c">
    <div class="se-q"><span class="se-t se-o">1</span><span class="title">Temporada 1 <i>Oct. 05, 2015</i></span></div>
    <div class="se-a"><ul class="episodios">
      <li class="mark-1"><div class="numerando">1 - 1</div><div class="episodiotitle"><a href="https://animesorion.cc/episodios/one-punch-man/">O Homem Mais Poderoso do Mundo</a> <span class="date">Oct. 05, 2015</span></div></li>
      <li class="mark-2"><div class="numerando">1 - 2</div><div class="episodiotitle"><a href="https://animesorion.cc/episodios/one-punch-man-2/">O Ciborgue Solitário</a> <span class="date">Oct. 12, 2015</span></div></li>
    </ul></div>
  </div>
  <div class="se-c">
    <div class="se-q"><span class="se-t se-o">2</span><span class="title">Temporada 2 <i>Apr. 09, 2019</i></span></div>
    <div class="se-a"><ul class="episodios">
      <li class="mark-1"><div class="numerando">3 - 1</div><div class="episodiotitle"><a href="https://animesorion.cc/episodios/one-punch-man-3-episodio-1/">O Discípulo Mais Forte</a></div></li>
    </ul></div>
  </div>
</div>`

// Movie pages have the same header markup but no #seasons list.
const MOVIE_HTML = `
<div class="sheader">
  <div class="poster"><img itemprop="image" src="https://image.tmdb.org/t/p/w185/2ndvx03fmREMxEgaZ1vWt756TOQ.jpg" alt="Jujutsu Kaisen 0"></div>
  <div class="data"><h1>Jujutsu Kaisen 0: O Filme</h1><div class="sgeneros"><a href="https://animesorion.cc/genero/acao/" rel="tag">Ação</a></div></div>
</div>`

const EPISODE_PAGE_HTML = `
<div class="dooplay_player"><div id="playcontainer" class="play"><div id="dooplay_player_content">
  <div id="source-player-1" class="source-box"><div class="pframe">
    <iframe class="metaframe rptss" src="https://myembed.biz/serie/63926/1/2" frameborder="0" scrolling="no" allow="autoplay; encrypted-media" allowfullscreen></iframe>
  </div></div>
</div></div></div>
<ul id="playeroptionsul" class="no_ajax">
  <li id="player-option-1" class="dooplay_player_option" data-type="tv" data-post="14113" data-nume="1">
    <span class="title">HD-DUBLADO</span><span class="server">mybiz</span>
  </li>
</ul>`

// myembed.biz only serves the real gateway page when the animesorion Referer is sent.
const GATEWAY_HTML = `
<body>
  <div id="loading-container"><div class="spinner"></div><div class="loading-text">Carregando Player...</div></div>
  <iframe id="video-player" src="https://playerflix.ink/serie/63926/1/2" allowfullscreen="true" scrolling="no" style="display: none;"></iframe>
</body>`

const AJAX_JSON = JSON.stringify({
  status: true,
  data: {
    id: 15429,
    title: 'One-Punch Man',
    options: [
      {
        embed: 'https://www.blogger.com/video.g?token=AD6v5dwhpMA0qGY2P1nbwuGuk-717Uw',
        lang: 'pt-br',
        label: 'Blogger',
        budget: 'success'
      },
      {
        embed: 'https://embedplayer2.xyz/video/6d8601d82d764554c8430f34202031b1',
        lang: 'pt-br',
        label: 'VIP Player',
        budget: 'success'
      },
      {
        embed: 'https://embedplayer2.xyz/video/225b13b17df5a65427070216ac0a2b10',
        lang: 'en-us',
        label: 'VIP Player',
        budget: 'success'
      },
      {
        embed: 'https://superflixapi.pro/serie/63926/1/2',
        lang: 'pt-br',
        label: 'Premium',
        budget: 'danger'
      }
    ]
  }
})

const GETVIDEO_PT_JSON = JSON.stringify({
  hls: true,
  videoSource: 'https://embedplayer2.xyz/cdn/hls/2b90cf78/master.txt',
  securedLink: 'https://embedplayer2.xyz/cdn/hls/2b90cf78/master.m3u8?md5=h8G6IcMhwG3XcgeRyQNTUQ&expires=1786902891'
})

const GETVIDEO_EN_JSON = JSON.stringify({
  hls: false,
  videoSource: 'https://cvt24.embedplayer1.xyz/v/oppm.s1e02.en.mp4',
  securedLink: null
})

const AJAX_NOVIP_JSON = JSON.stringify({
  status: true,
  data: {
    options: [
      { embed: 'https://www.blogger.com/video.g?token=x', lang: 'pt-br', label: 'Blogger', budget: 'success' },
      { embed: 'https://superflixapi.pro/serie/63926/1/2', lang: 'pt-br', label: 'Premium', budget: 'danger' }
    ]
  }
})

const HOME_HTML = `
<div id="featured-titles" class="items featured">
  <article id="post-featured-14104" class="item tvshows"><div class="poster"><img src="https://image.tmdb.org/t/p/w185/a8BknzvFVK5EZ83rKg1a83iwaj0.jpg" alt="One-Punch Man"><div class="featu">Destaque</div><a href="https://animesorion.cc/animes/one-punch-man/"><div class="see play1"></div></a></div><div class="data dfeatur"><h3><a href="https://animesorion.cc/animes/one-punch-man/">One-Punch Man</a></h3><span>2015</span></div></article>
</div>
<div id="dt-tvshows" class="items normal">
  <article id="post-14326" class="item tvshows"><div class="poster"><img src="https://image.tmdb.org/t/p/w185/lk94wPoOiNBBE1Y3NNSj5r0KOFf.jpg" alt="Digimon 9: Beatbreak"><div class="rating">10</div><a href="https://animesorion.cc/animes/digimon-9-beatbreak/"><div class="see play1"></div></a></div><div class="data"><h3><a href="https://animesorion.cc/animes/digimon-9-beatbreak/">Digimon 9: Beatbreak</a></h3> <span>2025</span></div></article>
</div>
<div id="dt-movies" class="items normal">
  <article id="post-318" class="item movies"><div class="poster"><img src="https://image.tmdb.org/t/p/w185/jcGebpcnJfjdXKoTpoEus7Zc1zn.jpg" alt="Kaijuu 8-gou"><div class="mepo"> <span class="quality">HDTV</span></div><a href="https://animesorion.cc/filmes/kaijuu-8-gou-kaiju-no-8-filme/"><div class="see play1"></div></a></div><div class="data"><h3><a href="https://animesorion.cc/filmes/kaijuu-8-gou-kaiju-no-8-filme/">Kaijuu 8-gou: (Kaiju No. 8) – Filme</a></h3> <span>&nbsp;</span></div></article>
</div>`

interface FetchLogEntry {
  url: string
  headers?: Record<string, string>
}

function fixtureFetch(routes: Record<string, string>, log?: FetchLogEntry[]): FetchFn {
  return async (url, init): Promise<FetchResult> => {
    log?.push({ url, headers: init?.headers })
    const key = Object.keys(routes).find((k) => url.includes(k))
    if (!key) return { status: 404, headers: {}, body: `not found: ${url}` }
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

describe('animesorion source', () => {
  it('searches via the WordPress query and encodes spaces', async () => {
    const log: FetchLogEntry[] = []
    const fetch = fixtureFetch({ '?s=': SEARCH_HTML }, log)
    await animesorion.search({ ...ctx, fetch }, '  one punch  ', 1)
    expect(log[0]?.url).toBe('https://animesorion.cc/?s=one%20punch')
  })

  it('parses search cards for both animes and filmes paths', async () => {
    const res = await animesorion.search({ ...ctx, fetch: fixtureFetch({ '?s=': SEARCH_HTML }) }, 'naruto', 1)
    expect(res.items.map((m) => m.mediaId)).toEqual([
      'boruto-naruto-next-generations',
      'filme:naruto-shippuden-filme-8-boruto-naruto-o-filme'
    ])
    expect(res.items[0]?.title).toBe('Boruto: Naruto Next Generations')
    expect(res.items[0]?.type).toBe('anime')
    expect(res.items[0]?.id).toBe('animesorion/boruto-naruto-next-generations')
    expect(res.items[0]?.coverUrl).toContain('n4OLeeHqP4tpdvDxiloV65N6M5h.jpg')
    expect(res.hasNextPage).toBe(false)
  })

  it('parses media details: title, cover, synopsis (without tag/gallery noise) and genres', async () => {
    const m = await animesorion.getMedia(
      { ...ctx, fetch: fixtureFetch({ 'animes/one-punch-man': MEDIA_HTML }) },
      'one-punch-man'
    )
    expect(m.title).toBe('One-Punch Man')
    expect(m.type).toBe('anime')
    expect(m.coverUrl).toBe('https://image.tmdb.org/t/p/w185/a8BknzvFVK5EZ83rKg1a83iwaj0.jpg')
    expect(m.synopsis).toContain('jovem chamado Saitama')
    expect(m.synopsis).not.toContain('Anime Dublado')
    expect(m.synopsis).not.toContain('dt_galery')
    expect(m.tags).toEqual(['Ação', 'Comédia', 'Seinen'])
  })

  it('parses the episode list with season/number from .numerando, not from the URL', async () => {
    const eps = await animesorion.getEpisodes(
      { ...ctx, fetch: fixtureFetch({ 'animes/one-punch-man/': EPISODES_HTML }) },
      'one-punch-man'
    )
    expect(eps).toHaveLength(3)
    expect(eps[0]).toMatchObject({ season: 1, number: 1, mediaId: 'one-punch-man', lang: 'pt-br' })
    expect(eps[0]?.id).toBe('episodios/one-punch-man')
    expect(eps[0]?.title).toBe('O Homem Mais Poderoso do Mundo')
    expect(eps[2]).toMatchObject({ season: 3, number: 1 })
    expect(eps[2]?.id).toBe('episodios/one-punch-man-3-episodio-1')
  })

  it('returns a single pseudo-episode for movie pages (the player lives on the page)', async () => {
    const eps = await animesorion.getEpisodes(
      { ...ctx, fetch: fixtureFetch({ 'filmes/jujutsu-kaisen-0-o-filme': MOVIE_HTML }) },
      'filme:jujutsu-kaisen-0-o-filme'
    )
    expect(eps).toEqual([{ id: 'filme:jujutsu-kaisen-0-o-filme', mediaId: 'filme:jujutsu-kaisen-0-o-filme', number: 1, lang: 'pt-br' }])
  })

  it('follows the myembed -> playerflix chain, resolving VIP players to signed direct streams', async () => {
    const log: FetchLogEntry[] = []
    const fetch = fixtureFetch(
      {
        'animesorion.cc/episodios/one-punch-man-2/': EPISODE_PAGE_HTML,
        'myembed.biz/serie/63926/1/2': GATEWAY_HTML,
        'playerflix.ink/inc/Ajax.php': AJAX_JSON,
        'data=6d8601d82d764554c8430f34202031b1&do=getVideo': GETVIDEO_PT_JSON,
        'data=225b13b17df5a65427070216ac0a2b10&do=getVideo': GETVIDEO_EN_JSON
      },
      log
    )
    const media = {
      id: 'animesorion/one-punch-man',
      mediaId: 'one-punch-man',
      sourceId: 'animesorion',
      title: 'One-Punch Man',
      type: 'anime' as const
    }
    const episode = { id: 'episodios/one-punch-man-2', mediaId: 'one-punch-man', number: 2, season: 1, lang: 'pt-br' }
    const streams = await animesorion.getStreams!({ ...ctx, fetch }, media, episode)

    expect(streams).toHaveLength(2)
    // pt-br first (qualityScore), signed m3u8, en-us mp4 second
    expect(streams[0]).toMatchObject({
      url: 'https://embedplayer2.xyz/cdn/hls/2b90cf78/master.m3u8?md5=h8G6IcMhwG3XcgeRyQNTUQ&expires=1786902891',
      kind: 'hls',
      quality: 'VIP Player (pt-br)'
    })
    expect(streams[1]).toMatchObject({ kind: 'mp4', quality: 'VIP Player (en-us)' })
    expect(streams[1]?.url).toContain('.mp4')

    // the gateway request must carry the animesorion referer (it serves a decoy page otherwise)
    // and browser-like headers (playerflix sits behind Cloudflare)
    const gatewayCall = log.find((e) => e.url.includes('myembed.biz'))
    expect(gatewayCall?.headers).toMatchObject({ referer: 'https://animesorion.cc/' })
    expect(gatewayCall?.headers?.['user-agent']).toMatch(/Mozilla/)
    // the playerflix ajax must carry X-Requested-With and the episode id/season/episode params
    const ajaxCall = log.find((e) => e.url.includes('inc/Ajax.php'))
    expect(ajaxCall?.url).toBe('https://playerflix.ink/inc/Ajax.php?type=tv&id=63926&season=1&episode=2')
    expect(ajaxCall?.headers).toMatchObject({ 'x-requested-with': 'XMLHttpRequest' })
    expect(ajaxCall?.headers?.['user-agent']).toMatch(/Mozilla/)
  })

  it('throws a descriptive error when no server is resolvable (Blogger/Premium only)', async () => {
    const fetch = fixtureFetch({
      'animesorion.cc/episodios/one-punch-man-2/': EPISODE_PAGE_HTML,
      'myembed.biz/serie/63926/1/2': GATEWAY_HTML,
      'playerflix.ink/inc/Ajax.php': AJAX_NOVIP_JSON
    })
    const media = { id: 'animesorion/one-punch-man', mediaId: 'one-punch-man', sourceId: 'animesorion', title: 'One-Punch Man', type: 'anime' as const }
    const episode = { id: 'episodios/one-punch-man-2', mediaId: 'one-punch-man', number: 2 }
    await expect(animesorion.getStreams!({ ...ctx, fetch }, media, episode)).rejects.toThrow(/no resolvable stream.*Blogger\/pt-br/s)
  })

  it('provides three home sections and parses their carousels', async () => {
    const sections = await animesorion.getHomeSections!({ ...ctx, fetch: fixtureFetch({}) })
    expect(sections).toEqual([
      { id: 'destaques', title: 'Animes em Destaque' },
      { id: 'ultimos-animes', title: 'Últimos Animes Lançados' },
      { id: 'filmes', title: 'Filmes de Animes Recentes' }
    ])
    const fetch = fixtureFetch({ 'animesorion.cc/': HOME_HTML })
    const destaques = await animesorion.getHomeSection!({ ...ctx, fetch }, 'destaques', 1)
    expect(destaques.items.map((m) => m.mediaId)).toEqual(['one-punch-man'])
    expect(destaques.items[0]?.title).toBe('One-Punch Man')
    expect(destaques.items[0]?.coverUrl).toContain('a8BknzvFVK5EZ83rKg1a83iwaj0.jpg')
    const ultimos = await animesorion.getHomeSection!({ ...ctx, fetch }, 'ultimos-animes', 1)
    expect(ultimos.items.map((m) => m.mediaId)).toEqual(['digimon-9-beatbreak'])
    const filmes = await animesorion.getHomeSection!({ ...ctx, fetch }, 'filmes', 1)
    expect(filmes.items.map((m) => m.mediaId)).toEqual(['filme:kaijuu-8-gou-kaiju-no-8-filme'])
  })

  it('rejects unknown home sections', async () => {
    await expect(animesorion.getHomeSection!({ ...ctx, fetch: fixtureFetch({}) }, 'nope', 1)).rejects.toThrow(
      /unknown homepage section/
    )
  })
})
