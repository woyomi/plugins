import { describe, expect, it, vi } from 'vitest'
import type { PluginRegistration, SourceContext } from '@woyomi/core'
import { makeManhastroSource } from '../src/manhastro.js'

const source = makeManhastroSource()
// Trimmed live API shapes, checked 2026-10-23.
const MANGA = {
  manga_id: 34402, titulo: 'Solo Farming In The Tower', titulo_brasil: 'Cultivando em Solitário na Torre',
  titulo_alternative: ['Único Fazendeiro da Torre'], descricao: 'A tower appeared.', descricao_brasil: 'Uma torre misteriosa surgiu.',
  imagem: 'capa.manhastro.net/cover.webp', status: 'on-going', generos: ['Aventura', 'Fantasia']
}
const PAGES = { chapter: { baseUrl: 'https://albums.manhastro.net/t/TOKEN/img', hash: 'manga_656067fc6816c/capitulo-0001', data: ['1.webp', '2_part0.webp', '2_part1.webp'] } }

function context(data: unknown, options: { status?: number; raw?: boolean; prefix?: string } = {}): SourceContext {
  return {
    fetch: vi.fn(async () => ({ status: options.status ?? 200, headers: {}, body: (options.prefix ?? '') + (options.raw ? String(data) : JSON.stringify(data)) })),
    cache: { async withCache(_key, _ttl, compute) { return compute() } },
    preferences: { async get() { return undefined }, async getWithDefault(_key, fallback) { return fallback }, async set() {} }
  }
}

describe('Manhastro', () => {
  it('registers its Brazilian Portuguese source', async () => {
    const register = vi.fn<(value: PluginRegistration) => void>()
    globalThis.__media_plugin_register = register
    try {
      await import('../src/index.js')
      expect(register.mock.calls[0]?.[0].manifest).toMatchObject({ id: 'manhastro', version: '0.1.0', lang: 'pt-br', sourceIds: ['manhastro'] })
    } finally { delete globalThis.__media_plugin_register }
  })

  it('searches with encoded text and honors API pagination', async () => {
    const ctx = context({ success: true, data: [MANGA], meta: { has_more: true } })
    const result = await source.search(ctx, 'ação & torre', 2)
    expect(result).toMatchObject({ page: 2, hasNextPage: true, items: [{ id: 'manhastro/34402', title: MANGA.titulo_brasil }] })
    const params = new URL(vi.mocked(ctx.fetch).mock.calls[0]![0]).searchParams
    expect(params.get('nome')).toBe('ação & torre')
    expect(params.get('page')).toBe('2')
  })

  it('maps localized metadata, aliases, status and scheme-less covers', async () => {
    expect(await source.getMedia(context({ data: [MANGA] }), '34402')).toMatchObject({
      mediaId: '34402', sourceId: 'manhastro', type: 'manga', status: 'ongoing',
      title: MANGA.titulo_brasil, synopsis: MANGA.descricao_brasil,
      altTitles: [MANGA.titulo, 'Único Fazendeiro da Torre'], coverUrl: 'https://capa.manhastro.net/cover.webp', tags: ['Aventura', 'Fantasia']
    })
  })

  it('falls back to original text and handles missing optional fields', async () => {
    const raw = { manga_id: 1, titulo: 'Title', titulo_brasil: ' ', descricao: 'Description', descricao_brasil: '', status: 'end' }
    expect(await source.getMedia(context({ data: [raw] }), '1')).toMatchObject({ title: 'Title', synopsis: 'Description', status: 'completed', tags: [] })
  })

  it.each(['https://cdn.example/cover.jpg', '//cdn.example/cover.jpg'])('accepts a cover URL %s', async (imagem) => {
    expect((await source.getMedia(context({ data: [{ ...MANGA, imagem }] }), '34402')).coverUrl).toBe('https://cdn.example/cover.jpg')
  })

  it('rejects missing series and unsafe cover schemes', async () => {
    await expect(source.getMedia(context({ data: [] }), '34402')).rejects.toThrow('not found')
    const result = await source.getMedia(context({ data: [{ ...MANGA, imagem: 'javascript:alert(1)' }] }), '34402')
    expect(result.coverUrl).toBeUndefined()
  })

  it.each(['\uFEFF', ")]}'\n", ")]}'\n_", ','])('accepts known JSON prefixes %j', async (prefix) => {
    expect((await source.search(context({ data: [MANGA] }, { prefix }), '', 1)).items).toHaveLength(1)
  })

  it('deduplicates recent releases and does not repeat single-page home lists', async () => {
    const ctx = context({ data: [MANGA, MANGA] })
    const result = await source.getHomeSection?.(ctx, 'latest', 1)
    expect(result?.items).toHaveLength(1)
    expect(result?.hasNextPage).toBe(false)
    expect(vi.mocked(ctx.fetch).mock.calls[0]?.[0]).toBe('https://api2.manhastro.net/lancamentos')
    expect(await source.getHomeSection?.(ctx, 'latest', 2)).toEqual({ page: 2, hasNextPage: false, items: [] })
    expect(ctx.fetch).toHaveBeenCalledOnce()
  })

  it('loads daily popularity and rejects unknown sections', async () => {
    const ctx = context({ data: [] })
    expect((await source.getHomeSections?.(ctx))?.map((s) => s.id)).toEqual(['latest', 'popular'])
    await source.getHomeSection?.(ctx, 'popular', 1)
    expect(vi.mocked(ctx.fetch).mock.calls[0]?.[0]).toBe('https://api2.manhastro.net/rank/diario')
    await expect(source.getHomeSection?.(ctx, 'missing', 1)).rejects.toThrow('unknown homepage section')
  })

  it('loads all chapters, deduplicates IDs, preserves decimals and sorts numerically', async () => {
    const ch = (id: number, name: string) => ({ capitulo_id: id, capitulo_nome: name, capitulo_data: '2023-11-24 22:57:36' })
    const ctx = context({ data: [ch(3, 'Capitulo 10'), ch(2, 'Capítulo 2,5'), ch(1, 'Capitulo 1'), ch(1, 'Capitulo 1')] })
    const episodes = await source.getEpisodes(ctx, '34402')
    expect(episodes.map((e) => e.number)).toEqual([1, 2.5, 10])
    expect(episodes[0]).toMatchObject({ id: 'manhastro/34402/1', mediaId: '34402', lang: 'pt-br', publishedAt: '2023-11-24T22:57:36' })
    expect(vi.mocked(ctx.fetch).mock.calls[0]?.[0]).toBe('https://api2.manhastro.net/dados/34402')
  })

  it('retains unnumbered specials and supports empty chapter lists', async () => {
    expect((await source.getEpisodes(context({ data: [{ capitulo_id: 1, capitulo_nome: 'Prólogo' }] }), '1'))[0]?.number).toBe(1)
    expect(await source.getEpisodes(context({ data: [] }), '1')).toEqual([])
  })

  it.each(['270378', 'manhastro/34402/270378'])('resolves signed reader URLs in API order for %s', async (id) => {
    const ctx = context({ data: PAGES })
    const cache = vi.spyOn(ctx.cache, 'withCache')
    expect(await source.getChapterContent(ctx, '34402', id)).toEqual({
      type: 'pages', images: PAGES.chapter.data.map((file) => `${PAGES.chapter.baseUrl}/${PAGES.chapter.hash}/${file}`),
      headers: { referer: 'https://manhastro.net/' }
    })
    expect(cache).not.toHaveBeenCalled()
    expect(vi.mocked(ctx.fetch).mock.calls[0]?.[0]).toBe('https://api2.manhastro.net/paginas/270378')
  })

  it.each([{ chapter: null }, { chapter: { ...PAGES.chapter, data: [] } }])('rejects missing page content', async (data) => {
    await expect(source.getChapterContent(context({ data }), '1', '2')).rejects.toThrow('no reader images')
  })

  it('rejects invalid IDs before making requests', async () => {
    const ctx = context({ data: [] })
    await expect(source.getMedia(ctx, '../bad')).rejects.toThrow('invalid Manhastro ID')
    await expect(source.getEpisodes(ctx, 'bad')).rejects.toThrow('invalid Manhastro ID')
    await expect(source.getChapterContent(ctx, '1', 'bad')).rejects.toThrow('invalid Manhastro ID')
    expect(ctx.fetch).not.toHaveBeenCalled()
  })

  it('rejects API errors, missing data, malformed JSON and HTTP errors', async () => {
    await expect(source.search(context({ success: false, data: [] }), '', 1)).rejects.toThrow('API returned no data')
    await expect(source.search(context({}), '', 1)).rejects.toThrow('API returned no data')
    await expect(source.search(context('<html>Blocked</html>', { raw: true }), '', 1)).rejects.toThrow()
    const ctx = context('error', { status: 403 })
    await expect(source.search(ctx, '', 1)).rejects.toThrow('HTTP 403')
    await expect(source.getMedia(ctx, '1')).rejects.toThrow('HTTP 403')
    await expect(source.getEpisodes(ctx, '1')).rejects.toThrow('HTTP 403')
    await expect(source.getChapterContent(ctx, '1', '2')).rejects.toThrow('HTTP 403')
  })
})
