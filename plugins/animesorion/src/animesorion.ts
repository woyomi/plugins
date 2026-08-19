import type { ChapterContent, Episode, HomeSection, Media, SearchResults, Source, StreamSource } from '@woyomi/core'
import { fetchHtml, fetchJson } from '@woyomi/core'

const BASE = 'https://animesorion.cc'
const sourceId = 'animesorion'

/**
 * playerflix.ink sits behind Cloudflare and returns empty responses (HTTP 200,
 * 0 bytes) to requests that don't carry a full set of browser-like headers.
 * The native fetch_url hardcodes `user-agent: woyomi/0.1 (+native)` before
 * applying plugin headers, so we override it here with a Chrome UA plus the
 * Sec-Fetch / Accept-Language headers Cloudflare checks.
 */
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function browserHeaders(referer: string): Record<string, string> {
  return {
    'user-agent': BROWSER_UA,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.5',
    'sec-fetch-dest': 'iframe',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'cross-site',
    referer
  }
}

/** DOMParser is injected into the worker by the sandbox host (linkedom); tests polyfill it. */
function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

function text(el: Element | null | undefined): string | undefined {
  const t = el?.textContent?.trim()
  return t ? t : undefined
}

/**
 * Media id is slash-free so the app treats it as a single routing segment
 * (other plugin ids are plain slugs): bare `<slug>` for anime, `filme:<slug>`
 * for movies. The site route (`/animes/<slug>/` vs `/filmes/<slug>/`) is
 * recovered from that marker, not stored as a `/`-containing mediaId.
 */
function mediaIdFromPath(path: string): string {
  if (path.startsWith('filmes/')) return `filme:${path.slice('filmes/'.length)}`
  return path.replace(/^animes\//, '')
}

/** Turn a slash-free mediaId back into the site detail URL. */
function pageUrl(mediaId: string): string {
  if (mediaId.startsWith('filme:')) return `${BASE}/filmes/${mediaId.slice('filme:'.length)}/`
  return `${BASE}/animes/${mediaId}/`
}

/** Normalize an href (absolute or site-relative) to a slash-less site path. */
function pathFromHref(href: string): string {
  return href
    .replace(/^https?:\/\/[^/]+/, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}

/**
 * The synopsis lives as loose text inside `#info .wp-content`, followed by a
 * tags list (`ul.wp-tags`) and a screenshot gallery; stop at the first of those.
 */
function synopsisText(container: Element | null | undefined): string | undefined {
  let out = ''
  for (const node of Array.from(container?.childNodes ?? [])) {
    const isElement = node.nodeType === 1
    if (isElement) {
      const tag = (node as Element).tagName.toLowerCase()
      const isDecoration = tag === 'ul' || tag === 'div'
      if (isDecoration) break
    }
    out += ` ${node.textContent ?? ''}`
  }
  const clean = out.replace(/\s+/g, ' ').trim()
  return clean || undefined
}

/** A card in the WordPress (DooPlay) search results list. */
function mapSearchCard(item: Element): Media {
  const link = item.querySelector<HTMLAnchorElement>('.details .title a') ?? item.querySelector<HTMLAnchorElement>('.image a')
  const mediaId = mediaIdFromPath(pathFromHref(link?.getAttribute('href') ?? ''))
  return {
    id: `${sourceId}/${mediaId}`,
    mediaId,
    sourceId,
    title: text(link) ?? text(item.querySelector('img')) ?? 'Untitled',
    type: 'anime',
    coverUrl: item.querySelector<HTMLImageElement>('.image img')?.getAttribute('src') ?? undefined
  }
}

/** A card in a homepage carousel (`article.item` with `.poster img` + `.data h3 a`). */
function mapHomeCard(article: Element): Media {
  const link = article.querySelector<HTMLAnchorElement>('.data h3 a') ?? article.querySelector<HTMLAnchorElement>('.poster a[href]')
  const mediaId = mediaIdFromPath(pathFromHref(link?.getAttribute('href') ?? ''))
  return {
    id: `${sourceId}/${mediaId}`,
    mediaId,
    sourceId,
    title: text(link) ?? text(article.querySelector('img')) ?? 'Untitled',
    type: 'anime',
    coverUrl: article.querySelector<HTMLImageElement>('.poster img')?.getAttribute('src') ?? undefined
  }
}

interface PlayerOption {
  embed?: string
  lang?: string
  label?: string
  budget?: string
}

interface PlayerFlixResponse {
  data?: { options?: PlayerOption[] }
}

interface EmbedPlayerVideo {
  hls?: boolean
  videoSource?: string
  securedLink?: string
}

/** Prefer Portuguese (dublado/legendado) mirrors, then higher quality hints. */
function qualityScore(label: string | undefined): number {
  const s = label ?? ''
  if (/pt-br|portugu/i.test(s)) return 4
  if (/1080|fhd|full/i.test(s)) return 3
  if (/720|hd/i.test(s)) return 2
  if (/sd|360|480/i.test(s)) return 1
  return 0
}

/** Parse "S - E" (e.g. "1 - 2") from the .numerando div of an episode row. */
function parseNumerando(label: string | undefined): { season?: number; number?: number } {
  const parts = (label ?? '').split('-').map((p) => Number.parseInt(p.trim(), 10))
  const season = parts[0]
  const number = parts[1]
  const seasonOk = season !== undefined && Number.isFinite(season)
  const numberOk = number !== undefined && Number.isFinite(number)
  if (seasonOk && numberOk) return { season, number }
  if (numberOk) return { number }
  return {}
}

/**
 * Fetch the myembed.biz gateway or playerflix.ink page with full browser-like
 * headers — Cloudflare on playerflix returns empty bodies for non-browser UAs.
 */
async function fetchBrowserHtml(
  fetch: Parameters<typeof fetchHtml>[0],
  url: string,
  referer: string
): Promise<string> {
  const res = await fetch(url, { headers: browserHeaders(referer) })
  if (res.status < 200 || res.status >= 300) throw new Error(`GET ${url} -> HTTP ${res.status}`)
  if (!res.body || res.body.length === 0) throw new Error(`GET ${url} -> empty response (Cloudflare challenge?)`)
  return res.body
}

export function makeAnimesOrionSource(): Source {
  return {
    id: sourceId,
    name: 'Animes Orion',
    mediaTypes: ['anime'],
    lang: 'pt-br',

    async search(ctx, query, page): Promise<SearchResults> {
      // Plain WordPress search: /?s=<term>. The site returns up to 15 results, no pagination.
      const doc = parseHtml(await fetchHtml(ctx.fetch, `${BASE}/?s=${encodeURIComponent(query.trim())}`))
      const items = Array.from(doc.querySelectorAll('.search-page .result-item')).map(mapSearchCard)
      return { page, hasNextPage: false, items }
    },

    async getMedia(ctx, mediaId): Promise<Media> {
      const doc = parseHtml(await fetchHtml(ctx.fetch, pageUrl(mediaId)))
      return {
        id: `${sourceId}/${mediaId}`,
        mediaId,
        sourceId,
        type: 'anime',
        title: text(doc.querySelector('.sheader .data h1')) ?? 'Untitled',
        coverUrl: doc.querySelector<HTMLImageElement>('.sheader .poster img')?.getAttribute('src') ?? undefined,
        synopsis: synopsisText(doc.querySelector('#info .wp-content')),
        tags: Array.from(doc.querySelectorAll('.sgeneros a'))
          .map((a) => a.textContent?.trim() ?? '')
          .filter(Boolean)
      }
    },

    async getEpisodes(ctx, mediaId): Promise<Episode[]> {
      const doc = parseHtml(await fetchHtml(ctx.fetch, pageUrl(mediaId)))
      const episodes: Episode[] = []
      for (const li of Array.from(doc.querySelectorAll('#seasons .se-c ul.episodios li'))) {
        const link = li.querySelector<HTMLAnchorElement>('.episodiotitle a')
        const episodePath = pathFromHref(link?.getAttribute('href') ?? '')
        if (!/^episodios\//.test(episodePath)) continue
        const { season, number } = parseNumerando(text(li.querySelector('.numerando')))
        if (number === undefined) continue
        const label = text(link)
        episodes.push({
          // Episode ids are their site paths: "episodios/<slug>" (S/E live in .numerando, not the URL).
          id: episodePath,
          mediaId,
          number,
          ...(season !== undefined ? { season } : {}),
          ...(label ? { title: label } : {}),
          lang: 'pt-br'
        })
      }
      // Movie pages have no episode list: the playable iframe lives on the page itself.
      const isMovie = mediaId.startsWith('filme:')
      if (episodes.length === 0 && isMovie) {
        return [{ id: mediaId, mediaId, number: 1, lang: 'pt-br' }]
      }
      return episodes
    },

    // video-only source: the unified Source type requires this method, but the
    // app only calls it for manga/novel media
    async getChapterContent(): Promise<ChapterContent> {
      throw new Error('animesorion provides video streams, not chapter content')
    },

    async getStreams(ctx, media, episode): Promise<StreamSource[]> {
      // 1) episode/movie page -> first player iframe (myembed.biz/serie/<id>/<s>/<e> or /filme/<id>).
      //    Episode ids for series are site paths ("episodios/<slug>"); for movies they are the
      //    slash-free mediaId ("filme:<slug>") which must be routed onto the /filmes/ page.
      const page = episode.id.startsWith('filme:')
        ? `${BASE}/filmes/${episode.id.slice('filme:'.length)}/`
        : `${BASE}/${episode.id}/`
      const episodeDoc = parseHtml(await fetchHtml(ctx.fetch, page))
      const embedUrl = episodeDoc.querySelector<HTMLIFrameElement>('.dooplay_player iframe[src]')?.getAttribute('src')
      if (!embedUrl) throw new Error(`no player iframe found on ${page}`)

      // 2) myembed gateway (serves a decoy page unless the animesorion Referer is sent) -> playerflix url
      //    Cloudflare on playerflix returns empty bodies for non-browser UAs, so use browser headers.
      const gatewayDoc = parseHtml(await fetchBrowserHtml(ctx.fetch, embedUrl, `${BASE}/`))
      const playerFlixUrl = gatewayDoc.querySelector<HTMLIFrameElement>('iframe#video-player')?.getAttribute('src')
      if (!playerFlixUrl) throw new Error(`no playerflix iframe inside ${embedUrl}`)

      // 3) playerflix JSON api -> embed options (Blogger / VIP Player / WatchPlayer / Premium)
      const ajaxUrl = `${new URL(playerFlixUrl).origin}/inc/Ajax.php${playerFlixAjaxQuery(playerFlixUrl)}`
      const manifest = await fetchJson<PlayerFlixResponse>(ctx.fetch, ajaxUrl, {
        headers: {
          'user-agent': BROWSER_UA,
          accept: '*/*',
          'accept-language': 'en-US,en;q=0.5',
          'x-requested-with': 'XMLHttpRequest',
          referer: playerFlixUrl,
          origin: new URL(playerFlixUrl).origin,
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-origin'
        }
      })
      const options = manifest.data?.options ?? []

      // 4) resolve each "VIP Player" option (embedplayer*.xyz/video/<hash>) to a signed direct stream
      const streams: StreamSource[] = []
      for (const option of options) {
        const resolved = await resolveEmbedPlayer(ctx.fetch, option, playerFlixUrl)
        if (!resolved) continue
        const quality = `${option.label ?? 'Stream'} (${option.lang ?? '??'})`
        streams.push({ url: resolved.url, kind: resolved.kind, quality })
      }
      if (streams.length === 0) {
        const available = options.map((o) => `${o.label ?? '?'}/${o.lang ?? '?'}`).join(', ') || 'none'
        throw new Error(`no resolvable stream for ${media.mediaId} (servers: ${available})`)
      }
      return streams.sort((a, b) => qualityScore(b.quality) - qualityScore(a.quality))
    },

    async getHomeSections(): Promise<HomeSection[]> {
      return [
        { id: 'destaques', title: 'Animes em Destaque' },
        { id: 'ultimos-animes', title: 'Últimos Animes Lançados' },
        { id: 'filmes', title: 'Filmes de Animes Recentes' }
      ]
    },

    async getHomeSection(ctx, sectionId, page): Promise<SearchResults> {
      const selector =
        sectionId === 'destaques'
          ? '#featured-titles article.item'
          : sectionId === 'ultimos-animes'
            ? '#dt-tvshows article.item'
            : sectionId === 'filmes'
              ? '#dt-movies article.item'
              : null
      if (!selector) throw new Error(`unknown homepage section: ${sectionId}`)
      // The carousels only exist on the homepage; there is no archive pagination for them.
      const doc = parseHtml(await fetchHtml(ctx.fetch, `${BASE}/`))
      const items = Array.from(doc.querySelectorAll(selector)).map(mapHomeCard)
      return { page, hasNextPage: false, items }
    }
  }
}

/** playerflix /serie/<id>/<season>/<episode> or /filme/<id> -> the Ajax.php query string. */
function playerFlixAjaxQuery(playerFlixUrl: string): string {
  const path = new URL(playerFlixUrl).pathname
  const seriesMatch = /^\/serie\/([^/]+)\/(\d+)\/(\d+)/.exec(path)
  if (seriesMatch) {
    const id = seriesMatch[1]
    const season = seriesMatch[2]
    const ep = seriesMatch[3]
    if (id !== undefined && season !== undefined && ep !== undefined) {
      return `?type=tv&id=${id}&season=${season}&episode=${ep}`
    }
  }
  const movieMatch = /^\/(?:filme|movie)\/([^/]+)/.exec(path)
  const movieId = movieMatch?.[1]
  if (movieId !== undefined) return `?type=movie&id=${movieId}`
  throw new Error(`unrecognized playerflix path: ${path}`)
}

/**
 * embedplayer*.xyz options expose a FirePlayer api: POST /player/index.php?data=<hash>&do=getVideo
 * returns { videoSource, securedLink } where securedLink is a signed .m3u8 (or .mp4).
 */
async function resolveEmbedPlayer(
  fetch: Parameters<typeof fetchHtml>[0],
  option: PlayerOption,
  playerFlixUrl: string
): Promise<{ url: string; kind: 'hls' | 'mp4' } | undefined> {
  const match = /^https?:\/\/embedplayer\d*\.xyz\/video\/([0-9a-f]+)/.exec(option.embed ?? '')
  const hash = match?.[1]
  if (!match || hash === undefined || !option.embed) {
    return undefined // Blogger / WatchPlayer / Premium servers need JS or accounts
  }
  const api = `${new URL(option.embed).origin}/player/index.php?data=${hash}&do=getVideo`
  const res = await fetchJson<EmbedPlayerVideo>(fetch, api, {
    method: 'POST',
    headers: {
      'user-agent': BROWSER_UA,
      'content-type': 'application/x-www-form-urlencoded',
      'x-requested-with': 'XMLHttpRequest',
      referer: option.embed ?? '',
      origin: new URL(option.embed).origin,
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin'
    },
    body: `hash=${hash}&r=${encodeURIComponent(playerFlixUrl)}`
  })
  const url = res.securedLink ?? res.videoSource
  if (!url) return undefined
  const isHls = res.hls === true || /\.m3u8($|\?)/.test(url)
  return { url, kind: isHls ? 'hls' : 'mp4' }
}
