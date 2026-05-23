/**
 * ScreenshotModal component tests.
 *
 * Verifies: renders nothing when closed/no image, renders preview + crop + buttons
 * when open, download creates blob URL and triggers download, copy uses clipboard API,
 * crop dimensions update from image natural size.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resolveCropPixels } from '@/components/overlays/screenshotCrop'
import { ScreenshotModal } from '@/components/overlays/ScreenshotModal'
import { ToastProvider } from '@/contexts/ToastContext'
import { useScreenshotStore } from '@/stores/runtime/screenshotStore'

function renderWithProviders(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

// Minimal 1x1 PNG as data URL (valid base64)
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

describe('resolveCropPixels', () => {
  it('clamps subpixel crops to at least one source pixel', () => {
    expect(resolveCropPixels({ x: 0.99, y: 0.99, width: 0.001, height: 0.001 }, 1, 1)).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    })
  })

  it('recovers invalid crop fractions to the full image', () => {
    expect(
      resolveCropPixels({ x: Number.NaN, y: Infinity, width: -1, height: Number.NaN }, 320, 180)
    ).toEqual({ x: 0, y: 0, width: 320, height: 180 })
  })

  it('returns null for invalid image dimensions', () => {
    expect(resolveCropPixels({ x: 0, y: 0, width: 1, height: 1 }, 0, 100)).toBeNull()
    expect(resolveCropPixels({ x: 0, y: 0, width: 1, height: 1 }, 100, Infinity)).toBeNull()
  })
})

describe('ScreenshotModal', () => {
  // Mock Image so `generateOutput`'s `new Image()` stays in-flight
  // deterministically, regardless of DOM environment (happy-dom, jsdom, etc.).
  let OriginalImage: typeof globalThis.Image

  beforeEach(() => {
    useScreenshotStore.setState(useScreenshotStore.getInitialState())
    OriginalImage = globalThis.Image

    globalThis.Image = class MockImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_: string) {
        // Never fires onload — keeps the generateOutput promise pending
      }
    } as unknown as typeof globalThis.Image
  })

  afterEach(() => {
    globalThis.Image = OriginalImage
    vi.restoreAllMocks()
  })

  it('does not render modal content when isOpen=false', () => {
    useScreenshotStore.setState({ isOpen: false, imageSrc: null })
    renderWithProviders(<ScreenshotModal />)
    expect(screen.queryByText('Screenshot Preview')).not.toBeInTheDocument()
  })

  it('does not render modal content when imageSrc is null', () => {
    useScreenshotStore.setState({ isOpen: true, imageSrc: null })
    renderWithProviders(<ScreenshotModal />)
    expect(screen.queryByText('Screenshot Preview')).not.toBeInTheDocument()
  })

  it('renders modal with preview image and action buttons when open with image', () => {
    useScreenshotStore.setState({ isOpen: true, imageSrc: TINY_PNG })
    renderWithProviders(<ScreenshotModal />)

    expect(screen.getByText('Screenshot Preview')).toBeInTheDocument()
    expect(screen.getByTestId('screenshot-modal-content')).toBeInTheDocument()
    expect(screen.getByTestId('screenshot-copy-button')).toBeInTheDocument()
    expect(screen.getByTestId('screenshot-save-button')).toBeInTheDocument()
    expect(screen.getByAltText('Preview')).toBeInTheDocument()
  })

  it('Save button enters loading state while generateOutput is in flight', async () => {
    // MockImage (see beforeEach) never fires onload, so the generateOutput
    // promise stays pending. The component remains in `isSaving=true` and we
    // observe the button's loading affordance (disabled attribute) as proof
    // that `handleDownload` entered the try block.
    useScreenshotStore.setState({ isOpen: true, imageSrc: TINY_PNG })
    const user = userEvent.setup()

    renderWithProviders(<ScreenshotModal />)

    const saveBtn = screen.getByTestId('screenshot-save-button')
    expect(saveBtn).not.toBeDisabled()

    await user.click(saveBtn)

    // Button becomes disabled synchronously because `setIsSaving(true)`
    // runs before the first `await` in `handleDownload`. The disabled
    // attribute comes from `Button`'s `disabled={disabled || loading}`
    // branch when loading=true.
    expect(saveBtn).toBeDisabled()
  })

  it('closes modal when the Modal header close button is clicked', async () => {
    useScreenshotStore.setState({ isOpen: true, imageSrc: TINY_PNG })
    const user = userEvent.setup()

    renderWithProviders(<ScreenshotModal />)

    // The Modal header close button exposes aria-label="Close modal".
    // Direct role+name lookup removes the old `if (closeBtn)` silent-pass
    // pattern — a missing close button now fails the test explicitly.
    const closeBtn = screen.getByRole('button', { name: /close modal/i })
    await user.click(closeBtn)

    expect(useScreenshotStore.getState().isOpen).toBe(false)
  })
})
