import type { ChapterContent, Episode, HomeSection, Media, SearchResults, Source, SourceContext } from '@woyomi/core'
import { fetchJson, jsonHeaders } from '@woyomi/core'

/**
 * Comick (multilingual manga aggregator), ported from the keiyoushi
 * `all/comicklive` Tachiyomi extension.
 *
 * The official API hosts have rotated over the years (api.comick.fun ->
 * api.comick.cc -> api.comick.io -> api.comick.dev) and the current official
 * ones sit behind aggressive Cloudflare challenges; the keiyoushi extension
 * therefore talks to a plain-HTTP mirror of the same API. `comick.art` is the
 * mirror verified working today (comick.live, the extension's first mirror, is
 * Cloudflare-challenged as of 2026-08). Everything below matches the shapes
 * that mirror serves, which are the shapes the Kotlin extension parses.
 *
 * NOTE on images: page files live on `cdn1.comicknew.pictures` and are NOT
 * hotlink-safe — a plain GET without `Referer: https://comick.art/` answers
 * 403 (Cloudflare). getChapterContent therefore declares that Referer via
 * the pages `headers` field (woyomi core >= 0.2.0); older hosts ignore it
 * and the reader falls back to direct loads (the Mihon extension solves
 * this the same way, via its client interceptor).
 *
 * NOTE on pacing: the upstream rate-limits bursts (HTTP 429 "too many
 * requests" from the CDN/app). The Kotlin client throttles to 1 request per
 * 2s; woyomi plugins rely on the runtime's throttled fetch instead.
 */

const BASE = 'https://comick.art'
const sourceId = 'comick'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const API = {
  /** cursor-paginated search; `q` is only accepted when >= 3 chars */
  search: () => `${BASE}/api/search`,
  /** 7-day most-followed list (single page) */
  top: () => `${BASE}/api/comics/top?days=7&type=follow`,
  /** recently updated comics, ~100 per page */
  latest: (page: number) => `${BASE}/api/chapters/latest?order=new&page=${page}`,
  /** comic detail page; JSON embedded in `<script id="comic-data">` */
  comicPage: (slug: string) => `${BASE}/comic/${slug}`,
  /** chapter list for a comic filtered to one translation language */
  chapterList: (slug: string, lang: string, page: number) =>
    `${BASE}/api/comics/${slug}/chapter-list?lang=${encodeURIComponent(lang)}&page=${page}`,
  /** reader page; JSON embedded in `<script id="sv-data">` */
  chapterPage: (slug: string, hid: string, chap: string, lang: string) =>
    `${BASE}/comic/${slug}/${hid}-chapter-${chap}-${lang}`
}

interface BrowseComic {
  slug: string
  title: string
  default_thumbnail?: string
}

interface SearchResponse {
  data?: BrowseComic[]
  next_cursor?: string | null
}

interface BrowseResponse {
  data?: BrowseComic[]
}

/** JSON embedded in the comic detail page (`#comic-data`). */
interface ComicData {
  title: string
  slug: string
  default_thumbnail?: string
  status?: number
  translation_completed?: boolean
  desc?: string
  country?: string
  md_comic_md_genres?: Array<{ md_genres?: { name?: string } }>
  /** object or array depending on payload; only the array form carries alt titles */
  md_titles?: Array<{ title?: string }> | Record<string, unknown>
}

interface ChapterListItem {
  hid: string
  chap: string | null
  vol: string | null
  lang: string
  title?: string | null
  created_at?: string
}

interface ChapterListResponse {
  data?: ChapterListItem[]
  pagination?: { current_page?: number; last_page?: number }
}

/** JSON embedded in the chapter reader page (`#sv-data`). */
interface SvData {
  chapter?: { images?: Array<{ url?: string }> }
}

function headers(): Record<string, string> {
  return jsonHeaders({ 'user-agent': BROWSER_UA, referer: `${BASE}/` })
}

/** HTML fetch with the same header set the JSON calls use. */
async function fetchPage(ctx: SourceContext, url: string): Promise<string> {
  const res = await ctx.fetch(url, { headers: headers() })
  if (res.status < 200 || res.status >= 300) throw new Error(`GET ${url} -> HTTP ${res.status}`)
  return res.body
}

/**
 * Pull the JSON payload out of `<script id="{id}">…</script>` — Comick embeds
 * its server-rendered data this way on both the detail and reader pages.
 */
function extractScriptJson<T>(html: string, id: string): T {
  const match = new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)</script>`, 'i').exec(html)
  const payload = match?.[1]
  if (payload === undefined) throw new Error(`script#${id} not found in HTML`)
  return JSON.parse(payload) as T
}

/** Comick numeric status: 1 ongoing, 2 completed, 3 cancelled, 4 hiatus. */
function mapStatus(raw: number | undefined): Media['status'] {
  switch (raw) {
    case 1:
      return 'ongoing'
    case 2:
      // the Kotlin extension reports "publishing finished" when translations
      // are still ongoing; woyomi has no such state, so treat 2 as completed
      return 'completed'
    case 3:
      return 'cancelled'
    case 4:
      return 'hiatus'
    default:
      return undefined
  }
}

/**
 * Origin tag from the country field. The Kotlin extension matches lowercase
 * language-style codes ("jp"/"ko"/"cn") but the mirror's embedded comic-data
 * sends ISO country codes ("KR"), so both conventions are accepted.
 */
function originTag(country: string | undefined): string | undefined {
  switch (country?.toLowerCase()) {
    case 'jp':
    case 'ja':
      return 'Manga'
    case 'ko':
    case 'kr':
      return 'Manhwa'
    case 'cn':
    case 'zh':
      return 'Manhua'
    default:
      return undefined
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

/** Strip the light HTML Comick puts in descriptions and collapse whitespace. */
function cleanSynopsis(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const text = decodeEntities(raw.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
  return text.length > 0 ? text : undefined
}

function altTitles(data: ComicData): string[] | undefined {
  if (!Array.isArray(data.md_titles)) return undefined
  const list = data.md_titles.map((t) => t.title?.trim()).filter((t): t is string => t !== undefined && t.length > 0)
  return list.length > 0 ? list : undefined
}

function mapBrowse(comic: BrowseComic): Media {
  return withCoverHeaders({
    id: `${sourceId}/${comic.slug}`,
    mediaId: comic.slug,
    sourceId,
    title: comic.title || comic.slug,
    type: 'manga',
    coverUrl: comic.default_thumbnail || undefined
  })
}

/**
 * Comick cover files live on `cdn1.comicknew.pictures` and 403 without
 * `Referer: https://comick.art/` (Cloudflare hotlink protection). Media.coverUrl
 * is otherwise just a URL with no way to carry request headers, so attach the
 * same undocumented `headers` the core/app image loader already reads on chapter
 * content — the host sends it when it loads the cover.
 */
function withCoverHeaders(media: Media): Media & { headers: Record<string, string> } {
  return { ...media, headers: { Referer: `${BASE}/` } }
}

/**
 * Cursor pagination state for `/api/search` (Laravel cursor paginator): page N
 * must send the `next_cursor` returned by page N-1 — there is no page-number
 * parameter. The UI pages sequentially, so one mutable slot keyed by query is
 * sufficient; the Kotlin extension keeps the same field on its source instance.
 */
let searchCursor: string | null = null
let searchKey = ''

/** Homepage discovery sections; each is a single cheap GET. */
const HOME_SECTIONS = [
  { id: 'popular', title: 'Popular' },
  { id: 'latest', title: 'Latest' }
] as const

export function makeComickSource(): Source {
  return {
    id: sourceId,
    name: 'Comick',
    mediaTypes: ['manga'],
    lang: 'multi',

    async search(ctx, query, page): Promise<SearchResults> {
      const trimmed = query.trim()
      // upstream rejects queries shorter than 3 characters
      if (trimmed.length > 0 && trimmed.length < 3) {
        return { page, hasNextPage: false, items: [] }
      }
      if (page === 1 || searchKey !== trimmed) {
        searchCursor = null
        searchKey = trimmed
      }
      const params = new URLSearchParams({ type: 'comic', showAll: 'false', exclude_mylist: 'false' })
      if (trimmed.length > 0) params.set('q', trimmed)
      if (page > 1 && searchCursor !== null) params.set('cursor', searchCursor)
      const json = await fetchJson<SearchResponse>(ctx.fetch, `${API.search()}?${params.toString()}`, {
        headers: headers()
      })
      searchCursor = json.next_cursor ?? null
      return {
        page,
        hasNextPage: json.next_cursor != null,
        items: (json.data ?? []).map(mapBrowse)
      }
    },

    async getMedia(ctx, mediaId): Promise<Media> {
      const html = await fetchPage(ctx, API.comicPage(mediaId))
      const data = extractScriptJson<ComicData>(html, 'comic-data')
      const tags: string[] = []
      const origin = originTag(data.country)
      if (origin) tags.push(origin)
      for (const genre of data.md_comic_md_genres ?? []) {
        const name = genre.md_genres?.name?.trim()
        if (name) tags.push(name)
      }
      return withCoverHeaders({
        id: `${sourceId}/${data.slug || mediaId}`,
        mediaId,
        sourceId,
        type: 'manga',
        title: data.title || mediaId,
        coverUrl: data.default_thumbnail || undefined,
        synopsis: cleanSynopsis(data.desc),
        status: mapStatus(data.status),
        altTitles: altTitles(data),
        tags: tags.length > 0 ? tags : undefined
      })
    },

    async getEpisodes(ctx, mediaId): Promise<Episode[]> {
      const lang = await ctx.preferences.getWithDefault('chapterLang', 'en')
      return ctx.cache.withCache(`comick:episodes:${mediaId}:${lang}`, 30 * 60_000, async () => {
        const seen = new Set<string>()
        const episodes: Episode[] = []
        // chapter-list pages hold 60 chapters; loop until the last page
        for (let page = 1; ; page++) {
          const json = await fetchJson<ChapterListResponse>(ctx.fetch, API.chapterList(mediaId, lang, page), {
            headers: headers()
          })
          const chunk = json.data ?? []
          for (const chapter of chunk) {
            const number = chapter.chap !== null ? Number(chapter.chap) : Number.NaN
            if (Number.isNaN(number)) continue
            // several groups usually release the same chapter; keep the first
            const dedupeKey = `${chapter.vol ?? ''}/${chapter.chap}`
            if (seen.has(dedupeKey)) continue
            seen.add(dedupeKey)
            episodes.push({
              // the reader URL needs hid + number + lang, so carry all three
              id: `${sourceId}/${mediaId}/${chapter.hid}:${chapter.chap}:${chapter.lang}`,
              mediaId,
              number,
              season: chapter.vol ? Number(chapter.vol) : undefined,
              title: chapter.title?.trim() || undefined,
              publishedAt: chapter.created_at,
              lang: chapter.lang
            })
          }
          const lastPage = json.pagination?.last_page ?? page
          if (chunk.length === 0 || page >= lastPage) break
        }
        return episodes.sort((a, b) => a.number - b.number)
      })
    },

    async getChapterContent(ctx, mediaId, episodeId): Promise<ChapterContent> {
      const tail = episodeId.split('/').pop() ?? episodeId
      const [hid, chap, lang] = tail.split(':')
      if (hid === undefined || chap === undefined || lang === undefined) {
        throw new Error(`malformed episode id: ${episodeId}`)
      }
      const html = await fetchPage(ctx, API.chapterPage(mediaId, hid, chap, lang))
      const sv = extractScriptJson<SvData>(html, 'sv-data')
      const images = (sv.chapter?.images ?? [])
        .map((image) => image.url)
        .filter((url): url is string => url !== undefined)
      // CDN images 403 without the site Referer; declared for the host's
      // image loader (pages `headers`, woyomi core >= 0.2.0 — structurally
      // assignable even against older core types).
      const content: ChapterContent & { headers?: Record<string, string> } = {
        type: 'pages',
        images,
        headers: { Referer: `${BASE}/` }
      }
      return content
    },

    async getHomeSections(_ctx): Promise<HomeSection[]> {
      return HOME_SECTIONS.map((section) => ({ id: section.id, title: section.title }))
    },

    async getHomeSection(ctx, sectionId, page): Promise<SearchResults> {
      if (sectionId === 'popular') {
        if (page > 1) return { page, hasNextPage: false, items: [] }
        const json = await ctx.cache.withCache('comick:home:popular', 10 * 60_000, () =>
          fetchJson<BrowseResponse>(ctx.fetch, API.top(), { headers: headers() })
        )
        return { page, hasNextPage: false, items: (json.data ?? []).map(mapBrowse) }
      }
      if (sectionId === 'latest') {
        const json = await fetchJson<BrowseResponse>(ctx.fetch, API.latest(page), { headers: headers() })
        const items = json.data ?? []
        return { page, hasNextPage: items.length === 100, items: items.map(mapBrowse) }
      }
      throw new Error(`unknown homepage section: ${sectionId}`)
    }
  }
}
