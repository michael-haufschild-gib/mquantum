import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { SettingsSection } from '@/components/sections/Settings/SettingsSection'
import { ToastProvider } from '@/contexts/ToastContext'
import {
  type SavedScene,
  type SavedStyle,
  usePresetManagerStore,
} from '@/stores/runtime/presetManagerStore'

const styleData: SavedStyle['data'] = {
  appearance: {},
  lighting: {},
  postProcessing: {},
  environment: {},
  pbr: {},
}

const sceneData: SavedScene['data'] = {
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

function renderWithToast() {
  return render(
    <ToastProvider>
      <SettingsSection defaultOpen={true} />
    </ToastProvider>
  )
}

describe('SettingsSection', () => {
  beforeEach(() => {
    localStorage.clear()
    usePresetManagerStore.setState({ savedStyles: [], savedScenes: [] })
  })

  it('clears in-memory saved presets when localStorage is cleared', async () => {
    const user = userEvent.setup()
    usePresetManagerStore.setState({
      savedStyles: [{ id: 'style-1', name: 'Stored Style', timestamp: 1, data: styleData }],
      savedScenes: [{ id: 'scene-1', name: 'Stored Scene', timestamp: 1, data: sceneData }],
    })
    localStorage.setItem('mquantum-preset-manager', 'persisted')

    renderWithToast()

    await user.click(screen.getByTestId('clear-localstorage-button'))
    await user.click(screen.getByRole('button', { name: 'Clear' }))

    expect(usePresetManagerStore.getState().savedStyles).toEqual([])
    expect(usePresetManagerStore.getState().savedScenes).toEqual([])
    expect(localStorage.getItem('mquantum-preset-manager')).toBeNull()
  })
})
