import type { PluginRegistration } from '@woyomi/core'
import { API_VERSION } from '@woyomi/core'
import { makeManhastroSource } from './manhastro.js'

declare global {
  var __media_plugin_register: ((registration: PluginRegistration) => void) | undefined
}

const source = makeManhastroSource()
globalThis.__media_plugin_register?.({
  manifest: {
    id: 'manhastro',
    name: 'Manhastro',
    version: '0.1.0',
    apiVersion: API_VERSION,
    lang: 'pt-br',
    description: 'Manhastro — mangás, manhwas e manhuas em português brasileiro',
    mediaTypes: ['manga'],
    entry: 'manhastro.plugin.js',
    sourceIds: [source.id]
  },
  sources: [source]
})
