import type { ChapterContent, Episode, Media, SearchResults, Source, SourceContext } from '@woyomi/core'

const BASE = 'https://fliptru.com.br'
const sourceId = 'fliptru'
const HEADERS = { accept: 'text/html,application/json,*/*', 'user-agent': 'Mozilla/5.0', referer: `${BASE}/` }
const SECTIONS = [{ id: 'latest', title: 'Recentes' }, { id: 'popular', title: 'Populares' }]

interface ComicLd { '@type'?: string; name?: string; image?: string; description?: string; genre?: string }
interface SearchItem { label: string; url: string }

function text(el: Element | null | undefined): string | undefined { return el?.textContent?.trim() || undefined }

function httpUrl(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined
  try {
    const url = new URL(raw, BASE)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined
  } catch { return undefined }
}

function comicPath(raw: string | null): { id: string; chapter?: string } | undefined {
  const href = httpUrl(raw)
  if (!href) return undefined
  const url = new URL(href)
  if (url.origin !== BASE) return undefined
  const match = /^\/comic\/([\w-]+)(?:\/([\w.-]+))?\/?$/.exec(url.pathname)
  return match ? { id: match[1]!, chapter: match[2] } : undefined
}

async function fetchBody(ctx: SourceContext, path: string): Promise<string> {
  const res = await ctx.fetch(`${BASE}${path}`, { headers: HEADERS })
  if (res.status < 200 || res.status >= 300) throw new Error(`GET ${BASE}${path} -> HTTP ${res.status}`)
  return res.body
}

async function load(ctx: SourceContext, path: string, cached = true): Promise<Document> {
  const body = cached ? await ctx.cache.withCache(`${sourceId}:${path}`, 10 * 60_000, () => fetchBody(ctx, path)) : await fetchBody(ctx, path)
  return new DOMParser().parseFromString(body, 'text/html')
}

function media(id: string, title: string, coverUrl?: string): Media {
  return { id: `${sourceId}/${id}`, sourceId, mediaId: id, title, type: 'manga', coverUrl, coverHeaders: { referer: `${BASE}/` } }
}

function cards(doc: Document): Media[] {
  const items: Media[] = []
  const seen = new Set<string>()
  for (const a of Array.from(doc.querySelectorAll('a.comic-card[href]'))) {
    const path = comicPath(a.getAttribute('href'))
    const title = a.getAttribute('data-title')?.trim() || text(a.querySelector('h3'))
    if (!path || path.chapter || !title || seen.has(path.id)) continue
    seen.add(path.id)
    const cover = /url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/.exec(a.getAttribute('style') ?? '')?.[1]
    items.push(media(path.id, title, httpUrl(cover)))
  }
  return items
}

async function browse(ctx: SourceContext, path: string, page: number): Promise<SearchResults> {
  const doc = await load(ctx, path)
  return { page, hasNextPage: doc.querySelector('#loadMoreComics a') !== null, items: cards(doc) }
}

export function makeFliptruSource(): Source {
  return {
    id: sourceId, name: 'Fliptru', lang: 'pt-br', mediaTypes: ['manga'],
    async search(ctx, query, page): Promise<SearchResults> {
      if (!query.trim()) return browse(ctx, `/comics/all?page=${page}`, page)
      if (page > 1) return { page, hasNextPage: false, items: [] }
      const raw = await ctx.cache.withCache(`${sourceId}:search:${query}`, 10 * 60_000, () => fetchBody(ctx, `/search/?term=${encodeURIComponent(query)}`))
      const results = JSON.parse(raw) as SearchItem[]
      const seen = new Set<string>()
      const items: Media[] = []
      for (const result of results) {
        const path = comicPath(result.url)
        const title = result.label.split(' - @')[0]?.trim()
        if (!path || (path.chapter && path.chapter !== 'info') || !title || seen.has(path.id)) continue
        seen.add(path.id)
        items.push(media(path.id, title))
      }
      return { page, hasNextPage: false, items }
    },
    async getHomeSections() { return SECTIONS },
    async getHomeSection(ctx, sectionId, page): Promise<SearchResults> {
      if (!SECTIONS.some((s) => s.id === sectionId)) throw new Error(`unknown homepage section: ${sectionId}`)
      if (sectionId === 'popular') {
        if (page > 1) return { page, hasNextPage: false, items: [] }
        return { page, hasNextPage: false, items: cards(await load(ctx, '/most_popular_list/')) }
      }
      return browse(ctx, `/comics/all?page=${page}`, page)
    },
    async getMedia(ctx, mediaId): Promise<Media> {
      const doc = await load(ctx, `/comic/${encodeURIComponent(mediaId)}`)
      let ld: ComicLd | undefined
      for (const script of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
        try {
          const data = JSON.parse(script.textContent ?? '') as ComicLd
          if (data?.['@type'] === 'ComicSeries') { ld = data; break }
        } catch { /* Unrelated malformed structured data must not hide the comic. */ }
      }
      const title = ld?.name?.trim() || text(doc.querySelector('h1'))
      if (!title) throw new Error(`media ${mediaId} not found`)
      return {
        ...media(mediaId, title, httpUrl(ld?.image || doc.querySelector('meta[property="og:image"]')?.getAttribute('content'))),
        synopsis: ld?.description?.trim() || doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || undefined,
        tags: ld?.genre ? [ld.genre] : []
      }
    },
    async getEpisodes(ctx, mediaId): Promise<Episode[]> {
      return ctx.cache.withCache(`${sourceId}:episodes:${mediaId}`, 10 * 60_000, async () => {
        const chapterPath = `/comic/${encodeURIComponent(mediaId)}/chapters`
        let path: string | undefined = `${chapterPath}?order=asc`
        const visited = new Set<string>()
        const seen = new Set<string>()
        const episodes: Episode[] = []
        while (path) {
          if (visited.has(path)) throw new Error('Fliptru chapter pagination repeated a page')
          visited.add(path)
          const doc = await load(ctx, path)
          for (const a of Array.from(doc.querySelectorAll('.chapter-list-item a[href]'))) {
            const linked = comicPath(a.getAttribute('href'))
            const id = linked?.chapter
            if (!id || linked?.id !== mediaId || ['info', 'chapters'].includes(id) || seen.has(id)) continue
            seen.add(id)
            episodes.push({ id: `${sourceId}/${mediaId}/${id}`, mediaId, number: /^\d+(?:\.\d+)?$/.test(id) ? Number(id) : episodes.length + 1, title: text(a), lang: 'pt-br' })
          }
          const next = doc.querySelector('#chapters-load-more a')?.getAttribute('data-url')
          path = undefined
          if (next) {
            const href = httpUrl(next)
            const url = href ? new URL(href) : undefined
            if (!url || url.origin !== BASE || url.pathname !== chapterPath) throw new Error('Fliptru returned an invalid chapter pagination URL')
            path = `${url.pathname}${url.search}`
          }
        }
        return episodes.sort((a, b) => a.number - b.number)
      })
    },
    async getChapterContent(ctx, mediaId, episodeId): Promise<ChapterContent> {
      const id = episodeId.split('/').pop() ?? episodeId
      const doc = await load(ctx, `/comic/${encodeURIComponent(mediaId)}/${encodeURIComponent(id)}`, false)
      // The live site now uses hyphens; older chapters used underscores.
      const images = [...new Set(Array.from(doc.querySelectorAll('.comic-page-image img, .comic_page_image img'))
        .map((img) => httpUrl(img.getAttribute('data-src') || img.getAttribute('src'))).filter((url): url is string => url !== undefined))]
      if (!images.length) throw new Error(`chapter ${id} has no reader images (it may require login)`)
      return { type: 'pages', images, headers: { referer: `${BASE}/` } }
    }
  }
}
