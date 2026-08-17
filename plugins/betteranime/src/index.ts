import type { PluginRegistration } from '@woyomi/core'
import { API_VERSION } from '@woyomi/core'
import { makeBetteranimeSource } from './betteranime.js'

declare global {
  /** Provided by the woyomi runtime (sandbox) or plugin-builder at evaluation time. */
  var __media_plugin_register: ((registration: PluginRegistration) => void) | undefined
}

const registration: PluginRegistration = {
  manifest: {
    id: 'betteranime',
    name: 'Better Anime',
    version: '0.1.1',
    apiVersion: API_VERSION,
    lang: 'pt-br',
    description: 'Better Anime — animes legendados e dublados (WordPress/dooplay scraping)',
    mediaTypes: ['anime'],
    entry: 'betteranime.plugin.js',
    sourceIds: ['betteranime']
  },
  sources: [makeBetteranimeSource()]
}

globalThis.__media_plugin_register?.(registration)
