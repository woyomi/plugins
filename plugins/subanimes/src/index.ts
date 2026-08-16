import type { PluginRegistration } from '@woyomi/core'
import { API_VERSION } from '@woyomi/core'
import { makeSubanimesSource } from './subanimes.js'

declare global {
  /** Provided by the woyomi runtime (sandbox) or plugin-builder at evaluation time. */
  var __media_plugin_register: ((registration: PluginRegistration) => void) | undefined
}

const registration: PluginRegistration = {
  manifest: {
    id: 'subanimes',
    name: 'SubAnimes',
    version: '0.1.0',
    apiVersion: API_VERSION,
    lang: 'pt-br',
    description: 'SubAnimes — animes dublados e legendados via HLS (subanimes.org)',
    mediaTypes: ['anime'],
    entry: 'subanimes.plugin.js',
    sourceIds: ['subanimes']
  },
  sources: [makeSubanimesSource()]
}

globalThis.__media_plugin_register?.(registration)
