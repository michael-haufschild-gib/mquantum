import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TopBarControls } from '@/components/layout/TopBarControls'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useLayoutStore } from '@/stores/ui/layoutStore'
import { useUIStore } from '@/stores/ui/uiStore'

const { addToastMock } = vi.hoisted(() => ({
  addToastMock: vi.fn(),
}))

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    addToast: addToastMock,
  }),
}))

vi.mock('@/lib/audio/SoundManager', () => ({
  soundManager: {
    isEnabled: true,
    playHover: vi.fn(),
    playClick: vi.fn(),
    toggle: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    getSnapshot: vi.fn(() => true),
  },
}))

describe('TopBarControls', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useUIStore.getState().setShowPerfMonitor(false)
    addToastMock.mockClear()
    if (useLayoutStore.getState().isCinematicMode) {
      useLayoutStore.getState().toggleCinematicMode()
    }
  })

  it('uses a single desktop representation toggle button with three-state cycle', async () => {
    const user = userEvent.setup()
    render(<TopBarControls compact={false} />)

    const toggle = screen.getByTestId('control-representation-toggle')
    expect(toggle).toHaveTextContent('Position')
    const initialClasses = [...toggle.classList]

    await user.click(toggle)
    expect(toggle).toHaveTextContent('Momentum')
    expect([...toggle.classList]).toEqual(initialClasses)
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('momentum')

    await user.click(toggle)
    expect(toggle).toHaveTextContent('Wigner')
    expect([...toggle.classList]).toEqual(initialClasses)
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('wigner')

    await user.click(toggle)
    expect(toggle).toHaveTextContent('Position')
    expect([...toggle.classList]).toEqual(initialClasses)
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('position')
  })

  it('uses a single mobile icon toggle that cycles through representations', async () => {
    const user = userEvent.setup()
    render(<TopBarControls compact={true} />)

    // `getByLabelText` is an assertion on its own — it throws if the label is
    // missing — so the earlier redundant `toBeInTheDocument()` calls have been
    // removed. What matters here is that (1) the compact variant exposes a
    // *single* toggle button per representation (not one per representation
    // in parallel) and (2) clicking it cycles the store forward.
    const repButton = screen.getByLabelText('Representation: Position')
    const initialClasses = [...repButton.classList]
    await user.click(repButton)
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('momentum')

    // The same button now advertises the new representation via its label.
    // The class list must be unchanged — the compact toggle is intentionally
    // stateless-looking so the active/not-active distinction comes from the
    // icon swap, not a style change.
    const momentumButton = screen.getByLabelText('Representation: Momentum')
    expect([...momentumButton.classList]).toEqual(initialClasses)
    // Only one toggle exists at a time — the previous representation must be gone.
    expect(screen.queryByLabelText('Representation: Position')).toBeNull()

    await user.click(momentumButton)
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('wigner')
    expect(screen.queryByLabelText('Representation: Momentum')).toBeNull()

    // Final advance — verifies the cycle reaches the third state. The
    // position-only leg (wigner → position) is covered by the desktop test.
    // `toBeInTheDocument` is kept (even though `getByLabelText` already
    // throws) to satisfy `testing-library/prefer-explicit-assert`.
    expect(screen.getByLabelText('Representation: Wigner')).toBeInTheDocument()
  })

  it('disables the representation toggle and shows "Position (locked)" in compute modes', async () => {
    // Enter a compute quantum mode so the representation control should lock.
    // Regression guard: this used to be covered only by the e2e spec
    // (`representation locked in compute modes`); running it as a unit test
    // catches the regression orders of magnitude faster and without GPU.
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('tdseDynamics')

    render(<TopBarControls compact={false} />)

    const toggle = screen.getByTestId('control-representation-toggle')
    expect(toggle).toBeDisabled()
    expect(toggle).toHaveTextContent(/Position \(locked\)/i)

    // Clicking must not change the store — the disabled attribute blocks
    // synthetic events, but we assert the store invariant explicitly so a
    // future code path that bypasses `disabled` (e.g. a keyboard shortcut)
    // would still fail this test.
    const user = userEvent.setup()
    const initialRep = useExtendedObjectStore.getState().schroedinger.representation
    await user.click(toggle)
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe(initialRep)
  })

  it('reports fullscreen request failures without leaving an unhandled rejection', async () => {
    const user = userEvent.setup()
    const originalRequestFullscreen = document.documentElement.requestFullscreen
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error('fullscreen blocked')),
    })

    try {
      render(<TopBarControls compact={false} />)

      await user.click(screen.getByLabelText('Fullscreen'))

      await waitFor(() => {
        expect(addToastMock).toHaveBeenCalledWith('Fullscreen unavailable', 'error')
      })
    } finally {
      Object.defineProperty(document.documentElement, 'requestFullscreen', {
        configurable: true,
        value: originalRequestFullscreen,
      })
    }
  })
})
