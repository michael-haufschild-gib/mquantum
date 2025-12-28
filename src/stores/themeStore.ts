import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'cyan' | 'green' | 'magenta' | 'orange' | 'blue'

/** Valid theme values for runtime validation */
const VALID_THEMES: readonly Theme[] = [
  'cyan',
  'green',
  'magenta',
  'orange',
  'blue',
] as const

/**
 * Type guard to validate theme values at runtime
 * @param value - Value to check
 * @returns True if value is a valid Theme
 */
function isValidTheme(value: unknown): value is Theme {
  return typeof value === 'string' && VALID_THEMES.includes(value as Theme)
}

export interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'cyan', // Default cyan theme
      setTheme: (theme) => {
        // Runtime validation for safety (handles localStorage deserialization edge cases)
        if (!isValidTheme(theme)) {
          if (import.meta.env.DEV) {
            console.warn(`Invalid theme value: "${theme}". Using default "cyan".`)
          }
          set({ theme: 'cyan' })
          return
        }
        set({ theme })
      },
    }),
    {
      name: 'mdimension-theme-storage',
    }
  )
)
