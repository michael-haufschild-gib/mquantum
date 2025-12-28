/**
 * Platform Detection Utilities
 * Cross-platform keyboard shortcut display support
 */

/**
 * Detect if the current platform is macOS/iOS
 * Uses navigator.platform for SSR safety
 */
export const isMac =
  typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)

/**
 * Get the primary modifier key symbol for the current platform
 * @returns '⌘' on Mac, 'Ctrl' on Windows/Linux
 */
export function getModifierKey(): string {
  return isMac ? '⌘' : 'Ctrl'
}

/**
 * Get all modifier key symbols for the current platform
 * @returns Object with ctrl, shift, alt symbols
 */
export function getModifierSymbols(): { ctrl: string; shift: string; alt: string } {
  return {
    ctrl: isMac ? '⌘' : 'Ctrl',
    shift: isMac ? '⇧' : 'Shift',
    alt: isMac ? '⌥' : 'Alt',
  }
}

/**
 * Get platform-specific key label
 * @param key - The key to convert
 * @returns Platform-appropriate display label
 */
export function getPlatformKeyLabel(key: string): string {
  const keyMap: Record<string, string> = {
    Delete: isMac ? '⌫' : 'Del',
    Backspace: isMac ? '⌫' : 'Backspace',
    Enter: isMac ? '↵' : 'Enter',
    Escape: 'Esc',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    ' ': 'Space',
  }

  return keyMap[key] ?? key
}
