import type { PluginRegistration } from '@woyomi/core'
import { API_VERSION } from '@woyomi/core'
import { makeWeebcentralSource } from './weebcentral.js'

declare global {
  var __media_plugin_register: ((registration: PluginRegistration) => void) | undefined
}

const source = makeWeebcentralSource()

globalThis.__media_plugin_register?.({
  manifest: {
    id: 'weebcentral',
    name: 'Weeb Central',
    version: '0.1.0',
    apiVersion: API_VERSION,
    lang: 'en',
    description: 'Weeb Central — English manga, manhwa and manhua',
    mediaTypes: ['manga'],
    entry: 'weebcentral.plugin.js',
    sourceIds: [source.id]
  },
  sources: [source]
})
