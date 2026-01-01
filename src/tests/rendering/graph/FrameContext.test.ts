/**
 * Tests for FrameContext
 *
 * Verifies that frame context correctly captures and freezes store state.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as THREE from 'three'

import {
  captureFrameContext,
  createEmptyFrameContext,
  type StoreGetters,
} from '@/rendering/graph/FrameContext'

describe('FrameContext', () => {
  let mockScene: THREE.Scene
  let mockCamera: THREE.PerspectiveCamera
  let mockStoreGetters: StoreGetters

  beforeEach(() => {
    mockScene = new THREE.Scene()
    mockScene.background = new THREE.Color(0x000000)
    mockScene.environment = null

    mockCamera = new THREE.PerspectiveCamera()
    mockCamera.position.set(0, 0, 5)
    mockCamera.updateMatrixWorld()

    // Create mock store getters
    mockStoreGetters = {
      getAnimationState: vi.fn().mockReturnValue({
        accumulatedTime: 123.45,
        speed: 1.5,
        isPlaying: true,
        direction: 1,
        animatingPlanes: new Set(['XY', 'ZW']),
      }),
      getGeometryState: vi.fn().mockReturnValue({
        objectType: 'hypercube',
        dimension: 4,
      }),
      getEnvironmentState: vi.fn().mockReturnValue({
        skybox: {
          skyboxEnabled: true,
          skyboxMode: 'classic',
          skyboxTexture: 'space_blue',
          skyboxIntensity: 1.2,
          skyboxRotation: Math.PI / 4,
          skyboxAnimationMode: 'rotate',
          skyboxAnimationSpeed: 0.3,
          skyboxHighQuality: true,
          skyboxLoading: false,
          classicCubeTexture: null,
        },
        ground: {
          activeWalls: ['floor', 'back'],
        },
      }),
      getPostProcessingState: vi.fn().mockReturnValue({
        bloomEnabled: true,
        bloomIntensity: 0.8,
        bloomThreshold: 0.6,
        bloomRadius: 0.4,
        bokehEnabled: false,
        bokehFocusMode: 'auto-center',
        bokehBlurMethod: 'hexagonal',
        bokehWorldFocusDistance: 15,
        bokehWorldFocusRange: 10,
        bokehScale: 1.0,
        bokehFocalLength: 0.05,
        bokehSmoothTime: 0.3,
        bokehShowDebug: false,
        ssrEnabled: true,
        ssrIntensity: 0.7,
        ssrMaxDistance: 15,
        ssrThickness: 0.2,
        ssrFadeStart: 0.6,
        ssrFadeEnd: 0.85,
        ssrQuality: 'high',
        refractionEnabled: false,
        refractionIOR: 1.5,
        refractionStrength: 0.5,
        refractionChromaticAberration: 0,
        antiAliasingMethod: 'smaa',
        cinematicEnabled: false,
        cinematicAberration: 0.005,
        cinematicVignette: 1.2,
        cinematicGrain: 0,
        objectOnlyDepth: false,
        ssaoEnabled: true,
        ssaoIntensity: 1.2,
        gravityEnabled: false,
        gravityStrength: 1,
        gravityDistortionScale: 1,
        gravityFalloff: 1.5,
        gravityChromaticAberration: 0,
      }),
      getPerformanceState: vi.fn().mockReturnValue({
        isInteracting: false,
        sceneTransitioning: false,
        progressiveRefinementEnabled: true,
        qualityMultiplier: 0.75,
        refinementStage: 'high',
        temporalReprojectionEnabled: true,
        cameraTeleported: false,
        fractalAnimationLowQuality: true,
        isShaderCompiling: false,
      }),
      getBlackHoleState: vi.fn().mockReturnValue({
        horizonRadius: 1.0,
        spin: 0.5,
        gravityStrength: 1.0,
        manifoldIntensity: 1.0,
        manifoldThickness: 0.15,
        timeScale: 1.0,
        baseColor: '#ffffff',
        paletteMode: 'diskGradient',
        bendScale: 1.0,
        rayBendingMode: 'spiral',
        maxSteps: 128,
        stepBase: 0.1,
        deferredLensingEnabled: false,
        deferredLensingStrength: 1.0,
        skyCubemapResolution: 512,
        temporalAccumulationEnabled: false,
      }),
      getUIState: vi.fn().mockReturnValue({
        showDepthBuffer: false,
        showNormalBuffer: false,
        showTemporalDepthBuffer: false,
      }),
    }
  })

  describe('captureFrameContext', () => {
    it('should capture frame number', () => {
      const context = captureFrameContext(42, mockScene, mockCamera, mockStoreGetters)

      expect(context.frameNumber).toBe(42)
    })

    it('should capture animation state', () => {
      const context = captureFrameContext(0, mockScene, mockCamera, mockStoreGetters)

      expect(context.stores.animation.accumulatedTime).toBe(123.45)
      expect(context.stores.animation.speed).toBe(1.5)
      expect(context.stores.animation.isPlaying).toBe(true)
      expect(context.stores.animation.direction).toBe(1)
      expect(context.stores.animation.animatingPlanes).toContain('XY')
      expect(context.stores.animation.animatingPlanes).toContain('ZW')
    })

    it('should capture geometry state', () => {
      const context = captureFrameContext(0, mockScene, mockCamera, mockStoreGetters)

      expect(context.stores.geometry.objectType).toBe('hypercube')
      expect(context.stores.geometry.dimension).toBe(4)
    })

    it('should capture environment state', () => {
      const context = captureFrameContext(0, mockScene, mockCamera, mockStoreGetters)

      expect(context.stores.environment.skyboxEnabled).toBe(true)
      expect(context.stores.environment.skyboxMode).toBe('classic')
      expect(context.stores.environment.skyboxTexture).toBe('space_blue')
      expect(context.stores.environment.skyboxIntensity).toBe(1.2)
    })

    it('should capture post-processing state', () => {
      const context = captureFrameContext(0, mockScene, mockCamera, mockStoreGetters)

      expect(context.stores.postProcessing.bloomEnabled).toBe(true)
      expect(context.stores.postProcessing.bloomIntensity).toBe(0.8)
      expect(context.stores.postProcessing.ssrEnabled).toBe(true)
      expect(context.stores.postProcessing.ssaoEnabled).toBe(true)
    })

    it('should capture performance state', () => {
      const context = captureFrameContext(0, mockScene, mockCamera, mockStoreGetters)

      expect(context.stores.performance.isInteracting).toBe(false)
      expect(context.stores.performance.qualityMultiplier).toBe(0.75)
      expect(context.stores.performance.refinementStage).toBe('high')
      expect(context.stores.performance.temporalReprojectionEnabled).toBe(true)
    })

    it('should capture black hole state', () => {
      const context = captureFrameContext(0, mockScene, mockCamera, mockStoreGetters)

      expect(context.stores.blackHole.horizonRadius).toBe(1.0)
      expect(context.stores.blackHole.spin).toBe(0.5)
      expect(context.stores.blackHole.paletteMode).toBe('diskGradient')
    })

    it('should capture UI state', () => {
      const context = captureFrameContext(0, mockScene, mockCamera, mockStoreGetters)

      expect(context.stores.ui.showDepthBuffer).toBe(false)
      expect(context.stores.ui.showNormalBuffer).toBe(false)
      expect(context.stores.ui.showTemporalDepthBuffer).toBe(false)
    })

    it('should capture activeWalls from environment', () => {
      const context = captureFrameContext(0, mockScene, mockCamera, mockStoreGetters)

      expect(context.stores.environment.activeWalls).toEqual(['floor', 'back'])
    })

    it('should capture camera state', () => {
      mockCamera.position.set(10, 20, 30)
      mockCamera.updateMatrixWorld()

      const context = captureFrameContext(0, mockScene, mockCamera, mockStoreGetters)

      expect(context.camera.position.x).toBe(10)
      expect(context.camera.position.y).toBe(20)
      expect(context.camera.position.z).toBe(30)
      expect(context.camera.matrixWorld).toBeInstanceOf(THREE.Matrix4)
      expect(context.camera.projectionMatrix).toBeInstanceOf(THREE.Matrix4)
    })

    it('should capture scene external state', () => {
      const texture = new THREE.Texture()
      mockScene.background = texture
      mockScene.environment = texture

      const context = captureFrameContext(0, mockScene, mockCamera, mockStoreGetters)

      expect(context.external.sceneBackground).toBe(texture)
      expect(context.external.sceneEnvironment).toBe(texture)
    })

    it('should call all store getters exactly once', () => {
      captureFrameContext(0, mockScene, mockCamera, mockStoreGetters)

      expect(mockStoreGetters.getAnimationState).toHaveBeenCalledTimes(1)
      expect(mockStoreGetters.getGeometryState).toHaveBeenCalledTimes(1)
      expect(mockStoreGetters.getEnvironmentState).toHaveBeenCalledTimes(1)
      expect(mockStoreGetters.getPostProcessingState).toHaveBeenCalledTimes(1)
      expect(mockStoreGetters.getPerformanceState).toHaveBeenCalledTimes(1)
      expect(mockStoreGetters.getBlackHoleState).toHaveBeenCalledTimes(1)
      expect(mockStoreGetters.getUIState).toHaveBeenCalledTimes(1)
    })
  })

  describe('freeze behavior', () => {
    it('should freeze animation planes into a new Set', () => {
      const originalSet = new Set(['XY', 'ZW'])
      ;(mockStoreGetters.getAnimationState as ReturnType<typeof vi.fn>).mockReturnValue({
        accumulatedTime: 0,
        speed: 1,
        isPlaying: true,
        direction: 1,
        animatingPlanes: originalSet,
      })

      const context = captureFrameContext(0, mockScene, mockCamera, mockStoreGetters)

      // Modify original set
      originalSet.add('YZ')

      // Frozen set should not be affected
      expect(context.stores.animation.animatingPlanes).not.toContain('YZ')
    })

    it('should clone camera matrices', () => {
      const context = captureFrameContext(0, mockScene, mockCamera, mockStoreGetters)
      const capturedPosition = context.camera.position.clone()

      // Modify original camera
      mockCamera.position.set(999, 999, 999)

      // Frozen position should not be affected
      expect(context.camera.position.equals(capturedPosition)).toBe(true)
      expect(context.camera.position.x).not.toBe(999)
    })
  })

  describe('createEmptyFrameContext', () => {
    it('should create a valid frame context with defaults', () => {
      const context = createEmptyFrameContext()

      expect(context.frameNumber).toBe(-1)
      expect(context.stores.animation.accumulatedTime).toBe(0)
      expect(context.stores.geometry.objectType).toBe('hypercube')
      expect(context.stores.geometry.dimension).toBe(4)
      expect(context.stores.environment.skyboxEnabled).toBe(false)
      expect(context.stores.postProcessing.bloomEnabled).toBe(true)
      expect(context.stores.performance.qualityMultiplier).toBe(1)
      expect(context.stores.blackHole.horizonRadius).toBe(1)
    })

    it('should have null scene external state', () => {
      const context = createEmptyFrameContext()

      expect(context.external.sceneBackground).toBeNull()
      expect(context.external.sceneEnvironment).toBeNull()
    })

    it('should have default camera position', () => {
      const context = createEmptyFrameContext()

      expect(context.camera.position.x).toBe(0)
      expect(context.camera.position.y).toBe(0)
      expect(context.camera.position.z).toBe(5)
    })
  })

  describe('consistency', () => {
    it('should capture same values when called multiple times with same input', () => {
      const context1 = captureFrameContext(0, mockScene, mockCamera, mockStoreGetters)
      const context2 = captureFrameContext(0, mockScene, mockCamera, mockStoreGetters)

      expect(context1.stores.animation.accumulatedTime).toBe(
        context2.stores.animation.accumulatedTime
      )
      expect(context1.stores.geometry.dimension).toBe(context2.stores.geometry.dimension)
      expect(context1.stores.performance.qualityMultiplier).toBe(
        context2.stores.performance.qualityMultiplier
      )
    })

    it('should capture different frame numbers when changed', () => {
      const context1 = captureFrameContext(0, mockScene, mockCamera, mockStoreGetters)
      const context2 = captureFrameContext(1, mockScene, mockCamera, mockStoreGetters)

      expect(context1.frameNumber).toBe(0)
      expect(context2.frameNumber).toBe(1)
    })
  })
})
