import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { logger } from '@/lib/logger'

/** Application color scheme mode. */
export type ThemeMode = 'light' | 'dark' | 'system'
/** Available accent color options. */
export type ThemeAccent = 'cyan' | 'green' | 'magenta' | 'orange' | 'blue' | 'violet' | 'red'

/** Named theme configuration combining mode and accent. */
export interface ThemePreset {
  id: string
  label: string
  mode: ThemeMode
  accent: ThemeAccent
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'cosmic', label: 'Cosmic', mode: 'dark', accent: 'cyan' },
  { id: 'emerald', label: 'Emerald', mode: 'dark', accent: 'green' },
  { id: 'amethyst', label: 'Amethyst', mode: 'dark', accent: 'magenta' },
  { id: 'sunset', label: 'Sunset', mode: 'dark', accent: 'orange' },
  { id: 'ocean', label: 'Ocean', mode: 'dark', accent: 'blue' },
  { id: 'paper', label: 'Paper', mode: 'light', accent: 'blue' },
  { id: 'solar', label: 'Solar', mode: 'light', accent: 'orange' },
  { id: 'lavender', label: 'Lavender', mode: 'light', accent: 'violet' },
  { id: 'rose', label: 'Rose', mode: 'light', accent: 'red' },
]

export const VALID_ACCENTS: readonly ThemeAccent[] = [
  'cyan',
  'green',
  'magenta',
  'orange',
  'blue',
  'violet',
  'red',
] as const

function isValidAccent(value: unknown): value is ThemeAccent {
  return typeof value === 'string' && VALID_ACCENTS.includes(value as ThemeAccent)
}

function isValidMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && ['light', 'dark', 'system'].includes(value)
}

/** Global theme store state and actions. */
export interface ThemeState {
  mode: ThemeMode
  accent: ThemeAccent
  setMode: (mode: ThemeMode) => void
  setAccent: (accent: ThemeAccent) => void
  setPreset: (presetId: string) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'dark', // Default to dark for that "amethyst" feel
      accent: 'magenta',
      setMode: (mode) => {
        if (!isValidMode(mode)) return
        set({ mode })
      },
      setAccent: (accent) => {
        if (!isValidAccent(accent)) {
          logger.warn(`Invalid accent: "${accent}". Using default "cyan".`)
          set({ accent: 'cyan' })
          return
        }
        set({ accent })
      },
      setPreset: (presetId) => {
        const preset = THEME_PRESETS.find((p) => p.id === presetId)
        if (preset) {
          set({ mode: preset.mode, accent: preset.accent })
        }
      },
    }),
    {
      name: 'mquantum-theme-storage',
    }
  )
)
