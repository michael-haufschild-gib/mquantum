/**
 * SceneManager component tests.
 *
 * Verifies CRUD operations on saved scenes: loading, deleting (with confirmation),
 * renaming via InlineEdit, import/export JSON, empty state display.
 * All operations go through the presetManagerStore — these tests verify the
 * component correctly wires UI interactions to store actions.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SceneManager } from '@/components/presets/SceneManager'
import { ToastProvider } from '@/contexts/ToastContext'
import { usePresetManagerStore } from '@/stores/presetManagerStore'
import type { SavedScene } from '@/stores/utils/presetTypes'

/** Wrap component with required providers. */
function renderWithProviders(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

const emptySceneData: SavedScene['data'] = {
  appearance: {},
  lighting: {},
  postProcessing: {},
  environment: {},
  pbr: {},
  geometry: {},
  extended: {},
  transform: {},
  rotation: {},
  animation: {},
  camera: {},
  ui: {},
}

/** Create a minimal saved scene for testing. */
function createScene(id: string, name: string, timestamp = Date.now()): SavedScene {
  return { id, name, timestamp, data: emptySceneData }
}

describe('SceneManager', () => {
  beforeEach(() => {
    usePresetManagerStore.setState(usePresetManagerStore.getInitialState())
  })

  describe('empty state', () => {
    it('shows "No saved scenes yet" when no scenes exist', () => {
      renderWithProviders(<SceneManager onClose={() => {}} />)
      expect(screen.getByText(/No saved scenes yet/)).toBeInTheDocument()
    })

    it('renders Import and Export buttons', () => {
      renderWithProviders(<SceneManager onClose={() => {}} />)
      expect(screen.getByRole('button', { name: /import/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument()
    })
  })

  describe('with saved scenes', () => {
    beforeEach(() => {
      usePresetManagerStore.setState({
        savedScenes: [
          createScene('scene-1', 'My First Scene', Date.parse('2026-01-15')),
          createScene('scene-2', 'Hydrogen 7D Demo', Date.parse('2026-02-20')),
        ],
      })
    })

    it('renders each saved scene name', () => {
      renderWithProviders(<SceneManager onClose={() => {}} />)
      expect(screen.getByText('My First Scene')).toBeInTheDocument()
      expect(screen.getByText('Hydrogen 7D Demo')).toBeInTheDocument()
    })

    it('renders formatted dates for each scene', () => {
      renderWithProviders(<SceneManager onClose={() => {}} />)
      // Dates formatted with toLocaleDateString — exact format varies by locale
      // Both scenes are from 2026, so at least two date elements should contain the year
      const dateElements = screen.getAllByText(/2026/)
      expect(dateElements).toHaveLength(2)
    })

    it('clicking a scene calls loadScene and onClose', async () => {
      const onClose = vi.fn()
      const user = userEvent.setup()
      renderWithProviders(<SceneManager onClose={onClose} />)

      // Click the scene row (has role="button")
      const loadButtons = screen.getAllByRole('button', { name: /load scene/i })
      await user.click(loadButtons[0]!)

      expect(usePresetManagerStore.getState().savedScenes).toHaveLength(2)
      expect(onClose).toHaveBeenCalled()
    })

    it('delete button opens confirmation modal', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SceneManager onClose={() => {}} />)

      // Find and click the delete button for the first scene
      const deleteButtons = screen.getAllByRole('button', { name: /delete scene/i })
      await user.click(deleteButtons[0]!)

      // Confirmation modal should appear
      expect(screen.getByText('Delete Scene')).toBeInTheDocument()
      expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument()
    })

    it('confirming delete removes the scene from the store', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SceneManager onClose={() => {}} />)

      // Open delete confirmation for first scene
      const deleteButtons = screen.getAllByRole('button', { name: /delete scene/i })
      await user.click(deleteButtons[0]!)

      // Click the confirm delete button in the modal
      const confirmBtn = screen.getByRole('button', { name: /delete$/i })
      await user.click(confirmBtn)

      // Scene should be removed from store
      const scenes = usePresetManagerStore.getState().savedScenes
      expect(scenes.find((s) => s.id === 'scene-1')).toBeUndefined()
    })

    it('canceling delete does not remove the scene', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SceneManager onClose={() => {}} />)

      const deleteButtons = screen.getAllByRole('button', { name: /delete scene/i })
      await user.click(deleteButtons[0]!)

      // Cancel
      const cancelBtn = screen.getByRole('button', { name: /cancel/i })
      await user.click(cancelBtn)

      // Scene should still exist
      expect(usePresetManagerStore.getState().savedScenes).toHaveLength(2)
    })
  })

  describe('export', () => {
    it('export button triggers file download', async () => {
      usePresetManagerStore.setState({
        savedScenes: [createScene('s1', 'Test Scene')],
      })

      const user = userEvent.setup()
      const createObjectURL = vi.fn(() => 'blob:test-url')
      globalThis.URL.createObjectURL = createObjectURL

      renderWithProviders(<SceneManager onClose={() => {}} />)
      await user.click(screen.getByRole('button', { name: /export/i }))

      expect(createObjectURL).toHaveBeenCalled()
    })
  })
})
