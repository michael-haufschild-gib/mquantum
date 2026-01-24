import { useEffect, useState, useCallback } from 'react'

/** Konami code sequence */
const KONAMI_CODE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
] as const
const KONAMI_CODE_STRING = KONAMI_CODE.join('')

/**
 * Hook that listens for the Konami code keyboard sequence.
 *
 * Detects the classic cheat code (↑↑↓↓←→←→BA) and triggers a callback
 * when the full sequence is entered correctly.
 *
 * @param callback - Function to call when the Konami code is entered
 *
 * @example
 * ```tsx
 * useKonamiCode(() => {
 *   console.log('Konami code activated!');
 *   enableSecretFeature();
 * });
 * ```
 */
export const useKonamiCode = (callback: () => void) => {
  const [, setSequence] = useState<string[]>([])

  // Memoize handler to keep callback reference stable
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      setSequence((prev) => {
        const newSequence = [...prev, e.key]
        if (newSequence.length > KONAMI_CODE.length) {
          newSequence.shift()
        }

        if (newSequence.join('') === KONAMI_CODE_STRING) {
          callback()
          return []
        }

        // Reset if mismatch to avoid partial matches later (simplistic)
        // Better: check if newSequence is a prefix of code
        const isPrefix = KONAMI_CODE_STRING.startsWith(newSequence.join(''))
        if (!isPrefix && newSequence.length > 0) {
          // Logic to keep last valid char if it starts new sequence?
          // Keep it simple: if not prefix, reset to just current char if it matches first char
          if (e.key === KONAMI_CODE[0]) return [e.key]
          return []
        }

        return newSequence
      })
    },
    [callback]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
