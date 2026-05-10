/**
 * Tests for SchroedingerAnimationDrawer component
 *
 * Tests quantum wavefunction animation controls:
 * - Time Evolution
 * - Wavepacket Dispersion
 * - Interference Fringing
 * - Phase Shimmer
 * - Slice Animation (4D+ only)
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { SchroedingerAnimationDrawer } from '@/components/layout/TimelineControls/SchroedingerAnimationDrawer'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

describe('SchroedingerAnimationDrawer', () => {
  beforeEach(() => {
    // Reset stores before each test
    useExtendedObjectStore.getState().reset()
    useGeometryStore.getState().reset()
    useGeometryStore.getState().setDimension(3)
    useGeometryStore.getState().setObjectType('schroedinger')
  })

  it('should render Time Evolution controls', () => {
    render(<SchroedingerAnimationDrawer />)
    expect(screen.getByText('Time Evolution')).toBeInTheDocument()
  })

  it('should have correct test ids', () => {
    render(<SchroedingerAnimationDrawer />)
    expect(screen.getByTestId('schroedinger-animation-drawer')).toBeInTheDocument()
    expect(screen.getByTestId('animation-panel-timeEvolution')).toBeInTheDocument()
  })

  it('should not show Dimensional Sweeps for 3D', () => {
    useGeometryStore.getState().setDimension(3)
    render(<SchroedingerAnimationDrawer />)
    expect(screen.queryByText('Dimensional Sweeps')).not.toBeInTheDocument()
  })

  it('should show Dimensional Sweeps for 4D', () => {
    useGeometryStore.getState().setDimension(4)
    render(<SchroedingerAnimationDrawer />)
    expect(screen.getByText('Dimensional Sweeps')).toBeInTheDocument()
    expect(screen.getByTestId('animation-panel-sliceAnimation')).toBeInTheDocument()
  })

  it('should render toggle buttons for animation systems', () => {
    render(<SchroedingerAnimationDrawer />)

    // Each toggleable system has a toggle button with "OFF" initially
    const offButtons = screen.getAllByText('OFF')
    expect(offButtons.length).toBeGreaterThanOrEqual(1)
  })

  it('should not render Open Quantum controls in the Anim panel', () => {
    render(<SchroedingerAnimationDrawer />)
    expect(screen.queryByTestId('animation-panel-openQuantum')).not.toBeInTheDocument()
  })

  it('should toggle Phase Shimmer', () => {
    render(<SchroedingerAnimationDrawer />)

    const toggleBtn = screen.getByRole('button', { name: /toggle phase shimmer/i })
    expect(toggleBtn).toBeInTheDocument()

    // Initially off
    expect(useExtendedObjectStore.getState().schroedinger.phaseShimmerEnabled).toBe(false)

    // Click to enable
    fireEvent.click(toggleBtn)
    expect(useExtendedObjectStore.getState().schroedinger.phaseShimmerEnabled).toBe(true)
  })

  it('should toggle Slice Animation for 4D', () => {
    useGeometryStore.getState().setDimension(4)
    render(<SchroedingerAnimationDrawer />)

    const toggleBtn = screen.getByRole('button', { name: /toggle dimensional sweeps/i })
    fireEvent.click(toggleBtn)
    expect(useExtendedObjectStore.getState().schroedinger.sliceAnimationEnabled).toBe(true)
  })

  it('should render Time Scale slider', () => {
    render(<SchroedingerAnimationDrawer />)
    expect(screen.getByText('Time Scale')).toBeInTheDocument()
  })

  it('should render amplitude and speed sliders for Slice Animation in 4D', () => {
    useGeometryStore.getState().setDimension(4)
    render(<SchroedingerAnimationDrawer />)

    // Slice Animation has Amplitude and Speed
    const amplitudeLabels = screen.getAllByText('Amplitude')
    expect(amplitudeLabels.length).toBeGreaterThanOrEqual(1)

    const speedLabels = screen.getAllByText('Speed')
    expect(speedLabels.length).toBeGreaterThanOrEqual(1)
  })

  it('should have disabled state when animation is off', () => {
    render(<SchroedingerAnimationDrawer />)

    // Phase Shimmer is off — its parameter group should be aria-disabled
    const paramGroup = screen.getByRole('group', { name: 'Phase Shimmer parameters' })
    expect(paramGroup).toHaveAttribute('aria-disabled', 'true')
  })

  it('should render Probability Current animation type controls and update settings', () => {
    render(<SchroedingerAnimationDrawer />)

    expect(screen.getByTestId('animation-panel-probabilityCurrent')).toBeInTheDocument()

    const toggle = screen.getByTestId('schroedinger-probability-current-toggle')
    fireEvent.click(toggle)
    expect(useExtendedObjectStore.getState().schroedinger.probabilityCurrentEnabled).toBe(true)

    fireEvent.change(screen.getByTestId('schroedinger-probability-current-style'), {
      target: { value: 'arrows' },
    })
    expect(useExtendedObjectStore.getState().schroedinger.probabilityCurrentStyle).toBe('arrows')
    expect(screen.getByTestId('schroedinger-probability-current-opacity')).toBeInTheDocument()

    fireEvent.change(screen.getByTestId('schroedinger-probability-current-style'), {
      target: { value: 'streamlines' },
    })
    expect(screen.getByTestId('schroedinger-probability-current-steps')).toBeInTheDocument()
  })
})
