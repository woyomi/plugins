import type { PluginRegistration } from '@woyomi/core'
import { API_VERSION } from '@woyomi/core'
import { makeAnimefireSource } from './animefire.js'

declare global {
  /** Provided by the woyomi runtime (sandbox) or plugin-builder at evaluation time. */
  var __media_plugin_register: ((registration: PluginRegistration) => void) | undefined
}

const registration: PluginRegistration = {
  manifest: {
    id: 'animefire',
    name: 'AnimeFire',
    version: '0.1.0',
    apiVersion: API_VERSION,
    lang: 'pt-br',
    description: 'AnimeFire — animes legendados e dublados (HTML scraping)',
    mediaTypes: ['anime'],
    entry: 'animefire.plugin.js',
    sourceIds: ['animefire']
  },
  sources: [makeAnimefireSource()]
}

globalThis.__media_plugin_register?.(registration)