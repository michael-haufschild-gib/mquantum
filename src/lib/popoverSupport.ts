/**
 * Popover API feature detection.
 *
 * The Popover API (`showPopover`, `hidePopover`, `:popover-open`) requires
 * Safari 17+, Chrome 114+, Firefox 125+. On older browsers,
 * `element.matches(':popover-open')` throws SyntaxError which crashes React 19
 * error boundaries.
 *
 * Components should gate all Popover API usage behind this flag and fall back
 * to store-driven visibility with AnimatePresence.
 */
export const supportsPopover =
  typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.showPopover === 'function'

function isIgnorablePopoverStateError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'InvalidStateError'
}

/** Show a popover without relying on `:popover-open` selector support. */
export function showPopoverSafely(popover: HTMLElement): void {
  if (!supportsPopover) return
  try {
    popover.showPopover()
  } catch (error) {
    if (!isIgnorablePopoverStateError(error)) throw error
  }
}

/** Hide a popover without relying on `:popover-open` selector support. */
export function hidePopoverSafely(popover: HTMLElement): void {
  if (!supportsPopover) return
  try {
    popover.hidePopover()
  } catch (error) {
    if (!isIgnorablePopoverStateError(error)) throw error
  }
}
