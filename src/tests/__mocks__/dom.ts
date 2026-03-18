/**
 * DOM API mocks for happy-dom test environment.
 *
 * Provides mocks for APIs not fully supported in happy-dom:
 * - ResizeObserver
 * - window.matchMedia
 * - localStorage / sessionStorage
 * - Popover API (showPopover, hidePopover, togglePopover)
 * - HTMLDialogElement (showModal, close)
 *
 * @module tests/__mocks__/dom
 */

import { vi } from 'vitest'

// =============================================================================
// ResizeObserver
// =============================================================================

class MockResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

// =============================================================================
// Storage
// =============================================================================

function createStorageMock() {
  const storageData = new Map<string, string>()
  return {
    getItem: (key: string) => (storageData.has(key) ? storageData.get(key)! : null),
    setItem: (key: string, value: string) => {
      storageData.set(key, String(value))
    },
    removeItem: (key: string) => {
      storageData.delete(key)
    },
    clear: () => {
      storageData.clear()
    },
    key: (index: number) => Array.from(storageData.keys())[index] ?? null,
    get length() {
      return storageData.size
    },
  }
}

// =============================================================================
// Popover API
// =============================================================================

const popoverOpenState = new WeakMap<HTMLElement, boolean>()
const popoverEscapeListeners = new WeakMap<HTMLElement, (e: KeyboardEvent) => void>()
const popoverClickListeners = new WeakMap<HTMLElement, (e: MouseEvent) => void>()

function installPopoverMock(): void {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    if (!this.hasAttribute('popover')) {
      throw new DOMException('Element is not a popover', 'InvalidStateError')
    }
    const wasOpen = popoverOpenState.get(this) ?? false
    if (!wasOpen) {
      popoverOpenState.set(this, true)
      this.setAttribute('data-popover-open', '')

      if (this.getAttribute('popover') === 'auto') {
        const escapeHandler = (e: KeyboardEvent) => {
          if (e.key === 'Escape' && popoverOpenState.get(this)) {
            this.hidePopover()
          }
        }
        popoverEscapeListeners.set(this, escapeHandler)
        document.addEventListener('keydown', escapeHandler)

        const clickHandler = (e: MouseEvent) => {
          const target = e.target as HTMLElement
          if (this.contains(target)) return
          if (target.closest(`[popovertarget="${this.id}"]`)) return
          if (target.closest(`[data-dropdown-trigger="${this.id}"]`)) return
          if (target.closest('[data-dropdown-content]')) return
          if (popoverOpenState.get(this)) {
            this.hidePopover()
          }
        }
        popoverClickListeners.set(this, clickHandler)
        document.addEventListener('mousedown', clickHandler)
      }

      const event = new Event('toggle') as Event & { newState: string; oldState: string }
      Object.defineProperty(event, 'newState', { value: 'open', writable: false })
      Object.defineProperty(event, 'oldState', { value: 'closed', writable: false })
      this.dispatchEvent(event)
    }
  })

  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    if (!this.hasAttribute('popover')) {
      throw new DOMException('Element is not a popover', 'InvalidStateError')
    }
    const wasOpen = popoverOpenState.get(this) ?? false
    if (wasOpen) {
      popoverOpenState.set(this, false)
      this.removeAttribute('data-popover-open')

      const escapeHandler = popoverEscapeListeners.get(this)
      if (escapeHandler) {
        document.removeEventListener('keydown', escapeHandler)
        popoverEscapeListeners.delete(this)
      }
      const clickHandler = popoverClickListeners.get(this)
      if (clickHandler) {
        document.removeEventListener('mousedown', clickHandler)
        popoverClickListeners.delete(this)
      }

      const event = new Event('toggle') as Event & { newState: string; oldState: string }
      Object.defineProperty(event, 'newState', { value: 'closed', writable: false })
      Object.defineProperty(event, 'oldState', { value: 'open', writable: false })
      this.dispatchEvent(event)
    }
  })

  HTMLElement.prototype.togglePopover = vi.fn(function (
    this: HTMLElement,
    force?: boolean
  ): boolean {
    if (!this.hasAttribute('popover')) {
      throw new DOMException('Element is not a popover', 'InvalidStateError')
    }
    const isOpen = popoverOpenState.get(this) ?? false
    const shouldOpen = force !== undefined ? force : !isOpen
    if (shouldOpen && !isOpen) {
      this.showPopover()
      return true
    } else if (!shouldOpen && isOpen) {
      this.hidePopover()
      return false
    }
    return isOpen
  })

  // Override matches to support :popover-open pseudo-selector
  const originalMatches = HTMLElement.prototype.matches
  HTMLElement.prototype.matches = function (this: HTMLElement, selector: string): boolean {
    if (selector === ':popover-open') {
      return popoverOpenState.get(this) ?? false
    }
    return originalMatches.call(this, selector)
  }
}

// =============================================================================
// Dialog
// =============================================================================

function installDialogMock(): void {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
    this.dispatchEvent(new Event('open'))
  })

  HTMLDialogElement.prototype.close = vi.fn(function (
    this: HTMLDialogElement,
    returnValue?: string
  ) {
    this.removeAttribute('open')
    if (returnValue !== undefined) {
      this.returnValue = returnValue
    }
    this.dispatchEvent(new Event('close'))
  })
}

// =============================================================================
// Install all DOM mocks
// =============================================================================

/**
 * Install all DOM mocks (ResizeObserver, matchMedia, storage, popover, dialog).
 * Must be called during test setup.
 */
export function installDOMMocks(): void {
  // ResizeObserver
  ;(globalThis as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver =
    MockResizeObserver

  // matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })

  // Storage
  const storageMock = createStorageMock()
  Object.defineProperty(window, 'localStorage', { writable: true, value: storageMock })
  Object.defineProperty(window, 'sessionStorage', { writable: true, value: storageMock })

  // Popover API
  installPopoverMock()

  // Dialog API
  installDialogMock()
}
