import type { PluginRegistration } from '@woyomi/core'
import { API_VERSION } from '@woyomi/core'
import { makeTsundokuSource } from './tsundoku.js'

declare global {
  /** Provided by the woyomi runtime (sandbox) or plugin-builder at evaluation time. */
  var __media_plugin_register: ((registration: PluginRegistration) => void) | undefined
}

const registration: PluginRegistration = {
  manifest: {
    id: 'tsundoku',
    name: 'Tsundoku Traduções',
    version: '0.1.0',
    apiVersion: API_VERSION,
    lang: 'pt-br',
    description: 'Tsundoku Traduções — mangás, manhuas, manhwas e light novels (HTML scraping)',
    mediaTypes: ['manga', 'novel'],
    entry: 'tsundoku.plugin.js',
    sourceIds: ['tsundoku']
  },
  sources: [makeTsundokuSource()]
}

globalThis.__media_plugin_register?.(registration)