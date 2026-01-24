/**
 * Tests for ShadowsSection component
 *
 * Tests centralized shadow controls for all object types:
 * - Basic rendering and no-lights state
 * - Object type switching (SDF, Volumetric, Polytope)
 * - Shadow toggle behavior
 * - Disabled state styling
 */

import { ShadowsSection } from '@/components/sections/Shadows/ShadowsSection'
import type { LightSource } from '@/rendering/lights/types'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { useLightingStore } from '@/stores/lightingStore'
import { LIGHTING_INITIAL_STATE } from '@/stores/slices/lightingSlice'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

/**
 * Helper to create lighting state with at least one enabled light
 * @returns Array of LightSource with first light enabled
 */
function createLightsWithOneEnabled(): LightSource[] {
  const lights = LIGHTING_INITIAL_STATE.lights
  // Enable the first light
  return lights.map((light, index) => (index === 0 ? { ...light, enabled: true } : light))
}

describe('ShadowsSection', () => {
  beforeEach(() => {
    // Reset stores before each test
    useGeometryStore.getState().reset()
    useExtendedObjectStore.getState().reset()
    useLightingStore.setState(LIGHTING_INITIAL_STATE)
  })

  describe('Basic Rendering', () => {
    it('should render section with correct title and data-testid', () => {
      render(<ShadowsSection defaultOpen />)
      expect(screen.getByTestId('section-shadows')).toBeInTheDocument()
      expect(screen.getByText('Shadows')).toBeInTheDocument()
    })

    it('should show "Add lights to enable shadows" message when no lights enabled', () => {
      // Disable all lights
      useLightingStore.setState({
        ...LIGHTING_INITIAL_STATE,
        lights: LIGHTING_INITIAL_STATE.lights.map((light) => ({
          ...light,
          enabled: false,
        })),
      })

      render(<ShadowsSection defaultOpen />)
      expect(screen.getByText('Add lights to enable shadows.')).toBeInTheDocument()
    })

    it('should show shadow controls when lights are enabled', () => {
      useLightingStore.setState({
        ...LIGHTING_INITIAL_STATE,
        lights: createLightsWithOneEnabled(),
      })

      render(<ShadowsSection defaultOpen />)
      expect(screen.getByTestId('shadow-enabled-toggle')).toBeInTheDocument()
      expect(screen.getByText('Enable shadows')).toBeInTheDocument()
    })

    it('should accept defaultOpen prop for expansion state', () => {
      useLightingStore.setState({
        ...LIGHTING_INITIAL_STATE,
        lights: createLightsWithOneEnabled(),
      })

      // Test with defaultOpen=true - should be expanded
      render(<ShadowsSection defaultOpen={true} />)
      expect(screen.getByTestId('section-shadows')).toBeInTheDocument()
      const header = screen.getByTestId('section-shadows-header')
      expect(header).toHaveAttribute('aria-expanded', 'true')
    })
  })

  describe('Object Type Switching', () => {
    beforeEach(() => {
      // Enable lights for all object type tests
      useLightingStore.setState({
        ...LIGHTING_INITIAL_STATE,
        lights: createLightsWithOneEnabled(),
      })
    })

    it('should show SDF controls (Quality, Softness) for mandelbulb', () => {
      useGeometryStore.getState().setObjectType('mandelbulb')
      useGeometryStore.getState().setDimension(4)

      render(<ShadowsSection defaultOpen />)

      // Component shows the shadow type label, not a settings header
      expect(screen.getByText(/Self-Shadow \(Raymarched\)/)).toBeInTheDocument()
      expect(screen.getByTestId('shadow-quality-select')).toBeInTheDocument()
      expect(screen.getByTestId('shadow-softness-slider')).toBeInTheDocument()
    })

    it('should show SDF controls for quaternion-julia', () => {
      useGeometryStore.getState().setObjectType('quaternion-julia')
      useGeometryStore.getState().setDimension(4)

      render(<ShadowsSection defaultOpen />)

      // Component shows the shadow type label, not a settings header
      expect(screen.getByText(/Self-Shadow \(Raymarched\)/)).toBeInTheDocument()
      expect(screen.getByTestId('shadow-quality-select')).toBeInTheDocument()
      expect(screen.getByTestId('shadow-softness-slider')).toBeInTheDocument()
    })

    it('should show Volumetric controls (Strength, Steps) for schroedinger', () => {
      useGeometryStore.getState().setObjectType('schroedinger')
      useGeometryStore.getState().setDimension(4)

      render(<ShadowsSection defaultOpen />)

      // Component shows "Self-Shadow (Volumetric)" label
      expect(screen.getByText(/Self-Shadow \(Volumetric\)/)).toBeInTheDocument()
      expect(screen.getByTestId('schroedinger-shadow-strength')).toBeInTheDocument()
      expect(screen.getByTestId('schroedinger-shadow-steps')).toBeInTheDocument()
    })

    it('should show Shadow Map controls (Bias, Blur) for polytope', () => {
      useGeometryStore.getState().setObjectType('wythoff-polytope')
      useGeometryStore.getState().setDimension(4)

      render(<ShadowsSection defaultOpen />)

      // Component shows "Environment Shadow" label, no separate header
      expect(screen.getByText(/Environment Shadow/)).toBeInTheDocument()
      expect(screen.getByTestId('shadow-map-bias')).toBeInTheDocument()
      expect(screen.getByTestId('shadow-map-blur')).toBeInTheDocument()
    })

    it('should not show SDF controls when object is schroedinger', () => {
      useGeometryStore.getState().setObjectType('schroedinger')
      useGeometryStore.getState().setDimension(4)

      render(<ShadowsSection defaultOpen />)

      expect(screen.queryByText('Raymarched Shadows')).not.toBeInTheDocument()
      expect(screen.queryByTestId('shadow-quality-select')).not.toBeInTheDocument()
    })

    it('should not show Volumetric controls when object is mandelbulb', () => {
      useGeometryStore.getState().setObjectType('mandelbulb')
      useGeometryStore.getState().setDimension(4)

      render(<ShadowsSection defaultOpen />)

      expect(screen.queryByText('Volumetric Self-Shadowing')).not.toBeInTheDocument()
      expect(screen.queryByTestId('schroedinger-shadow-strength')).not.toBeInTheDocument()
    })

    it('should not show Shadow Map controls when object is SDF fractal', () => {
      useGeometryStore.getState().setObjectType('mandelbulb')
      useGeometryStore.getState().setDimension(4)

      render(<ShadowsSection defaultOpen />)

      expect(screen.queryByText('Shadow Map Settings')).not.toBeInTheDocument()
      expect(screen.queryByTestId('shadow-map-bias')).not.toBeInTheDocument()
    })
  })

  describe('Shadow Toggle Behavior', () => {
    beforeEach(() => {
      // Enable lights
      useLightingStore.setState({
        ...LIGHTING_INITIAL_STATE,
        lights: createLightsWithOneEnabled(),
        shadowEnabled: false,
      })
    })

    it('should toggle global shadowEnabled for SDF fractals', () => {
      useGeometryStore.getState().setObjectType('mandelbulb')
      useGeometryStore.getState().setDimension(4)

      render(<ShadowsSection defaultOpen />)

      const toggle = screen.getByTestId('shadow-enabled-toggle')
      expect(useLightingStore.getState().shadowEnabled).toBe(false)

      fireEvent.click(toggle)
      expect(useLightingStore.getState().shadowEnabled).toBe(true)
    })

    it('should toggle schroedingerShadowsEnabled for schroedinger', () => {
      useGeometryStore.getState().setObjectType('schroedinger')
      useGeometryStore.getState().setDimension(4)
      useExtendedObjectStore.getState().setSchroedingerShadowsEnabled(false)

      render(<ShadowsSection defaultOpen />)

      const toggle = screen.getByTestId('shadow-enabled-toggle')
      expect(useExtendedObjectStore.getState().schroedinger.shadowsEnabled).toBe(false)

      fireEvent.click(toggle)
      expect(useExtendedObjectStore.getState().schroedinger.shadowsEnabled).toBe(true)
    })

    it('should toggle global shadowEnabled for polytopes', () => {
      useGeometryStore.getState().setObjectType('wythoff-polytope')
      useGeometryStore.getState().setDimension(4)

      render(<ShadowsSection defaultOpen />)

      const toggle = screen.getByTestId('shadow-enabled-toggle')
      expect(useLightingStore.getState().shadowEnabled).toBe(false)

      fireEvent.click(toggle)
      expect(useLightingStore.getState().shadowEnabled).toBe(true)
    })
  })

  describe('Disabled State', () => {
    beforeEach(() => {
      // Enable lights
      useLightingStore.setState({
        ...LIGHTING_INITIAL_STATE,
        lights: createLightsWithOneEnabled(),
        shadowEnabled: false,
      })
    })

    it('should show disabled styling when shadows are off for SDF fractals', () => {
      useGeometryStore.getState().setObjectType('mandelbulb')
      useGeometryStore.getState().setDimension(4)

      render(<ShadowsSection defaultOpen />)

      // Find the container with disabled styling using a control inside the settings area
      const settingsContainer = screen
        .getByTestId('shadow-quality-select')
        .closest('[aria-disabled]')
      expect(settingsContainer).toHaveAttribute('aria-disabled', 'true')
    })

    it('should remove disabled styling when shadows are enabled', () => {
      useGeometryStore.getState().setObjectType('mandelbulb')
      useGeometryStore.getState().setDimension(4)
      useLightingStore.setState({
        ...useLightingStore.getState(),
        shadowEnabled: true,
      })

      render(<ShadowsSection defaultOpen />)

      const settingsContainer = screen
        .getByTestId('shadow-quality-select')
        .closest('[aria-disabled]')
      expect(settingsContainer).toHaveAttribute('aria-disabled', 'false')
    })

    it('should show disabled styling for schroedinger when shadows are off', () => {
      useGeometryStore.getState().setObjectType('schroedinger')
      useGeometryStore.getState().setDimension(4)
      useExtendedObjectStore.getState().setSchroedingerShadowsEnabled(false)

      render(<ShadowsSection defaultOpen />)

      // For Schrödinger, use the shadow strength control
      const settingsContainer = screen
        .getByTestId('schroedinger-shadow-strength')
        .closest('[aria-disabled]')
      expect(settingsContainer).toHaveAttribute('aria-disabled', 'true')
    })
  })
})
