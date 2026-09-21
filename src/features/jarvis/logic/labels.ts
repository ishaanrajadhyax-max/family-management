import type { JarvisMode } from '../api'
import type { VoiceEngine } from '../useSpeechOutput'

export const MODE_NOTE: Record<JarvisMode, string> = {
  general: 'Everyday assistant',
  news: 'Briefs and analysis',
  style: 'Wardrobe, fit and shopping',
}

export const ENGINE_LABEL: Record<VoiceEngine, string> = {
  unreal: 'Will · Unreal Speech',
  'unreal-raw': 'Will · Unreal (unprocessed)',
  browser: 'Browser voice',
}
