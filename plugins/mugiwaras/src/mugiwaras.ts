import type { ChapterContent, Episode, FetchInit, HomeSection, Media, MediaStatus, SearchResults, Source, SourceContext } from '@woyomi/core'
import { fetchJson, jsonHeaders } from '@woyomi/core'
import { hmacSha256 } from './crypto.js'

/**
 * Mugiwaras Oficial (mugiwarasoficial.org) is a Brazilian manga/manhwa/manhua
 * reader. The Next.js frontend is powered by an open Fastify JSON API at
 * app.mugiwarasoficial.com/v1/www, so this source consumes the API directly
 * instead of scraping Tailwind-class HTML.
 *
 * Chapter pages come back as encrypted `atfield` tokens, not URLs. The site
 * resolves them client-side: pass the ad-shortener gate (POST /v1/www/gate-token
 * -> redenovax.com -> /gate/callback sets a per-chapter `mnx_gate_*` cookie
 * pair), then GET /api/atfield/key?v=<keyId>&e=<version> for the XOR key. A
 * token is base64url(`keyId | version | nonce(8) | ciphertext`) decrypted with
 * an HMAC-SHA256-CTR keystream. Plain URLs pass through unchanged. Images live
 * on aurora.snipercache.com behind signed URLs (`?sig=&exp=`); the CDN rejects
 * loads without the Mugiwaras Referer and a User-Agent, so the reader uses its
 * native stream proxy for page requests.
 */
const API = 'https://app.mugiwarasoficial.com/v1/www'
const SITE = 'https://mugiwarasoficial.org'
const sourceId = 'mugiwaras'

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
/**
 * Cloudflare fronts the site/API with a managed challenge keyed on browser
 * fetch metadata: verified live, a plain UA (even with accept/origin) gets 403
 * "Just a moment...", while a browser User-Agent + `Sec-Fetch-*` passes. Sent
 * on every request.
 */
const FETCH_METADATA_HEADERS = {
  'user-agent': BROWSER_UA,
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site'
}

const PAGE_HEADERS = {
  Referer: `${SITE}/`,
  'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
}

/** `redirect` (and thus cookie flows) landed in a newer SDK than the installed type. */
type PluginFetchInit = FetchInit & { redirect?: 'follow' | 'manual' }

/**
 * The gate server answers `gate_error=too_fast` below ~8s between token issue
 * and callback (verified live: 6s rejected, 8s accepted), regardless of the
 * `minWaitSeconds` it advertises.
 */
const GATE_WAIT_MS = 9000

const apiInit = { headers: jsonHeaders(FETCH_METADATA_HEADERS) }

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

/** The /works/<slug> endpoint wraps the work in `{ data: WorkDetail }`. */
interface WorkDetailResponse {
  data: WorkDetail
}

interface Chapter {
  id?: string
  /** Usually a number, but fractional chapters exist (e.g. 102.5). */
  number?: number | string
  title?: string
  publishedAt?: string
  isPreview?: boolean
  /** "chapter" | "spoiler" — spoiler chapters have no readable pages yet. */
  kind?: string
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

/**
 * aurora.snipercache.com cover URLs carry a per-request `sig`/`exp` pair that
 * changes on every API call even though the underlying image is the same and
 * is hotlink-safe without the signature. Strip them so the URL (and thus the
 * app's sha256 cover hash) is stable across calls — otherwise every getMedia
 * invalidates the cached cover and re-downloads.
 */
function stableCoverUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    const u = new URL(url)
    u.searchParams.delete('sig')
    u.searchParams.delete('exp')
    return u.toString()
  } catch {
    return url
  }
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
    coverUrl: stableCoverUrl(w.coverUrl) ?? undefined
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** `atfield` page tokens are base64url; keys from /api/atfield/key are plain base64. */
function decodeBase64(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

interface PageToken {
  keyId: number
  version: number
  nonce: Uint8Array
  ciphertext: Uint8Array
}

/** `keyId(1) | version(4, BE) | nonce(8) | ciphertext`, base64url-encoded. */
function parsePageToken(token: string): PageToken {
  const bytes = decodeBase64(token)
  if (bytes.length <= 13) throw new Error('mugiwaras: malformed page token')
  const version = (((bytes[1] ?? 0) << 24) | ((bytes[2] ?? 0) << 16) | ((bytes[3] ?? 0) << 8) | (bytes[4] ?? 0)) >>> 0
  return { keyId: bytes[0] ?? 0, version, nonce: bytes.subarray(5, 13), ciphertext: bytes.subarray(13) }
}

/**
 * Keystream block i = HMAC-SHA256(key, nonce || i), XORed over the ciphertext
 * (mirrors the site's `atfield` client).
 */
function decryptPageToken(key: Uint8Array, token: PageToken): string {
  const out = new Uint8Array(token.ciphertext.length)
  let pos = 0
  let counter = 0
  while (pos < out.length) {
    const block = new Uint8Array(token.nonce.length + 1)
    block.set(token.nonce, 0)
    block[token.nonce.length] = counter & 255
    const keystream = hmacSha256(key, block)
    const take = Math.min(keystream.length, out.length - pos)
    for (let i = 0; i < take; i++) out[pos + i] = (token.ciphertext[pos + i] ?? 0) ^ (keystream[i] ?? 0)
    pos += take
    counter++
  }
  return new TextDecoder().decode(out)
}

/** Extract `name=value` pairs from the `set-cookie` header (values joined with '\n'). */
function cookieHeader(setCookie: string | undefined): string {
  return (setCookie ?? '')
    .split('\n')
    .map((line) => line.split(';')[0]?.trim() ?? '')
    .filter(Boolean)
    .join('; ')
}

/**
 * Walk the site's ad-shortener gate and return the per-chapter cookie pair the
 * key endpoint requires. Needs `redirect: 'manual'` (native app) to read the
 * 307's `set-cookie`.
 */
async function fetchGateCookies(ctx: SourceContext, scopePath: string): Promise<string> {
  const gate = await fetchJson<{ data: { token?: string; gateUrl?: string } }>(ctx.fetch, `${API}/gate-token`, {
    method: 'POST',
    headers: { ...FETCH_METADATA_HEADERS, 'content-type': 'application/json' },
    body: JSON.stringify({ returnTo: scopePath })
  })
  const token = gate.data?.token
  if (!token) throw new Error('mugiwaras: gate did not issue a token')
  // The shortener hop is the site's ad surface; visit it like the website does.
  if (gate.data.gateUrl) await ctx.fetch(gate.data.gateUrl, { headers: { 'user-agent': BROWSER_UA } }).catch(() => undefined)
  await delay(GATE_WAIT_MS)
  const res = await ctx.fetch(`${SITE}/gate/callback?token=${encodeURIComponent(token)}`, {
    headers: {
      ...FETCH_METADATA_HEADERS,
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'cross-site',
      referer: 'https://redenovax.com/'
    },
    redirect: 'manual'
  } as PluginFetchInit)
  const cookies = cookieHeader(res.headers['set-cookie'])
  if (!cookies) {
    throw new Error(
      res.status === 200 || res.status === 0
        ? 'mugiwaras: gate cookies are unreadable in this runtime (needs the native woyomi app)'
        : `mugiwaras: gate redemption failed (HTTP ${res.status})`
    )
  }
  return cookies
}

async function fetchDecryptionKey(
  ctx: SourceContext,
  keyId: number,
  version: number,
  scopePath: string,
  cookies: string
): Promise<Uint8Array> {
  // The key is scope-checked against the Referer, so it must match the gated chapter.
  const res = await fetchJson<{ k?: string }>(ctx.fetch, `${SITE}/api/atfield/key?v=${keyId}&e=${version}`, {
    headers: { ...FETCH_METADATA_HEADERS, 'sec-fetch-site': 'same-origin', referer: `${SITE}${scopePath}`, cookie: cookies }
  })
  if (!res.k) throw new Error('mugiwaras: key response is missing k')
  return decodeBase64(res.k)
}

function isPlainUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://')
}

/**
 * Decrypt `atfield` page tokens into signed image URLs, fetching and caching
 * the key on first use — one gate walk unlocks later chapters until the site
 * rotates the key version. Tokens that are already URLs pass through.
 */
async function resolvePageUrls(
  ctx: SourceContext,
  keyCache: Map<string, Uint8Array>,
  slug: string,
  number: string,
  tokens: string[]
): Promise<string[]> {
  const parsed = tokens.map((raw) => (isPlainUrl(raw) ? { raw, token: undefined } : { raw, token: parsePageToken(raw) }))
  const missing = new Map<string, PageToken>()
  for (const item of parsed) {
    if (!item.token) continue
    const cacheKey = `${item.token.keyId}:${item.token.version}`
    if (!keyCache.has(cacheKey) && !missing.has(cacheKey)) missing.set(cacheKey, item.token)
  }
  if (missing.size > 0) {
    const scopePath = `/manga/${slug}/${number}`
    const cookies = await fetchGateCookies(ctx, scopePath)
    for (const [cacheKey, token] of missing) {
      keyCache.set(cacheKey, await fetchDecryptionKey(ctx, token.keyId, token.version, scopePath, cookies))
    }
  }
  return parsed.map((item) => {
    if (!item.token) return item.raw
    const key = keyCache.get(`${item.token.keyId}:${item.token.version}`)
    if (!key) throw new Error('mugiwaras: missing page decryption key')
    return decryptPageToken(key, item.token)
  })
}

export function makeMugiwarasSource(): Source {
  /** Decryption keys by `keyId:version`; one gate walk serves until rotation. */
  const keyCache = new Map<string, Uint8Array>()
  return {
    id: sourceId,
    name: 'Mugiwaras',
    mediaTypes: ['manga'],
    lang: 'pt-br',

    async search(ctx, query, page): Promise<SearchResults> {
      const res = await fetchJson<SearchResponse>(ctx.fetch, `${API}/search?q=${encodeURIComponent(query.trim())}`, apiInit)
      const items = (res.data ?? []).filter(hasSlug).map(mapCard)
      // the endpoint caps results at meta.limit (8) and has no pagination
      return { page, hasNextPage: false, items }
    },

    async getMedia(ctx, mediaId): Promise<Media> {
      const res = await fetchJson<WorkDetailResponse>(ctx.fetch, `${API}/works/${mediaId}`, apiInit)
      const w = res.data
      const altTitles = (w.altTitles ?? []).map((t) => t.trim()).filter(Boolean)
      return {
        id: `${sourceId}/${mediaId}`,
        mediaId,
        sourceId,
        title: w.title?.trim() || 'Untitled',
        type: 'manga',
        coverUrl: stableCoverUrl(w.coverUrl) ?? undefined,
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
          `${API}/works/${mediaId}/chapters?limit=100&page=${page}`,
          apiInit
        )
        chapters.push(...(res.data ?? []))
        totalPages = Math.max(1, res.meta?.totalPages ?? 1)
        page++
      } while (page <= totalPages && page <= MAX_CHAPTER_PAGES)
      const episodes: Episode[] = []
      for (const ch of chapters) {
        if (ch.isPreview) continue
        // "spoiler" chapters are pre-release entries with no readable pages yet
        if (ch.kind === 'spoiler') continue
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
      const res = await fetchJson<PagesResponse>(ctx.fetch, `${API}/works/${slug}/chapters/${number}/pages`, apiInit)
      const pages = (res.data?.pages ?? []).slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      const tokens = pages.map((p) => p.imageUrl).filter((u): u is string => typeof u === 'string' && u.length > 0)
      if (tokens.length === 0) throw new Error(`no pages found for ${slug} chapter ${number}`)
      const images = await resolvePageUrls(ctx, keyCache, slug, number, tokens)
      return { type: 'pages', images, headers: PAGE_HEADERS }
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
      const res = await fetchJson<HomeResponse>(ctx.fetch, `${API}/home`, apiInit)
      const section = res.data?.[payloadKey]
      if (!Array.isArray(section)) throw new Error(`unknown homepage section: ${sectionId}`)
      const items = (section as WorkSummary[]).filter(hasSlug).map(mapCard)
      return { page, hasNextPage: false, items }
    }
  }
}
