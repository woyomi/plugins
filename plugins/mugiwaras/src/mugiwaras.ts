import type { ChapterContent, Episode, HomeSection, Media, MediaStatus, SearchResults, Source } from '@woyomi/core'
import { fetchJson } from '@woyomi/core'

/**
 * Mugiwaras Oficial (mugiwarasoficial.com) is a Brazilian manga/manhwa/manhua
 * reader. The Next.js frontend is powered by an open Fastify JSON API at
 * app.mugiwarasoficial.com/v1/www, so this source consumes the API directly
 * instead of scraping Tailwind-class HTML.
 *
 * Notably, the website's chapter pages sit behind a shortener gate
 * (POST /v1/www/gate-token -> redenovax.com -> /gate/callback sets a
 * per-chapter `mnx_gate_<n>` cookie), but the API serves the page image list
 * with no gate at all. Images live on aurora.snipercache.com behind signed
 * URLs (`?sig=&exp=`) and need no Referer.
 */
const API = 'https://app.mugiwarasoficial.com/v1/www'
const sourceId = 'mugiwaras'

/** Highest chapter-list page count we will walk before giving up (defensive). */
const MAX_CHAPTER_PAGES = 50

interface WorkSummary {
  slug?: string
  title?: string
  coverUrl?: string
  /** Site-side type: "manga" | "manhwa" | "manhua" (all read like manga). */
  type?: string
  isAdult?: boolean
}

interface WorkDetail extends WorkSummary {
  altTitles?: string[]
  description?: string
  tags?: string[]
  /** ongoing | completed | cancelled (observed). */
  publicationStatus?: string
  chapterCount?: number
}

interface Chapter {
  id?: string
  /** Usually a number, but fractional chapters exist (e.g. 102.5). */
  number?: number | string
  title?: string
  publishedAt?: string
  isPreview?: boolean
}

interface ChapterListResponse {
  data?: Chapter[]
  meta?: { page?: number; limit?: number; total?: number; totalPages?: number }
}

interface PagesResponse {
  data?: { chapterId?: string; pages?: Array<{ index?: number; imageUrl?: string }> }
}

interface SearchResponse {
  data?: WorkSummary[]
  /** The search endpoint returns at most `limit` (8) items with no pagination. */
  meta?: { query?: string; limit?: number; count?: number }
}

interface HomeResponse {
  data?: Record<string, WorkSummary[] | unknown>
}

/** Public section ids -> the /home payload's camelCase keys. */
const HOME_SECTION_KEYS: Record<string, string> = {
  'recent-updates': 'recentUpdates',
  'most-read': 'mostRead',
  popular: 'popular'
}

const STATUS_MAP: Record<string, MediaStatus> = {
  ongoing: 'ongoing',
  completed: 'completed',
  hiatus: 'hiatus',
  cancelled: 'cancelled'
}

function mapStatus(publicationStatus: string | undefined): MediaStatus | undefined {
  return publicationStatus ? STATUS_MAP[publicationStatus] : undefined
}

/** "Capitulo 1189" is a generated placeholder, not a real chapter title. */
function isPlaceholderTitle(title: string | undefined, numberText: string): boolean {
  if (!title) return true
  return title.replace(/\s+/g, ' ').trim().toLowerCase() === `capitulo ${numberText}`.toLowerCase()
}

/** A work card in search results or a homepage section. */
function mapCard(w: WorkSummary): Media {
  const slug = w.slug ?? ''
  return {
    id: `${sourceId}/${slug}`,
    mediaId: slug,
    sourceId,
    title: w.title?.trim() || 'Untitled',
    // manga/manhwa/manhua are all page-based reading; woyomi models them as 'manga'
    type: 'manga',
    coverUrl: w.coverUrl ?? undefined
  }
}

function hasSlug(w: WorkSummary): w is WorkSummary & { slug: string } {
  return typeof w.slug === 'string' && w.slug.length > 0
}

/** Episode ids are `${sourceId}/${workSlug}/${chapterNumber}`. */
function parseEpisodeId(episodeId: string): { slug: string; number: string } {
  const parts = episodeId.split('/')
  const number = parts.pop()
  const slug = parts.pop()
  if (!slug || number === undefined) throw new Error(`malformed episode id: ${episodeId}`)
  return { slug, number }
}

export function makeMugiwarasSource(): Source {
  return {
    id: sourceId,
    name: 'Mugiwaras',
    mediaTypes: ['manga'],
    lang: 'pt-br',

    async search(ctx, query, page): Promise<SearchResults> {
      const res = await fetchJson<SearchResponse>(ctx.fetch, `${API}/search?q=${encodeURIComponent(query.trim())}`)
      const items = (res.data ?? []).filter(hasSlug).map(mapCard)
      // the endpoint caps results at meta.limit (8) and has no pagination
      return { page, hasNextPage: false, items }
    },

    async getMedia(ctx, mediaId): Promise<Media> {
      const w = await fetchJson<WorkDetail>(ctx.fetch, `${API}/works/${mediaId}`)
      const altTitles = (w.altTitles ?? []).map((t) => t.trim()).filter(Boolean)
      return {
        id: `${sourceId}/${mediaId}`,
        mediaId,
        sourceId,
        title: w.title?.trim() || 'Untitled',
        type: 'manga',
        coverUrl: w.coverUrl ?? undefined,
        synopsis: w.description?.trim() || undefined,
        status: mapStatus(w.publicationStatus),
        tags: w.tags && w.tags.length > 0 ? w.tags : undefined,
        altTitles: altTitles.length > 0 ? altTitles : undefined
      }
    },

    async getEpisodes(ctx, mediaId): Promise<Episode[]> {
      // The chapter list is newest-first and paged (50/page default); walk all pages.
      const chapters: Chapter[] = []
      let page = 1
      let totalPages = 1
      do {
        const res = await fetchJson<ChapterListResponse>(
          ctx.fetch,
          `${API}/works/${mediaId}/chapters?limit=100&page=${page}`
        )
        chapters.push(...(res.data ?? []))
        totalPages = Math.max(1, res.meta?.totalPages ?? 1)
        page++
      } while (page <= totalPages && page <= MAX_CHAPTER_PAGES)
      const episodes: Episode[] = []
      for (const ch of chapters) {
        if (ch.isPreview) continue
        const numberText = String(ch.number ?? '')
        const number = Number(numberText)
        if (numberText === '' || !Number.isFinite(number)) continue
        const title = isPlaceholderTitle(ch.title, numberText) ? undefined : ch.title?.trim()
        episodes.push({
          id: `${sourceId}/${mediaId}/${numberText}`,
          mediaId,
          number,
          ...(title ? { title } : {}),
          ...(ch.publishedAt ? { publishedAt: ch.publishedAt } : {}),
          lang: 'pt-br'
        })
      }
      // newest-first from the API; present ascending like other sources
      return episodes.sort((a, b) => a.number - b.number)
    },

    async getChapterContent(ctx, _mediaId, episodeId): Promise<ChapterContent> {
      const { slug, number } = parseEpisodeId(episodeId)
      const res = await fetchJson<PagesResponse>(ctx.fetch, `${API}/works/${slug}/chapters/${number}/pages`)
      const pages = (res.data?.pages ?? []).slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      const images = pages.map((p) => p.imageUrl).filter((u): u is string => typeof u === 'string' && u.length > 0)
      if (images.length === 0) throw new Error(`no pages found for ${slug} chapter ${number}`)
      return { type: 'pages', images }
    },

    async getHomeSections(): Promise<HomeSection[]> {
      return [
        { id: 'recent-updates', title: 'Últimas atualizações' },
        // most-read and popular are the same ranked list; expose one of them
        { id: 'most-read', title: 'Mais lidos no momento' }
      ]
    },

    async getHomeSection(ctx, sectionId, page): Promise<SearchResults> {
      if (page > 1) return { page, hasNextPage: false, items: [] }
      const payloadKey = HOME_SECTION_KEYS[sectionId]
      if (!payloadKey) throw new Error(`unknown homepage section: ${sectionId}`)
      const res = await fetchJson<HomeResponse>(ctx.fetch, `${API}/home`)
      const section = res.data?.[payloadKey]
      if (!Array.isArray(section)) throw new Error(`unknown homepage section: ${sectionId}`)
      const items = (section as WorkSummary[]).filter(hasSlug).map(mapCard)
      return { page, hasNextPage: false, items }
    }
  }
}
