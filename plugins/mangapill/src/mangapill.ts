import type { ChapterContent, Episode, Media, SearchResults, Source, SourceContext } from '@woyomi/core'

const BASE = 'https://mangapill.com'
const sourceId = 'mangapill'
const HEADERS = { accept: 'text/html,*/*', 'user-agent': 'Mozilla/5.0', referer: `${BASE}/` }
const SECTIONS = [{ id: 'latest', title: 'Latest' }, { id: 'trending', title: 'Trending' }]

function text(el: Element | null | undefined): string | undefined {
  return el?.textContent?.trim() || undefined
}

function httpUrl(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined
  try {
    const url = new URL(raw, BASE)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined
  } catch { return undefined }
}

function linkedId(raw: string | null, kind: 'manga' | 'chapters'): string | undefined {
  const href = httpUrl(raw)
  if (!href) return undefined
  const url = new URL(href)
  if (url.origin !== BASE) return undefined
  return new RegExp(`^/${kind}/(${kind === 'manga' ? '\\d+' : '\\d+-\\d+'})(?:/|$)`).exec(url.pathname)?.[1]
}

function image(el: Element | null): string | undefined {
  return httpUrl(el?.getAttribute('data-src') || el?.getAttribute('src'))
}

async function load(ctx: SourceContext, path: string, cached = true): Promise<Document> {
  const compute = async () => {
    const res = await ctx.fetch(`${BASE}${path}`, { headers: HEADERS })
    if (res.status < 200 || res.status >= 300) throw new Error(`GET ${BASE}${path} -> HTTP ${res.status}`)
    return res.body
  }
  const html = cached ? await ctx.cache.withCache(`${sourceId}:${path}`, 10 * 60_000, compute) : await compute()
  return new DOMParser().parseFromString(html, 'text/html')
}

function media(id: string, title: string, coverUrl?: string): Media {
  return { id: `${sourceId}/${id}`, mediaId: id, sourceId, type: 'manga', title, coverUrl, coverHeaders: { referer: `${BASE}/` } }
}

function cards(root: ParentNode): Media[] {
  const items: Media[] = []
  const seen = new Set<string>()
  for (const card of Array.from(root.querySelectorAll('.grid > div:not([class])'))) {
    const a = card.querySelector('a[href*="/manga/"]')
    const id = linkedId(a?.getAttribute('href') ?? null, 'manga')
    const title = text(card.querySelector('.line-clamp-2'))
    if (!id || !title || seen.has(id)) continue
    seen.add(id)
    items.push(media(id, title, image(card.querySelector('img'))))
  }
  return items
}

export function makeMangapillSource(): Source {
  return {
    id: sourceId, name: 'MangaPill', lang: 'en', mediaTypes: ['manga'],
    async search(ctx, query, page): Promise<SearchResults> {
      const doc = await load(ctx, `/search?q=${encodeURIComponent(query)}&page=${page}`)
      const hasNextPage = Array.from(doc.querySelectorAll('a[href]')).some((a) => {
        const url = httpUrl(a.getAttribute('href'))
        if (!url) return false
        const next = new URL(url)
        return next.origin === BASE && next.pathname === '/search' && Number(next.searchParams.get('page')) === page + 1
      })
      return { page, hasNextPage, items: cards(doc) }
    },
    async getHomeSections() { return SECTIONS },
    async getHomeSection(ctx, sectionId, page): Promise<SearchResults> {
      if (!SECTIONS.some((s) => s.id === sectionId)) throw new Error(`unknown homepage section: ${sectionId}`)
      if (page > 1) return { page, hasNextPage: false, items: [] }
      const doc = await load(ctx, sectionId === 'latest' ? '/chapters' : '/')
      const heading = Array.from(doc.querySelectorAll('h4')).find((h) => /trending/i.test(text(h) ?? ''))
      let trending = heading?.parentElement
      while (trending && !trending.querySelector('.grid')) trending = trending.parentElement
      return { page, hasNextPage: false, items: sectionId === 'latest' ? cards(doc) : trending ? cards(trending) : [] }
    },
    async getMedia(ctx, mediaId): Promise<Media> {
      const doc = await load(ctx, `/manga/${encodeURIComponent(mediaId)}`)
      const h1 = doc.querySelector('h1')
      const title = text(h1)
      if (!title) throw new Error(`media ${mediaId} not found`)
      const details = h1?.parentElement?.parentElement
      const statusLabel = Array.from(details?.querySelectorAll('label') ?? []).find((label) => text(label)?.toLowerCase() === 'status')
      const status = text(statusLabel?.parentElement?.querySelector('div'))?.toLowerCase()
      return {
        ...media(mediaId, title, image(details?.parentElement?.querySelector('img') ?? null)),
        synopsis: text(details?.querySelector('p')),
        status: status === 'publishing' ? 'ongoing' : status === 'finished' ? 'completed' : undefined,
        tags: Array.from(details?.querySelectorAll('a[href*="genre="]') ?? []).map((a) => text(a)!).filter(Boolean)
      }
    },
    async getEpisodes(ctx, mediaId): Promise<Episode[]> {
      const doc = await load(ctx, `/manga/${encodeURIComponent(mediaId)}`)
      const seen = new Set<string>()
      const links = Array.from(doc.querySelectorAll('#chapters > div > a[href]'))
      const episodes: Episode[] = []
      for (const [index, a] of links.entries()) {
        const id = linkedId(a.getAttribute('href'), 'chapters')
        if (!id || !id.startsWith(`${mediaId}-`) || seen.has(id)) continue
        seen.add(id)
        const title = text(a) ?? `Chapter ${links.length - index}`
        const number = /chapter\s*(\d+(?:\.\d+)?)/i.exec(title)?.[1]
        episodes.push({ id: `${sourceId}/${mediaId}/${id}`, mediaId, title, number: number ? Number(number) : links.length - index, lang: 'en' })
      }
      return episodes.sort((a, b) => a.number - b.number)
    },
    async getChapterContent(ctx, _mediaId, episodeId): Promise<ChapterContent> {
      const id = episodeId.split('/').pop() ?? episodeId
      const doc = await load(ctx, `/chapters/${encodeURIComponent(id)}`, false)
      const images = Array.from(doc.querySelectorAll('picture img')).map(image).filter((url): url is string => url !== undefined)
      if (!images.length) throw new Error(`chapter ${id} has no reader images`)
      return { type: 'pages', images, headers: { referer: `${BASE}/` } }
    }
  }
}
