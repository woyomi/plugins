import type { PluginRegistration } from '@woyomi/core'
import { API_VERSION } from '@woyomi/core'
import { makeMugiwarasSource } from './mugiwaras.js'

declare global {
  /** Provided by the woyomi runtime (sandbox) or plugin-builder at evaluation time. */
  var __media_plugin_register: ((registration: PluginRegistration) => void) | undefined
}

const registration: PluginRegistration = {
  manifest: {
    id: 'mugiwaras',
    name: 'Mugiwaras',
    version: '0.2.0',
    apiVersion: API_VERSION,
    lang: 'pt-br',
    description: 'Mugiwaras Oficial — mangás, manhwas e manhuas em português (JSON API)',
    mediaTypes: ['manga'],
    entry: 'mugiwaras.plugin.js',
    sourceIds: ['mugiwaras']
  },
  sources: [makeMugiwarasSource()]
}

globalThis.__media_plugin_register?.(registration)
