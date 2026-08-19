import type { PluginRegistration } from '@woyomi/core'
import { API_VERSION } from '@woyomi/core'
import { makeComickSource } from './comick.js'

declare global {
  /** Provided by the woyomi runtime (sandbox) or plugin-builder at evaluation time. */
  var __media_plugin_register: ((registration: PluginRegistration) => void) | undefined
}

/** Translation languages Comick chapters are commonly read in. */
const CHAPTER_LANGS = [
  { value: 'en', label: 'English' },
  { value: 'pt-br', label: 'Portuguese (Brazil)' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'ru', label: 'Russian' },
  { value: 'tr', label: 'Turkish' },
  { value: 'pl', label: 'Polish' },
  { value: 'uk', label: 'Ukrainian' },
  { value: 'id', label: 'Indonesian' },
  { value: 'vi', label: 'Vietnamese' },
  { value: 'ar', label: 'Arabic' },
  { value: 'th', label: 'Thai' },
  { value: 'ms', label: 'Malay' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Chinese' }
]

const registration: PluginRegistration = {
  manifest: {
    id: 'comick',
    name: 'Comick',
    version: '0.2.0',
    apiVersion: API_VERSION,
    lang: 'multi',
    description: 'Comick — multilingual manga aggregator',
    mediaTypes: ['manga'],
    entry: 'comick.plugin.js',
    sourceIds: ['comick'],
    prefs: [
      {
        key: 'chapterLang',
        label: 'Chapter language',
        type: 'select',
        defaultValue: 'en',
        options: CHAPTER_LANGS,
        description: 'Language of the chapter list (Comick mixes translations of every series).'
      }
    ]
  },
  sources: [makeComickSource()]
}

globalThis.__media_plugin_register?.(registration)
