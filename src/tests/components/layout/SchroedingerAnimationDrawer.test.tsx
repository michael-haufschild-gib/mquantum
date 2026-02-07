/**
 * Tests for SchroedingerAnimationDrawer component
 *
 * Tests quantum wavefunction animation controls:
 * - Time Evolution
 * - Wavepacket Dispersion
 * - Interference Fringing
 * - Probability Flow
 * - Slice Animation (4D+ only)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SchroedingerAnimationDrawer } from '@/components/layout/TimelineControls/SchroedingerAnimationDrawer'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'

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

  it('should toggle Probability Flow', () => {
    render(<SchroedingerAnimationDrawer />)

    const toggleBtn = screen.getByRole('button', { name: /toggle probability current flow/i })
    expect(toggleBtn).toBeInTheDocument()

    // Initially off
    expect(useExtendedObjectStore.getState().schroedinger.probabilityFlowEnabled).toBe(false)

    // Click to enable
    fireEvent.click(toggleBtn)
    expect(useExtendedObjectStore.getState().schroedinger.probabilityFlowEnabled).toBe(true)
  })

  it('should toggle Slice Animation for 4D', () => {
    useGeometryStore.getState().setDimension(4)
    render(<SchroedingerAnimationDrawer />)

    const toggleBtn = screen.getByRole('button', { name: /toggle slice animation/i })
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

  it('should have disabled state styling when animation is off', () => {
    render(<SchroedingerAnimationDrawer />)

    // Probability Flow is off, its parameter container should have opacity-50
    const flowPanel = screen.getByTestId('animation-panel-probabilityFlow')
    const paramContainer = flowPanel.querySelector('.opacity-50')
    expect(paramContainer).toBeInTheDocument()
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
