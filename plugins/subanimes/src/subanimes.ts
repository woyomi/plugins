import type { ChapterContent, Episode, HomeSection, Media, SearchResults, Source, StreamSource } from '@woyomi/core'
import { fetchHtml, fetchJson } from '@woyomi/core'

const BASE = 'https://subanimes.org'
/** Host backing the embedded player: /player/index.php?data=<hex> -> /hls/<hex>/master.txt. */
const HLS_HOST = 'https://00000410.xyz'
const sourceId = 'subanimes'

/** DOMParser is injected into the worker by the sandbox host (linkedom); tests polyfill it. */
function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

function text(el: Element | null | undefined): string | undefined {
  const t = el?.textContent?.trim()
  return t ? t : undefined
}

/** `/anime/<slug>` (absolute or relative) -> `<slug>`; empty when it is not an anime link. */
function slugFromHref(href: string): string {
  const match = /\/anime\/([^/?#]+)/.exec(href)
  return match?.[1] ? decodeURIComponent(match[1]) : ''
}

/** " DUBLADO " -> "Dublado" (used as the distinguishing part of the quality label). */
function titleCaseVariant(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/(^|\s)(\S)/g, (_m, prefix: string, ch: string) => prefix + ch.toUpperCase())
}

function heightToQuality(height: number | undefined): string | undefined {
  if (height === undefined) return undefined
  if (height >= 2160) return '2160p'
  if (height >= 1080) return '1080p'
  if (height >= 720) return '720p'
  if (height >= 480) return '480p'
  return 'SD'
}

interface SearchItem {
  name?: string
  slug?: string
  url?: string
  poster?: string
  year?: number
  type?: string
}

interface SearchApiResponse {
  status?: string
  data?: SearchItem[]
}

/** One audio variant button on the episode page (DUBLADO / LEGENDADO). */
interface PlayerVariant {
  /** the `data=<32 hex>` token identifying the stream on the HLS host */
  data: string
  /** raw button text, e.g. "DUBLADO" */
  label: string
}

interface EpisodeItem {
  number?: number
  season?: number
  name?: string
  title?: string
  is_filler?: boolean
  url?: string
}

interface EpisodesApiResponse {
  data?: { episodes?: EpisodeItem[] }
}

function mapSearchItem(item: SearchItem): Media | undefined {
  const mediaId = item.slug?.trim() || slugFromHref(item.url ?? '')
  if (!mediaId) return undefined
  return {
    id: `${sourceId}/${mediaId}`,
    mediaId,
    sourceId,
    title: item.name?.trim() || 'Untitled',
    type: 'anime',
    coverUrl: item.poster || undefined
  }
}

/** The status box carries the state as a modifier class: `status-box status-completed`. */
function mapStatusBox(el: Element | null | undefined): Media['status'] {
  const cls = el?.getAttribute('class') ?? ''
  if (/\bstatus-completed\b/.test(cls)) return 'completed'
  if (/\bstatus-airing\b/.test(cls)) return 'ongoing'
  return undefined
}

/** A card inside one of the homepage sliders (`a.homeSlider-item`). */
function mapSliderCard(a: Element): Media {
  const mediaId = slugFromHref(a.getAttribute('href') ?? '')
  const img = a.querySelector<HTMLImageElement>('.poster-holder img')
  return {
    id: `${sourceId}/${mediaId}`,
    mediaId,
    sourceId,
    title: text(a.querySelector<HTMLElement>('.info .title')) ?? img?.getAttribute('alt')?.trim() ?? 'Untitled',
    type: 'anime',
    coverUrl: img?.getAttribute('src') ?? undefined
  }
}

function extractPlayerVariants(doc: Document): PlayerVariant[] {
  const variants: PlayerVariant[] = []
  const seen = new Set<string>()
  for (const btn of Array.from(doc.querySelectorAll<HTMLElement>('button.player-tab-btn'))) {
    // onclick="switchPlayer(this, 'https://00000410.xyz/player/index.php?data=<32hex>')"
    const playerUrl = /switchPlayer\(\s*this\s*,\s*'([^']+)'\s*\)/.exec(btn.getAttribute('onclick') ?? '')?.[1]
    const data = playerUrl ? /[?&]data=([0-9a-fA-F]+)/.exec(playerUrl)?.[1] : undefined
    if (!data || seen.has(data)) continue
    seen.add(data)
    variants.push({ data, label: text(btn) ?? '' })
  }
  return variants
}

interface MasterPlaylist {
  /** absolute media-playlist URL (https://00000410.xyz/m3/<token>) */
  url: string
  height?: number
}

/** First #EXT-X-STREAM-INF variant of a master playlist: its RESOLUTION and the URL on the next line. */
function parseMasterPlaylist(body: string): MasterPlaylist | undefined {
  const lines = body.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue
    const height = /RESOLUTION=(\d+)x(\d+)/.exec(line)?.[2]
    for (let j = i + 1; j < lines.length; j++) {
      const url = (lines[j] ?? '').trim()
      if (!url || url.startsWith('#')) continue
      // the site always emits absolute /m3/ URLs; keep a relative fallback anyway
      const absolute = /^https?:\/\//.test(url) ? url : `${HLS_HOST}${url.startsWith('/') ? '' : '/'}${url}`
      const parsedHeight = height ? Number.parseInt(height, 10) : undefined
      return { url: absolute, height: Number.isFinite(parsedHeight) ? parsedHeight : undefined }
    }
  }
  return undefined
}

/** "720p" + "Dublado" -> "720p • Dublado". */
function joinQuality(quality: string | undefined, variant: string): string | undefined {
  const parts = [quality, variant ? titleCaseVariant(variant) : ''].filter(Boolean)
  return parts.length > 0 ? parts.join(' • ') : undefined
}

/** home section id -> slider element id on the homepage */
const HOME_SECTION_SLIDERS: Record<string, string> = {
  'lanca-hoje': 'slider-lancamentos',
  novos: 'slider-novos',
  completos: 'slider-completos',
  populares: 'slider-populares'
}

export function makeSubanimesSource(): Source {
  return {
    id: sourceId,
    name: 'SubAnimes',
    mediaTypes: ['anime'],
    lang: 'pt-br',

    async search(ctx, query, page): Promise<SearchResults> {
      // the API rejects queries shorter than 3 chars; skip the round-trip entirely
      const term = query.trim()
      if (term.length < 3) return { page, hasNextPage: false, items: [] }
      const payload = await fetchJson<SearchApiResponse>(
        ctx.fetch,
        `${BASE}/api/search?query=${encodeURIComponent(term)}`
      )
      const items = (payload.data ?? [])
        .map(mapSearchItem)
        .filter((m): m is Media => m !== undefined)
      return { page, hasNextPage: false, items }
    },

    async getMedia(ctx, mediaId): Promise<Media> {
      const doc = parseHtml(await fetchHtml(ctx.fetch, `${BASE}/anime/${mediaId}`))
      return {
        id: `${sourceId}/${mediaId}`,
        mediaId,
        sourceId,
        type: 'anime',
        title: text(doc.querySelector<HTMLElement>('.anime-header-bar h1')) ?? 'Untitled',
        coverUrl: doc.querySelector<HTMLImageElement>('.poster-holder img.stupidPoster')?.getAttribute('src') ?? undefined,
        synopsis: text(doc.querySelector<HTMLElement>('.synopsis-box .desc')),
        status: mapStatusBox(doc.querySelector<HTMLElement>('.status-box')),
        tags: Array.from(doc.querySelectorAll<HTMLElement>('.genres-row .genre-tag'))
          .map((el) => el.textContent?.trim() ?? '')
          .filter(Boolean)
      }
    },

    async getEpisodes(ctx, mediaId): Promise<Episode[]> {
      const payload = await fetchJson<EpisodesApiResponse>(ctx.fetch, `${BASE}/anime/${mediaId}/data`, {
        headers: { accept: 'application/json' }
      })
      const episodes: Episode[] = []
      for (const item of payload.data?.episodes ?? []) {
        const number = item.number
        if (typeof number !== 'number' || !Number.isFinite(number)) continue
        const season =
          typeof item.season === 'number' && Number.isFinite(item.season) ? item.season : 1
        const label = item.name?.trim()
        episodes.push({
          id: `${sourceId}/${mediaId}/${season}x${number}`,
          mediaId,
          number,
          season,
          ...(label && label !== `Episódio ${number}` ? { title: label } : {}),
          lang: 'pt-br'
        })
      }
      return episodes
    },

    // video-only source: the unified Source type requires this method, but the
    // app only calls it for manga/novel media
    async getChapterContent(): Promise<ChapterContent> {
      throw new Error('subanimes provides video streams, not chapter content')
    },

    async getStreams(ctx, media, episode): Promise<StreamSource[]> {
      // episode pages live at /ep/<anime-slug>-<season>-episodio-<number>
      const season = episode.season ?? 1
      const pageUrl = `${BASE}/ep/${media.mediaId}-${season}-episodio-${episode.number}`
      const doc = parseHtml(await fetchHtml(ctx.fetch, pageUrl))
      const streams: StreamSource[] = []
      for (const variant of extractPlayerVariants(doc)) {
        // resolving the media playlist requires fetching the master first:
        // master.txt points at the real /m3/<token> URL
        let master: string
        try {
          const res = await ctx.fetch(`${HLS_HOST}/hls/${variant.data}/master.txt`)
          if (res.status < 200 || res.status >= 300) continue
          master = res.body
        } catch {
          continue // a dead variant must not sink the whole episode
        }
        const parsed = parseMasterPlaylist(master)
        if (!parsed) continue
        const quality = joinQuality(heightToQuality(parsed.height), variant.label)
        // The /m3/ manifest is served without `Access-Control-Allow-Origin`, so a
        // cross-origin browser HLS fetch (hls.js) is CORS-blocked and never starts.
        // Declaring request headers routes the stream through the app's network
        // loader (same mechanism animefire/comick use for referer-protected media)
        // so it can pull the manifest + CORS-enabled segments natively.
        streams.push({
          url: parsed.url,
          kind: 'hls',
          ...(quality ? { quality } : {}),
          headers: { Referer: `${BASE}/` }
        })
      }
      return streams
    },

    async getHomeSections(): Promise<HomeSection[]> {
      return [
        { id: 'lanca-hoje', title: 'Lança Hoje!' },
        { id: 'novos', title: 'Novos Animes' },
        { id: 'completos', title: 'Completos' },
        { id: 'populares', title: 'Populares' }
      ]
    },

    async getHomeSection(ctx, sectionId, page): Promise<SearchResults> {
      const sliderId = HOME_SECTION_SLIDERS[sectionId]
      if (!sliderId) throw new Error(`unknown homepage section: ${sectionId}`)
      // the sliders are homepage-only; there is no pagination behind them
      if (page > 1) return { page, hasNextPage: false, items: [] }
      const doc = parseHtml(await fetchHtml(ctx.fetch, `${BASE}/`))
      const items = Array.from(doc.querySelectorAll<HTMLAnchorElement>(`#${sliderId} a.homeSlider-item`)).map(mapSliderCard)
      return { page, hasNextPage: false, items }
    }
  }
}
