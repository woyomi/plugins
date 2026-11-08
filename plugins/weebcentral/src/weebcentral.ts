import type { ChapterContent, Episode, Media, SearchResults, Source, SourceContext } from '@woyomi/core'

const BASE = 'https://weebcentral.com'
const sourceId = 'weebcentral'
const HEADERS = { accept: 'text/html,*/*', 'user-agent': 'Mozilla/5.0', referer: `${BASE}/` }
const SECTIONS = [
  { id: 'latest', title: 'Latest', sort: 'Latest Updates' },
  { id: 'popular', title: 'Popular', sort: 'Popularity' }
] as const

// HTML fragment endpoints verified against the live site; see ../README.md.
// Requests use the runtime's throttled fetch, never a separate network client.
async function fetchDocument(ctx: SourceContext, url: string): Promise<Document> {
  const res = await ctx.fetch(url, { headers: HEADERS })
  if (res.status < 200 || res.status >= 300) throw new Error(`GET ${url} -> HTTP ${res.status}`)
  return new DOMParser().parseFromString(res.body, 'text/html')
}

function text(el: Element | null | undefined): string | undefined {
  return el?.textContent?.trim() || undefined
}

function httpUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value, BASE)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined
  } catch {
    return undefined
  }
}

function linkedId(href: string | null, kind: 'series' | 'chapters'): string | undefined {
  const url = httpUrl(href)
  if (!url || new URL(url).origin !== BASE) return undefined
  return new RegExp(`^/${kind}/([a-zA-Z0-9]+)(?:/|$)`).exec(new URL(url).pathname)?.[1]
}

function cover(el: Element): string | undefined {
  const srcset = el.querySelector('source')?.getAttribute('srcset')
  const src = srcset?.split(',')[0]?.trim().split(/\s+/)[0]
  return httpUrl(src?.replace('/cover/small/', '/cover/normal/') ?? el.querySelector('img')?.getAttribute('src'))
}

function media(mediaId: string, title: string): Media {
  return { id: `${sourceId}/${mediaId}`, mediaId, sourceId, title, type: 'manga' }
}

function mapStatus(value?: string): Media['status'] {
  switch (value?.toLowerCase()) {
    case 'ongoing': return 'ongoing'
    case 'complete': return 'completed'
    case 'hiatus': return 'hiatus'
    case 'canceled': return 'cancelled'
    default: return undefined
  }
}

async function browse(ctx: SourceContext, query: string, page: number, sort: string): Promise<SearchResults> {
  const params = new URLSearchParams({
    text: query.replace(/[!#:(),-]/g, ' ').trim(),
    sort,
    order: 'Descending',
    limit: '32',
    offset: String((page - 1) * 32),
    display_mode: 'Full Display'
  })
  return ctx.cache.withCache(`${sourceId}:browse:${params}`, 10 * 60_000, async () => {
    const doc = await fetchDocument(ctx, `${BASE}/search/data?${params}`)
    const items: Media[] = []
    const seen = new Set<string>()
    for (const a of Array.from(doc.querySelectorAll('article > section > a[href]'))) {
      const id = linkedId(a.getAttribute('href'), 'series')
      const title = text(a.querySelector('div.text-ellipsis')) ?? text(a.querySelector('div:not([class]):last-child'))
      if (!id || !title || seen.has(id)) continue
      seen.add(id)
      items.push({ ...media(id, title), coverUrl: cover(a) })
    }
    return { page, hasNextPage: doc.querySelector('button[hx-get]') !== null, items }
  })
}

export function makeWeebcentralSource(): Source {
  return {
    id: sourceId,
    name: 'Weeb Central',
    mediaTypes: ['manga'],
    lang: 'en',

    search: (ctx, query, page) => browse(ctx, query, page, 'Best Match'),

    async getHomeSections() {
      return SECTIONS.map(({ id, title }) => ({ id, title }))
    },

    async getHomeSection(ctx, sectionId, page) {
      const section = SECTIONS.find((s) => s.id === sectionId)
      if (!section) throw new Error(`unknown homepage section: ${sectionId}`)
      return browse(ctx, '', page, section.sort)
    },

    async getMedia(ctx, mediaId): Promise<Media> {
      const doc = await fetchDocument(ctx, `${BASE}/series/${encodeURIComponent(mediaId)}`)
      const title = text(doc.querySelector('main h1'))
      if (!title) throw new Error(`media ${mediaId} not found`)
      const info = Array.from(doc.querySelectorAll('main li'))
      const field = (label: string) => info.find((li) => text(li.querySelector('strong'))?.startsWith(label))
      return {
        ...media(mediaId, title),
        coverUrl: cover(doc.querySelector('main')!),
        status: mapStatus(text(doc.querySelector('main a[href*="included_status="]'))),
        synopsis: text(field('Description')?.querySelector('p')),
        altTitles: Array.from(field('Associated Name')?.querySelectorAll('ul > li') ?? []).map((li) => text(li)!).filter(Boolean),
        tags: Array.from(doc.querySelectorAll('main a[href*="included_tag="], main a[href*="included_type="]')).map((a) => text(a)!).filter(Boolean)
      }
    },

    async getEpisodes(ctx, mediaId): Promise<Episode[]> {
      return ctx.cache.withCache(`${sourceId}:episodes:${mediaId}`, 10 * 60_000, async () => {
        const doc = await fetchDocument(ctx, `${BASE}/series/${encodeURIComponent(mediaId)}/full-chapter-list`)
        const links = Array.from(doc.querySelectorAll('div[x-data] > a[href]'))
        const seen = new Set<string>()
        const episodes: Episode[] = []
        for (const [index, a] of links.entries()) {
          const id = linkedId(a.getAttribute('href'), 'chapters')
          if (!id || seen.has(id)) continue
          seen.add(id)
          const title = text(a.querySelector('span.flex > span')) ?? `Chapter ${links.length - index}`
          const chapter = /(?:chapter|ch\.?)\s*(\d+(?:\.\d+)?)/i.exec(title)
          const season = /(?:season|s)\s*(\d+)/i.exec(title)
          episodes.push({
            id: `${sourceId}/${mediaId}/${id}`,
            mediaId,
            number: chapter ? Number(chapter[1]) : links.length - index,
            season: season ? Number(season[1]) : undefined,
            title,
            publishedAt: a.querySelector('time')?.getAttribute('datetime') ?? undefined,
            lang: 'en'
          })
        }
        return episodes.sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || a.number - b.number)
      })
    },

    async getChapterContent(ctx, _mediaId, episodeId): Promise<ChapterContent> {
      const id = episodeId.split('/').pop() ?? episodeId
      const doc = await fetchDocument(ctx, `${BASE}/chapters/${encodeURIComponent(id)}/images?is_prev=False&reading_style=long_strip`)
      const images = Array.from(doc.querySelectorAll('section[x-data*="scroll"] > img[src]'))
        .map((img) => httpUrl(img.getAttribute('src')))
        .filter((url): url is string => url !== undefined)
      if (!images.length) throw new Error(`chapter ${id} has no reader images`)
      return { type: 'pages', images, headers: { referer: `${BASE}/` } }
    }
  }
}
