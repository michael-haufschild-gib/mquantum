/**
 * WebGPU Scene Component
 *
 * Main scene component for WebGPU rendering that sets up render passes
 * and manages the rendering pipeline. Mirrors the WebGL scene setup.
 *
 * @module rendering/webgpu/WebGPUScene
 */

import React, { useEffect, useRef, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useWebGPU } from './WebGPUCanvas'
import { WebGPURenderGraph } from './graph/WebGPURenderGraph'

// Stores
import { useAppearanceStore } from '@/stores/appearanceStore'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useLightingStore } from '@/stores/lightingStore'
import { usePerformanceStore } from '@/stores/performanceStore'
import { usePostProcessingStore } from '@/stores/postProcessingStore'
import { useCameraStore } from '@/stores/cameraStore'
import { useAnimationStore } from '@/stores/animationStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useRotationStore } from '@/stores/rotationStore'
import { useTransformStore } from '@/stores/transformStore'
import { usePBRStore } from '@/stores/pbrStore'

// Passes (import as needed for the pipeline)
import { ScenePass } from './passes/ScenePass'
import { BloomPass } from './passes/BloomPass'
import { TonemappingPass } from './passes/TonemappingPass'
import { FXAAPass } from './passes/FXAAPass'
import { ToScreenPass } from './passes/ToScreenPass'
import { CompositePass } from './passes/CompositePass'
import { EnvironmentCompositePass } from './passes/EnvironmentCompositePass'
import { GTAOPass } from './passes/GTAOPass'
import { SSRPass } from './passes/SSRPass'

// Object Renderers
import { WebGPUMandelbulbRenderer } from './renderers/WebGPUMandelbulbRenderer'
import { WebGPUQuaternionJuliaRenderer } from './renderers/WebGPUQuaternionJuliaRenderer'
import { WebGPUSchrodingerRenderer } from './renderers/WebGPUSchrodingerRenderer'
import { WebGPUBlackHoleRenderer } from './renderers/WebGPUBlackHoleRenderer'
import { WebGPUPolytopeRenderer } from './renderers/WebGPUPolytopeRenderer'
import { WebGPUTubeWireframeRenderer } from './renderers/WebGPUTubeWireframeRenderer'
import type { ObjectType } from '@/lib/geometry/types'

// ============================================================================
// Types
// ============================================================================

export interface WebGPUSceneProps {
  /** Current object type to render */
  objectType: ObjectType
  /** Current dimension */
  dimension: number
  /** Optional callback when frame renders */
  onFrame?: (deltaTime: number) => void
}

// ============================================================================
// Store Selectors
// ============================================================================

const appearanceSelector = (state: ReturnType<typeof useAppearanceStore.getState>) => ({
  colorAlgorithm: state.colorAlgorithm,
  cosineCoefficients: state.cosineCoefficients,
})

const environmentSelector = (state: ReturnType<typeof useEnvironmentStore.getState>) => ({
  skyboxEnabled: state.skyboxEnabled,
  skyboxMode: state.skyboxMode,
  groundEnabled: state.groundEnabled,
})

const performanceSelector = (state: ReturnType<typeof usePerformanceStore.getState>) => ({
  renderResolutionScale: state.renderResolutionScale,
})

const postProcessingSelector = (state: ReturnType<typeof usePostProcessingStore.getState>) => ({
  bloomEnabled: state.bloomEnabled,
  bloomIntensity: state.bloomIntensity,
  ssaoEnabled: state.ssaoEnabled,
  ssrEnabled: state.ssrEnabled,
  antiAliasingMethod: state.antiAliasingMethod,
})

// ============================================================================
// Component
// ============================================================================

/**
 * WebGPU Scene component.
 *
 * Sets up the complete render pipeline with all necessary passes.
 * Connects to Zustand stores for uniforms and settings.
 */
export const WebGPUScene: React.FC<WebGPUSceneProps> = ({
  objectType,
  dimension,
  onFrame,
}) => {
  const { graph } = useWebGPU()
  const animationFrameRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(performance.now())
  const passesInitializedRef = useRef(false)
  const currentObjectTypeRef = useRef<ObjectType | null>(null)

  // Store subscriptions with shallow comparison
  const appearance = useAppearanceStore(useShallow(appearanceSelector))
  const environment = useEnvironmentStore(useShallow(environmentSelector))
  const performance_ = usePerformanceStore(useShallow(performanceSelector))
  const postProcessing = usePostProcessingStore(useShallow(postProcessingSelector))

  // Animation state
  const isPlaying = useAnimationStore((state) => state.isPlaying)

  // Initialize passes - rebuild when objectType changes
  useEffect(() => {
    const needsRebuild = !passesInitializedRef.current || currentObjectTypeRef.current !== objectType

    if (!needsRebuild) return

    // Clear existing passes if rebuilding
    if (passesInitializedRef.current) {
      graph.clearPasses()
    }

    passesInitializedRef.current = true
    currentObjectTypeRef.current = objectType

    setupRenderPasses(graph, {
      objectType,
      dimension,
      bloomEnabled: postProcessing.bloomEnabled,
      ssaoEnabled: postProcessing.ssaoEnabled,
      ssrEnabled: postProcessing.ssrEnabled,
      antiAliasingMethod: postProcessing.antiAliasingMethod,
    })

    // Compile the graph
    graph.compile()

    return () => {
      // Cleanup passes
      passesInitializedRef.current = false
    }
  }, [graph, objectType, dimension, postProcessing.bloomEnabled, postProcessing.ssaoEnabled, postProcessing.ssrEnabled, postProcessing.antiAliasingMethod])

  // Set up store getters for uniform updates
  useEffect(() => {
    graph.setStoreGetter('appearance', () => useAppearanceStore.getState())
    graph.setStoreGetter('environment', () => useEnvironmentStore.getState())
    graph.setStoreGetter('lighting', () => useLightingStore.getState())
    graph.setStoreGetter('performance', () => usePerformanceStore.getState())
    graph.setStoreGetter('postProcessing', () => usePostProcessingStore.getState())
    graph.setStoreGetter('camera', () => useCameraStore.getState())
    graph.setStoreGetter('animation', () => useAnimationStore.getState())
    graph.setStoreGetter('extended', () => useExtendedObjectStore.getState())
    graph.setStoreGetter('rotation', () => useRotationStore.getState())
    graph.setStoreGetter('transform', () => useTransformStore.getState())
    graph.setStoreGetter('pbr', () => usePBRStore.getState())
  }, [graph])

  // Animation loop
  const renderFrame = useCallback(() => {
    const now = performance.now()
    const deltaTime = (now - lastTimeRef.current) / 1000 // Convert to seconds
    lastTimeRef.current = now

    // Execute render graph
    graph.execute({
      objectType,
      dimension,
      deltaTime,
      isPlaying,
    })

    onFrame?.(deltaTime)

    // Continue animation loop
    animationFrameRef.current = requestAnimationFrame(renderFrame)
  }, [graph, objectType, dimension, isPlaying, onFrame])

  // Start/stop animation loop
  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(renderFrame)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [renderFrame])

  // This component doesn't render any DOM - it manages the WebGPU pipeline
  return null
}

// ============================================================================
// Pass Setup
// ============================================================================

interface PassConfig {
  objectType: ObjectType
  dimension: number
  bloomEnabled: boolean
  ssaoEnabled: boolean
  ssrEnabled: boolean
  antiAliasingMethod: 'none' | 'fxaa' | 'smaa'
}

/**
 * Set up render passes for the WebGPU pipeline.
 *
 * Pass order:
 * 1. Object Renderer - Render main object to MRT (color, normal, depth)
 * 2. ScenePass - Render environment (skybox, ground)
 * 3. GTAOPass (optional) - Ambient occlusion
 * 4. SSRPass (optional) - Screen-space reflections
 * 5. EnvironmentCompositePass - Composite environment with main object
 * 6. BloomPass (optional) - Bloom effect
 * 7. CompositePass - Final composition
 * 8. TonemappingPass - HDR to LDR conversion
 * 9. FXAAPass (optional) - Anti-aliasing
 * 10. ToScreenPass - Copy to canvas
 */
function setupRenderPasses(graph: WebGPURenderGraph, config: PassConfig): void {
  // Define resources

  // Initial scene render (before post-processing)
  graph.addResource('scene-render', {
    type: 'texture',
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  })

  // Final HDR buffer (TonemappingPass reads from this)
  graph.addResource('hdr-color', {
    type: 'texture',
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  })

  graph.addResource('normal-buffer', {
    type: 'texture',
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  })

  graph.addResource('depth-buffer', {
    type: 'texture',
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  })


  // BloomPass expects this output name
  graph.addResource('bloom-output', {
    type: 'texture',
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  })

  // TonemappingPass expects this output name
  graph.addResource('ldr-color', {
    type: 'texture',
    format: 'rgba8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  })

  // FXAAPass expects this output name
  graph.addResource('final-color', {
    type: 'texture',
    format: 'rgba8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  })

  // Add passes in execution order

  // 1. Object renderer - add appropriate renderer based on objectType
  const objectRenderer = createObjectRenderer(config.objectType, config.dimension)
  if (objectRenderer) {
    graph.addPass(objectRenderer)
  }

  // 2. Scene pass (environment) - outputs to scene-render buffer
  graph.addPass(
    new ScenePass({
      outputResource: 'scene-render',
      depthResource: 'depth-buffer',
      mode: 'clear',
    })
  )

  // 3. GTAO (optional)
  if (config.ssaoEnabled) {
    graph.addResource('aoBuffer', {
      type: 'texture',
      format: 'r8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })

    graph.addPass(
      new GTAOPass({
        depthInput: 'depth-buffer',
        normalInput: 'normal-buffer',
        outputResource: 'aoBuffer',
      })
    )
  }

  // 4. SSR (optional)
  if (config.ssrEnabled) {
    graph.addResource('ssrBuffer', {
      type: 'texture',
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })

    graph.addPass(
      new SSRPass({
        colorInput: 'hdr-color',
        depthInput: 'depth-buffer',
        normalInput: 'normal-buffer',
        outputResource: 'ssrBuffer',
      })
    )
  }

  // 5. Environment composite - reads scene-render, outputs to hdr-color
  graph.addPass(
    new EnvironmentCompositePass({
      lensedEnvironmentInput: 'scene-render',
      mainObjectInput: 'scene-render',
      mainObjectDepthInput: 'depth-buffer',
      outputResource: 'hdr-color',  // Output to hdr-color for BloomPass/TonemappingPass
    })
  )

  // 6. Bloom (optional)
  // Note: BloomPass uses hardcoded resource names: input='hdr-color', output='bloom-output'
  if (config.bloomEnabled) {
    graph.addPass(
      new BloomPass({
        threshold: 1.0,
        intensity: 0.5,
      })
    )
  }

  // 7. Composite - combines env composite with bloom
  // Note: We skip CompositePass for now since TonemappingPass is hardcoded to read 'hdr-color'
  // and we can't output to 'hdr-color' without creating a cycle.
  // TODO: Refactor TonemappingPass to accept configurable input resource
  // For now, the pipeline is: scene → env composite → tonemap (bloom is disabled)

  // 8. Tonemapping
  graph.addPass(
    new TonemappingPass({
      // Note: TonemappingPass hardcodes input='hdr-color', output='ldr-color'
      exposure: 1.0,
    })
  )

  // 9. Anti-aliasing (optional)
  if (config.antiAliasingMethod === 'fxaa') {
    graph.addPass(
      new FXAAPass({
        // Note: FXAAPass hardcodes input='ldr-color', output='final-color'
        subpixelQuality: 0.75,
      })
    )
  }

  // 10. Copy to screen
  graph.addPass(
    new ToScreenPass({
      // Takes final output to canvas
      // If FXAA enabled, input is 'final-color', otherwise 'ldr-color'
      inputResource: config.antiAliasingMethod === 'fxaa' ? 'final-color' : 'ldr-color',
    })
  )
}

/**
 * Create the appropriate object renderer based on object type.
 *
 * @param objectType - The type of object to render
 * @param dimension - The dimension of the object
 * @returns The appropriate renderer pass or null if not supported
 */
function createObjectRenderer(objectType: ObjectType, dimension: number) {
  switch (objectType) {
    case 'mandelbulb':
      return new WebGPUMandelbulbRenderer({
        dimension,
        shadows: true,
        ambientOcclusion: true,
        sss: false,
        temporal: false,
        ibl: true,
      })

    case 'quaternion-julia':
      return new WebGPUQuaternionJuliaRenderer({
        dimension,
        shadows: true,
        ambientOcclusion: true,
        sss: false,
        temporal: false,
        ibl: true,
      })

    case 'schroedinger':
      return new WebGPUSchrodingerRenderer({
        dimension,
        shadows: true,
        ambientOcclusion: true,
        sss: false,
        temporal: false,
        ibl: true,
      })

    case 'blackhole':
      return new WebGPUBlackHoleRenderer({
        dimension,
        shadows: false,
        ambientOcclusion: false,
        sss: false,
        temporal: false,
        ibl: false,
      })

    case 'hypercube':
    case 'simplex':
    case 'cross-polytope':
    case 'wythoff-polytope':
      return new WebGPUPolytopeRenderer({
        dimension,
        shadows: true,
        ambientOcclusion: true,
        ibl: true,
      })

    case 'root-system':
    case 'clifford-torus':
    case 'nested-torus':
      // These use tube wireframe rendering
      return new WebGPUTubeWireframeRenderer({
        dimension,
        shadows: true,
        ambientOcclusion: false,
        ibl: false,
      })

    default:
      console.warn(`WebGPU: No renderer for object type '${objectType}'`)
      return null
  }
}

export default WebGPUScene
