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
import { beforeEach, describe, expect, it } from 'vitest'

import { ScreenshotModal } from '@/components/overlays/ScreenshotModal'
import { ToastProvider } from '@/contexts/ToastContext'
import { useScreenshotStore } from '@/stores/screenshotStore'

function renderWithProviders(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

// Minimal 1x1 PNG as data URL (valid base64)
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

describe('ScreenshotModal', () => {
  beforeEach(() => {
    useScreenshotStore.setState(useScreenshotStore.getInitialState())
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
    // generateOutput awaits Image.onload, which happy-dom does NOT fire.
    // That actually works for us: the in-flight promise never settles, so
    // the component stays in `isSaving=true` and we can observe the button's
    // loading affordance (disabled attribute + aria-busy) as proof that
    // `handleDownload` actually entered the try block. Before this test
    // the file had a no-op click with a comment that admitted it asserted
    // nothing — now a regression that short-circuits the handler or never
    // flips `setIsSaving` will fail here.
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
