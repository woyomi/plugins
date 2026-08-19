import type { PluginRegistration } from '@woyomi/core'
import { API_VERSION } from '@woyomi/core'
import { makeAnimesOrionSource } from './animesorion.js'

declare global {
  /** Provided by the woyomi runtime (sandbox) or plugin-builder at evaluation time. */
  var __media_plugin_register: ((registration: PluginRegistration) => void) | undefined
}

const registration: PluginRegistration = {
  manifest: {
    id: 'animesorion',
    name: 'Animes Orion',
    version: '0.2.0',
    apiVersion: API_VERSION,
    lang: 'pt-br',
    description: 'Animes Orion — animes dublados e legendados e filmes (HTML scraping)',
    mediaTypes: ['anime'],
    entry: 'animesorion.plugin.js',
    sourceIds: ['animesorion']
  },
  sources: [makeAnimesOrionSource()]
}

globalThis.__media_plugin_register?.(registration)
