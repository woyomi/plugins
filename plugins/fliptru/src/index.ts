import type { PluginRegistration } from '@woyomi/core'
import { API_VERSION } from '@woyomi/core'
import { makeFliptruSource } from './fliptru.js'

declare global {
  var __media_plugin_register: ((registration: PluginRegistration) => void) | undefined
}

const source = makeFliptruSource()
globalThis.__media_plugin_register?.({
  manifest: {
    id: 'fliptru', name: 'Fliptru', version: '0.1.0', apiVersion: API_VERSION,
    lang: 'pt-br', description: 'Fliptru — quadrinhos independentes brasileiros', mediaTypes: ['manga'],
    entry: 'fliptru.plugin.js', sourceIds: [source.id]
  },
  sources: [source]
})
