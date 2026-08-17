import type { PluginRegistration } from '@woyomi/core'
import { API_VERSION } from '@woyomi/core'
import { makeAnimesonlineccSource } from './animesonlinecc.js'

declare global {
  /** Provided by the woyomi runtime (sandbox) or plugin-builder at evaluation time. */
  var __media_plugin_register: ((registration: PluginRegistration) => void) | undefined
}

const registration: PluginRegistration = {
  manifest: {
    id: 'animesonlinecc',
    name: 'Animes Online CC',
    version: '0.1.1',
    apiVersion: API_VERSION,
    lang: 'pt-br',
    description: 'Animes Online CC — animes legendados e dublados via Blogger players (HTML scraping)',
    mediaTypes: ['anime'],
    entry: 'animesonlinecc.plugin.js',
    sourceIds: ['animesonlinecc']
  },
  sources: [makeAnimesonlineccSource()]
}

globalThis.__media_plugin_register?.(registration)
