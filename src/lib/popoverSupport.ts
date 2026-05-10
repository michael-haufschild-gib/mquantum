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
