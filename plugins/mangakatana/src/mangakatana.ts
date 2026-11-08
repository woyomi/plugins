import type { ChapterContent, Episode, Media, SearchResults, Source, SourceContext } from '@woyomi/core'

const BASE = 'https://mangakatana.com'
const sourceId = 'mangakatana'
const HEADERS = { accept: 'text/html,*/*', 'user-agent': 'Mozilla/5.0', referer: `${BASE}/` }
const SECTIONS = [{ id: 'latest', title: 'Latest' }, { id: 'directory', title: 'Directory (A–Z)' }]

function text(el: Element | null | undefined): string | undefined {
  return el?.textContent?.trim() || undefined
}

function httpUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value, BASE)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined
  } catch {
    return undefined
  }
}

function mangaPath(value: string | null): string[] | undefined {
  const href = httpUrl(value)
  if (!href) return undefined
  const url = new URL(href)
  if (url.origin !== BASE) return undefined
  const match = /^\/manga\/([\w.-]+)(?:\/([\w.-]+))?\/?$/.exec(url.pathname)
  return match ? match.slice(1) : undefined
}

async function load(ctx: SourceContext, path: string, cached = true): Promise<Document> {
  const url = `${BASE}${path}`
  const compute = async () => {
    const res = await ctx.fetch(url, { headers: HEADERS })
    if (res.status < 200 || res.status >= 300) throw new Error(`GET ${url} -> HTTP ${res.status}`)
    return res.body
  }
  const html = cached ? await ctx.cache.withCache(`${sourceId}:${url}`, 10 * 60_000, compute) : await compute()
  return new DOMParser().parseFromString(html, 'text/html')
}

function media(id: string, title: string, cover?: string): Media {
  return { id: `${sourceId}/${id}`, mediaId: id, sourceId, title, type: 'manga', coverUrl: cover, coverHeaders: { referer: `${BASE}/` } }
}

function detail(doc: Document, id: string): Media {
  const title = text(doc.querySelector('h1.heading'))
  if (!title) throw new Error(`media ${id} not found`)
  const status = text(doc.querySelector('.value.status'))?.toLowerCase()
  return {
    ...media(id, title, httpUrl(doc.querySelector('.media .cover img')?.getAttribute('src'))),
    status: status === 'ongoing' ? 'ongoing' : status === 'completed' ? 'completed' : undefined,
    synopsis: Array.from(doc.querySelectorAll('.summary > p')).map((p) => text(p)).filter(Boolean).join('\n\n') || undefined,
    altTitles: text(doc.querySelector('.alt_name'))?.split(';').map((s) => s.trim()).filter(Boolean),
    tags: Array.from(doc.querySelectorAll('.genres > a')).map((a) => text(a)!).filter(Boolean)
  }
}

async function browse(ctx: SourceContext, path: string, page: number): Promise<SearchResults> {
  const doc = await load(ctx, path)
  // A unique search match can redirect straight to the series page.
  if (doc.querySelector('h1.heading')) {
    const id = mangaPath(doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null)?.[0]
    if (!id) throw new Error('search redirect has no series URL')
    return { page, hasNextPage: false, items: [detail(doc, id)] }
  }
  const items: Media[] = []
  const seen = new Set<string>()
  for (const card of Array.from(doc.querySelectorAll('#book_list > .item'))) {
    const a = card.querySelector('.text > h3 > a')
    const id = mangaPath(a?.getAttribute('href') ?? null)?.[0]
    const title = text(a)
    if (!id || !title || seen.has(id)) continue
    seen.add(id)
    items.push(media(id, title, httpUrl(card.querySelector('img')?.getAttribute('src'))))
  }
  return { page, hasNextPage: doc.querySelector('a.next.page-numbers') !== null, items }
}

function chapterDate(raw?: string): string | undefined {
  const match = /^(\w{3})-(\d{1,2})-(\d{4})$/.exec(raw ?? '')
  if (!match) return undefined
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(match[1]!) + 1
  return month ? `${match[3]}-${String(month).padStart(2, '0')}-${match[2]!.padStart(2, '0')}` : undefined
}

function readerImages(doc: Document): string[] {
  for (const script of Array.from(doc.querySelectorAll('script'))) {
    const code = script.textContent ?? ''
    const name = /['"]data-src['"]\s*,\s*([\w$]+)\s*\[/.exec(code)?.[1]
    if (!name) continue
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const array = new RegExp(`(?:var|let|const)\\s+${escaped}\\s*=\\s*\\[([^\\]]*)\\]`).exec(code)?.[1]
    if (!array) continue
    // Read only URL string literals; never evaluate the site's JavaScript.
    return Array.from(array.matchAll(/'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"/g))
      .map((m) => httpUrl((m[1] ?? m[2] ?? '').replace(/\\([\\/'"])/g, '$1')))
      .filter((url): url is string => url !== undefined)
  }
  return []
}

export function makeMangakatanaSource(): Source {
  return {
    id: sourceId,
    name: 'MangaKatana',
    lang: 'en',
    mediaTypes: ['manga'],
    search: (ctx, query, page) => browse(ctx, `/page/${page}?search=${encodeURIComponent(query)}&search_by=book_name`, page),
    async getHomeSections() { return SECTIONS },
    async getHomeSection(ctx, sectionId, page) {
      if (!SECTIONS.some((s) => s.id === sectionId)) throw new Error(`unknown homepage section: ${sectionId}`)
      return browse(ctx, sectionId === 'latest' ? `/page/${page}` : `/manga/page/${page}`, page)
    },
    async getMedia(ctx, mediaId) {
      return detail(await load(ctx, `/manga/${encodeURIComponent(mediaId)}`), mediaId)
    },
    async getEpisodes(ctx, mediaId): Promise<Episode[]> {
      const doc = await load(ctx, `/manga/${encodeURIComponent(mediaId)}`)
      const links = Array.from(doc.querySelectorAll('.chapters .chapter a'))
      const seen = new Set<string>()
      const episodes: Episode[] = []
      for (const [index, a] of links.entries()) {
        const path = mangaPath(a.getAttribute('href'))
        const id = path?.[1]
        if (path?.[0] !== mediaId || !id || seen.has(id)) continue
        seen.add(id)
        const title = text(a) ?? `Chapter ${links.length - index}`
        const number = /chapter\s*(\d+(?:\.\d+)?)/i.exec(title)
        const volume = /vol\.?\s*(\d+)/i.exec(title)
        episodes.push({
          id: `${sourceId}/${mediaId}/${id}`, mediaId,
          number: number ? Number(number[1]) : links.length - index,
          season: volume ? Number(volume[1]) : undefined,
          title, lang: 'en',
          publishedAt: chapterDate(text(a.closest('tr')?.querySelector('.update_time')))
        })
      }
      return episodes.sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || a.number - b.number)
    },
    async getChapterContent(ctx, mediaId, episodeId): Promise<ChapterContent> {
      const chapter = episodeId.split('/').pop() ?? episodeId
      const images = readerImages(await load(ctx, `/manga/${encodeURIComponent(mediaId)}/${encodeURIComponent(chapter)}`, false))
      if (!images.length) throw new Error(`chapter ${chapter} has no reader images`)
      return { type: 'pages', images, headers: { referer: `${BASE}/` } }
    }
  }
}
