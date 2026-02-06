/**
 * Tests for ShadowsSection component
 *
 * Tests centralized shadow controls for Schroedinger object type:
 * - Basic rendering and no-lights state
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

    it('should show Volumetric controls (Strength, Steps) for schroedinger', () => {
      useGeometryStore.getState().setObjectType('schroedinger')
      useGeometryStore.getState().setDimension(4)

      render(<ShadowsSection defaultOpen />)

      // Component shows "Self-Shadow (Volumetric)" label
      expect(screen.getByText(/Self-Shadow \(Volumetric\)/)).toBeInTheDocument()
      expect(screen.getByTestId('schroedinger-shadow-strength')).toBeInTheDocument()
      expect(screen.getByTestId('schroedinger-shadow-steps')).toBeInTheDocument()
    })

    it('should not show SDF controls when object is schroedinger', () => {
      useGeometryStore.getState().setObjectType('schroedinger')
      useGeometryStore.getState().setDimension(4)

      render(<ShadowsSection defaultOpen />)

      expect(screen.queryByText('Raymarched Shadows')).not.toBeInTheDocument()
      expect(screen.queryByTestId('shadow-quality-select')).not.toBeInTheDocument()
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

    it('should show disabled styling for schroedinger when shadows are off', () => {
      useGeometryStore.getState().setObjectType('schroedinger')
      useGeometryStore.getState().setDimension(4)
      useExtendedObjectStore.getState().setSchroedingerShadowsEnabled(false)

      render(<ShadowsSection defaultOpen />)

      // For Schroedinger, use the shadow strength control
      const settingsContainer = screen
        .getByTestId('schroedinger-shadow-strength')
        .closest('[aria-disabled]')
      expect(settingsContainer).toHaveAttribute('aria-disabled', 'true')
    })
  })
})
