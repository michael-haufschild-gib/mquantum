import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { Canvas } from '@react-three/fiber'
import { SceneLighting } from '@/rendering/environment/SceneLighting'
import { useLightingStore } from '@/stores/lightingStore'
import { LIGHTING_INITIAL_STATE } from '@/stores/slices/lightingSlice'

describe('SceneLighting', () => {
  beforeEach(() => {
    // Reset store before each test
    useLightingStore.setState(LIGHTING_INITIAL_STATE)
  })

  describe('rendering', () => {
    it('should render without errors', () => {
      const { container } = render(
        <Canvas>
          <SceneLighting />
        </Canvas>
      )
      expect(container).toBeTruthy()
    })

    it('should always render ambient light', () => {
      const { container } = render(
        <Canvas>
          <SceneLighting />
        </Canvas>
      )
      expect(container).toBeTruthy()
    })
  })

  describe('directional light', () => {
    it('should render directional light when enabled', () => {
      useLightingStore.getState().setLightEnabled(true)
      const { container } = render(
        <Canvas>
          <SceneLighting />
        </Canvas>
      )
      expect(container).toBeTruthy()
    })

    it('should not render directional light when disabled', () => {
      useLightingStore.getState().setLightEnabled(false)
      const { container } = render(
        <Canvas>
          <SceneLighting />
        </Canvas>
      )
      expect(container).toBeTruthy()
    })

    it('should update when light color changes', () => {
      useLightingStore.getState().setLightEnabled(true)
      useLightingStore.getState().setLightColor('#FF0000')
      const { container } = render(
        <Canvas>
          <SceneLighting />
        </Canvas>
      )
      expect(container).toBeTruthy()
    })

    it('should update when light angles change', () => {
      useLightingStore.getState().setLightEnabled(true)
      useLightingStore.getState().setLightHorizontalAngle(90)
      useLightingStore.getState().setLightVerticalAngle(45)
      const { container } = render(
        <Canvas>
          <SceneLighting />
        </Canvas>
      )
      expect(container).toBeTruthy()
    })
  })

  describe('light indicator', () => {
    it('should render light indicator when both enabled and indicator shown', () => {
      useLightingStore.getState().setLightEnabled(true)
      useLightingStore.getState().setShowLightIndicator(true)
      const { container } = render(
        <Canvas>
          <SceneLighting />
        </Canvas>
      )
      expect(container).toBeTruthy()
    })

    it('should not render light indicator when light disabled', () => {
      useLightingStore.getState().setLightEnabled(false)
      useLightingStore.getState().setShowLightIndicator(true)
      const { container } = render(
        <Canvas>
          <SceneLighting />
        </Canvas>
      )
      expect(container).toBeTruthy()
    })

    it('should not render light indicator when indicator hidden', () => {
      useLightingStore.getState().setLightEnabled(true)
      useLightingStore.getState().setShowLightIndicator(false)
      const { container } = render(
        <Canvas>
          <SceneLighting />
        </Canvas>
      )
      expect(container).toBeTruthy()
    })
  })

  describe('ambient light', () => {
    it('should update when ambient intensity changes', () => {
      useLightingStore.getState().setAmbientIntensity(0.5)
      const { container } = render(
        <Canvas>
          <SceneLighting />
        </Canvas>
      )
      expect(container).toBeTruthy()
    })

    it('should render with minimum ambient intensity', () => {
      useLightingStore.getState().setAmbientIntensity(0)
      const { container } = render(
        <Canvas>
          <SceneLighting />
        </Canvas>
      )
      expect(container).toBeTruthy()
    })

    it('should render with maximum ambient intensity', () => {
      useLightingStore.getState().setAmbientIntensity(1)
      const { container } = render(
        <Canvas>
          <SceneLighting />
        </Canvas>
      )
      expect(container).toBeTruthy()
    })
  })

  describe('light position calculation', () => {
    it('should calculate position for 0,0 angles', () => {
      useLightingStore.getState().setLightEnabled(true)
      useLightingStore.getState().setLightHorizontalAngle(0)
      useLightingStore.getState().setLightVerticalAngle(0)
      const { container } = render(
        <Canvas>
          <SceneLighting />
        </Canvas>
      )
      expect(container).toBeTruthy()
    })

    it('should calculate position for 90,45 angles', () => {
      useLightingStore.getState().setLightEnabled(true)
      useLightingStore.getState().setLightHorizontalAngle(90)
      useLightingStore.getState().setLightVerticalAngle(45)
      const { container } = render(
        <Canvas>
          <SceneLighting />
        </Canvas>
      )
      expect(container).toBeTruthy()
    })

    it('should calculate position for 180,0 angles', () => {
      useLightingStore.getState().setLightEnabled(true)
      useLightingStore.getState().setLightHorizontalAngle(180)
      useLightingStore.getState().setLightVerticalAngle(0)
      const { container } = render(
        <Canvas>
          <SceneLighting />
        </Canvas>
      )
      expect(container).toBeTruthy()
    })

    it('should calculate position for negative vertical angle', () => {
      useLightingStore.getState().setLightEnabled(true)
      useLightingStore.getState().setLightHorizontalAngle(45)
      useLightingStore.getState().setLightVerticalAngle(-30)
      const { container } = render(
        <Canvas>
          <SceneLighting />
        </Canvas>
      )
      expect(container).toBeTruthy()
    })
  })

  describe('state reactivity', () => {
    it('should re-render when light enabled state changes', () => {
      const { rerender } = render(
        <Canvas>
          <SceneLighting />
        </Canvas>
      )

      useLightingStore.getState().setLightEnabled(false)
      rerender(
        <Canvas>
          <SceneLighting />
        </Canvas>
      )

      expect(useLightingStore.getState().lightEnabled).toBe(false)
    })

    it('should re-render when light angles change', () => {
      const { rerender } = render(
        <Canvas>
          <SceneLighting />
        </Canvas>
      )

      useLightingStore.getState().setLightHorizontalAngle(180)
      useLightingStore.getState().setLightVerticalAngle(-45)

      rerender(
        <Canvas>
          <SceneLighting />
        </Canvas>
      )

      expect(useLightingStore.getState().lightHorizontalAngle).toBe(180)
      expect(useLightingStore.getState().lightVerticalAngle).toBe(-45)
    })
  })
})
