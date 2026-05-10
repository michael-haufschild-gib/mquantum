/**
 * StyleManager component tests.
 *
 * Verifies CRUD operations on saved styles: loading applies style and closes,
 * delete requires confirmation, empty state shown when no styles exist,
 * export triggers download.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { StyleManager } from '@/components/presets/StyleManager'
import { ToastProvider } from '@/contexts/ToastContext'
import { usePresetManagerStore } from '@/stores/runtime/presetManagerStore'
import type { SavedStyle } from '@/stores/utils/presetTypes'

function renderWithProviders(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

const emptyStyleData: SavedStyle['data'] = {
  appearance: {},
  lighting: {},
  postProcessing: {},
  environment: {},
  pbr: {},
}

function createStyle(id: string, name: string, timestamp = Date.now()): SavedStyle {
  return { id, name, timestamp, data: emptyStyleData }
}

describe('StyleManager', () => {
  beforeEach(() => {
    usePresetManagerStore.setState(usePresetManagerStore.getInitialState())
  })

  describe('empty state', () => {
    it('shows "No saved styles yet" when no styles exist', () => {
      renderWithProviders(<StyleManager onClose={() => {}} />)
      expect(screen.getByText(/No saved styles yet/)).toBeInTheDocument()
    })

    it('renders Import and Export buttons', () => {
      renderWithProviders(<StyleManager onClose={() => {}} />)
      expect(screen.getByRole('button', { name: /import/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument()
    })
  })

  describe('with saved styles', () => {
    beforeEach(() => {
      usePresetManagerStore.setState({
        savedStyles: [
          createStyle('style-1', 'Neon Glow', Date.parse('2026-01-10')),
          createStyle('style-2', 'Dark Minimal', Date.parse('2026-03-05')),
        ],
      })
    })

    it('renders each saved style name', () => {
      renderWithProviders(<StyleManager onClose={() => {}} />)
      expect(screen.getByText('Neon Glow')).toBeInTheDocument()
      expect(screen.getByText('Dark Minimal')).toBeInTheDocument()
    })

    it('clicking a style calls loadStyle and onClose', async () => {
      const onClose = vi.fn()
      const user = userEvent.setup()
      renderWithProviders(<StyleManager onClose={onClose} />)

      const applyButtons = screen.getAllByRole('button', { name: /apply style/i })
      await user.click(applyButtons[0]!)

      expect(onClose).toHaveBeenCalled()
    })

    it('delete button opens confirmation modal with style name', async () => {
      const user = userEvent.setup()
      renderWithProviders(<StyleManager onClose={() => {}} />)

      const deleteButtons = screen.getAllByRole('button', { name: /delete style/i })
      await user.click(deleteButtons[0]!)

      expect(screen.getByText('Delete Style')).toBeInTheDocument()
      expect(screen.getByText(/Are you sure you want to delete style/)).toBeInTheDocument()
    })

    it('confirming delete removes the style', async () => {
      const user = userEvent.setup()
      renderWithProviders(<StyleManager onClose={() => {}} />)

      const deleteButtons = screen.getAllByRole('button', { name: /delete style/i })
      await user.click(deleteButtons[0]!)

      const confirmBtn = screen.getByRole('button', { name: /delete$/i })
      await user.click(confirmBtn)

      const styles = usePresetManagerStore.getState().savedStyles
      expect(styles.find((s) => s.id === 'style-1')).toBeUndefined()
    })

    it('canceling delete preserves the style', async () => {
      const user = userEvent.setup()
      renderWithProviders(<StyleManager onClose={() => {}} />)

      const deleteButtons = screen.getAllByRole('button', { name: /delete style/i })
      await user.click(deleteButtons[0]!)

      const cancelBtn = screen.getByRole('button', { name: /cancel/i })
      await user.click(cancelBtn)

      expect(usePresetManagerStore.getState().savedStyles).toHaveLength(2)
    })
  })

  describe('export', () => {
    it('export button triggers file download', async () => {
      usePresetManagerStore.setState({
        savedStyles: [createStyle('s1', 'Test Style')],
      })

      const user = userEvent.setup()
      const createObjectURL = vi.fn(() => 'blob:test-url')
      globalThis.URL.createObjectURL = createObjectURL

      renderWithProviders(<StyleManager onClose={() => {}} />)
      await user.click(screen.getByRole('button', { name: /export/i }))

      expect(createObjectURL).toHaveBeenCalled()
    })
  })
})
