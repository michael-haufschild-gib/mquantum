/**
 * Platform Detection Utilities
 * Cross-platform keyboard shortcut display support
 */

/**
 * Detect if the current platform is macOS/iOS.
 *
 * Prefers navigator.userAgentData.platform when available, and falls back to
 * the deprecated navigator.platform for browsers that do not expose
 * userAgentData.
 */
export const isMac =
  typeof navigator !== 'undefined' &&
  ('userAgentData' in navigator
    ? /macOS|iOS|iPadOS/i.test(
        (navigator as Navigator & { userAgentData: { platform: string } }).userAgentData.platform
      )
    : /Mac|iPod|iPhone|iPad/.test(navigator.platform))

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
