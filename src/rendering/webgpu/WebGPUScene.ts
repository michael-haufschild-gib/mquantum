/**
 * WebGPU Scene Component
 *
 * Thin composition layer that wires together the camera controller,
 * gizmo interaction, store wiring, frame loop, and pass setup.
 *
 * @module rendering/webgpu/WebGPUScene
 */

import React, { useCallback, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { MAX_DIMENSION } from '@/constants/dimension'
import { useRotationUpdates } from '@/hooks/useRotationUpdates'
import type { SchroedingerQuantumMode } from '@/lib/geometry/extended/common'
import { freeScalarVacuumCanEvolveKSpaceOccupation } from '@/lib/geometry/extended/freeScalar'
import { getNamedPresetStoreControls } from '@/lib/geometry/extended/schroedinger/presets'
import {
  getQuantumTypeCompileContextFields,
  isComputeQuantumType,
  supportsOpenQuantumForQuantumType,
} from '@/lib/geometry/registry'
import type { ObjectType } from '@/lib/geometry/types'
import type { SkyboxMode } from '@/stores/defaults/visualDefaults'
import { useMeasurementStore } from '@/stores/diagnostics/measurementStore'
import { usePerformanceStore } from '@/stores/runtime/performanceStore'
import { useScreenshotCaptureStore } from '@/stores/runtime/screenshotCaptureStore'
import { useAppearanceStore } from '@/stores/scene/appearanceStore'
import { useEnvironmentStore } from '@/stores/scene/environmentStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { usePostProcessingStore } from '@/stores/scene/postProcessingStore'

import { createInitialExportRuntimeState, isExportRuntimeActive } from './sceneExportRuntime'
import {
  type PassConfig,
  pauliFieldViewForColorAlgorithm,
  updateScenePassBackgroundColor,
  updateToScreenPassSharpness,
} from './scenePassConfig'
import { useExportRuntime } from './useExportRuntime'
import { useGizmoInteraction } from './useGizmoInteraction'
import { useSceneCameraController } from './useSceneCameraController'
import { useSceneFrameCallbacks, useSceneFrameLoop } from './useSceneFrameLoop'
import { useScenePassSetup } from './useScenePassSetup'
import { useSceneStoreWiring } from './useSceneStoreWiring'
import { raycastCanvas } from './utils/raycasting'
import { WebGPUCanvasCapture } from './utils/WebGPUCanvasCapture'
import { useWebGPU } from './WebGPUContext'
import { WebGPUStatsCollector } from './WebGPUPerformanceCollector'

// Re-export for backward compat (tests import from this module path)
export { isExportRuntimeActive }

// ============================================================================
// Types
// ============================================================================

/** Props for the main WebGPU scene component that manages the render pipeline. */
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
})

const environmentSelector = (state: ReturnType<typeof useEnvironmentStore.getState>) => ({
  skyboxEnabled: state.skyboxEnabled,
  skyboxMode: state.skyboxMode,
  backgroundColor: state.backgroundColor,
})

const performanceSelector = (state: ReturnType<typeof usePerformanceStore.getState>) => ({
  maxFps: state.maxFps,
  temporalReprojectionEnabled: state.temporalReprojectionEnabled,
  eigenfunctionCacheEnabled: state.eigenfunctionCacheEnabled,
  analyticalGradientEnabled: state.analyticalGradientEnabled,
  fastEigenInterpolationEnabled: state.fastEigenInterpolationEnabled,
  densityGridResolution: state.densityGridResolution,
})

const postProcessingSelector = (state: ReturnType<typeof usePostProcessingStore.getState>) => ({
  bloomEnabled: state.bloomEnabled,
  antiAliasingMethod: state.antiAliasingMethod,
  paperEnabled: state.paperEnabled,
  frameBlendingEnabled: state.frameBlendingEnabled,
})

const schroedingerIsoSelector = (state: ReturnType<typeof useExtendedObjectStore.getState>) =>
  state.schroedinger?.isoEnabled ?? false

/** Resolves open-quantum support based on quantum mode and representation. */
function isOpenQuantumSupported(
  quantumMode: SchroedingerQuantumMode,
  representation: string,
  enabled: boolean
): boolean {
  return enabled && supportsOpenQuantumForQuantumType(quantumMode) && representation !== 'wigner'
}

const schroedingerCompileSelector = (state: ReturnType<typeof useExtendedObjectStore.getState>) => {
  const s = state.schroedinger
  const quantumMode = (s?.quantumMode ?? 'harmonicOscillator') as SchroedingerQuantumMode
  const representation = (s?.representation ?? 'position') as 'position' | 'momentum' | 'wigner'
  const compileContextFields = getQuantumTypeCompileContextFields(quantumMode)
  const presetControls = getNamedPresetStoreControls(s?.presetName)
  const freeScalar = s?.freeScalar

  return {
    quantumMode,
    termCount: (presetControls?.termCount ?? s?.termCount ?? 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
    nodalEnabled: s?.nodalEnabled ?? false,
    nodalDefinition: s?.nodalDefinition ?? 'psiAbs',
    nodalRenderMode: s?.nodalRenderMode ?? 'band',
    nodalFamilyFilter: s?.nodalFamilyFilter ?? 'all',
    phaseMaterialityEnabled: s?.phaseMaterialityEnabled ?? false,
    interferenceEnabled: s?.interferenceEnabled ?? false,
    uncertaintyBoundaryEnabled: s?.uncertaintyBoundaryEnabled ?? false,
    crossSectionEnabled: s?.crossSectionEnabled ?? false,
    probabilityCurrentEnabled: s?.probabilityCurrentEnabled ?? false,
    radialProbabilityEnabled:
      (quantumMode === 'hydrogenND' || quantumMode === 'hydrogenNDCoupled') &&
      (s?.radialProbabilityEnabled ?? false),
    bornNullWeaveEnabled: s?.bornNullWeaveEnabled ?? false,
    phaseShimmerEnabled: s?.phaseShimmerEnabled ?? false,
    phaseAnimationEnabled:
      (quantumMode === 'hydrogenND' || quantumMode === 'hydrogenNDCoupled') &&
      (s?.phaseAnimationEnabled ?? false),
    quantumBackreactionLensingEnabled: s?.quantumBackreactionLensingEnabled ?? false,
    bilocalERBridgeEnabled: s?.bilocalERBridgeEnabled ?? false,
    entropicTimeShearEnabled: s?.entropicTimeShearEnabled ?? false,
    spectralDimensionFlowEnabled: s?.spectralDimensionFlowEnabled ?? false,
    vacuumBubbleLensEnabled: s?.vacuumBubbleLensEnabled ?? false,
    representation,
    openQuantumEnabled: isOpenQuantumSupported(
      quantumMode,
      representation,
      s?.openQuantum?.enabled ?? false
    ),
    diracFieldView: compileContextFields.includes('diracFieldView')
      ? (s?.dirac?.fieldView ?? 'totalDensity')
      : undefined,
    pauliFieldView: state.pauliSpinor?.fieldView ?? 'spinDensity',
    // Expose freeScalar.initialCondition so the normalization path can hide
    // kSpaceOccupation for `freeScalarField + vacuumNoise` (exact vacuum has
    // n_k = 0 everywhere → blank map). Without this, preset or stale state
    // carrying kSpaceOccupation would leak past normalization and render.
    freeScalarInitialCondition: compileContextFields.includes('freeScalarInitialCondition')
      ? freeScalar?.initialCondition
      : undefined,
    freeScalarVacuumCanEvolveKSpaceOccupation:
      compileContextFields.includes('freeScalarInitialCondition') && freeScalar
        ? freeScalarVacuumCanEvolveKSpaceOccupation(freeScalar)
        : undefined,
  }
}

// Stable empty array to avoid new reference on every render when parameterValues is undefined
const EMPTY_PARAM_VALUES: number[] = []
const schroedingerSelector = (state: ReturnType<typeof useExtendedObjectStore.getState>) =>
  state.schroedinger?.parameterValues ?? EMPTY_PARAM_VALUES

// ============================================================================
// Component
// ============================================================================

/**
 * WebGPU Scene component.
 *
 * Sets up the complete render pipeline with all necessary passes.
 * Connects to Zustand stores for uniforms and settings.
 */
export const WebGPUScene: React.FC<WebGPUSceneProps> = ({ objectType, dimension, onFrame }) => {
  const { graph, size, canvas, device } = useWebGPU()
  const maxTextureDimension2D = device.getCapabilities()?.maxTextureDimension2D

  // ── Camera controller ──
  const { cameraRef, dimensionRef } = useSceneCameraController({ size, dimension })

  // ── Gizmo interaction (produces pointer handlers with pointer capture) ──
  const { overlayRef, handlePointerDown, handlePointerUp, handlePointerMove, handlePointerCancel } =
    useGizmoInteraction({
      cameraRef,
      dimensionRef,
    })

  // ── Wheel handler (passive: false for preventDefault) ──
  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return

    const handleWheel = (e: WheelEvent) => {
      if (!cameraRef.current) return
      e.preventDefault()
      const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9
      cameraRef.current.zoom(zoomFactor)
    }

    overlay.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      overlay.removeEventListener('wheel', handleWheel)
    }
  }, [cameraRef, overlayRef])

  // ── Stats collector initialization ──
  const statsCollectorRef = useRef<WebGPUStatsCollector>(new WebGPUStatsCollector())
  useEffect(() => {
    const collector = statsCollectorRef.current
    collector.initialize(device.getAdapter())
    return () => {
      collector.reset()
    }
  }, [device])

  // ── Screenshot capture hook ──
  useEffect(() => {
    const capture = new WebGPUCanvasCapture(device.getDevice())

    graph.registerBeforeSubmitHook(
      'screenshot-capture',
      ({ encoder, canvasTexture, size: frameSize }) => {
        const state = useScreenshotCaptureStore.getState()
        if (state.status !== 'capturing') return

        capture.queueCapture({
          encoder,
          texture: canvasTexture,
          width: frameSize.width,
          height: frameSize.height,
          format: device.getFormat(),
          requestId: state.requestId,
          onSuccess: (dataUrl, requestId) => {
            useScreenshotCaptureStore.getState().setCapturedImage(dataUrl, requestId)
          },
          onError: (error, requestId) => {
            useScreenshotCaptureStore.getState().setError(error, requestId)
          },
        })
      }
    )

    return () => {
      graph.unregisterBeforeSubmitHook('screenshot-capture')
      capture.dispose()
    }
  }, [device, graph])

  // ── Store subscriptions ──
  const appearance = useAppearanceStore(useShallow(appearanceSelector))
  const environment = useEnvironmentStore(useShallow(environmentSelector))
  const performance_ = usePerformanceStore(useShallow(performanceSelector))
  const renderResolutionScale = usePerformanceStore((state) => state.renderResolutionScale)
  const postProcessing = usePostProcessingStore(useShallow(postProcessingSelector))
  const schroedingerIsoEnabled = useExtendedObjectStore(schroedingerIsoSelector)
  const schroedingerCompile = useExtendedObjectStore(useShallow(schroedingerCompileSelector))
  const schroedingerParamValues = useExtendedObjectStore(schroedingerSelector)

  // ── Schrödinger rotation basis vectors ──
  const schroedingerRotation = useRotationUpdates({
    dimension,
    parameterValues: schroedingerParamValues,
  })

  const schroedingerBasisCacheRef = useRef({
    basisX: new Float32Array(MAX_DIMENSION),
    basisY: new Float32Array(MAX_DIMENSION),
    basisZ: new Float32Array(MAX_DIMENSION),
    origin: new Float32Array(MAX_DIMENSION),
  })

  // ── Store wiring ──
  useSceneStoreWiring({ graph, objectType, cameraRef, schroedingerBasisCacheRef })

  // ── Export runtime state ──
  const exportRuntimeRef = useRef(createInitialExportRuntimeState())

  // ── Frame callbacks (shared by frame loop and export runtime) ──
  const { advanceSceneStateByDelta, executeSceneFrame } = useSceneFrameCallbacks({
    graph,
    canvas,
    size,
    objectType,
    dimension,
    statsCollector: statsCollectorRef.current,
    schroedingerRotation,
    schroedingerBasisCacheRef,
    exportRuntimeRef,
    maxTextureDimension2D,
    onFrame,
  })

  // ── Export runtime ──
  const { tickExport, cleanupExport } = useExportRuntime({
    canvas,
    device,
    graph,
    cameraRef,
    size,
    advanceSceneStateByDelta,
    executeSceneFrame,
    exportRuntimeRef,
  })

  // ── Frame loop ──
  useSceneFrameLoop({
    maxFps: performance_.maxFps,
    advanceSceneStateByDelta,
    executeSceneFrame,
    tickExport,
    cleanupExport,
  })

  const fullConfig: PassConfig = {
    objectType,
    dimension,
    bloomEnabled: postProcessing.bloomEnabled,
    antiAliasingMethod: postProcessing.antiAliasingMethod,
    paperEnabled: postProcessing.paperEnabled,
    frameBlendingEnabled: postProcessing.frameBlendingEnabled,
    isosurface: schroedingerIsoEnabled,
    quantumMode: schroedingerCompile.quantumMode,
    termCount: schroedingerCompile.termCount,
    nodalEnabled: schroedingerCompile.nodalEnabled,
    nodalDefinition: schroedingerCompile.nodalDefinition,
    nodalRenderMode: schroedingerCompile.nodalRenderMode,
    nodalFamilyFilter: schroedingerCompile.nodalFamilyFilter,
    phaseMaterialityEnabled: schroedingerCompile.phaseMaterialityEnabled,
    interferenceEnabled: schroedingerCompile.interferenceEnabled,
    uncertaintyBoundaryEnabled: schroedingerCompile.uncertaintyBoundaryEnabled,
    temporalReprojectionEnabled:
      // Temporal reprojection is incompatible with compute modes (they use density grids)
      // and 2D pipelines (fullscreen triangle, no depth/MRT). Derive the
      // compute-mode set from the registry so new compute modes (e.g.
      // wheelerDeWitt) are gated automatically without editing this list.
      isComputeQuantumType(schroedingerCompile.quantumMode) ||
      objectType === 'pauliSpinor' ||
      dimension === 2 ||
      schroedingerCompile.representation === 'wigner'
        ? false
        : performance_.temporalReprojectionEnabled,
    eigenfunctionCacheEnabled: performance_.eigenfunctionCacheEnabled,
    analyticalGradientEnabled: performance_.analyticalGradientEnabled,
    fastEigenInterpolationEnabled: performance_.fastEigenInterpolationEnabled,
    renderResolutionScale,
    colorAlgorithm: appearance.colorAlgorithm,
    diracFieldView: schroedingerCompile.diracFieldView,
    pauliFieldView:
      objectType === 'pauliSpinor'
        ? pauliFieldViewForColorAlgorithm(appearance.colorAlgorithm)
        : schroedingerCompile.pauliFieldView,
    freeScalarInitialCondition: schroedingerCompile.freeScalarInitialCondition,
    freeScalarVacuumCanEvolveKSpaceOccupation:
      schroedingerCompile.freeScalarVacuumCanEvolveKSpaceOccupation,
    representation: schroedingerCompile.representation,
    openQuantumEnabled: schroedingerCompile.openQuantumEnabled,
    crossSectionEnabled: schroedingerCompile.crossSectionEnabled,
    probabilityCurrentEnabled: schroedingerCompile.probabilityCurrentEnabled,
    radialProbabilityEnabled: schroedingerCompile.radialProbabilityEnabled,
    bornNullWeaveEnabled: schroedingerCompile.bornNullWeaveEnabled,
    phaseShimmerEnabled: schroedingerCompile.phaseShimmerEnabled,
    phaseAnimationEnabled: schroedingerCompile.phaseAnimationEnabled,
    quantumBackreactionLensingEnabled: schroedingerCompile.quantumBackreactionLensingEnabled,
    bilocalERBridgeEnabled: schroedingerCompile.bilocalERBridgeEnabled,
    entropicTimeShearEnabled: schroedingerCompile.entropicTimeShearEnabled,
    spectralDimensionFlowEnabled: schroedingerCompile.spectralDimensionFlowEnabled,
    vacuumBubbleLensEnabled: schroedingerCompile.vacuumBubbleLensEnabled,
    densityGridResolution: performance_.densityGridResolution,
    skyboxEnabled: environment.skyboxEnabled,
    skyboxMode: environment.skyboxMode as SkyboxMode,
    backgroundColor: environment.backgroundColor,
  }
  useScenePassSetup({ graph, canvas, cameraRef, fullConfig, maxTextureDimension2D })

  // ── Runtime scene clear-color update ──
  useEffect(() => {
    updateScenePassBackgroundColor({
      graph,
      skyboxEnabled: environment.skyboxEnabled,
      backgroundColor: environment.backgroundColor,
    })
  }, [graph, environment.skyboxEnabled, environment.backgroundColor])

  // ── Runtime CAS sharpening update ──
  useEffect(() => {
    updateToScreenPassSharpness({ graph, renderResolutionScale })
  }, [graph, renderResolutionScale])

  // ── Measurement click handler ──
  const measurementEnabled = useMeasurementStore((s) => s.enabled)

  const handleMeasurementClick = useCallback(
    (e: React.MouseEvent) => {
      if (!measurementEnabled) return
      const mState = useMeasurementStore.getState()
      if (mState.isCollapsing || mState.cooldownFrames > 0) return

      const cam = cameraRef.current
      const overlay = overlayRef.current
      if (!cam || !overlay) return

      const rect = overlay.getBoundingClientRect()
      const clickX = e.clientX - rect.left
      const clickY = e.clientY - rect.top

      const matrices = cam.getMatrices()
      // Estimate bounding radius from the active lattice, or use default.
      // Both `tdse` and `bec` are unconditionally populated by
      // `createDefaultSchroedingerConfig`, so a `?? ` fallback always picks
      // TDSE and silently ignores BEC's grid/spacing — the click→world raycast
      // would then use the wrong bounding-box scale in BEC mode.
      const schState = useExtendedObjectStore.getState().schroedinger
      const lattice = schState?.quantumMode === 'becDynamics' ? schState?.bec : schState?.tdse
      let br = 2.0
      if (lattice?.gridSize && lattice?.spacing) {
        // Half-extent of the computational domain
        const halfExtent = lattice.gridSize[0]! * lattice.spacing[0]! * 0.5
        br = Math.max(halfExtent, 1.0)
      }

      const result = raycastCanvas(
        clickX,
        clickY,
        rect.width,
        rect.height,
        matrices.viewMatrix,
        matrices.projectionMatrix,
        br
      )

      if (result.hit) {
        mState.requestMeasurement(result.worldPosition)
      }
    },
    [measurementEnabled, cameraRef, overlayRef]
  )

  // ── Render event capture overlay ──
  // Pointer events with capture (handled inside useGizmoInteraction) keep the
  // drag alive across overlay-leave and off-element release, eliminating the
  // stale-lastMouseRef camera-jump when the cursor crossed a panel boundary
  // mid-drag. `touch-action: none` prevents the browser from synthesizing
  // pan/scroll/zoom gestures from a finger drag, which would otherwise
  // cancel pointer capture and abort the rotation.
  return React.createElement('div', {
    ref: overlayRef,
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      cursor: measurementEnabled ? 'crosshair' : 'grab',
      touchAction: 'none',
    },
    onPointerDown: handlePointerDown,
    onPointerUp: handlePointerUp,
    onPointerMove: handlePointerMove,
    onPointerCancel: handlePointerCancel,
    onClick: handleMeasurementClick,
  })
}
