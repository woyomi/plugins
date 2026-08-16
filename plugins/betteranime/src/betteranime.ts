import type { ChapterContent, Episode, FetchFn, HomeSection, Media, SearchResults, Source, SourceContext, StreamSource } from '@woyomi/core'
import { fetchHtml } from '@woyomi/core'

const BASE = 'https://betteranime.io'
const AJAX = `${BASE}/wp-admin/admin-ajax.php`
const sourceId = 'betteranime'

/**
 * Players are Blogger embeds (`/video.g?token=...`) behind the site's own JW Player page.
 * The Blogger page itself no longer embeds stream URLs; the player resolves them through
 * this batchexecute RPC (`WcwnYd`), which accepts plain requests (no cookies/sid needed).
 */
const BLOGGER_RPC_URL =
  'https://www.blogger.com/_/BloggerVideoPlayerUi/data/batchexecute?rpcids=WcwnYd&source-path=%2Fvideo.g&f.sid=1&bl=boq_bloggeruiserver_20260811.01_p0&hl=pt-BR&_reqid=100000&rt=c'

/** DOMParser is injected into the worker by the sandbox host (linkedom); tests polyfill it. */
function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

function text(el: Element | null | undefined): string | undefined {
  const t = el?.textContent?.trim()
  return t ? t : undefined
}

/** `/animes/<slug>/` (absolute or relative) -> `<slug>`; '' when the link is not an anime link. */
function animeSlugFromHref(href: string): string {
  const match = /\/animes\/([^/?#]+)/.exec(href)
  return match?.[1] ? decodeURIComponent(match[1]) : ''
}

/** `/episodios/<slug>/` -> `<slug>` (kept whole: slugs vary, e.g. `<anime>-episodio-7`, `<anime>-filler-100`). */
function episodeSlugFromHref(href: string): string {
  const match = /\/episodios\/([^/?#]+)/.exec(href)
  return match?.[1] ? decodeURIComponent(match[1]) : ''
}

/** `<anime-slug>-episodio-<n>` -> `<anime-slug>` for episode cards on the homepage feed. */
function animeSlugFromEpisodeSlug(slug: string): string {
  return slug.replace(/-episodio-\d+$/i, '')
}

/** Episode number is the trailing integer of the episode slug (`...-episodio-7`, `...-filler-100`). */
function episodeNumberFromSlug(slug: string): number {
  return Number.parseInt(/(\d+)$/.exec(slug)?.[1] ?? '', 10)
}

/** Poster/thumbnail src, skipping the SVG placeholder used by the WP lazy loader. */
function imgSrc(img: HTMLImageElement | Element | null | undefined): string | undefined {
  const src = img?.getAttribute('data-lazy-src') ?? img?.getAttribute('src')
  if (!src || /^data:/.test(src)) return undefined
  return src
}

interface PlayerEmbed {
  embed_url?: string
  type?: string
}

interface JwConfig {
  file?: string
}

/** WcwnYd payload: `[status, null, streams[], meta[]]` — positional array, streams are `[url, [itag]]`. */
type BloggerVideoInfo = [unknown, unknown, unknown[]?, unknown[]?]

/**
 * batchexecute replies are `)]}'`-prefixed and chunked as `<size>\n<json>` frames.
 * Extract the first balanced JSON frame array (string-aware scan) and return the
 * payload of the `WcwnYd` frame.
 */
function parseBatchexecute(body: string): BloggerVideoInfo {
  const start = body.indexOf('[["wrb.fr"')
  if (start === -1) throw new Error('betteranime: unexpected Blogger RPC response (no wrb.fr frame)')
  for (let i = start; i < body.length; i++) {
    if (body[i] !== '[') continue
    // scan one balanced array starting at i
    let depth = 0
    let inString = false
    let escaped = false
    let end = -1
    for (let j = i; j < body.length; j++) {
      const c = body[j]
      if (inString) {
        if (escaped) escaped = false
        else if (c === '\\') escaped = true
        else if (c === '"') inString = false
        continue
      }
      if (c === '"') inString = true
      else if (c === '[') depth++
      else if (c === ']') {
        depth--
        if (depth === 0) {
          end = j + 1
          break
        }
      }
    }
    if (end === -1) throw new Error('betteranime: truncated Blogger RPC frame')
    let frame: unknown
    try {
      frame = JSON.parse(body.slice(i, end))
    } catch {
      continue
    }
    if (Array.isArray(frame)) {
      const payload = (frame as unknown[][]).find((entry) => entry[1] === 'WcwnYd')?.[2]
      if (typeof payload === 'string') {
        const info = JSON.parse(payload) as BloggerVideoInfo
        if (Array.isArray(info) && Array.isArray(info[2])) return info
      }
    }
    i = end - 1
  }
  throw new Error('betteranime: Blogger RPC response carried no video info')
}

/** Resolve one `video.g?token=` player to direct googlevideo mp4 streams. */
async function resolveBloggerStreams(fetch: FetchFn, token: string): Promise<StreamSource[]> {
  const inner = JSON.stringify([token, null, 0])
  // batchexecute bodies wrap each RPC frame in an extra envelope array:
  // [[["WcwnYd", "[\"token\",null,0]", null, "generic"]]] — two-level nesting gets HTTP 200 with an `er`/400 payload.
  const req = `f.req=${encodeURIComponent(JSON.stringify([[['WcwnYd', inner, null, 'generic']]]))}&`
  const res = await fetch(BLOGGER_RPC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      Referer: 'https://www.blogger.com/',
      'X-Same-Domain': '1'
    },
    body: req
  })
  if (res.status !== 200) throw new Error(`betteranime: Blogger RPC failed with HTTP ${res.status}`)
  const info = parseBatchexecute(res.body)
  const streams: StreamSource[] = []
  for (const entry of (info[2] ?? []) as unknown[][]) {
    const url = entry[0]
    if (typeof url !== 'string' || !/^https?:\/\//.test(url)) continue
    streams.push({
      url,
      kind: 'mp4',
      quality: itagQuality(url)
      // googlevideo playback URLs work with plain range requests (no Referer required)
    })
  }
  return streams
}

/** Progressive YouTube itags used by Blogger-hosted videos; quality is derived from the itag param. */
function itagQuality(url: string): string | undefined {
  const itag = Number.parseInt(/itag=(\d+)/.exec(url)?.[1] ?? '', 10)
  const labels: Record<number, string> = {
    13: '144p',
    17: '144p',
    36: '240p',
    18: '360p',
    59: '480p',
    78: '480p',
    22: '720p',
    37: '1080p'
  }
  return Number.isFinite(itag) ? labels[itag] : undefined
}

/** pick the highest-quality stream first (data order is not guaranteed). */
function qualityScore(label: string | undefined): number {
  const s = label ?? ''
  if (/1080|fhd|full/i.test(s)) return 3
  if (/720|hd/i.test(s)) return 2
  if (/sd|360|480|240|144/i.test(s)) return 1
  return 0
}

/** Extract the Blogger token from a `video.g?token=` URL, or from a base64-reversed blob. */
function bloggerToken(file: string | undefined): string | undefined {
  if (!file) return undefined
  const match = /video\.g\?token=([A-Za-z0-9_=-]+)/.exec(file)
  if (match?.[1]) return match[1]
  // Some embeds store the token base64-encoded and reversed (see the site's getBloggerIframeUrl).
  if (typeof atob === 'function') {
    try {
      const decoded = atob(file.replace(/ /g, '+')).split('').reverse().join('')
      if (/^[A-Za-z0-9_=-]+$/.test(decoded)) return decoded
    } catch {
      // not base64 — fall through
    }
  }
  return undefined
}

/** A card in the WordPress search results (`/?s=`). */
function mapSearchCard(item: Element): Media | undefined {
  const link = item.querySelector<HTMLAnchorElement>('.details .title a')
  const mediaId = animeSlugFromHref(link?.getAttribute('href') ?? '')
  if (!mediaId) return undefined
  const img = item.querySelector<HTMLImageElement>('.image img')
  return {
    id: `${sourceId}/${mediaId}`,
    mediaId,
    sourceId,
    title: text(link) ?? text(img) ?? 'Untitled',
    type: 'anime',
    coverUrl: imgSrc(img)
  }
}

/**
 * Prefer the anime's cover from its detail page, falling back to the episode
 * thumbnail when the detail fetch fails (dead/phantom entry).
 */
async function withAnimeCover(ctx: SourceContext, fallback: Media): Promise<Media> {
  try {
    const doc = parseHtml(await fetchHtml(ctx.fetch, `${BASE}/animes/${fallback.mediaId}/`))
    const cover = imgSrc(doc.querySelector('.sheader .poster img'))
    if (cover) return { ...fallback, coverUrl: cover }
  } catch {
    /* keep the episode thumb */
  }
  return fallback
}

/** A poster card in the homepage "TV Shows" grid. */
function mapTvCard(article: Element): Media | undefined {
  const link = article.querySelector<HTMLAnchorElement>('.data h3 a')
  const mediaId = animeSlugFromHref(link?.getAttribute('href') ?? article.querySelector<HTMLAnchorElement>('.poster a')?.getAttribute('href') ?? '')
  if (!mediaId) return undefined
  return {
    id: `${sourceId}/${mediaId}`,
    mediaId,
    sourceId,
    title: text(link) ?? 'Untitled',
    type: 'anime',
    coverUrl: imgSrc(article.querySelector('.poster img'))
  }
}

/** `{"file":"..."}` embedded as `var jw = {...}` on the /jwplayer/ embed page (no trailing semicolon). */
function parseJwConfig(html: string): JwConfig | undefined {
  const match = /var jw = (\{.*?\})\n/s.exec(html)
  const raw = match?.[1]
  if (!raw) return undefined
  try {
    return JSON.parse(raw) as JwConfig
  } catch {
    return undefined
  }
}

export function makeBetteranimeSource(): Source {
  return {
    id: sourceId,
    name: 'Better Anime',
    mediaTypes: ['anime'],
    lang: 'pt-br',

    async search(ctx, query, page): Promise<SearchResults> {
      // WordPress search: GET /?s=<term> returns all matches on a single page (no pagination).
      const doc = parseHtml(await fetchHtml(ctx.fetch, `${BASE}/?s=${encodeURIComponent(query.trim())}`))
      const items = Array.from(doc.querySelectorAll<HTMLElement>('.result-item'))
        .map(mapSearchCard)
        .filter((m): m is Media => Boolean(m))
      return { page, hasNextPage: false, items }
    },

    async getMedia(ctx, mediaId): Promise<Media> {
      // The site's routes keep a trailing slash: /animes/{slug}/ (no slash 301-redirects).
      const doc = parseHtml(await fetchHtml(ctx.fetch, `${BASE}/animes/${mediaId}/`))
      return {
        id: `${sourceId}/${mediaId}`,
        mediaId,
        sourceId,
        type: 'anime',
        title: text(doc.querySelector<HTMLElement>('.sheader .data h1')) ?? 'Untitled',
        coverUrl: imgSrc(doc.querySelector('.sheader .poster img')),
        synopsis: text(doc.querySelector<HTMLElement>('#info .wp-content p')),
        tags: Array.from(doc.querySelectorAll<HTMLAnchorElement>('.sgeneros a[rel="tag"]'))
          .map((a) => a.textContent?.trim() ?? '')
          .filter(Boolean)
      }
    },

    async getEpisodes(ctx, mediaId): Promise<Episode[]> {
      const doc = parseHtml(await fetchHtml(ctx.fetch, `${BASE}/animes/${mediaId}/`))
      const episodes: Episode[] = []
      // Seasons are separate .se-c blocks; episode links live at .episodiotitle a.
      for (const seasonBlock of Array.from(doc.querySelectorAll<HTMLElement>('#seasons .se-c'))) {
        const season = Number.parseInt(text(seasonBlock.querySelector('.se-t')) ?? '', 10)
        for (const li of Array.from(seasonBlock.querySelectorAll<HTMLElement>('ul.episodios li'))) {
          const link = li.querySelector<HTMLAnchorElement>('.episodiotitle a')
          const episodeSlug = episodeSlugFromHref(link?.getAttribute('href') ?? '')
          const n = episodeNumberFromSlug(episodeSlug)
          if (!episodeSlug || !Number.isFinite(n)) continue
          // Titles read "1 - Episódio - Volta para Casa": strip the leading number, `number` carries it.
          const label = text(link)?.replace(/^\d+\s*-\s*/, '')
          const publishedAt = li.querySelector<HTMLElement>('.timeAgo')?.getAttribute('data-time') ?? undefined
          const imageUrl = imgSrc(li.querySelector('.imagen img'))
          episodes.push({
            // The episode slug is kept whole: it cannot be rebuilt from mediaId + number
            // (season 2 entries use `<other-slug>-episodio-1`, fillers use `-filler-N`).
            id: `${sourceId}/${mediaId}/${episodeSlug}`,
            mediaId,
            number: n,
            ...(Number.isFinite(season) && season > 0 ? { season } : {}),
            ...(label ? { title: label } : {}),
            ...(publishedAt ? { publishedAt } : {}),
            ...(imageUrl ? { imageUrl } : {}),
            lang: 'pt-br'
          })
        }
      }
      return episodes
    },

    // video-only source: the unified Source type requires this method, but the
    // app only calls it for manga/novel media
    async getChapterContent(): Promise<ChapterContent> {
      throw new Error('betteranime provides video streams, not chapter content')
    },

    async getStreams(ctx, _media, episode): Promise<StreamSource[]> {
      const episodeSlug = episode.id.split('/').pop() ?? episodeSlugFromHref(episode.id)
      const doc = parseHtml(await fetchHtml(ctx.fetch, `${BASE}/episodios/${episodeSlug}/`))
      // Player options are AJAX-loaded (doo_player_ajax) rather than inline iframes.
      const options = Array.from(doc.querySelectorAll<HTMLElement>('li.dooplay_player_option'))
      const collected: StreamSource[] = []
      let failures = 0
      for (const option of options) {
        try {
          const body = new URLSearchParams({
            action: 'doo_player_ajax',
            post: option.getAttribute('data-post') ?? '',
            nume: option.getAttribute('data-nume') ?? '',
            type: option.getAttribute('data-type') ?? ''
          }).toString()
          const ajaxRes = await ctx.fetch(AJAX, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'X-Requested-With': 'XMLHttpRequest',
              Referer: `${BASE}/episodios/${episodeSlug}/`
            },
            body
          })
          if (ajaxRes.status !== 200) throw new Error(`doo_player_ajax -> HTTP ${ajaxRes.status}`)
          const embed = JSON.parse(ajaxRes.body) as PlayerEmbed
          if (!embed.embed_url) throw new Error('doo_player_ajax returned no embed_url')
          // The embed page carries `var jw = {"file": "<blogger video.g url>"}`.
          const embedHtml = await fetchHtml(ctx.fetch, embed.embed_url)
          const token = bloggerToken(parseJwConfig(embedHtml)?.file)
          if (!token) throw new Error('no Blogger token in player embed')
          collected.push(...(await resolveBloggerStreams(ctx.fetch, token)))
        } catch {
          failures++
        }
      }
      if (collected.length === 0) {
        throw new Error(`betteranime: no playable streams found (${options.length} player(s), ${failures} failed)`)
      }
      return collected.sort((a, b) => qualityScore(b.quality) - qualityScore(a.quality))
    },

    async getHomeSections(): Promise<HomeSection[]> {
      return [
        { id: 'ultimos-episodios', title: 'Últimos episódios' },
        { id: 'animes-recentes', title: 'Animes recentes' }
      ]
    },

    async getHomeSection(ctx, sectionId, page): Promise<SearchResults> {
      const isEpisodes = sectionId === 'ultimos-episodios'
      const isAnimes = sectionId === 'animes-recentes'
      if (!isEpisodes && !isAnimes) throw new Error(`unknown homepage section: ${sectionId}`)
      // Both sections live on the homepage; there is no per-section pagination.
      if (page > 1) return { page, hasNextPage: false, items: [] }
      const doc = parseHtml(await fetchHtml(ctx.fetch, `${BASE}/home/`))
      let items: Media[]
      if (isEpisodes) {
        // Episode cards thumbnail the episode itself; fetch each anime's real
        // cover from its detail page so the grid shows the series artwork.
        const cards = Array.from(doc.querySelectorAll<HTMLAnchorElement>('.episodes-grid article.item.se a[href*="/episodios/"]'))
        items = []
        for (const card of cards) {
          const mediaId = animeSlugFromEpisodeSlug(episodeSlugFromHref(card.getAttribute('href') ?? ''))
          if (!mediaId) continue
          const fallback: Media = {
            id: `${sourceId}/${mediaId}`,
            mediaId,
            sourceId,
            title: text(card.querySelector('p.hidden-text')) ?? 'Untitled',
            type: 'anime',
            coverUrl: card.querySelector<HTMLElement>('.contentImg')?.getAttribute('data-thumb') ?? undefined
          }
          items.push(await withAnimeCover(ctx, fallback))
        }
      } else {
        items = Array.from(doc.querySelectorAll<HTMLElement>('#dt-tvshows article.item.tvshows'))
          .map(mapTvCard)
          .filter((m): m is Media => Boolean(m))
      }
      return { page, hasNextPage: false, items }
    }
  }
}
