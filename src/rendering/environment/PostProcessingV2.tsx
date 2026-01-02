/**
 * PostProcessingV2 Component
 *
 * TRUE Render Graph-based post-processing implementation.
 * Uses declarative pass dependencies - the graph compiler automatically
 * determines execution order based on resource inputs/outputs.
 *
 * Architecture:
 * - Resources declared with types (HDR, depth, normal, etc.)
 * - Passes declare inputs/outputs - compiler orders them
 * - graph.execute() runs everything in dependency order
 * - Passes dynamically enabled/disabled via enabled() callbacks
 *
 * ## Callback Architecture: Config-Time vs Frame-Time
 *
 * This component uses two types of callbacks with different lifecycle semantics:
 *
 * ### Frame-Time Callbacks (enabled())
 * - Called every frame during graph execution
 * - Receive frozen FrameContext for consistent state reads
 * - MUST use frozen context, NOT refs
 * - Signature: `(frame: FrozenFrameContext | null) => boolean`
 * - Example: `enabled: (frame) => frame?.stores.postProcessing.bloomEnabled ?? false`
 *
 * ### Config-Time Callbacks (everything else)
 * - Called during graph setup/configuration, not per-frame
 * - CAN use refs because they run before execute() captures state
 * - Include: generatePMREM, getExternalCubeTexture, depthInputSelector,
 *   forceCapture, shouldRender, etc.
 * - Example: `generatePMREM: () => envStateRef.current.activeWalls.length > 0`
 *
 * This distinction is critical for frame stability. Frame-time callbacks
 * (enabled()) must see frozen state to prevent mid-frame state changes from
 * causing render inconsistencies. Config-time callbacks run at graph setup
 * when refs are the appropriate way to access current state.
 *
 * @module rendering/environment/PostProcessingV2
 */

import { useFrame, useThree } from '@react-three/fiber';
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useShallow } from 'zustand/react/shallow';

import { isPolytopeType } from '@/lib/geometry/types';
import { FRAME_PRIORITY } from '@/rendering/core/framePriorities';
import { RENDER_LAYERS, needsVolumetricSeparation } from '@/rendering/core/layers';
import {
  createSceneBackgroundExport,
  createSceneEnvironmentExport,
} from '@/rendering/graph/ExternalBridge';
import {
  BloomPass,
  BokehPass,
  BufferPreviewPass,
  CinematicPass,
  CopyPass,
  CubemapCapturePass,
  DebugOverlayPass,
  DepthPass,
  EnvironmentCompositePass,
  FXAAPass,
  FrameBlendingPass,
  FullscreenPass,
  GTAOPass,
  GravitationalLensingPass,
  MainObjectMRTPass,
  NormalPass,
  PaperTexturePass,
  RefractionPass,
  SMAAPass,
  SSRPass,
  ScenePass,
  ScreenSpaceLensingPass,
  TemporalCloudPass,
  TemporalDepthCapturePass,
  ToScreenPass,
  ToneMappingPass,
} from '@/rendering/graph/passes';
import { RenderGraph } from '@/rendering/graph/RenderGraph';
import { cloudCompositeFragmentShader } from '@/rendering/shaders/postprocessing/cloudComposite.glsl';
import { normalCompositeFragmentShader } from '@/rendering/shaders/postprocessing/normalComposite.glsl';
import { TONE_MAPPING_TO_THREE } from '@/rendering/shaders/types';
import { useAnimationStore } from '@/stores/animationStore';
import { SSR_QUALITY_STEPS } from '@/stores/defaults/visualDefaults';
import { useEnvironmentStore } from '@/stores/environmentStore';
import { useExtendedObjectStore } from '@/stores/extendedObjectStore';
import { useGeometryStore } from '@/stores/geometryStore';
import { useLightingStore } from '@/stores/lightingStore';
import { usePerformanceMetricsStore } from '@/stores/performanceMetricsStore';
import { getEffectiveSSRQuality, usePerformanceStore, type SSRQualityLevel } from '@/stores/performanceStore';
import { usePostProcessingStore } from '@/stores/postProcessingStore';
import { useRenderGraphStore } from '@/stores/renderGraphStore';
import { useUIStore } from '@/stores/uiStore';
import { useWebGLContextStore } from '@/stores/webglContextStore';

// =============================================================================
// Resource IDs (declared once, referenced by passes)
// =============================================================================

const RESOURCES = {
  // G-buffer resources
  SCENE_COLOR: 'sceneColor',
  OBJECT_DEPTH: 'objectDepth',
  NORMAL_ENV: 'normalEnv',
  MAIN_OBJECT_MRT: 'mainObjectMrt',
  NORMAL_BUFFER: 'normalBuffer',
  SCENE_COMPOSITE: 'sceneComposite',
  PREVIEW_OUTPUT: 'previewOutput',

  // Environment separation resources (for gravitational lensing)
  ENVIRONMENT_COLOR: 'environmentColor',
  MAIN_OBJECT_COLOR: 'mainObjectColor',
  LENSED_ENVIRONMENT: 'lensedEnvironment',

  // Temporal Cloud resources
  TEMPORAL_CLOUD_BUFFER: 'temporalCloudBuffer',
  TEMPORAL_ACCUMULATION: 'temporalAccumulation',
  TEMPORAL_REPROJECTION: 'temporalReprojection',
  TEMPORAL_DEPTH_OUTPUT: 'temporalDepthOutput',

  // Effect chain resources
  GTAO_OUTPUT: 'gtaoOutput',
  BLOOM_OUTPUT: 'bloomOutput',
  SSR_OUTPUT: 'ssrOutput',
  BOKEH_OUTPUT: 'bokehOutput',
  REFRACTION_OUTPUT: 'refractionOutput',
  LENSING_OUTPUT: 'lensingOutput',
  CINEMATIC_OUTPUT: 'cinematicOutput',
  TONEMAPPED_OUTPUT: 'tonemappedOutput',
  FRAME_BLENDING_OUTPUT: 'frameBlendingOutput',
  PAPER_OUTPUT: 'paperOutput',
  AA_OUTPUT: 'aaOutput',
} as const;

// =============================================================================
// Performance: Throttled Scene GPU Stats Update
// =============================================================================

/**
 * Throttle sceneGpu updates to 500ms to match main metrics update frequency.
 * Only updates when Stats tab is active to minimize overhead.
 */
let lastSceneGpuUpdateTime = 0;
const SCENE_GPU_UPDATE_INTERVAL = 500; // ms

/**
 * Throttle autofocus raycaster to reduce expensive scene graph traversals.
 * Raycasting at 60 FPS is unnecessary since bokehSmoothTime already smooths
 * focus transitions. 100ms (10 Hz) is sufficient for responsive auto-focus.
 */
const AUTOFOCUS_RAYCAST_INTERVAL = 100; // ms

function throttledUpdateSceneGpu(stats: { calls: number; triangles: number; points: number; lines: number }) {
  // Only update when Stats tab is showing sceneGpu data
  const { showPerfMonitor, perfMonitorExpanded, perfMonitorTab } = useUIStore.getState();
  if (!showPerfMonitor || !perfMonitorExpanded || perfMonitorTab !== 'perf') return;

  const now = performance.now();
  if (now - lastSceneGpuUpdateTime >= SCENE_GPU_UPDATE_INTERVAL) {
    usePerformanceMetricsStore.getState().updateSceneGpu(stats);
    lastSceneGpuUpdateTime = now;
  }
}

// =============================================================================
// Helper: Object Type Temporal Support
// =============================================================================

/**
 * Check if object type uses temporal depth reprojection (raymarching acceleration).
 * Only Mandelbulb and Julia fractals benefit from depth-skip temporal optimization.
 * @param objectType - The current object type
 * @returns True if the object type uses temporal depth
 */
function usesTemporalDepth(objectType: string): boolean {
  return objectType === 'mandelbulb' || objectType === 'quaternion-julia';
}

/**
 * Check if object type uses temporal cloud accumulation (Horizon-style).
 * Only Schroedinger volumetric rendering uses quarter-res temporal accumulation.
 * @param objectType - The current object type
 * @returns True if the object type uses temporal cloud
 */
function usesTemporalCloud(objectType: string): boolean {
  return objectType === 'schroedinger';
}

// =============================================================================
// PostProcessingV2 Component
// =============================================================================

/**
 * PostProcessingV2 - True render graph-based post-processing.
 *
 * The graph compiler automatically orders passes based on declared
 * dependencies. No manual pass ordering required.
 */
export const PostProcessingV2 = memo(function PostProcessingV2() {
  const { gl, scene, camera, size, viewport } = useThree();

  // Context restore counter for recreation
  const restoreCount = useWebGLContextStore((s) => s.restoreCount);

  // Get object type to determine which effects to enable
  const objectType = useGeometryStore((s) => s.objectType);
  const isPolytope = isPolytopeType(objectType);
  const isBlackHole = objectType === 'blackhole';
  const objectTypeRef = useRef(objectType);

  useEffect(() => {
    objectTypeRef.current = objectType;
    // Invalidate MainObjectMRTPass cache when object type changes
    // (scene structure changes, materials are recreated)
    passRefs.current.mainObjectMrt?.invalidateCache();
  }, [objectType]);

  // Store subscriptions - Post Processing
  const postProcessingSelector = useShallow((s: ReturnType<typeof usePostProcessingStore.getState>) => ({
    // Bloom
    bloomEnabled: s.bloomEnabled,
    bloomIntensity: s.bloomIntensity,
    bloomRadius: s.bloomRadius,
    bloomThreshold: s.bloomThreshold,
    bloomSmoothing: s.bloomSmoothing,
    bloomLevels: s.bloomLevels,
    // Bokeh
    bokehEnabled: s.bokehEnabled,
    bokehFocusMode: s.bokehFocusMode,
    bokehBlurMethod: s.bokehBlurMethod,
    bokehWorldFocusDistance: s.bokehWorldFocusDistance,
    bokehWorldFocusRange: s.bokehWorldFocusRange,
    bokehScale: s.bokehScale,
    bokehSmoothTime: s.bokehSmoothTime,
    // SSR
    ssrEnabled: s.ssrEnabled,
    ssrIntensity: s.ssrIntensity,
    ssrMaxDistance: s.ssrMaxDistance,
    ssrThickness: s.ssrThickness,
    ssrFadeStart: s.ssrFadeStart,
    ssrFadeEnd: s.ssrFadeEnd,
    ssrQuality: s.ssrQuality,
    // Refraction
    refractionEnabled: s.refractionEnabled,
    refractionIOR: s.refractionIOR,
    refractionStrength: s.refractionStrength,
    refractionChromaticAberration: s.refractionChromaticAberration,
    // Anti-aliasing
    antiAliasingMethod: s.antiAliasingMethod,
    // Cinematic
    cinematicEnabled: s.cinematicEnabled,
    cinematicAberration: s.cinematicAberration,
    cinematicVignette: s.cinematicVignette,
    cinematicGrain: s.cinematicGrain,
    // SSAO (GTAO)
    ssaoEnabled: s.ssaoEnabled,
    ssaoIntensity: s.ssaoIntensity,
    // Paper texture
    paperEnabled: s.paperEnabled,
    paperContrast: s.paperContrast,
    paperRoughness: s.paperRoughness,
    paperFiber: s.paperFiber,
    paperFiberSize: s.paperFiberSize,
    paperCrumples: s.paperCrumples,
    paperCrumpleSize: s.paperCrumpleSize,
    paperFolds: s.paperFolds,
    paperFoldCount: s.paperFoldCount,
    paperDrops: s.paperDrops,
    paperFade: s.paperFade,
    paperSeed: s.paperSeed,
    paperColorFront: s.paperColorFront,
    paperColorBack: s.paperColorBack,
    paperQuality: s.paperQuality,
    paperIntensity: s.paperIntensity,
    // Frame Blending
    frameBlendingEnabled: s.frameBlendingEnabled,
    frameBlendingFactor: s.frameBlendingFactor,
    // Depth selection
    objectOnlyDepth: s.objectOnlyDepth,
  }));
  const ppState = usePostProcessingStore(postProcessingSelector);

  // Store subscriptions - Environment (walls, skybox, background color)
  const envSelector = useShallow((s: ReturnType<typeof useEnvironmentStore.getState>) => ({
    activeWalls: s.activeWalls,
    skyboxMode: s.skyboxMode,
    skyboxEnabled: s.skyboxEnabled,
    classicCubeTexture: s.classicCubeTexture,
    iblQuality: s.iblQuality,
    backgroundColor: s.backgroundColor,
  }));
  const envState = useEnvironmentStore(envSelector);

  // Store subscriptions - Lighting (tone mapping)
  const lightingSelector = useShallow((s: ReturnType<typeof useLightingStore.getState>) => ({
    toneMappingEnabled: s.toneMappingEnabled,
    toneMappingAlgorithm: s.toneMappingAlgorithm,
    exposure: s.exposure,
  }));
  const lightingState = useLightingStore(lightingSelector);

  // Store subscriptions - UI debug toggles
  const uiSelector = useShallow((s: ReturnType<typeof useUIStore.getState>) => ({
    showDepthBuffer: s.showDepthBuffer,
    showNormalBuffer: s.showNormalBuffer,
    showTemporalDepthBuffer: s.showTemporalDepthBuffer,
  }));
  const uiState = useUIStore(uiSelector);

  // Store subscriptions - Performance (temporal reprojection, resolution scale)
  const perfSelector = useShallow((s: ReturnType<typeof usePerformanceStore.getState>) => ({
    temporalReprojectionEnabled: s.temporalReprojectionEnabled,
    qualityMultiplier: s.qualityMultiplier,
    renderResolutionScale: s.renderResolutionScale,
  }));
  const perfState = usePerformanceStore(perfSelector);

  // Store subscriptions - Black hole config (non-gravity params only)
  // NOTE: Gravity-related settings (gravityStrength, bendScale, distanceFalloff, lensingFalloff)
  // are now read from global postProcessingStore (ppState) instead of blackhole store
  const blackHoleSelector = useShallow((s: ReturnType<typeof useExtendedObjectStore.getState>) => ({
    // Non-gravity black hole settings only
    horizonRadius: s.blackhole.horizonRadius,
    skyCubemapResolution: s.blackhole.skyCubemapResolution,
    schroedingerIsoEnabled: s.schroedinger.isoEnabled,
    // Gravity settings (from blackhole config)
    gravityStrength: s.blackhole.gravityStrength,
    bendScale: s.blackhole.bendScale,
    lensingFalloff: s.blackhole.distanceFalloff, // Aliased from distanceFalloff
    // Photon shell settings (screen-space edge glow)
    shellGlowStrength: s.blackhole.shellGlowStrength,
    shellGlowColor: s.blackhole.shellGlowColor,
    // DEPRECATED: Deferred lensing properties (pass is always disabled, use defaults)
    deferredLensingStrength: 0,
    deferredLensingChromaticAberration: 0,
    deferredLensingRadius: 1.0,
  }));
  const blackHoleState = useExtendedObjectStore(blackHoleSelector);

  // Keep latest store states in refs for render graph callbacks
  const ppStateRef = useRef(ppState);
  const envStateRef = useRef(envState);
  const uiStateRef = useRef(uiState);
  const perfStateRef = useRef(perfState);
  const blackHoleStateRef = useRef(blackHoleState);

  useEffect(() => {
    ppStateRef.current = ppState;
  }, [ppState]);

  useEffect(() => {
    envStateRef.current = envState;
  }, [envState]);

  useEffect(() => {
    uiStateRef.current = uiState;
  }, [uiState]);

  useEffect(() => {
    perfStateRef.current = perfState;
  }, [perfState]);

  useEffect(() => {
    blackHoleStateRef.current = blackHoleState;
  }, [blackHoleState]);

  // ==========================================================================
  // Camera-relative helpers (auto-focus, lensing center)
  // ==========================================================================

  const autoFocusRaycaster = useMemo(() => new THREE.Raycaster(), []);
  const screenCenter = useMemo(() => new THREE.Vector2(0, 0), []);
  const autoFocusDistanceRef = useRef(ppState.bokehWorldFocusDistance);
  const currentFocusRef = useRef(ppState.bokehWorldFocusDistance);
  const lastRaycastTimeRef = useRef(0); // Throttle autofocus raycaster
  const blackHoleWorldPosition = useMemo(() => new THREE.Vector3(0, 0, 0), []);

  // Buffer stats update interval (for performance monitor)
  const bufferStatsTimeRef = useRef(0);
  const projectedBlackHole = useMemo(() => new THREE.Vector3(), []);

  // Track previous frame blending enabled state for onEnabled() callback
  const wasFrameBlendingEnabledRef = useRef(ppState.frameBlendingEnabled);

  // NOTE: Three.js renderer tone mapping (gl.toneMapping) is NOT used here.
  // It only applies when rendering directly to screen (null render target),
  // but our render graph renders everything to off-screen targets first.
  // Tone mapping is handled by ToneMappingPass in the render graph instead.

  // ==========================================================================
  // Create Render Graph (once, with all passes)
  // ==========================================================================

  const graphRef = useRef<RenderGraph | null>(null);
  const passRefs = useRef<{
    cubemapCapture?: CubemapCapturePass;
    scenePass?: ScenePass;
    environmentScene?: ScenePass;
    objectDepth?: DepthPass;
    temporalDepthCapture?: TemporalDepthCapturePass;
    temporalCloud?: TemporalCloudPass;
    normalPass?: NormalPass;
    mainObjectMrt?: MainObjectMRTPass;
    normalComposite?: FullscreenPass;
    cloudComposite?: FullscreenPass;
    bufferPreview?: BufferPreviewPass;
    gravityComposite?: EnvironmentCompositePass;
    gtao?: GTAOPass;
    bloom?: BloomPass;
    ssr?: SSRPass;
    bokeh?: BokehPass;
    refraction?: RefractionPass;
    lensing?: ScreenSpaceLensingPass;
    cinematic?: CinematicPass;
    toneMapping?: ToneMappingPass;
    frameBlending?: FrameBlendingPass;
    paper?: PaperTexturePass;
    fxaa?: FXAAPass;
    smaa?: SMAAPass;
    toScreen?: ToScreenPass;
  }>({});

  // Create graph with all resources and passes
  const graph = useMemo(() => {
    // Dispose previous graph
    graphRef.current?.dispose();

    const g = new RenderGraph();

    // ========================================================================
    // Set Store Getters for Frozen Frame Context
    // ========================================================================
    // These are called ONCE at frame start to capture frozen state.
    // Passes should read from ctx.frame.stores.* instead of live stores.
    g.setStoreGetters({
      getAnimationState: () => {
        const s = useAnimationStore.getState();
        return {
          accumulatedTime: s.accumulatedTime,
          speed: s.speed,
          isPlaying: s.isPlaying,
          direction: s.direction,
          animatingPlanes: s.animatingPlanes,
        };
      },
      getGeometryState: () => {
        const s = useGeometryStore.getState();
        return {
          objectType: s.objectType,
          dimension: s.dimension,
        };
      },
      getEnvironmentState: () => {
        const s = useEnvironmentStore.getState();
        return {
          skybox: s,
          ground: s,
        };
      },
      getPostProcessingState: () => usePostProcessingStore.getState(),
      getPerformanceState: () => {
        const s = usePerformanceStore.getState();
        return {
          isInteracting: s.isInteracting,
          sceneTransitioning: s.sceneTransitioning,
          progressiveRefinementEnabled: s.progressiveRefinementEnabled,
          qualityMultiplier: s.qualityMultiplier,
          refinementStage: s.refinementStage,
          temporalReprojectionEnabled: s.temporalReprojectionEnabled,
          cameraTeleported: s.cameraTeleported,
          fractalAnimationLowQuality: s.fractalAnimationLowQuality,
          isShaderCompiling: s.isShaderCompiling,
          renderResolutionScale: s.renderResolutionScale,
        };
      },
      getBlackHoleState: () => useExtendedObjectStore.getState().blackhole,
      getUIState: () => {
        const s = useUIStore.getState();
        return {
          showDepthBuffer: s.showDepthBuffer,
          showNormalBuffer: s.showNormalBuffer,
          showTemporalDepthBuffer: s.showTemporalDepthBuffer,
        };
      },
    });

    // ========================================================================
    // Register External Bridge Exports
    // ========================================================================
    // These define how internal resources are exported to external systems.
    // CubemapCapturePass calls ctx.queueExport() which batches exports.
    // executeExports() applies them AFTER all passes complete.
    g.registerExport(createSceneBackgroundExport(scene));
    g.registerExport(createSceneEnvironmentExport(scene));

    // ========================================================================
    // Register Resources
    // ========================================================================

    // Main scene HDR color buffer (with depth texture)
    // Single attachment to support mixed materials (standard objects + MRT-aware objects).
    // G-Buffer data for Main Object is captured separately in MainObjectMRTPass.
    g.addResource({
      id: RESOURCES.SCENE_COLOR,
      type: 'renderTarget',
      size: { mode: 'screen' },
      format: THREE.RGBAFormat,
      dataType: THREE.HalfFloatType,
      depthBuffer: true,
      depthTexture: true,
      depthTextureFormat: THREE.DepthFormat,
      depthTextureType: THREE.UnsignedShortType,
      depthTextureMinFilter: THREE.NearestFilter,
      depthTextureMagFilter: THREE.NearestFilter,
    });

    // Object-only depth (for effects that should ignore environment)
    g.addResource({
      id: RESOURCES.OBJECT_DEPTH,
      type: 'renderTarget',
      size: { mode: 'screen' },
      format: THREE.RGBAFormat,
      dataType: THREE.UnsignedByteType,
      depthBuffer: true,
      depthTexture: true,
      depthTextureFormat: THREE.DepthFormat,
      depthTextureType: THREE.UnsignedShortType,
      depthTextureMinFilter: THREE.NearestFilter,
      depthTextureMagFilter: THREE.NearestFilter,
      textureRole: 'depth',
    });

    // Environment normals
    g.addResource({
      id: RESOURCES.NORMAL_ENV,
      type: 'renderTarget',
      size: { mode: 'screen' },
      format: THREE.RGBAFormat,
      dataType: THREE.HalfFloatType,
      depthBuffer: false,
    });

    // Main object MRT (color + normal + position)
    // Uses 3 attachments: gColor, gNormal, gPosition
    // Position is needed for raymarching objects (Schroedinger, BlackHole) that use
    // temporal reprojection even when on MAIN_OBJECT layer.
    // IMPORTANT: All shaders rendering to this target MUST output to all 3 locations
    // to avoid GL_INVALID_OPERATION errors.
    g.addResource({
      id: RESOURCES.MAIN_OBJECT_MRT,
      type: 'mrt',
      size: { mode: 'screen' },
      attachmentCount: 3, // DO NOT CHANGE - needed for temporal reprojection, reducing to 2 is NOT the fix for GL errors
      attachmentFormats: [THREE.RGBAFormat, THREE.RGBAFormat, THREE.RGBAFormat],
      dataType: THREE.HalfFloatType,
      depthBuffer: true,
      depthTexture: true,
      depthTextureFormat: THREE.DepthFormat,
      depthTextureType: THREE.UnsignedShortType,
      depthTextureMinFilter: THREE.NearestFilter,
      depthTextureMagFilter: THREE.NearestFilter,
    });

    // Temporal Cloud Resources
    // 1. Quarter-res render target (Color, Normal, Position)
    g.addResource({
      id: RESOURCES.TEMPORAL_CLOUD_BUFFER,
      type: 'mrt',
      size: { mode: 'fraction', fraction: 0.5 },
      attachmentCount: 3,
      attachmentFormats: [THREE.RGBAFormat, THREE.RGBAFormat, THREE.RGBAFormat],
      dataType: THREE.FloatType, // Float for high precision position
      depthBuffer: true,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });

    // 2. Accumulation buffer (Color, Position) - PingPong
    g.addResource({
      id: RESOURCES.TEMPORAL_ACCUMULATION,
      type: 'mrt',
      size: { mode: 'screen' },
      attachmentCount: 2,
      attachmentFormats: [THREE.RGBAFormat, THREE.RGBAFormat],
      dataType: THREE.FloatType, // Float for position precision
      depthBuffer: false,
    });

    // 3. Reprojection buffer (Reprojected Color, Validity)
    g.addResource({
      id: RESOURCES.TEMPORAL_REPROJECTION,
      type: 'mrt',
      size: { mode: 'screen' },
      attachmentCount: 2,
      attachmentFormats: [THREE.RGBAFormat, THREE.RGBAFormat], // Validity in R channel
      dataType: THREE.HalfFloatType,
      depthBuffer: false,
    });

    // 4. Temporal depth output for raymarching acceleration
    g.addResource({
      id: RESOURCES.TEMPORAL_DEPTH_OUTPUT,
      type: 'renderTarget',
      size: { mode: 'screen' },
      format: THREE.RGBAFormat,
      dataType: THREE.FloatType,
      depthBuffer: false,
    });

    // Final normal buffer for SSR/refraction/GTAO
    g.addResource({
      id: RESOURCES.NORMAL_BUFFER,
      type: 'renderTarget',
      size: { mode: 'screen' },
      format: THREE.RGBAFormat,
      dataType: THREE.HalfFloatType,
      depthBuffer: false,
    });

    // Scene color after volumetric composite
    g.addResource({
      id: RESOURCES.SCENE_COMPOSITE,
      type: 'renderTarget',
      size: { mode: 'screen' },
      format: THREE.RGBAFormat,
      dataType: THREE.HalfFloatType,
    });

    // Environment color (skybox + walls only, for gravitational lensing)
    g.addResource({
      id: RESOURCES.ENVIRONMENT_COLOR,
      type: 'renderTarget',
      size: { mode: 'screen' },
      format: THREE.RGBAFormat,
      dataType: THREE.HalfFloatType,
      depthBuffer: true,
      depthTexture: true,
      depthTextureFormat: THREE.DepthFormat,
      depthTextureType: THREE.UnsignedShortType,
    });

    // Main object color (separate from environment for gravity composite)
    g.addResource({
      id: RESOURCES.MAIN_OBJECT_COLOR,
      type: 'renderTarget',
      size: { mode: 'screen' },
      format: THREE.RGBAFormat,
      dataType: THREE.HalfFloatType,
      depthBuffer: true,
      depthTexture: true,
      depthTextureFormat: THREE.DepthFormat,
      depthTextureType: THREE.UnsignedShortType,
    });

    // Lensed environment (after gravitational lensing applied)
    g.addResource({
      id: RESOURCES.LENSED_ENVIRONMENT,
      type: 'renderTarget',
      size: { mode: 'screen' },
      format: THREE.RGBAFormat,
      dataType: THREE.HalfFloatType,
    });

    // Buffer preview output
    g.addResource({
      id: RESOURCES.PREVIEW_OUTPUT,
      type: 'renderTarget',
      size: { mode: 'screen' },
      format: THREE.RGBAFormat,
      dataType: THREE.UnsignedByteType,
    });

    // Effect chain buffers
    g.addResource({
      id: RESOURCES.GTAO_OUTPUT,
      type: 'renderTarget',
      size: { mode: 'screen' },
      format: THREE.RGBAFormat,
      dataType: THREE.HalfFloatType,
      colorSpace: THREE.LinearSRGBColorSpace,
    });

    g.addResource({
      id: RESOURCES.BLOOM_OUTPUT,
      type: 'renderTarget',
      size: { mode: 'screen' },
      format: THREE.RGBAFormat,
      dataType: THREE.HalfFloatType,
      colorSpace: THREE.LinearSRGBColorSpace,
    });

    g.addResource({
      id: RESOURCES.SSR_OUTPUT,
      type: 'renderTarget',
      size: { mode: 'screen' },
      format: THREE.RGBAFormat,
      dataType: THREE.HalfFloatType,
      colorSpace: THREE.LinearSRGBColorSpace,
    });

    g.addResource({
      id: RESOURCES.BOKEH_OUTPUT,
      type: 'renderTarget',
      size: { mode: 'screen' },
      format: THREE.RGBAFormat,
      dataType: THREE.HalfFloatType,
      colorSpace: THREE.LinearSRGBColorSpace,
    });

    g.addResource({
      id: RESOURCES.REFRACTION_OUTPUT,
      type: 'renderTarget',
      size: { mode: 'screen' },
      format: THREE.RGBAFormat,
      dataType: THREE.HalfFloatType,
      colorSpace: THREE.LinearSRGBColorSpace,
    });

    g.addResource({
      id: RESOURCES.LENSING_OUTPUT,
      type: 'renderTarget',
      size: { mode: 'screen' },
      format: THREE.RGBAFormat,
      dataType: THREE.HalfFloatType,
    });

    g.addResource({
      id: RESOURCES.CINEMATIC_OUTPUT,
      type: 'renderTarget',
      size: { mode: 'screen' },
      format: THREE.RGBAFormat,
      dataType: THREE.HalfFloatType,
    });

    g.addResource({
      id: RESOURCES.TONEMAPPED_OUTPUT,
      type: 'renderTarget',
      size: { mode: 'screen' },
      format: THREE.RGBAFormat,
      dataType: THREE.HalfFloatType,
    });

    g.addResource({
      id: RESOURCES.FRAME_BLENDING_OUTPUT,
      type: 'renderTarget',
      size: { mode: 'screen' },
      format: THREE.RGBAFormat,
      dataType: THREE.HalfFloatType,
    });

    g.addResource({
      id: RESOURCES.PAPER_OUTPUT,
      type: 'renderTarget',
      size: { mode: 'screen' },
      format: THREE.RGBAFormat,
      dataType: THREE.HalfFloatType, // Keep precision for AA input
    });

    g.addResource({
      id: RESOURCES.AA_OUTPUT,
      type: 'renderTarget',
      size: { mode: 'screen' },
      format: THREE.RGBAFormat,
      dataType: THREE.UnsignedByteType, // AA output is LDR
    });

    // ========================================================================
    // Add Passes (order determined by graph compiler!)
    // ========================================================================

    // Helper functions receive frozen frame context for consistent state
    const shouldRenderNormals = (frame: import('@/rendering/graph/FrameContext').FrozenFrameContext | null) => {
      if (!frame) return false;
      const pp = frame.stores.postProcessing;
      const ui = frame.stores.ui;
      return (
        pp.ssrEnabled ||
        pp.refractionEnabled ||
        (pp.ssaoEnabled && isPolytope) ||
        ui.showNormalBuffer
      );
    };

    const shouldRenderObjectDepth = (frame: import('@/rendering/graph/FrameContext').FrozenFrameContext | null) => {
      if (!frame) return false;
      const pp = frame.stores.postProcessing;
      const ui = frame.stores.ui;
      const depthForEffects =
        pp.objectOnlyDepth && (pp.ssrEnabled || pp.refractionEnabled || pp.bokehEnabled);
      // NOTE: temporalDepthNeeded was removed from here because TemporalDepthCapturePass
      // now reads from MAIN_OBJECT_MRT's depth texture instead of OBJECT_DEPTH.
      // This eliminates the double-render issue for Mandelbulb/Julia temporal reprojection.
      const depthPreview = ui.showDepthBuffer && pp.objectOnlyDepth;
      return depthForEffects || depthPreview;
    };

    const shouldRenderTemporalCloud = (frame: import('@/rendering/graph/FrameContext').FrozenFrameContext | null) => {
      if (!frame) return false;
      const perf = frame.stores.performance;
      // Note: schroedingerIsoEnabled comes from extendedObjectStore, not captured in frozen context
      // Use ref for this specific field as it's not in the frozen context
      const temporalCloudAccumulation = perf.temporalReprojectionEnabled && !blackHoleStateRef.current.schroedingerIsoEnabled;
      return needsVolumetricSeparation({ temporalCloudAccumulation, objectType: objectTypeRef.current });
    };

    // Cubemap capture pass - handles both procedural and classic skyboxes
    // CRITICAL: Must run first, before any pass that depends on scene.background/environment
    // This consolidates ALL environment map handling into the render graph, ensuring proper
    // MRT state management via patched renderer.setRenderTarget.
    //
    // Two modes:
    // - PROCEDURAL: Captures SKYBOX layer to CubeRenderTarget
    // - CLASSIC: Uses externally loaded CubeTexture from store (set by SkyboxLoader)
    const cubemapCapturePass = new CubemapCapturePass({
      id: 'cubemapCapture',
      backgroundResolution: blackHoleStateRef.current.skyCubemapResolution,
      environmentResolution: 256,
      // Enabled when skybox is active and something needs it (black hole, walls, or IBL)
      enabled: (frame) => {
        if (!frame) return false;
        const env = frame.stores.environment;
        if (!env.skyboxEnabled) return false;
        // For classic mode, also need the texture to be loaded
        if (env.skyboxMode === 'classic' && !env.classicCubeTexture) return false;
        // IBL needs the cubemap for environment reflections on all objects
        const hasIBL = env.iblQuality !== 'off';
        const hasConsumer = isBlackHole || env.activeWalls.length > 0 || hasIBL;
        return hasConsumer;
      },
      // Generate PMREM only when walls need reflections OR when IBL is enabled for objects
      // Note: This is not an enabled() callback, so it still uses refs
      generatePMREM: () => envStateRef.current.activeWalls.length > 0 || envStateRef.current.iblQuality !== 'off',
      // Provide external CubeTexture for classic skybox mode
      // Note: This is not an enabled() callback, so it still uses refs
      getExternalCubeTexture: () => {
        const env = envStateRef.current;
        if (env.skyboxMode === 'classic' && env.classicCubeTexture) {
          return env.classicCubeTexture;
        }
        return null;
      },
    });
    passRefs.current.cubemapCapture = cubemapCapturePass;
    g.addPass(cubemapCapturePass);

    // Scene render pass - renders all layers to SCENE_COLOR
    // Used when gravity is disabled (no split rendering needed)
    // CRITICAL: renderBackground: false prevents Three.js from rendering scene.background
    // with its internal shader that only outputs to 1 location. The custom SkyboxMesh on
    // SKYBOX layer uses a proper 3-output shader and handles skybox rendering correctly.
    const scenePass = new ScenePass({
      id: 'scene',
      outputs: [{ resourceId: RESOURCES.SCENE_COLOR, access: 'write' }],
      layers: [RENDER_LAYERS.MAIN_OBJECT, RENDER_LAYERS.ENVIRONMENT, RENDER_LAYERS.SKYBOX],
      clearColor: 0x000000,
      autoClear: true,
      renderBackground: false,
      // Disabled when gravity is enabled (use split rendering instead)
      enabled: (frame) => !(frame?.stores.postProcessing.gravityEnabled ?? false),
      // Capture scene-only GPU stats for performance monitoring (excludes post-processing)
      // Throttled to 500ms to prevent 60Hz store updates
      onRenderStats: throttledUpdateSceneGpu,
    });
    passRefs.current.scenePass = scenePass;
    g.addPass(scenePass);

    // ========================================================================
    // Gravitational Lensing Pipeline (Split Scene Rendering)
    // ========================================================================
    // When gravity is enabled, render environment and main object separately
    // so we can apply gravitational lensing only to the environment layer.

    // Environment scene pass - renders ENVIRONMENT + SKYBOX layers only
    const environmentScenePass = new ScenePass({
      id: 'environmentScene',
      outputs: [{ resourceId: RESOURCES.ENVIRONMENT_COLOR, access: 'write' }],
      layers: [RENDER_LAYERS.ENVIRONMENT, RENDER_LAYERS.SKYBOX],
      clearColor: 0x000000,
      autoClear: true,
      renderBackground: false,
      enabled: (frame) => frame?.stores.postProcessing.gravityEnabled ?? false,
    });
    passRefs.current.environmentScene = environmentScenePass;
    g.addPass(environmentScenePass);

    // Main object scene pass - renders MAIN_OBJECT layer only
    // forceOpaque: true ensures the object is rendered without blending
    // The composite pass handles alpha blending using the material's opacity uniform
    g.addPass(
      new ScenePass({
        id: 'mainObjectScene',
        outputs: [{ resourceId: RESOURCES.MAIN_OBJECT_COLOR, access: 'write' }],
        layers: [RENDER_LAYERS.MAIN_OBJECT],
        clearColor: 0x000000,
        clearAlpha: 0, // Clear with transparent black
        autoClear: true,
        renderBackground: false,
        forceOpaque: true, // Render opaque, let composite shader handle alpha
        enabled: (frame) => frame?.stores.postProcessing.gravityEnabled ?? false,
        // Capture scene-only GPU stats when gravity path is active (excludes post-processing)
        // Throttled to 500ms to prevent 60Hz store updates
        onRenderStats: throttledUpdateSceneGpu,
      })
    );

    // Gravitational lensing pass - applies lensing to environment only
    const gravityLensingPass = new GravitationalLensingPass({
      id: 'gravityLensing',
      environmentInput: RESOURCES.ENVIRONMENT_COLOR,
      outputResource: RESOURCES.LENSED_ENVIRONMENT,
      enabled: (frame) => frame?.stores.postProcessing.gravityEnabled ?? false,
    });
    g.addPass(gravityLensingPass);

    // Environment composite pass - combines lensed environment with main object
    // Also handles screen-space photon shell (edge glow) for black holes
    const gravityCompositePass = new EnvironmentCompositePass({
      id: 'gravityComposite',
      lensedEnvironmentInput: RESOURCES.LENSED_ENVIRONMENT,
      mainObjectInput: RESOURCES.MAIN_OBJECT_COLOR,
      mainObjectDepthInput: RESOURCES.MAIN_OBJECT_COLOR,
      mainObjectDepthInputAttachment: 'depth', // Read depth attachment from render target
      outputResource: RESOURCES.SCENE_COLOR, // Output to SCENE_COLOR so rest of pipeline works
      enabled: (frame) => frame?.stores.postProcessing.gravityEnabled ?? false,
    });
    passRefs.current.gravityComposite = gravityCompositePass;
    g.addPass(gravityCompositePass);

    // Object depth pass
    const objectDepthPass = new DepthPass({
      id: 'objectDepth',
      outputs: [{ resourceId: RESOURCES.OBJECT_DEPTH, access: 'write' }],
      layers: [RENDER_LAYERS.MAIN_OBJECT],
      mode: 'material',
      forceDepthWrite: 'all',
      disableColorWrites: true,
      clear: true,
      enabled: shouldRenderObjectDepth,
    });
    passRefs.current.objectDepth = objectDepthPass;
    g.addPass(objectDepthPass);

    // Temporal position capture pass
    // Captures gPosition buffer (xyz=world pos, w=model-space ray distance) for
    // position-based temporal reprojection. This correctly handles camera rotation
    // unlike the previous depth-only approach.
    // The graph automatically orders this AFTER mainObjectMrt due to input dependency.
    const temporalDepthCapture = new TemporalDepthCapturePass({
      id: 'temporalDepthCapture',
      positionInput: RESOURCES.MAIN_OBJECT_MRT,
      positionAttachment: 2,  // gPosition is MRT attachment 2 (0=gColor, 1=gNormal, 2=gPosition)
      outputResource: RESOURCES.TEMPORAL_DEPTH_OUTPUT,
      enabled: (frame) => {
        if (!frame) return false;
        const perf = frame.stores.performance;
        const ui = frame.stores.ui;
        const objectType = frame.stores.geometry?.objectType ?? '';
        // Only enable for object types that use temporal depth (Mandelbulb/Julia)
        const usesDepth = usesTemporalDepth(objectType);
        return (perf.temporalReprojectionEnabled && usesDepth) || (ui.showTemporalDepthBuffer && usesDepth);
      },
      // Note: forceCapture is not an enabled() callback, so it still uses refs
      forceCapture: () => uiStateRef.current.showTemporalDepthBuffer,
      skipPassthrough: true,
    });
    passRefs.current.temporalDepthCapture = temporalDepthCapture;
    g.addPass(temporalDepthCapture);

    // Temporal cloud accumulation (quarter-res volumetric pass)
    // Note: shouldRender uses refs because it's not an enabled() callback (different interface)
    const shouldRenderTemporalCloudRef = () => {
      const perf = perfStateRef.current;
      const temporalCloudAccumulation = perf.temporalReprojectionEnabled && !blackHoleStateRef.current.schroedingerIsoEnabled;
      return needsVolumetricSeparation({ temporalCloudAccumulation, objectType: objectTypeRef.current });
    };
    const temporalCloudPass = new TemporalCloudPass({
      id: 'temporalCloud',
      volumetricLayer: RENDER_LAYERS.VOLUMETRIC,
      shouldRender: shouldRenderTemporalCloudRef,
      cloudBuffer: RESOURCES.TEMPORAL_CLOUD_BUFFER,
      accumulationBuffer: RESOURCES.TEMPORAL_ACCUMULATION,
      reprojectionBuffer: RESOURCES.TEMPORAL_REPROJECTION,
      enabled: shouldRenderTemporalCloud,
      priority: -10,
    });
    passRefs.current.temporalCloud = temporalCloudPass;
    g.addPass(temporalCloudPass);

    // Environment normal pass
    const normalPass = new NormalPass({
      id: 'normalEnv',
      outputs: [{ resourceId: RESOURCES.NORMAL_ENV, access: 'write' }],
      layers: [RENDER_LAYERS.ENVIRONMENT],
      renderBackground: false,
      enabled: shouldRenderNormals,
    });
    passRefs.current.normalPass = normalPass;
    g.addPass(normalPass);

    // Main object MRT (color + normal + position)
    // ALWAYS enabled - main objects only render here now (not in ScenePass)
    const mainObjectMrt = new MainObjectMRTPass({
      id: 'mainObjectMrt',
      outputResource: RESOURCES.MAIN_OBJECT_MRT,
      layers: [RENDER_LAYERS.MAIN_OBJECT],
      renderBackground: false,
      forceOpaque: true,
    });
    passRefs.current.mainObjectMrt = mainObjectMrt;
    g.addPass(mainObjectMrt);

    // Composite normals (env + main object + volumetric)
    // Composite normals from environment and main object MRT
    // Note: Depth-based compositing was removed because after the scene pass split
    // for gravitational lensing, the depths no longer match reliably.
    const normalComposite = new FullscreenPass({
      id: 'normalComposite',
      inputs: [
        { resourceId: RESOURCES.NORMAL_ENV, access: 'read', binding: 'uNormalEnv' },
        { resourceId: RESOURCES.MAIN_OBJECT_MRT, access: 'read', attachment: 1, binding: 'uMainNormal' },
      ],
      outputs: [{ resourceId: RESOURCES.NORMAL_BUFFER, access: 'write' }],
      fragmentShader: normalCompositeFragmentShader,
      uniforms: {
        uCloudNormal: { value: null },
        uCloudAvailable: { value: 0 },
      },
      enabled: shouldRenderNormals,
    });
    passRefs.current.normalComposite = normalComposite;
    g.addPass(normalComposite);

    // Composite temporal clouds over the scene color
    // This pass is only needed when temporal clouds are active.
    // When disabled, passthrough correctly copies SCENE_COLOR → SCENE_COMPOSITE.
    const cloudComposite = new FullscreenPass({
      id: 'cloudComposite',
      inputs: [{ resourceId: RESOURCES.SCENE_COLOR, access: 'read', binding: 'uSceneColor' }],
      outputs: [{ resourceId: RESOURCES.SCENE_COMPOSITE, access: 'write' }],
      fragmentShader: cloudCompositeFragmentShader,
      uniforms: {
        uCloud: { value: null },
        uCloudAvailable: { value: 0 },
      },
      enabled: shouldRenderTemporalCloud,
      skipPassthrough: true,
    });
    passRefs.current.cloudComposite = cloudComposite;
    g.addPass(cloudComposite);

    // GTAO pass (only for polytopes)
    // OPTIMIZATION: Half-resolution rendering with bilateral upsampling
    // reduces GTAO cost by 50-75% with minimal visual quality loss
    const gtaoPass = new GTAOPass({
      id: 'gtao',
      colorInput: RESOURCES.SCENE_COMPOSITE,
      normalInput: RESOURCES.NORMAL_BUFFER,
      depthInput: RESOURCES.SCENE_COLOR,
      depthInputAttachment: 'depth',
      outputResource: RESOURCES.GTAO_OUTPUT,
      enabled: (frame) => (frame?.stores.postProcessing.ssaoEnabled ?? false) && isPolytope,
      skipPassthrough: true,
      halfResolution: true, // Enable half-res optimization
      bilateralDepthThreshold: 0.02, // Depth threshold for edge preservation
    });
    passRefs.current.gtao = gtaoPass;
    g.addPass(gtaoPass);

    // Bloom pass (using postprocessing library for better HDR support)
    const bloomPass = new BloomPass({
      id: 'bloom',
      inputResource: RESOURCES.GTAO_OUTPUT,
      outputResource: RESOURCES.BLOOM_OUTPUT,
      strength: ppStateRef.current.bloomIntensity,
      radius: ppStateRef.current.bloomRadius,
      threshold: ppStateRef.current.bloomThreshold,
      smoothing: ppStateRef.current.bloomSmoothing,
      levels: ppStateRef.current.bloomLevels,
      enabled: (frame) => frame?.stores.postProcessing.bloomEnabled ?? false,
      skipPassthrough: true,
    });
    passRefs.current.bloom = bloomPass;
    g.addPass(bloomPass);

    // SSR pass
    const ssrPass = new SSRPass({
      id: 'ssr',
      colorInput: RESOURCES.BOKEH_OUTPUT,
      normalInput: RESOURCES.NORMAL_BUFFER,
      depthInput: RESOURCES.OBJECT_DEPTH,
      alternateDepthInput: RESOURCES.SCENE_COLOR,
      alternateDepthInputAttachment: 'depth',
      // Note: depthInputSelector is not an enabled() callback, so it still uses refs
      depthInputSelector: () =>
        ppStateRef.current.objectOnlyDepth ? RESOURCES.OBJECT_DEPTH : RESOURCES.SCENE_COLOR,
      outputResource: RESOURCES.SSR_OUTPUT,
      intensity: ppStateRef.current.ssrIntensity,
      maxDistance: ppStateRef.current.ssrMaxDistance,
      thickness: ppStateRef.current.ssrThickness,
      fadeStart: ppStateRef.current.ssrFadeStart,
      fadeEnd: ppStateRef.current.ssrFadeEnd,
      enabled: (frame) => frame?.stores.postProcessing.ssrEnabled ?? false,
      skipPassthrough: true,
    });
    passRefs.current.ssr = ssrPass;
    g.addPass(ssrPass);

    // Refraction pass
    const refractionPass = new RefractionPass({
      id: 'refraction',
      colorInput: RESOURCES.SSR_OUTPUT,
      normalInput: RESOURCES.NORMAL_BUFFER,
      depthInput: RESOURCES.OBJECT_DEPTH,
      alternateDepthInput: RESOURCES.SCENE_COLOR,
      alternateDepthInputAttachment: 'depth',
      // Note: depthInputSelector is not an enabled() callback, so it still uses refs
      depthInputSelector: () =>
        ppStateRef.current.objectOnlyDepth ? RESOURCES.OBJECT_DEPTH : RESOURCES.SCENE_COLOR,
      outputResource: RESOURCES.REFRACTION_OUTPUT,
      ior: ppStateRef.current.refractionIOR,
      strength: ppStateRef.current.refractionStrength,
      chromaticAberration: ppStateRef.current.refractionChromaticAberration,
      enabled: (frame) => frame?.stores.postProcessing.refractionEnabled ?? false,
      skipPassthrough: true,
    });
    passRefs.current.refraction = refractionPass;
    g.addPass(refractionPass);

    // Bokeh pass
    const bokehPass = new BokehPass({
      id: 'bokeh',
      colorInput: RESOURCES.BLOOM_OUTPUT,
      depthInput: RESOURCES.OBJECT_DEPTH,
      alternateDepthInput: RESOURCES.SCENE_COLOR,
      alternateDepthInputAttachment: 'depth',
      // Note: depthInputSelector is not an enabled() callback, so it still uses refs
      depthInputSelector: () =>
        ppStateRef.current.objectOnlyDepth ? RESOURCES.OBJECT_DEPTH : RESOURCES.SCENE_COLOR,
      outputResource: RESOURCES.BOKEH_OUTPUT,
      focus: ppStateRef.current.bokehWorldFocusDistance,
      focusRange: ppStateRef.current.bokehWorldFocusRange,
      aperture: ppStateRef.current.bokehScale * 0.005,
      maxBlur: ppStateRef.current.bokehScale * 0.02,
      enabled: (frame) => {
        if (!frame) return false;
        const pp = frame.stores.postProcessing;
        const ui = frame.stores.ui;
        return pp.bokehEnabled &&
          !(ui.showDepthBuffer || ui.showNormalBuffer || ui.showTemporalDepthBuffer);
      },
      skipPassthrough: true,
    });
    passRefs.current.bokeh = bokehPass;
    g.addPass(bokehPass);

    // Screen-space lensing pass (DEPRECATED for black hole - use global gravity lensing instead)
    // Kept for potential future use on other objects, but always disabled
    const lensingPass = new ScreenSpaceLensingPass({
      id: 'lensing',
      colorInput: RESOURCES.REFRACTION_OUTPUT,
      depthInput: RESOURCES.SCENE_COLOR,
      depthInputAttachment: 'depth',
      outputResource: RESOURCES.LENSING_OUTPUT,
      intensity: blackHoleStateRef.current.deferredLensingStrength,
      mass: blackHoleStateRef.current.gravityStrength,
      distortionScale: blackHoleStateRef.current.bendScale,
      chromaticAberration: blackHoleStateRef.current.deferredLensingChromaticAberration,
      falloff: blackHoleStateRef.current.lensingFalloff,
      // DEPRECATED: SSL for black holes is replaced by global gravity lensing (GravitationalLensingPass)
      enabled: () => false,
      skipPassthrough: true,
    });
    passRefs.current.lensing = lensingPass;
    g.addPass(lensingPass);

    // Cinematic pass (includes chromatic aberration, vignette, and film grain)
    const cinematicPass = new CinematicPass({
      id: 'cinematic',
      colorInput: RESOURCES.LENSING_OUTPUT,
      outputResource: RESOURCES.CINEMATIC_OUTPUT,
      aberration: ppStateRef.current.cinematicAberration,
      vignette: ppStateRef.current.cinematicVignette,
      grain: ppStateRef.current.cinematicGrain,
      enabled: (frame) => frame?.stores.postProcessing.cinematicEnabled ?? false,
      skipPassthrough: true,
    });
    passRefs.current.cinematic = cinematicPass;
    g.addPass(cinematicPass);

    // Tone mapping pass - converts HDR to LDR
    // Position: After all HDR effects (cinematic), before AA
    const toneMappingPass = new ToneMappingPass({
      id: 'toneMapping',
      colorInput: RESOURCES.CINEMATIC_OUTPUT,
      outputResource: RESOURCES.TONEMAPPED_OUTPUT,
      toneMapping: TONE_MAPPING_TO_THREE[lightingState.toneMappingAlgorithm],
      exposure: lightingState.exposure,
      enabled: (frame) => {
        if (!frame) return false;
        // Access lighting state from frozen frame context
        // Note: We need to add lighting to frozen context, for now use ref
        return lightingState.toneMappingEnabled;
      },
      skipPassthrough: true,
    });
    passRefs.current.toneMapping = toneMappingPass;
    g.addPass(toneMappingPass);

    // Frame blending pass - blends current frame with previous for smoother motion
    // Position: After tone mapping (LDR), before paper texture
    const frameBlendingPass = new FrameBlendingPass({
      id: 'frameBlending',
      colorInput: RESOURCES.TONEMAPPED_OUTPUT,
      outputResource: RESOURCES.FRAME_BLENDING_OUTPUT,
      blendFactor: ppStateRef.current.frameBlendingFactor,
      enabled: (frame) => frame?.stores.postProcessing.frameBlendingEnabled ?? false,
      // Default skipPassthrough: false means automatic passthrough when disabled
    });
    passRefs.current.frameBlending = frameBlendingPass;
    g.addPass(frameBlendingPass);

    // Paper texture pass - applies paper/cardboard texture overlay
    // Position: After frame blending, before AA
    const paperPass = new PaperTexturePass({
      id: 'paper',
      colorInput: RESOURCES.FRAME_BLENDING_OUTPUT,
      outputResource: RESOURCES.PAPER_OUTPUT,
      contrast: ppStateRef.current.paperContrast,
      roughness: ppStateRef.current.paperRoughness,
      fiber: ppStateRef.current.paperFiber,
      fiberSize: ppStateRef.current.paperFiberSize,
      crumples: ppStateRef.current.paperCrumples,
      crumpleSize: ppStateRef.current.paperCrumpleSize,
      folds: ppStateRef.current.paperFolds,
      foldCount: ppStateRef.current.paperFoldCount,
      drops: ppStateRef.current.paperDrops,
      fade: ppStateRef.current.paperFade,
      seed: ppStateRef.current.paperSeed,
      colorFront: ppStateRef.current.paperColorFront,
      colorBack: ppStateRef.current.paperColorBack,
      quality: ppStateRef.current.paperQuality,
      intensity: ppStateRef.current.paperIntensity,
      enabled: (frame) => frame?.stores.postProcessing.paperEnabled ?? false,
      skipPassthrough: true,
    });
    passRefs.current.paper = paperPass;
    g.addPass(paperPass);

    // Anti-aliasing pass (only add the active one to avoid multiple writers)
    // Graph is recreated when antiAliasingMethod changes (see dependency array)
    if (ppStateRef.current.antiAliasingMethod === 'fxaa') {
      const fxaaPass = new FXAAPass({
        id: 'fxaa',
        colorInput: RESOURCES.PAPER_OUTPUT,
        outputResource: RESOURCES.AA_OUTPUT,
      });
      passRefs.current.fxaa = fxaaPass;
      passRefs.current.smaa = undefined;
      g.addPass(fxaaPass);
    } else if (ppStateRef.current.antiAliasingMethod === 'smaa') {
      const smaaPass = new SMAAPass({
        id: 'smaa',
        colorInput: RESOURCES.PAPER_OUTPUT,
        outputResource: RESOURCES.AA_OUTPUT,
      });
      passRefs.current.smaa = smaaPass;
      passRefs.current.fxaa = undefined;
      g.addPass(smaaPass);
    } else {
      // No AA - use efficient CopyPass instead of FXAAPass for passthrough
      const passthroughPass = new CopyPass({
        id: 'aaPassthrough',
        colorInput: RESOURCES.PAPER_OUTPUT,
        outputResource: RESOURCES.AA_OUTPUT,
      });
      passRefs.current.fxaa = undefined;
      passRefs.current.smaa = undefined;
      g.addPass(passthroughPass);
    }

    // Buffer preview pass
    const bufferPreview = new BufferPreviewPass({
      id: 'bufferPreview',
      bufferInput: RESOURCES.NORMAL_BUFFER,
      additionalInputs: [RESOURCES.OBJECT_DEPTH, RESOURCES.SCENE_COLOR, RESOURCES.NORMAL_BUFFER],
      outputResource: RESOURCES.PREVIEW_OUTPUT,
      bufferType: 'copy',
      depthMode: 'linear',
      enabled: (frame) => {
        if (!frame) return false;
        const ui = frame.stores.ui;
        return ui.showDepthBuffer || ui.showNormalBuffer || ui.showTemporalDepthBuffer;
      },
      skipPassthrough: true,
    });
    passRefs.current.bufferPreview = bufferPreview;
    g.addPass(bufferPreview);

    // Output to screen (preview vs final)
    g.addPass(
      new ToScreenPass({
        id: 'previewToScreen',
        inputs: [{ resourceId: RESOURCES.PREVIEW_OUTPUT, access: 'read' }],
        gammaCorrection: false,
        toneMapping: false,
        enabled: (frame) => {
          if (!frame) return false;
          const ui = frame.stores.ui;
          return ui.showDepthBuffer || ui.showNormalBuffer || ui.showTemporalDepthBuffer;
        },
      })
    );

    const toScreenPass = new ToScreenPass({
      id: 'finalToScreen',
      inputs: [{ resourceId: RESOURCES.AA_OUTPUT, access: 'read' }],
      gammaCorrection: false, // Let renderer handle it
      toneMapping: false,
      enabled: (frame) => {
        if (!frame) return true; // Default to showing final output
        const ui = frame.stores.ui;
        return !(ui.showDepthBuffer || ui.showNormalBuffer || ui.showTemporalDepthBuffer);
      },
    });
    passRefs.current.toScreen = toScreenPass;
    g.addPass(toScreenPass);

    // Debug overlay pass - renders RENDER_LAYERS.DEBUG after all post-processing.
    // This allows standard Three.js materials (MeshBasicMaterial, LineBasicMaterial,
    // ArrowHelper, TransformControls, etc.) to render without MRT compatibility.
    g.addPass(
      new DebugOverlayPass({
        id: 'debugOverlay',
      })
    );

    // Compile the graph (resolves dependencies, orders passes)
    const result = g.compile({ debug: false });
    if (result.warnings.length > 0) {
      console.warn('[PostProcessingV2] Graph compilation warnings:', result.warnings);
    }

    graphRef.current = g;

    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoreCount, isPolytope, isBlackHole, ppState.antiAliasingMethod, lightingState.toneMappingEnabled]); // Recreate on context restore, object type, AA method, or tone mapping toggle

  // ==========================================================================
  // Publish graph and pass references to store for external access
  // ==========================================================================

  // CRITICAL: useLayoutEffect ensures store is set BEFORE useFrame callbacks run.
  // MandelbulbMesh/QuaternionJuliaMesh/SchroedingerMesh read temporal uniforms
  // from this store in their useFrame at priority 1 (before PostProcessingV2's
  // useFrame at priority 10). useEffect would run too late, causing textureValid=false.
  //
  // NOTE: We use graphRef.current instead of graph to avoid React StrictMode issues.
  // In StrictMode, React unmounts/remounts components, which disposes the first graph.
  // The graph variable from useMemo would capture the disposed first graph, while
  // graphRef.current always points to the latest valid graph.
  useLayoutEffect(() => {
    const currentGraph = graphRef.current;
    if (!currentGraph) return;

    const { setGraph, setTemporalDepthPass, clear } = useRenderGraphStore.getState();

    // Publish references when graph is created
    setGraph(currentGraph);
    setTemporalDepthPass(passRefs.current.temporalDepthCapture ?? null);

    // Initialize GPU profiler in dev mode
    if (import.meta.env.DEV) {
      import('@/dev-tools/profiler').then(({ initProfiler }) => {
        const profiler = initProfiler(currentGraph);
        // @ts-expect-error - Dev-only profiler access
        window.__PROFILER__ = profiler;
      });
    }

    // Clear references on unmount or when graph changes
    return () => {
      clear();
      // Dispose profiler in dev mode
      if (import.meta.env.DEV) {
        import('@/dev-tools/profiler').then(({ disposeProfiler }) => {
          disposeProfiler();
          // @ts-expect-error - Dev-only profiler access
          window.__PROFILER__ = null;
        });
      }
    };
  }, [graph]);

  // ==========================================================================
  // Update pass parameters when store changes
  // ==========================================================================

  useEffect(() => {
    const { gtao, bloom, ssr, bokeh, refraction, lensing, cinematic, toneMapping } = passRefs.current;

    if (gtao) {
      gtao.setIntensity(ppState.ssaoIntensity);
    }

    if (bloom) {
      bloom.setStrength(ppState.bloomIntensity);
      bloom.setRadius(ppState.bloomRadius);
      bloom.setThreshold(ppState.bloomThreshold);
      bloom.setSmoothing(ppState.bloomSmoothing);
      bloom.setLevels(ppState.bloomLevels);
    }

    if (ssr) {
      ssr.setIntensity(ppState.ssrIntensity);
      ssr.setMaxDistance(ppState.ssrMaxDistance);
      ssr.setThickness(ppState.ssrThickness);
    }

    if (bokeh) {
      bokeh.setFocus(ppState.bokehWorldFocusDistance);
      bokeh.setFocusRange(ppState.bokehWorldFocusRange);
      bokeh.setAperture(ppState.bokehScale * 0.005);
      bokeh.setMaxBlur(ppState.bokehScale * 0.02);
    }

    autoFocusDistanceRef.current = ppState.bokehWorldFocusDistance;
    currentFocusRef.current = ppState.bokehWorldFocusDistance;

    if (refraction) {
      refraction.setIOR(ppState.refractionIOR);
      refraction.setStrength(ppState.refractionStrength);
      refraction.setChromaticAberration(ppState.refractionChromaticAberration);
    }

    if (lensing) {
      lensing.setIntensity(blackHoleState.deferredLensingStrength);
      lensing.setMass(blackHoleState.gravityStrength);
      lensing.setDistortionScale(blackHoleState.bendScale);
      lensing.setFalloff(blackHoleState.lensingFalloff);
      lensing.setChromaticAberration(blackHoleState.deferredLensingChromaticAberration);
      lensing.setHybridSkyEnabled(true);
    }

    if (cinematic) {
      cinematic.setAberration(ppState.cinematicAberration);
      cinematic.setVignette(ppState.cinematicVignette);
      cinematic.setGrain(ppState.cinematicGrain);
    }

    if (toneMapping) {
      toneMapping.setToneMapping(TONE_MAPPING_TO_THREE[lightingState.toneMappingAlgorithm]);
      toneMapping.setExposure(lightingState.exposure);
    }

    const frameBlending = passRefs.current.frameBlending;
    if (frameBlending) {
      // Reset history when re-enabled to avoid stale frame blending
      if (ppState.frameBlendingEnabled && !wasFrameBlendingEnabledRef.current) {
        frameBlending.onEnabled();
      }
      wasFrameBlendingEnabledRef.current = ppState.frameBlendingEnabled;
      frameBlending.setBlendFactor(ppState.frameBlendingFactor);
    }

    const paper = passRefs.current.paper;
    if (paper) {
      paper.setContrast(ppState.paperContrast);
      paper.setRoughness(ppState.paperRoughness);
      paper.setFiber(ppState.paperFiber);
      paper.setFiberSize(ppState.paperFiberSize);
      paper.setCrumples(ppState.paperCrumples);
      paper.setCrumpleSize(ppState.paperCrumpleSize);
      paper.setFolds(ppState.paperFolds);
      paper.setFoldCount(ppState.paperFoldCount);
      paper.setDrops(ppState.paperDrops);
      paper.setFade(ppState.paperFade);
      paper.setSeed(ppState.paperSeed);
      paper.setColorFront(ppState.paperColorFront);
      paper.setColorBack(ppState.paperColorBack);
      paper.setQuality(ppState.paperQuality);
      paper.setIntensity(ppState.paperIntensity);
    }

    // Update photon shell (screen-space edge glow) settings
    if (passRefs.current.gravityComposite) {
      passRefs.current.gravityComposite.setShellConfig({
        enabled: blackHoleState.shellGlowStrength > 0,
        color: new THREE.Color(blackHoleState.shellGlowColor),
        strength: blackHoleState.shellGlowStrength,
      });
    }
  }, [ppState, blackHoleState, lightingState]);

  // ==========================================================================
  // Update size - use useLayoutEffect to run BEFORE useFrame
  // ==========================================================================

  useLayoutEffect(() => {
    // CRITICAL: Use graphRef.current to match what useFrame uses
    // Using `graph` from useMemo causes a mismatch during React StrictMode double-render
    const graphInstance = graphRef.current;
    if (!graphInstance) return;

    // CRITICAL: Use DPR-adjusted dimensions for native resolution rendering
    // useThree().size returns CSS pixels, but canvas renders at CSS × DPR physical pixels.
    // Without DPR adjustment, render targets are at CSS resolution and get upscaled,
    // causing blurry output on high-DPI displays (e.g., MacBook Pro M3 Max at DPR 2).
    const dpr = viewport.dpr;
    const nativeWidth = Math.floor(size.width * dpr);
    const nativeHeight = Math.floor(size.height * dpr);

    graphInstance.setSize(nativeWidth, nativeHeight, perfState.renderResolutionScale);
  }, [graph, size.width, size.height, viewport.dpr, perfState.renderResolutionScale]); // Still depend on graph to re-run when graph changes

  // ==========================================================================
  // Update CAS sharpening for upscaled content
  // ==========================================================================

  useEffect(() => {
    const { toScreen } = passRefs.current;
    if (!toScreen) return;

    const scale = perfState.renderResolutionScale;

    // Skip sharpening at near-full resolution (95%+)
    if (scale >= 0.95) {
      toScreen.setSharpness(0);
    } else {
      // Auto-calculate sharpness: lower resolution = stronger sharpening
      // Formula: (1 - scale) * 1.5, clamped to max 0.7
      const autoSharpness = Math.min(0.7, (1 - scale) * 1.5);
      toScreen.setSharpness(autoSharpness);
    }
  }, [perfState.renderResolutionScale]);

  // ==========================================================================
  // CRITICAL: Initialize MRT state manager BEFORE any useFrame rendering
  // ==========================================================================
  // This MUST run before ProceduralSkyboxCapture's useFrame which calls
  // cubeCamera.update(). Without early initialization, those renders happen
  // with an unpatched renderer, causing GL_INVALID_OPERATION errors.

  useLayoutEffect(() => {
    const graphInstance = graphRef.current;
    if (!graphInstance) return;

    // Initialize renderer patching for MRT state management
    graphInstance.initializeRenderer(gl);
  }, [gl, graph]);

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  useEffect(() => {
    return () => {
      graphRef.current?.dispose();
      graphRef.current = null;
    };
  }, []);

  // ==========================================================================
  // Main Render Loop - Just call graph.execute()!
  // ==========================================================================

  useFrame((_, delta) => {
    const graphInstance = graphRef.current;
    if (!graphInstance) return;

    const pp = ppStateRef.current;
    const ui = uiStateRef.current;
    const perf = perfStateRef.current;
    const blackHole = blackHoleStateRef.current;

    const showDepthBuffer = ui.showDepthBuffer;
    const showNormalBuffer = ui.showNormalBuffer;
    const showTemporalDepthBuffer = ui.showTemporalDepthBuffer;

    // Determine temporal cloud usage (Schroedinger volumetric accumulation)
    const temporalCloudAccumulation = perf.temporalReprojectionEnabled && !blackHole.schroedingerIsoEnabled;
    const useTemporalCloud = needsVolumetricSeparation({
      temporalCloudAccumulation,
      objectType: objectTypeRef.current,
    });

    // Update object-depth layers (exclude volumetric when temporal cloud is active)
    const objectDepthLayers: number[] = [RENDER_LAYERS.MAIN_OBJECT];
    if (!useTemporalCloud) {
      objectDepthLayers.push(RENDER_LAYERS.VOLUMETRIC);
    }
    passRefs.current.objectDepth?.setLayers(objectDepthLayers);

    // Update scene clear color based on background color setting
    // When skybox is disabled, use the background color as clear color
    // When skybox is enabled, clear to black (skybox will render on top)
    const env = envStateRef.current;
    const clearColor = env.skyboxEnabled ? 0x000000 : env.backgroundColor;
    passRefs.current.scenePass?.setClearColor(clearColor);
    passRefs.current.environmentScene?.setClearColor(clearColor);

    // Update SSR quality based on performance refinement
    if (passRefs.current.ssr) {
      const effectiveQuality = getEffectiveSSRQuality(pp.ssrQuality as SSRQualityLevel, perf.qualityMultiplier);
      passRefs.current.ssr.setMaxSteps(SSR_QUALITY_STEPS[effectiveQuality] ?? 32);
    }

    // Update bokeh focus (auto-focus + smoothing)
    if (passRefs.current.bokeh && camera instanceof THREE.PerspectiveCamera) {
      let targetFocus = pp.bokehWorldFocusDistance;

      if (pp.bokehFocusMode === 'auto-center' || pp.bokehFocusMode === 'auto-mouse') {
        // Throttle raycasting to reduce expensive scene graph traversals
        // Focus smoothing (bokehSmoothTime) handles interpolation between updates
        const now = performance.now();
        if (now - lastRaycastTimeRef.current > AUTOFOCUS_RAYCAST_INTERVAL) {
          lastRaycastTimeRef.current = now;
          autoFocusRaycaster.setFromCamera(screenCenter, camera);
          const intersects = autoFocusRaycaster.intersectObjects(scene.children, true);
          if (intersects.length > 0 && intersects[0]) {
            autoFocusDistanceRef.current = intersects[0].distance;
          }
        }
        targetFocus = autoFocusDistanceRef.current;
      }

      const smoothFactor = pp.bokehSmoothTime > 0 ? 1 - Math.exp(-delta / pp.bokehSmoothTime) : 1;
      currentFocusRef.current += (targetFocus - currentFocusRef.current) * smoothFactor;

      passRefs.current.bokeh.setFocus(currentFocusRef.current);
    }

    // Update lensing center + horizon radius (screen-space)
    if (passRefs.current.lensing && camera instanceof THREE.PerspectiveCamera) {
      projectedBlackHole.copy(blackHoleWorldPosition).project(camera);
      const centerX = (projectedBlackHole.x + 1) * 0.5;
      const centerY = (projectedBlackHole.y + 1) * 0.5;
      passRefs.current.lensing.setCenter(centerX, centerY);

      const distance = camera.position.distanceTo(blackHoleWorldPosition);
      const fovY = (camera.fov * Math.PI) / 180;
      const screenHeight = 2 * distance * Math.tan(fovY / 2);
      const horizonRadiusUV = screenHeight > 0 ? blackHole.horizonRadius / screenHeight : 0.05;
      passRefs.current.lensing.setHorizonRadius(horizonRadiusUV * blackHole.deferredLensingRadius);
    }

    // Update cloud composite uniforms (use write target before swap)
    if (passRefs.current.cloudComposite) {
      const cloudTarget = useTemporalCloud ? graphInstance.getWriteTarget(RESOURCES.TEMPORAL_ACCUMULATION) : null;
      passRefs.current.cloudComposite.setUniform('uCloud', cloudTarget ? cloudTarget.texture : null);
      passRefs.current.cloudComposite.setUniform('uCloudAvailable', cloudTarget ? 1 : 0);
    }

    // Update normal composite with volumetric normals
    if (passRefs.current.normalComposite) {
      // Normal is attachment 1 of cloud buffer
      const cloudNormal = useTemporalCloud ? graphInstance.getTexture(RESOURCES.TEMPORAL_CLOUD_BUFFER, 1) : null;
      passRefs.current.normalComposite.setUniform('uCloudNormal', cloudNormal);
      passRefs.current.normalComposite.setUniform('uCloudAvailable', cloudNormal ? 1 : 0);
    }

    // Configure buffer preview
    if (passRefs.current.bufferPreview && camera instanceof THREE.PerspectiveCamera) {
      if (showDepthBuffer) {
        passRefs.current.bufferPreview.setBufferType('depth');
        passRefs.current.bufferPreview.setDepthMode('linear');
        const depthTexture = pp.objectOnlyDepth
          ? graphInstance.getTexture(RESOURCES.OBJECT_DEPTH)
          : graphInstance.getTexture(RESOURCES.SCENE_COLOR, 'depth');
        passRefs.current.bufferPreview.setExternalTexture(depthTexture);
      } else if (showNormalBuffer) {
        passRefs.current.bufferPreview.setBufferType('normal');
        passRefs.current.bufferPreview.setExternalTexture(null);
        passRefs.current.bufferPreview.setBufferInput(RESOURCES.NORMAL_BUFFER);
      } else if (showTemporalDepthBuffer) {
        const objectType = objectTypeRef.current;
        // Show temporal depth buffer for Mandelbulb/Julia, temporal cloud for Schroedinger
        if (usesTemporalDepth(objectType)) {
          passRefs.current.bufferPreview.setBufferType('temporalDepth');
          // Get temporal uniforms from the self-contained pass (reads from graph's ping-pong buffer)
          const temporalUniforms = passRefs.current.temporalDepthCapture?.getTemporalUniforms(graphInstance, true);
          passRefs.current.bufferPreview.setExternalTexture(temporalUniforms?.uPrevDepthTexture ?? null);
        } else if (usesTemporalCloud(objectType)) {
          // Show temporal cloud accumulation buffer for Schroedinger
          passRefs.current.bufferPreview.setBufferType('temporalDepth');
          passRefs.current.bufferPreview.setExternalTexture(
            graphInstance.getTexture(RESOURCES.TEMPORAL_ACCUMULATION, 0)
          );
        } else {
          // Graceful fallback: turn off the toggle if object doesn't support temporal
          useUIStore.getState().setShowTemporalDepthBuffer(false);
        }
      } else {
        passRefs.current.bufferPreview.setExternalTexture(null);
      }
    }

    // Execute the graph
    graphInstance.execute(gl, scene, camera, delta);

    // Temporal Cloud swap handled by RenderGraph (ping-pong on TEMPORAL_ACCUMULATION)

    // Periodically update buffer stats for performance monitor
    bufferStatsTimeRef.current += delta;
    if (bufferStatsTimeRef.current >= 1.0) {
      bufferStatsTimeRef.current = 0;

      const dims = graphInstance.getResourceDimensions();
      usePerformanceMetricsStore.getState().updateBufferStats({
        screen: dims.get(RESOURCES.SCENE_COLOR) ?? { width: 0, height: 0 },
        depth: dims.get(RESOURCES.OBJECT_DEPTH) ?? { width: 0, height: 0 },
        normal: dims.get(RESOURCES.NORMAL_ENV) ?? { width: 0, height: 0 },
        temporal: dims.get(RESOURCES.TEMPORAL_DEPTH_OUTPUT) ?? { width: 0, height: 0 },
      });
    }
  }, FRAME_PRIORITY.POST_EFFECTS);

  return null;
});
