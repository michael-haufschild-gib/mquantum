import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TopBarControls } from '@/components/layout/TopBarControls'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useUIStore } from '@/stores/uiStore'
import { useLayoutStore } from '@/stores/layoutStore'

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    addToast: vi.fn(),
  }),
}))

vi.mock('@/lib/audio/SoundManager', () => ({
  soundManager: {
    isEnabled: true,
    playHover: vi.fn(),
    playClick: vi.fn(),
    toggle: vi.fn(),
  },
}))

describe('TopBarControls', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useUIStore.getState().setShowPerfMonitor(false)
    if (useLayoutStore.getState().isCinematicMode) {
      useLayoutStore.getState().toggleCinematicMode()
    }
  })

  it('uses a single desktop representation toggle button with text flip', async () => {
    const user = userEvent.setup()
    render(<TopBarControls compact={false} />)

    const toggle = screen.getByTestId('control-representation-toggle')
    expect(toggle).toHaveTextContent('Position')
    const initialClassName = toggle.className

    await user.click(toggle)
    expect(toggle).toHaveTextContent('Momentum')
    expect(toggle.className).toBe(initialClassName)
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('momentum')

    await user.click(toggle)
    expect(toggle).toHaveTextContent('Position')
    expect(toggle.className).toBe(initialClassName)
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('position')
  })

  it('uses a single mobile icon toggle that flips action labels', async () => {
    const user = userEvent.setup()
    render(<TopBarControls compact={true} />)

    const toMomentum = screen.getByLabelText('Switch to Momentum Space')
    const initialClassName = toMomentum.className
    await user.click(toMomentum)
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('momentum')

    const toPosition = screen.getByLabelText('Switch to Position Space')
    expect(toPosition).toBeInTheDocument()
    expect(toPosition.className).toBe(initialClassName)
  })
})
