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

  it('uses a single desktop representation toggle button with three-state cycle', async () => {
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
    expect(toggle).toHaveTextContent('Wigner')
    expect(toggle.className).toBe(initialClassName)
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('wigner')

    await user.click(toggle)
    expect(toggle).toHaveTextContent('Position')
    expect(toggle.className).toBe(initialClassName)
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('position')
  })

  it('uses a single mobile icon toggle that cycles through representations', async () => {
    const user = userEvent.setup()
    render(<TopBarControls compact={true} />)

    const repButton = screen.getByLabelText('Representation: Position')
    const initialClassName = repButton.className
    await user.click(repButton)
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('momentum')

    const momentumButton = screen.getByLabelText('Representation: Momentum')
    expect(momentumButton).toBeInTheDocument()
    expect(momentumButton.className).toBe(initialClassName)

    await user.click(momentumButton)
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('wigner')

    const wignerButton = screen.getByLabelText('Representation: Wigner')
    expect(wignerButton).toBeInTheDocument()
  })
})
