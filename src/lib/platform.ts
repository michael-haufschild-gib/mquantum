/**
 * Platform Detection Utilities
 * Cross-platform keyboard shortcut display support
 */

interface PlatformNavigator {
  platform?: unknown
  userAgentData?: { platform?: unknown } | null
}

const MAC_PLATFORM_PATTERN = /macOS|iOS|iPadOS|Mac|iPod|iPhone|iPad/i

function isMacPlatformString(platform: unknown): boolean {
  return typeof platform === 'string' && MAC_PLATFORM_PATTERN.test(platform)
}

function hasExplicitUserAgentPlatform(navigatorLike: PlatformNavigator): boolean {
  return typeof navigatorLike.userAgentData?.platform === 'string'
}

/**
 * Detect if the current platform is macOS/iOS.
 *
 * Prefers navigator.userAgentData.platform when available, and falls back to
 * the deprecated navigator.platform for browsers that do not expose
 * userAgentData.
 *
 * @param navigatorLike - Navigator-compatible object to inspect
 * @returns True when navigator data identifies an Apple platform
 */
export function detectIsMac(navigatorLike?: PlatformNavigator): boolean {
  if (!navigatorLike) return false

  if (hasExplicitUserAgentPlatform(navigatorLike)) {
    return isMacPlatformString(navigatorLike.userAgentData?.platform)
  }

  return isMacPlatformString(navigatorLike.platform)
}

export const isMac = detectIsMac(typeof navigator === 'undefined' ? undefined : navigator)

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
    Delete: isMac ? '⌦' : 'Del',
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
