import type { ChapterContent, Episode, HomeSection, Media, SearchResults, Source, StreamSource } from '@woyomi/core'
import { fetchJson } from '@woyomi/core'

const BASE = 'https://animefire.one'
const API = 'https://api.animefire.one'
const sourceId = 'animefire'

interface AnimeListItem {
  id: string
  title: string
  audio?: string
  poster_src?: string
  poster_srcset?: string
  status?: string
  published_at?: string
  last_episode_at?: string
  most_liked?: boolean
}

interface SearchMeta {
  current_page: number
  last_page: number
  total?: number
  per_page?: number
}

interface SearchResponse {
  data: AnimeListItem[]
  meta: SearchMeta
}

interface ApiEpisode {
  id: string
  title?: string | null
  audio?: string | null
  season?: number | null
  number: number
  still_src?: string | null
  synopsis?: string | null
}

interface AnimeDetail {
  format?: string
  hero: {
    id: string
    titles: Record<string, string>
    synopsis?: string
    poster_src?: string
    status?: string
    audio?: string
    genres?: string[]
  }
  seasons?: Array<{ title?: string | null; number: number; first_episode_number?: number }>
  episodes: ApiEpisode[]
}

interface AnimeDetailResponse {
  data: AnimeDetail
}

interface ApiStream {
  audio?: string
  url?: string
  qualities?: string[]
}

interface EpisodeDetailResponse {
  data: {
    id: string
    streams?: ApiStream[]
  }
}

interface HomeCarousel {
  key: string
  title: string
  sub?: string
  items: AnimeListItem[]
}

interface HomeResponse {
  data: {
    carousels: HomeCarousel[]
    hero?: { items?: unknown[] }
  }
}

/** `new-episodes` lists episodes, not anime — it can't back Media sections. */
const EPISODE_ONLY_CAROUSELS = new Set(['new-episodes'])

/** A card from the JSON listing endpoints (`/animes/pesquisar`, `/home`). */
function mapListItem(item: AnimeListItem): Media {
  return {
    id: `${sourceId}/${item.id}`,
    mediaId: item.id,
    sourceId,
    title: item.title?.trim() || 'Untitled',
    type: 'anime',
    coverUrl: item.poster_src || undefined
  }
}

function mapStatus(label: string | undefined): Media['status'] {
  if (!label) return undefined
  const s = label.toLowerCase()
  if (s === 'completed' || /completo/i.test(label)) return 'completed'
  if (s === 'airing' || /lança/i.test(label)) return 'ongoing'
  return undefined
}

function primaryTitle(titles: Record<string, string> | undefined): string {
  if (!titles) return 'Untitled'
  return titles.BR ?? titles.JP ?? titles.US ?? Object.values(titles)[0] ?? 'Untitled'
}

function altTitles(titles: Record<string, string> | undefined, primary: string): string[] | undefined {
  if (!titles) return undefined
  const alts = Object.values(titles).filter((t) => t && t !== primary)
  const unique = [...new Set(alts.map((t) => t.trim()).filter(Boolean))]
  return unique.length > 0 ? unique : undefined
}

/** pick the highest-quality stream first (data order is not guaranteed). */
function qualityScore(label: string | undefined): number {
  const s = label ?? ''
  const m = /(\d{3,4})\s*p/i.exec(s)?.[1]
  if (m) {
    const h = Number.parseInt(m, 10)
    if (h >= 1080) return 3
    if (h >= 720) return 2
    if (h >= 240) return 1
  }
  if (/1080|fhd|full/i.test(s)) return 3
  if (/720|hd/i.test(s)) return 2
  if (/sd|360|480|240/i.test(s)) return 1
  return 0
}

function titleCaseAudio(raw: string | undefined): string {
  const clean = (raw ?? '').trim()
  if (!clean) return ''
  return clean
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (word === '&' ? '&' : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ')
}

function bestQuality(qualities: string[] | undefined): string | undefined {
  if (!qualities || qualities.length === 0) return undefined
  return [...qualities].sort((a, b) => qualityScore(b) - qualityScore(a))[0]
}

export function makeAnimefireSource(): Source {
  return {
    id: sourceId,
    name: 'AnimeFire',
    mediaTypes: ['anime'],
    lang: 'pt-br',

    async search(ctx, query, page): Promise<SearchResults> {
      const term = query.trim()
      if (!term) return { page, hasNextPage: false, items: [] }
      const payload = await fetchJson<SearchResponse>(
        ctx.fetch,
        `${API}/animes/pesquisar?q=${encodeURIComponent(term)}&page=${page}`
      )
      const items = (payload.data ?? []).map(mapListItem)
      const meta = payload.meta
      return { page, hasNextPage: meta ? meta.current_page < meta.last_page : false, items }
    },

    async getMedia(ctx, mediaId): Promise<Media> {
      const payload = await fetchJson<AnimeDetailResponse>(ctx.fetch, `${API}/anime/${mediaId}`)
      const hero = payload.data.hero
      const title = primaryTitle(hero.titles)
      return {
        id: `${sourceId}/${mediaId}`,
        mediaId,
        sourceId,
        type: 'anime',
        title,
        ...(altTitles(hero.titles, title) ? { altTitles: altTitles(hero.titles, title) } : {}),
        coverUrl: hero.poster_src || undefined,
        synopsis: hero.synopsis || undefined,
        status: mapStatus(hero.status),
        tags: (hero.genres ?? []).map((g) => g.trim()).filter(Boolean)
      }
    },

    async getEpisodes(ctx, mediaId): Promise<Episode[]> {
      const payload = await fetchJson<AnimeDetailResponse>(ctx.fetch, `${API}/anime/${mediaId}`)
      const episodes: Episode[] = []
      for (const ep of payload.data.episodes ?? []) {
        if (!ep?.id || typeof ep.number !== 'number' || !Number.isFinite(ep.number)) continue
        const title = ep.title?.trim()
        episodes.push({
          // Episode ids are opaque (`WCrJufyJmQn`); they cannot be rebuilt from
          // mediaId + number, so keep the full `mediaId/episodeId` id.
          id: `${sourceId}/${mediaId}/${ep.id}`,
          mediaId,
          number: ep.number,
          ...(typeof ep.season === 'number' && Number.isFinite(ep.season) ? { season: ep.season } : {}),
          ...(title ? { title } : {}),
          ...(ep.still_src ? { imageUrl: ep.still_src } : {}),
          lang: 'pt-br'
        })
      }
      return episodes
    },

    // video-only source: the unified Source type requires this method, but the
    // app only calls it for manga/novel media
    async getChapterContent(): Promise<ChapterContent> {
      throw new Error('animefire provides video streams, not chapter content')
    },

    async getStreams(ctx, _media, episode): Promise<StreamSource[]> {
      // Episode ids are `${sourceId}/${mediaId}/${episodeId}`; the API wants the trailing opaque id.
      const episodeId = episode.id.split('/').pop() ?? ''
      if (!episodeId) throw new Error('animefire: invalid episode id')
      const payload = await fetchJson<EpisodeDetailResponse>(ctx.fetch, `${API}/episode/${episodeId}`)
      const apiStreams = payload.data.streams ?? []
      const streams: StreamSource[] = []
      for (const s of apiStreams) {
        if (!s.url) continue
        // Audio is a separate HLS master per version; declare it structurally so
        // the host builds an audio menu instead of parsing the quality label.
        const audio = titleCaseAudio(s.audio)
        const quality = bestQuality(s.qualities)
        streams.push({
          url: s.url,
          // akumast.net serves HLS master playlists (multi-variant, fMP4
          // segments); verified `application/vnd.apple.mpegurl` live.
          kind: 'hls' as const,
          ...(quality ? { quality } : {}),
          ...(audio ? { audio } : {}),
          // akumast.net gates manifests + segments on the site origin
          headers: { Referer: `${BASE}/` }
        })
      }
      if (streams.length === 0) throw new Error(`animefire: no playable streams found for episode ${episodeId}`)
      return streams.sort((a, b) => qualityScore(b.quality) - qualityScore(a.quality))
    },

    async getHomeSections(ctx): Promise<HomeSection[]> {
      const payload = await fetchJson<HomeResponse>(ctx.fetch, `${API}/home`)
      return (payload.data.carousels ?? [])
        .filter((c) => !EPISODE_ONLY_CAROUSELS.has(c.key))
        .map((c) => ({ id: c.key, title: c.title }))
    },

    async getHomeSection(ctx, sectionId, page): Promise<SearchResults> {
      // The carousels live behind a single `/home` call; there is no per-section pagination.
      if (page > 1) return { page, hasNextPage: false, items: [] }
      const payload = await fetchJson<HomeResponse>(ctx.fetch, `${API}/home`)
      const carousel = (payload.data.carousels ?? []).find((c) => c.key === sectionId)
      if (!carousel || EPISODE_ONLY_CAROUSELS.has(carousel.key)) throw new Error(`unknown homepage section: ${sectionId}`)
      return { page, hasNextPage: false, items: (carousel.items ?? []).map(mapListItem) }
    }
  }
}
