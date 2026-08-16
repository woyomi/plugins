import type { ChapterContent, Episode, FetchFn, HomeSection, Media, SearchResults, Source, StreamSource } from '@woyomi/core'
import { fetchHtml } from '@woyomi/core'

const BASE = 'https://animesonlinecc.to'
const sourceId = 'animesonlinecc'

/**
 * Blogger hosts the embedded players (`/video.g?token=...`). The page itself no longer
 * embeds stream URLs; the player resolves them through this batchexecute RPC (`WcwnYd`),
 * which accepts plain requests (no cookies/sid needed). `f.sid`/`_reqid`/`bl` are ignored.
 */
const BLOGGER_RPC_URL =
  'https://www.blogger.com/_/BloggerVideoPlayerUi/data/batchexecute?rpcids=WcwnYd&source-path=%2Fvideo.g&f.sid=1&bl=boq_bloggeruiserver_20260811.01_p0&hl=en&_reqid=100000&rt=c'

/** DOMParser is injected into the worker by the sandbox host (linkedom); tests polyfill it. */
function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

function text(el: Element | null | undefined): string | undefined {
  const t = el?.textContent?.trim()
  return t ? t : undefined
}

function absoluteUrl(src: string): string | undefined {
  if (!src) return undefined
  if (/^https?:\/\//i.test(src)) return src
  return `${BASE}/${src.replace(/^\/+/, '')}`
}

/** `/anime/<slug>` (absolute or relative) -> `<slug>`; '' when the link is not an anime link. */
function animeSlugFromHref(href: string): string {
  const match = /\/anime\/([^/?#]+)/.exec(href)
  return match?.[1] ? decodeURIComponent(match[1]) : ''
}

/** `/episodio/<slug>-episodio-<n>/` -> `<slug>` (the site splits seasons into own entries). */
function animeSlugFromEpisodeHref(href: string): string {
  const match = /\/episodio\/([^/?#]+)/.exec(href)
  const slug = match?.[1] ? decodeURIComponent(match[1]) : ''
  return slug.replace(/-episodio-\d+$/i, '')
}

/** Detail h1s end in a SEO suffix ("... Todos os Episodios Online"); search cards are clean. */
function cleanTitle(raw: string | undefined): string | undefined {
  const t = raw?.replace(/\s*todos os episodios online\s*$/i, '').replace(/\s+/g, ' ').trim()
  return t ? t : undefined
}

/** "Black Torch Episodio 7" -> "Black Torch" for cards pulled from the episodes feed. */
function stripEpisodeSuffix(raw: string | undefined): string | undefined {
  const t = raw?.replace(/\s*-?\s*episodio\s*\d+\s*$/i, '').replace(/\s+/g, ' ').trim()
  return t ? t : undefined
}

/**
 * Synopsis lives in `.resumotemp .wp-content p`. Older entries prefix a SEO sentence and a
 * `<br>` before the real text, so prefer the text after the last `<br>` when one exists.
 */
function synopsisFromDetail(doc: Document): string | undefined {
  const p = doc.querySelector<HTMLElement>('.resumotemp .wp-content p')
  if (!p) return undefined
  let sawBr = false
  let afterBr = ''
  for (const node of Array.from(p.childNodes)) {
    if (node.nodeName === 'BR') {
      sawBr = true
      afterBr = ''
    } else if (sawBr) {
      afterBr += node.textContent ?? ''
    }
  }
  if (sawBr) {
    const t = afterBr.replace(/\s+/g, ' ').trim()
    if (t) return t
  }
  return text(p)
}

function mapCard(a: Element, kind: 'anime' | 'episode'): Media | undefined {
  const href = a.getAttribute('href') ?? ''
  const mediaId = kind === 'anime' ? animeSlugFromHref(href) : animeSlugFromEpisodeHref(href)
  if (!mediaId) return undefined
  const article = a.closest('article')
  const img = a.querySelector<HTMLImageElement>('img') ?? article?.querySelector('img')
  const rawTitle = text(article?.querySelector('h3 a')) ?? img?.getAttribute('alt') ?? undefined
  const title = kind === 'anime' ? cleanTitle(rawTitle) : stripEpisodeSuffix(rawTitle)
  return {
    id: `${sourceId}/${mediaId}`,
    mediaId,
    sourceId,
    title: title ?? 'Untitled',
    type: 'anime',
    coverUrl: absoluteUrl(img?.getAttribute('src') ?? '') ?? undefined
  }
}

/** pick the highest-quality stream first (data order is not guaranteed). */
function qualityScore(label: string | undefined): number {
  const s = label ?? ''
  if (/1080|fhd|full/i.test(s)) return 3
  if (/720|hd/i.test(s)) return 2
  if (/sd|360|480|240|144/i.test(s)) return 1
  return 0
}

/** Progressive YouTube itags used by Blogger-hosted videos. */
const ITAG_LABELS: Record<number, string> = {
  13: '144p',
  17: '144p',
  36: '240p',
  18: '360p',
  59: '480p',
  78: '480p',
  22: '720p',
  37: '1080p'
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
  if (start === -1) throw new Error('animesonlinecc: unexpected Blogger RPC response (no wrb.fr frame)')
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
    if (end === -1) throw new Error('animesonlinecc: truncated Blogger RPC frame')
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
  throw new Error('animesonlinecc: Blogger RPC response carried no video info')
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
  if (res.status !== 200) throw new Error(`animesonlinecc: Blogger RPC failed with HTTP ${res.status}`)
  const info = parseBatchexecute(res.body)
  const streams: StreamSource[] = []
  for (const entry of (info[2] ?? []) as unknown[][]) {
    const url = entry[0]
    const itagList = entry[1]
    if (typeof url !== 'string' || !/^https?:\/\//.test(url)) continue
    const itag = Array.isArray(itagList) ? itagList[0] : undefined
    const quality = typeof itag === 'number' ? ITAG_LABELS[itag] : undefined
    streams.push({
      url,
      kind: 'mp4',
      ...(quality ? { quality } : {})
      // googlevideo playback URLs work with plain range requests (no Referer required)
    })
  }
  return streams
}

export function makeAnimesonlineccSource(): Source {
  return {
    id: sourceId,
    name: 'Animes Online CC',
    mediaTypes: ['anime'],
    lang: 'pt-br',

    async search(ctx, query, page): Promise<SearchResults> {
      // `/?s=` 302-redirects to /search/<term>; multiword terms are %20-separated.
      const term = encodeURIComponent(query.trim().replace(/\s+/g, ' '))
      const doc = parseHtml(await fetchHtml(ctx.fetch, `${BASE}/search/${term}`))
      const items = Array.from(doc.querySelectorAll<HTMLAnchorElement>('#archive-content article.item .poster a'))
        .map((a) => mapCard(a, 'anime'))
        .filter((m): m is Media => Boolean(m))
      return { page, hasNextPage: false, items }
    },

    async getMedia(ctx, mediaId): Promise<Media> {
      // Site routes use a trailing slash: /anime/<slug>/ (no slash 301-redirects).
      const doc = parseHtml(await fetchHtml(ctx.fetch, `${BASE}/anime/${mediaId}/`))
      const tags = Array.from(doc.querySelectorAll<HTMLAnchorElement>('.sgeneros a[rel="tag"]'))
        .filter((a) => !/\/genero\/letra-/.test(a.getAttribute('href') ?? ''))
        .map((a) => a.textContent?.trim() ?? '')
        .filter(Boolean)
      return {
        id: `${sourceId}/${mediaId}`,
        mediaId,
        sourceId,
        type: 'anime',
        title: cleanTitle(text(doc.querySelector<HTMLElement>('.sheader .data h1'))) ?? 'Untitled',
        coverUrl: absoluteUrl(doc.querySelector<HTMLImageElement>('.sheader .poster img')?.getAttribute('src') ?? ''),
        synopsis: synopsisFromDetail(doc),
        tags
      }
    },

    async getEpisodes(ctx, mediaId): Promise<Episode[]> {
      const doc = parseHtml(await fetchHtml(ctx.fetch, `${BASE}/anime/${mediaId}/`))
      const episodes: Episode[] = []
      // The site splits seasons into separate entries, but keep `season` if a block declares one.
      for (const seasonBlock of Array.from(doc.querySelectorAll<HTMLElement>('#seasons .se-c'))) {
        const season = Number.parseInt(text(seasonBlock.querySelector('.se-t')) ?? '', 10)
        for (const li of Array.from(seasonBlock.querySelectorAll<HTMLElement>('ul.episodios li'))) {
          const href = li.querySelector<HTMLAnchorElement>('.episodiotitle a')?.getAttribute('href') ?? ''
          const n = Number.parseInt((text(li.querySelector('.numerando')) ?? '').match(/\d+\s*$/)?.[0] ?? '', 10)
            || Number.parseInt(/-episodio-(\d+)/i.exec(href)?.[1] ?? '', 10)
          if (!Number.isFinite(n)) continue
          const label = stripEpisodeSuffix(text(li.querySelector('.episodiotitle a')))
          episodes.push({
            id: `${sourceId}/${mediaId}/${n}`,
            mediaId,
            number: n,
            ...(Number.isFinite(season) && season > 0 ? { season } : {}),
            ...(label ? { title: label } : {}),
            lang: 'pt-br'
          })
        }
      }
      return episodes
    },

    // video-only source: the unified Source type requires this method, but the
    // app only calls it for manga/novel media
    async getChapterContent(): Promise<ChapterContent> {
      throw new Error('animesonlinecc provides video streams, not chapter content')
    },

    async getStreams(ctx, media, episode): Promise<StreamSource[]> {
      // Episode pages live at /episodio/<anime-slug>-episodio-<number>/
      const doc = parseHtml(await fetchHtml(ctx.fetch, `${BASE}/episodio/${media.mediaId}-episodio-${episode.number}/`))
      const tokens = Array.from(doc.querySelectorAll<HTMLIFrameElement>('#playex iframe'))
        .map((iframe) => /video\.g\?token=([A-Za-z0-9_-]+)/.exec(iframe.getAttribute('src') ?? '')?.[1])
        .filter((t): t is string => Boolean(t))
      // Server buttons ("Dublado", "Legendado", "HD") pair with iframes by order (option-N).
      const labels = Array.from(doc.querySelectorAll<HTMLAnchorElement>('nav.player a.options[href^="#option-"]'))
        .map((a) => text(a))
        .filter((t): t is string => Boolean(t))
      const collected: StreamSource[] = []
      let failures = 0
      for (const [index, token] of tokens.entries()) {
        try {
          const label = labels[index]
          const streams = await resolveBloggerStreams(ctx.fetch, token)
          collected.push(
            ...streams.map((s) => (label && s.quality ? { ...s, quality: `${s.quality} (${label})` } : s))
          )
        } catch {
          failures++
        }
      }
      if (collected.length === 0) {
        throw new Error(`animesonlinecc: no playable streams found (${tokens.length} player(s), ${failures} failed)`)
      }
      return collected.sort((a, b) => qualityScore(b.quality) - qualityScore(a.quality))
    },

    async getHomeSections(): Promise<HomeSection[]> {
      // Homepage lists must map to anime/manga entries only (no episode links).
      return [{ id: 'animes-recentes', title: 'Animes recentes' }]
    },

    async getHomeSection(ctx, sectionId, page): Promise<SearchResults> {
      if (sectionId !== 'animes-recentes') throw new Error(`unknown homepage section: ${sectionId}`)
      // Page 1 scrapes the homepage carousel; deeper pages use the paginated archive.
      const url = page > 1 ? `${BASE}/anime/page/${page}/` : `${BASE}/`
      const doc = parseHtml(await fetchHtml(ctx.fetch, url))
      const container = page > 1 ? '#archive-content article.item' : '#dt-tvshows article.item'
      const items = Array.from(doc.querySelectorAll<HTMLAnchorElement>(`${container} .poster a`))
        .map((a) => mapCard(a, 'anime'))
        .filter((m): m is Media => Boolean(m))
      const hasNextPage = page > 1 ? Boolean(doc.querySelector('.pagination a.arrow_pag')) : true
      return { page, hasNextPage, items }
    }
  }
}
