import type { PluginRegistration } from '@woyomi/core'
import { API_VERSION } from '@woyomi/core'
import { makeMangapillSource } from './mangapill.js'

declare global {
  var __media_plugin_register: ((registration: PluginRegistration) => void) | undefined
}

const source = makeMangapillSource()
globalThis.__media_plugin_register?.({
  manifest: {
    id: 'mangapill', name: 'MangaPill', version: '0.1.0', apiVersion: API_VERSION,
    lang: 'en', description: 'MangaPill — English manga', mediaTypes: ['manga'],
    entry: 'mangapill.plugin.js', sourceIds: [source.id]
  },
  sources: [source]
})
