import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TimelineControls } from '@/components/layout/TimelineControls'

const mockGeometryState = {
  dimension: 4,
  objectType: 'schroedinger',
}

vi.mock('@/stores/geometryStore', () => ({
  useGeometryStore: vi.fn((selector) => {
    return selector ? selector(mockGeometryState) : mockGeometryState
  }),
}))

const mockRandomizePlanes = vi.fn()

const mockResetSchroedingerParameters = vi.fn()
const mockResetFreeScalarField = vi.fn()
const mockResetTdseField = vi.fn()
const mockResetBecField = vi.fn()
const mockSetDiracNeedsReset = vi.fn()
const mockResetPauliField = vi.fn()
const mockRequestOpenQuantumStateReset = vi.fn()

const mockExtendedState = {
  schroedinger: {
    quantumMode: 'harmonicOscillator',
    representation: 'position',
    sliceAnimationEnabled: false,
    interferenceEnabled: false,
    phaseShimmerEnabled: false,
    probabilityCurrentEnabled: false,
    phaseAnimationEnabled: false,
    openQuantum: {
      enabled: false,
      dephasingEnabled: true,
      relaxationEnabled: false,
      thermalEnabled: false,
    },
  },
  pauliSpinor: {
    sliceAnimationEnabled: false,
  },
  resetSchroedingerParameters: mockResetSchroedingerParameters,
  resetFreeScalarField: mockResetFreeScalarField,
  resetTdseField: mockResetTdseField,
  resetBecField: mockResetBecField,
  setDiracNeedsReset: mockSetDiracNeedsReset,
  resetPauliField: mockResetPauliField,
  requestOpenQuantumStateReset: mockRequestOpenQuantumStateReset,
}

vi.mock('@/stores/animationStore', () => ({
  useAnimationStore: vi.fn((selector) => {
    const state = {
      isPlaying: false,
      speed: 1,
      direction: 1,
      animatingPlanes: new Set(['XY']),
      toggle: vi.fn(),
      setSpeed: vi.fn(),
      toggleDirection: vi.fn(),
      togglePlane: vi.fn(),
      stopAll: vi.fn(),
      animateAll: vi.fn(),
      randomizePlanes: mockRandomizePlanes,
      resetToFirstPlane: vi.fn(),
      clearAllPlanes: vi.fn(),
    }
    return selector ? selector(state) : state
  }),
  MIN_SPEED: 0.1,
  MAX_SPEED: 5,
}))

vi.mock('@/stores/uiStore', () => ({
  useUIStore: vi.fn((selector) => {
    const state = {
      animationBias: 0,
      setAnimationBias: vi.fn(),
    }
    return selector ? selector(state) : state
  }),
}))

vi.mock('@/stores/defaults/visualDefaults', () => ({
  MIN_ANIMATION_BIAS: 0,
  MAX_ANIMATION_BIAS: 1,
}))

vi.mock('@/stores/extendedObjectStore', () => ({
  useExtendedObjectStore: vi.fn((selector) => {
    return selector ? selector(mockExtendedState) : mockExtendedState
  }),
}))

vi.mock('zustand/react/shallow', () => ({
  useShallow: <T,>(selector: T) => selector,
}))

// Mock the sound manager
vi.mock('@/lib/audio/SoundManager', () => ({
  soundManager: {
    playClick: vi.fn(),
    playHover: vi.fn(),
    playSwish: vi.fn(),
  },
}))

describe('TimelineControls', () => {
  beforeEach(() => {
    mockGeometryState.dimension = 4
    mockGeometryState.objectType = 'schroedinger'
    mockExtendedState.schroedinger.sliceAnimationEnabled = false
    mockExtendedState.schroedinger.interferenceEnabled = false
    mockExtendedState.schroedinger.phaseShimmerEnabled = false
    mockExtendedState.schroedinger.probabilityCurrentEnabled = false
    mockExtendedState.schroedinger.quantumMode = 'harmonicOscillator'
    mockExtendedState.schroedinger.representation = 'position'
    mockRandomizePlanes.mockClear()
    mockResetSchroedingerParameters.mockClear()
    mockResetFreeScalarField.mockClear()
    mockResetTdseField.mockClear()
    mockResetBecField.mockClear()
    mockSetDiracNeedsReset.mockClear()
    mockResetPauliField.mockClear()
    mockRequestOpenQuantumStateReset.mockClear()
  })

  it('toggles Rotate drawer when button is clicked', async () => {
    render(<TimelineControls />)

    // Check initial state - button text is "Rotate"
    const rotButton = screen.getByText(/Rotate/i)
    expect(rotButton).toBeInTheDocument()

    // Plane buttons should NOT be visible yet
    expect(screen.queryByText('XY', { selector: 'button' })).not.toBeInTheDocument()

    // Click Rotate button
    fireEvent.click(rotButton)

    // Now drawer should be open, and "XY" button visible
    expect(screen.getByText('XY')).toBeInTheDocument()

    // Click Rotate again to close
    fireEvent.click(rotButton)
    await waitFor(() => {
      expect(screen.queryByText('XY', { selector: 'button' })).not.toBeInTheDocument()
    })
  })

  it('does not show Stop All button in main bar, but shows Deselect All in drawer', () => {
    render(<TimelineControls />)

    // Stop All button should be removed from main bar
    expect(screen.queryByTitle('Stop All')).not.toBeInTheDocument()

    // Open drawer
    const rotButton = screen.getByText(/Rotate/i)
    fireEvent.click(rotButton)

    // Deselect All button (functionally the stop button) should be in drawer
    expect(screen.getByText('Deselect All')).toBeInTheDocument()
  })

  it('shows randomize button in rotation drawer', () => {
    render(<TimelineControls />)

    // Open rotation drawer
    const rotButton = screen.getByText(/Rotate/i)
    fireEvent.click(rotButton)

    // Check for dice/randomize button
    const randomizeButton = screen.getByRole('button', { name: /randomize rotation planes/i })
    expect(randomizeButton).toBeInTheDocument()
  })

  it('calls randomizePlanes when dice button is clicked', () => {
    render(<TimelineControls />)

    // Open rotation drawer
    const rotButton = screen.getByText(/Rotate/i)
    fireEvent.click(rotButton)

    // Click randomize button
    const randomizeButton = screen.getByRole('button', { name: /randomize rotation planes/i })
    fireEvent.click(randomizeButton)

    // Verify randomizePlanes was called with the current dimension (4)
    expect(mockRandomizePlanes).toHaveBeenCalledWith(4)
  })

  it('closes rotation drawer when close button is clicked', async () => {
    render(<TimelineControls />)

    // Open rotation drawer
    const rotButton = screen.getByText(/Rotate/i)
    fireEvent.click(rotButton)

    // Drawer should be open
    expect(screen.getByText('XY')).toBeInTheDocument()

    // Click close button (floating close button uses "Close drawer" aria label)
    const closeButton = screen.getByRole('button', { name: /close drawer/i })
    fireEvent.click(closeButton)

    // Drawer should be closed
    await waitFor(() => {
      expect(screen.queryByText('XY', { selector: 'button' })).not.toBeInTheDocument()
    })
  })

  it('counts probability current as an animation type for schroedinger', () => {
    mockGeometryState.objectType = 'schroedinger'
    mockExtendedState.schroedinger.probabilityCurrentEnabled = true

    render(<TimelineControls />)

    const animButton = screen.getByRole('button', { name: /toggle animations drawer/i })
    expect((animButton.textContent ?? '').replace(/\s+/g, '')).toContain('Effects1')
  })

  it('shows an Open Q drawer toggle for schroedinger mode', () => {
    mockGeometryState.objectType = 'schroedinger'
    mockExtendedState.schroedinger.quantumMode = 'harmonicOscillator'

    render(<TimelineControls />)

    expect(screen.getByRole('button', { name: /toggle open quantum drawer/i })).toBeInTheDocument()
  })

  it('hides Open Q drawer toggle in wigner representation', () => {
    mockGeometryState.objectType = 'schroedinger'
    mockExtendedState.schroedinger.quantumMode = 'harmonicOscillator'
    mockExtendedState.schroedinger.representation = 'wigner'

    render(<TimelineControls />)

    expect(
      screen.queryByRole('button', { name: /toggle open quantum drawer/i })
    ).not.toBeInTheDocument()
  })

  it('renders restart button before play/pause', () => {
    render(<TimelineControls />)

    const resetButton = screen.getByRole('button', { name: /reset wavefunction/i })
    expect(resetButton).toBeInTheDocument()
  })

  it.each(['harmonicOscillator', 'hydrogenND', 'hydrogenNDCoupled'] as const)(
    'calls resetSchroedingerParameters and requestOpenQuantumStateReset when restart clicked in %s mode',
    (mode) => {
      mockGeometryState.objectType = 'schroedinger'
      mockExtendedState.schroedinger.quantumMode = mode

      render(<TimelineControls />)

      fireEvent.click(screen.getByRole('button', { name: /reset wavefunction/i }))
      expect(mockResetSchroedingerParameters).toHaveBeenCalledOnce()
      expect(mockRequestOpenQuantumStateReset).toHaveBeenCalledOnce()
    }
  )

  it('calls resetTdseField when restart clicked in TDSE mode', () => {
    mockGeometryState.objectType = 'schroedinger'
    mockExtendedState.schroedinger.quantumMode = 'tdseDynamics'

    render(<TimelineControls />)

    fireEvent.click(screen.getByRole('button', { name: /reset wavefunction/i }))
    expect(mockResetTdseField).toHaveBeenCalledOnce()
  })

  it('calls resetPauliField when restart clicked in Pauli mode', () => {
    mockGeometryState.objectType = 'pauliSpinor'

    render(<TimelineControls />)

    fireEvent.click(screen.getByRole('button', { name: /reset wavefunction/i }))
    expect(mockResetPauliField).toHaveBeenCalledOnce()
  })

  it('calls resetFreeScalarField when restart clicked in FSF mode', () => {
    mockGeometryState.objectType = 'schroedinger'
    mockExtendedState.schroedinger.quantumMode = 'freeScalarField'

    render(<TimelineControls />)

    fireEvent.click(screen.getByRole('button', { name: /reset wavefunction/i }))
    expect(mockResetFreeScalarField).toHaveBeenCalledOnce()
  })

  it('calls resetBecField when restart clicked in BEC mode', () => {
    mockGeometryState.objectType = 'schroedinger'
    mockExtendedState.schroedinger.quantumMode = 'becDynamics'

    render(<TimelineControls />)

    fireEvent.click(screen.getByRole('button', { name: /reset wavefunction/i }))
    expect(mockResetBecField).toHaveBeenCalledOnce()
  })

  it('calls setDiracNeedsReset when restart clicked in Dirac mode', () => {
    mockGeometryState.objectType = 'schroedinger'
    mockExtendedState.schroedinger.quantumMode = 'diracEquation'

    render(<TimelineControls />)

    fireEvent.click(screen.getByRole('button', { name: /reset wavefunction/i }))
    expect(mockSetDiracNeedsReset).toHaveBeenCalledOnce()
  })

  it('shows Open Quantum badge with 0 when disabled', () => {
    mockExtendedState.schroedinger.openQuantum.enabled = false
    mockExtendedState.schroedinger.openQuantum.dephasingEnabled = true
    mockExtendedState.schroedinger.openQuantum.relaxationEnabled = true

    render(<TimelineControls />)

    const button = screen.getByRole('button', { name: /toggle open quantum drawer, 0 active/i })
    expect(button).toHaveTextContent('0')
  })

  it('counts active Lindblad channels in Open Quantum badge', () => {
    mockExtendedState.schroedinger.openQuantum.enabled = true
    mockExtendedState.schroedinger.openQuantum.dephasingEnabled = true
    mockExtendedState.schroedinger.openQuantum.relaxationEnabled = false
    mockExtendedState.schroedinger.openQuantum.thermalEnabled = true

    render(<TimelineControls />)

    const button = screen.getByRole('button', { name: /toggle open quantum drawer, 2 active/i })
    expect(button).toBeInTheDocument()
  })

  it('shows badge count of 1 for hydrogen modes regardless of channel flags', () => {
    mockExtendedState.schroedinger.quantumMode = 'hydrogenND'
    mockExtendedState.schroedinger.openQuantum.enabled = true
    mockExtendedState.schroedinger.openQuantum.dephasingEnabled = true
    mockExtendedState.schroedinger.openQuantum.relaxationEnabled = true
    mockExtendedState.schroedinger.openQuantum.thermalEnabled = true

    render(<TimelineControls />)

    const button = screen.getByRole('button', { name: /toggle open quantum drawer, 1 active/i })
    expect(button).toBeInTheDocument()
  })
})
