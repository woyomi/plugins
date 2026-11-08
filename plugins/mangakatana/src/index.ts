import type { PluginRegistration } from '@woyomi/core'
import { API_VERSION } from '@woyomi/core'
import { makeMangakatanaSource } from './mangakatana.js'

declare global {
  var __media_plugin_register: ((registration: PluginRegistration) => void) | undefined
}

const source = makeMangakatanaSource()
globalThis.__media_plugin_register?.({
  manifest: {
    id: 'mangakatana',
    name: 'MangaKatana',
    version: '0.1.0',
    apiVersion: API_VERSION,
    lang: 'en',
    description: 'MangaKatana — English manga, manhwa and manhua',
    mediaTypes: ['manga'],
    entry: 'mangakatana.plugin.js',
    sourceIds: [source.id]
  },
  sources: [source]
})
