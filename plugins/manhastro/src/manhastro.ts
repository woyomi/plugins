import type { ChapterContent, Episode, Media, SearchResults, Source, SourceContext } from '@woyomi/core'

const API = 'https://api2.manhastro.net'
const BASE = 'https://manhastro.net'
const sourceId = 'manhastro'
const HEADERS = { accept: 'application/json', 'user-agent': 'Mozilla/5.0', referer: `${BASE}/` }
const SECTIONS = [{ id: 'latest', title: 'Últimas atualizações' }, { id: 'popular', title: 'Populares do dia' }]

interface Manga {
  manga_id: number
  titulo: string
  titulo_brasil?: string | null
  titulo_alternative?: string[] | null
  descricao?: string | null
  descricao_brasil?: string | null
  imagem?: string | null
  generos?: string[]
  status?: string
}

interface Chapter {
  capitulo_id: number
  capitulo_nome: string
  capitulo_data?: string
}

interface Response<T> {
  success?: boolean
  data: T
  meta?: { has_more?: boolean }
}

interface Pages {
  chapter?: { baseUrl: string; hash: string; data: string[] } | null
}

async function request<T>(ctx: SourceContext, path: string): Promise<Response<T>> {
  const url = `${API}${path}`
  const res = await ctx.fetch(url, { headers: HEADERS })
  if (res.status < 200 || res.status >= 300) throw new Error(`GET ${url} -> HTTP ${res.status}`)
  // Some API responses carry a BOM or an anti-XSSI prefix.
  const body = res.body.replace(/^\uFEFF/, '').trimStart().replace(/^\)\]\}'[,\s]*/, '').replace(/^[,_]\s*/, '')
  const json = JSON.parse(body) as Response<T>
  if (json.success === false || json.data == null) throw new Error('Manhastro API returned no data')
  return json
}

function imageUrl(value?: string | null): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value.startsWith('//') ? `https:${value}` : /^[a-z][\w+.-]*:/i.test(value) ? value : `https://${value}`)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined
  } catch {
    return undefined
  }
}

function mapMedia(raw: Manga): Media {
  const mediaId = String(raw.manga_id)
  const status = raw.status === 'on-going' ? 'ongoing' : raw.status === 'end' ? 'completed' : undefined
  return {
    id: `${sourceId}/${mediaId}`, mediaId, sourceId, type: 'manga',
    title: raw.titulo_brasil?.trim() || raw.titulo,
    altTitles: [...new Set([raw.titulo, ...(raw.titulo_alternative ?? [])].filter(Boolean))],
    synopsis: raw.descricao_brasil?.trim() || raw.descricao || undefined,
    status,
    coverUrl: imageUrl(raw.imagem),
    coverHeaders: { referer: `${BASE}/` },
    tags: raw.generos ?? []
  }
}

function numericId(value: string): string {
  if (!/^\d+$/.test(value)) throw new Error(`invalid Manhastro ID: ${value}`)
  return value
}

async function browse(ctx: SourceContext, path: string, page: number): Promise<SearchResults> {
  const json = await ctx.cache.withCache(`${sourceId}:browse:${path}`, 10 * 60_000, () => request<Manga[]>(ctx, path))
  const seen = new Set<number>()
  const items = json.data.filter((m) => {
    if (seen.has(m.manga_id)) return false
    seen.add(m.manga_id)
    return true
  }).map(mapMedia)
  return { page, hasNextPage: json.meta?.has_more ?? false, items }
}

export function makeManhastroSource(): Source {
  return {
    id: sourceId,
    name: 'Manhastro',
    lang: 'pt-br',
    mediaTypes: ['manga'],
    search: (ctx, query, page) => browse(ctx, `/dados?page=${page}&nome=${encodeURIComponent(query)}&sort=views&order=desc`, page),
    async getHomeSections() { return SECTIONS },
    async getHomeSection(ctx, sectionId, page) {
      if (!SECTIONS.some((s) => s.id === sectionId)) throw new Error(`unknown homepage section: ${sectionId}`)
      // These endpoints are complete lists, not paginated catalogs.
      if (page > 1) return { page, hasNextPage: false, items: [] }
      return browse(ctx, sectionId === 'latest' ? '/lancamentos' : '/rank/diario', page)
    },
    async getMedia(ctx, mediaId) {
      const json = await request<Manga[]>(ctx, `/dados?manga_id=${numericId(mediaId)}`)
      const raw = json.data.find((m) => String(m.manga_id) === mediaId)
      if (!raw) throw new Error(`media ${mediaId} not found`)
      return mapMedia(raw)
    },
    async getEpisodes(ctx, mediaId): Promise<Episode[]> {
      const id = numericId(mediaId)
      return ctx.cache.withCache(`${sourceId}:episodes:${id}`, 10 * 60_000, async () => {
        const json = await request<Chapter[]>(ctx, `/dados/${id}`)
        const seen = new Set<number>()
        const episodes: Episode[] = []
        for (const [index, ch] of json.data.entries()) {
          if (seen.has(ch.capitulo_id)) continue
          seen.add(ch.capitulo_id)
          const number = /\d+(?:[.,]\d+)?/.exec(ch.capitulo_nome)?.[0]
          episodes.push({
            id: `${sourceId}/${id}/${ch.capitulo_id}`, mediaId,
            number: number ? Number(number.replace(',', '.')) : index + 1,
            title: ch.capitulo_nome,
            // The API does not specify a timezone; do not invent a UTC offset.
            publishedAt: ch.capitulo_data?.replace(' ', 'T'),
            lang: 'pt-br'
          })
        }
        return episodes.sort((a, b) => a.number - b.number)
      })
    },
    async getChapterContent(ctx, _mediaId, episodeId): Promise<ChapterContent> {
      const id = numericId(episodeId.split('/').pop() ?? episodeId)
      // Page base URLs contain expiring tokens, so resolve them on every read.
      const json = await request<Pages>(ctx, `/paginas/${id}`)
      const chapter = json.data.chapter
      if (!chapter?.data.length) throw new Error(`chapter ${id} has no reader images`)
      const images = chapter.data.map((file) => imageUrl(`${chapter.baseUrl.replace(/\/$/, '')}/${chapter.hash}/${file}`))
      if (images.some((url) => !url)) throw new Error(`chapter ${id} has an invalid image URL`)
      return { type: 'pages', images: images.filter((url): url is string => url !== undefined), headers: { referer: `${BASE}/` } }
    }
  }
}
