/**
 * useBlackHoleUniformUpdates Hook
 *
 * Updates black hole shader uniforms each frame. This hook reads from
 * various stores and updates the material uniforms accordingly.
 *
 * Extracted from BlackHoleMesh.tsx to reduce component complexity.
 */

import { computeKerrRadii } from '@/lib/geometry/extended/kerr-physics'
import { createCachedLinearColor, updateLinearColorUniform } from '@/rendering/colors/linearCache'
import { FRAME_PRIORITY } from '@/rendering/core/framePriorities'
import { getLastFrameExternal } from '@/rendering/graph/lastFrameContext'
import { MAX_DIMENSION, useRotationUpdates } from '@/rendering/renderers/base'
import { UniformManager } from '@/rendering/uniforms/UniformManager'
import { applyScreenCoverageReduction, getScreenCoverage } from '@/rendering/utils/adaptiveQuality'
import { useAnimationStore } from '@/stores/animationStore'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { usePostProcessingStore } from '@/stores/postProcessingStore'
// Note: useLightingStore no longer imported - PBR handled via UniformManager 'pbr-face' source
import { useRotationStore } from '@/stores/rotationStore'
import { useFrame, useThree } from '@react-three/fiber'
import React, { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import {
  LIGHTING_MODE_MAP,
  MANIFOLD_TYPE_MAP,
  PALETTE_MODE_MAP,
  RAY_BENDING_MODE_MAP,
} from './types'

/**
 * Compute visual absorption radius for black hole rendering.
 *
 * This determines where rays are absorbed to create the black disk appearance.
 * We use the shadow radius (critical impact parameter) - this is the boundary
 * where any ray with smaller impact parameter will be captured by the black hole.
 *
 * For Schwarzschild: shadow ≈ 2.598 * rs (5.196 * M)
 * For Kerr: slightly smaller depending on spin
 *
 * NOTE: The photon shell is rendered BEFORE the horizon check in the shader,
 * so it remains visible even though it's at a smaller radius than the shadow.
 *
 * @param horizonRadius - Schwarzschild radius rs = 2M
 * @param spin - Dimensionless spin chi (0 to 0.998)
 * @returns Visual absorption radius (shadow radius)
 */
function computeVisualEventHorizon(horizonRadius: number, spin: number): number {
  const M = horizonRadius / 2
  const kerr = computeKerrRadii(M, spin)
  // Use shadow radius as absorption boundary
  // This is where rays would be captured regardless of bending
  return kerr.shadowRadius
}

/**
 * Create color cache for black hole specific colors
 * @returns Object containing cached linear colors
 */
function createBlackHoleColorCache() {
  return {
    baseColor: createCachedLinearColor(),
    shellGlowColor: createCachedLinearColor(),
  }
}

/**
 * Configuration options for the black hole uniform updates hook
 */
interface UseBlackHoleUniformUpdatesOptions {
  /** Reference to the black hole mesh */
  meshRef: React.RefObject<THREE.Mesh | null>
}

/**
 * Helper to safely set a uniform value
 * @param uniforms - The uniforms record to update
 * @param name - The name of the uniform
 * @param value - The new value for the uniform
 */
function setUniform<T>(
  uniforms: Record<string, { value: unknown } | undefined>,
  name: string,
  value: T
): void {
  const u = uniforms[name]
  if (u) u.value = value
}

/**
 * Update black hole uniforms each frame
 *
 * This hook handles all per-frame uniform updates, including:
 * - Time and camera updates
 * - Rotation matrix calculations
 * - Black hole parameter synchronization
 * - Lighting updates
 * - Temporal accumulation setup
 *
 * OPTIMIZATION: Uses dirty-flag tracking to skip unchanged uniform categories.
 * Categories: per-frame (always), blackhole-config (on version change),
 * rotation (on rotation change), gravity (on gravity change).
 *
 * @param options - Configuration options
 * @param options.meshRef - Reference to the black hole mesh
 */
export function useBlackHoleUniformUpdates({ meshRef }: UseBlackHoleUniformUpdatesOptions) {
  const { camera, size } = useThree()

  // Subscribe to dimension and parameterValues for useRotationUpdates hook
  const dimension = useGeometryStore((state) => state.dimension)
  const parameterValues = useExtendedObjectStore((state) => state.blackhole.parameterValues)

  // Use shared rotation updates hook for basis vector computation
  const rotationUpdates = useRotationUpdates({ dimension, parameterValues })

  // ============================================
  // DIRTY-FLAG TRACKING REFS
  // ============================================
  // Track versions to skip unchanged uniform categories
  const lastBHVersionRef = useRef(-1)
  const lastRotationVersionRef = useRef(-1)
  const lastGravityVersionRef = useRef(-1)
  const lastDimensionRef = useRef(-1)
  const lastAppearanceVersionRef = useRef(-1)

  // PERF (OPT-BH-3): Camera velocity tracking for ultra-fast mode
  // When camera moves quickly, enable ultra-fast mode to skip noise computation
  const prevCameraPosRef = useRef(new THREE.Vector3())
  const cameraVelocityRef = useRef(0)
  const ULTRA_FAST_THRESHOLD = 2.0 // units per second - above this, enable ultra-fast

  // Cached linear colors (avoid sRGB->linear conversion every frame)
  const colorCacheRef = useRef(createBlackHoleColorCache())

  // Track material to detect when TrackedShaderMaterial switches from placeholder to real shader.
  // When this happens, we need to force-sync all uniforms before the first render.
  const prevMaterialRef = useRef<THREE.ShaderMaterial | null>(null)

  // PERF: Pre-allocated array for origin values to avoid allocation every frame
  const originValuesRef = useRef(new Array(MAX_DIMENSION).fill(0) as number[])

  // CRITICAL: Sync uniforms immediately on mount to prevent first-frame rendering issues.
  // Without this, the shader uses stale initial values until useFrame runs,
  // causing ray bending/lensing to not work on initial page load.
  useLayoutEffect(() => {
    if (!meshRef.current) return
    const material = meshRef.current.material as THREE.ShaderMaterial | undefined
    if (!material?.uniforms) return

    const u = material.uniforms
    const bhState = useExtendedObjectStore.getState().blackhole
    const ppState = usePostProcessingStore.getState()

    // Sync critical ray bending uniforms from store
    setUniform(u, 'uHorizonRadius', bhState.horizonRadius)
    // Compute visual event horizon on-demand from horizonRadius and spin (Kerr physics)
    setUniform(
      u,
      'uVisualEventHorizon',
      computeVisualEventHorizon(bhState.horizonRadius, bhState.spin)
    )
    setUniform(u, 'uSpin', bhState.spin)
    setUniform(u, 'uDiskTemperature', bhState.diskTemperature)
    // Use GLOBAL gravity settings from postProcessingStore (controlled by UI slider)
    setUniform(u, 'uGravityStrength', ppState.gravityStrength)
    setUniform(u, 'uBendScale', ppState.gravityDistortionScale)
    setUniform(u, 'uBendMaxPerStep', bhState.bendMaxPerStep)
    // ManifoldIntensity is for accretion disk, NOT gravity - keep from bhState
    setUniform(u, 'uManifoldIntensity', bhState.manifoldIntensity)
    setUniform(u, 'uDiskInnerRadiusMul', bhState.diskInnerRadiusMul)
    setUniform(u, 'uDiskOuterRadiusMul', bhState.diskOuterRadiusMul)

    // CRITICAL: Sync farRadius - store default (35.0) differs from uniform default (20.0)
    // Without this, the bounding sphere is too small and edge rays miss it,
    // causing them to use unbent rayDir in the early-out path
    setUniform(u, 'uFarRadius', bhState.farRadius)

    // CRITICAL: Sync shell precomputed values on mount
    // Shell center 15% outside shadow radius
    // Shell width: use photonShellWidth directly (0.05 = 5% of horizon radius)
    const initVisualHorizon = computeVisualEventHorizon(bhState.horizonRadius, bhState.spin)
    const initShellRp = initVisualHorizon * 1.15
    const initShellDelta = initVisualHorizon * bhState.photonShellWidth
    setUniform(u, 'uShellRpPrecomputed', initShellRp)
    setUniform(u, 'uShellDeltaPrecomputed', initShellDelta)
    setUniform(u, 'uShellGlowStrength', bhState.shellGlowStrength)

    // CRITICAL: Sync pre-computed disk radii on mount
    setUniform(u, 'uDiskInnerR', bhState.horizonRadius * bhState.diskInnerRadiusMul)
    setUniform(u, 'uDiskOuterR', bhState.horizonRadius * bhState.diskOuterRadiusMul)

    // CRITICAL: Sync pre-computed lensing falloff boundaries on mount
    setUniform(u, 'uLensingFalloffStart', bhState.horizonRadius * 3.5)
    setUniform(u, 'uLensingFalloffEnd', bhState.horizonRadius * 8.0)
    setUniform(u, 'uHorizonRadiusInv', 1.0 / Math.max(bhState.horizonRadius, 0.001))

    // CRITICAL: Sync pre-computed effective thickness on mount
    // Default to dimension 3 (disk) for initial thickness scale
    const initDim = useGeometryStore.getState().dimension
    const initManifoldType = MANIFOLD_TYPE_MAP[bhState.manifoldType] ?? 0
    let initThicknessScale = 1.0
    if (initManifoldType === 0) {
      if (initDim <= 3) initThicknessScale = 1.0
      else if (initDim === 4) initThicknessScale = 2.0
      else if (initDim <= 6) initThicknessScale = Math.min(initDim - 2, bhState.thicknessPerDimMax)
      else initThicknessScale = Math.min(initDim, bhState.thicknessPerDimMax)
    } else if (initManifoldType === 1) initThicknessScale = 1.0
    else if (initManifoldType === 2) initThicknessScale = 2.0
    else if (initManifoldType === 3) initThicknessScale = Math.min(initDim - 2, bhState.thicknessPerDimMax)
    else initThicknessScale = Math.min(initDim, bhState.thicknessPerDimMax)
    setUniform(u, 'uEffectiveThickness', bhState.manifoldThickness * bhState.horizonRadius * initThicknessScale)

    // Sync camera uniforms
    if (u.uCameraPosition?.value) {
      ;(u.uCameraPosition.value as THREE.Vector3).copy(camera.position)
    }
    if (u.uViewMatrix?.value) {
      ;(u.uViewMatrix.value as THREE.Matrix4).copy(camera.matrixWorldInverse)
    }
    if (u.uProjectionMatrix?.value) {
      ;(u.uProjectionMatrix.value as THREE.Matrix4).copy(camera.projectionMatrix)
    }

    // Force material update
    material.needsUpdate = true
  }, [meshRef, camera])

  // CRITICAL: Use negative priority (-10) to ensure uniforms are updated BEFORE
  // PostProcessing's useFrame runs the volumetric render pass.
  useFrame((_, delta) => {
    if (!meshRef.current) {
      return
    }
    const material = meshRef.current.material as THREE.ShaderMaterial | undefined
    if (!material?.uniforms) {
      return
    }

    // Uniforms with null-safe access pattern
    const u = material.uniforms

    // CRITICAL: Detect material change (placeholder → real shader) and force-sync critical uniforms.
    // TrackedShaderMaterial renders a placeholder for ~4 frames before switching to real shader.
    // The useLayoutEffect runs on mount but syncs to the placeholder, not the real shader.
    // Without this detection, the first render with real shader uses DEFAULT uniform values,
    // causing the bounding sphere to be wrong and rays to use unbent directions.
    const materialChanged = material !== prevMaterialRef.current
    if (materialChanged) {
      prevMaterialRef.current = material

      // DIRTY-FLAG: Reset all version refs to force full sync on material change
      lastBHVersionRef.current = -1
      lastRotationVersionRef.current = -1
      lastGravityVersionRef.current = -1
      lastDimensionRef.current = -1

      // Also check if scene.background is ready and sync envMap state
      // Read from frozen frame context for frame-consistent state
      const bg = getLastFrameExternal('sceneBackground') as THREE.Texture | null
      const isCubeCompatible =
        bg &&
        ((bg as THREE.CubeTexture).isCubeTexture ||
          bg.mapping === THREE.CubeReflectionMapping ||
          bg.mapping === THREE.CubeRefractionMapping)
      if (isCubeCompatible) {
        setUniform(u, 'envMap', bg)
        setUniform(u, 'uEnvMapReady', 1.0)
      }
    }

    // Black hole is always fully opaque (solid mode) - set material once
    if (material.transparent !== false) {
      material.transparent = false
      material.depthWrite = true
      material.needsUpdate = true
    }

    // CRITICAL: Update camera and resolution uniforms - required for ray reconstruction
    // Without these, raymarching fails with NaN values (division by zero)
    if (u.uCameraPosition?.value) {
      ;(u.uCameraPosition.value as THREE.Vector3).copy(camera.position)
    }

    // PERF (OPT-BH-3): Track camera velocity for ultra-fast mode
    // When camera moves quickly, skip noise computation entirely
    const safeDelta = Math.max(delta, 0.001) // Avoid division by zero
    const frameDist = camera.position.distanceTo(prevCameraPosRef.current)
    const frameVelocity = frameDist / safeDelta
    // Smooth velocity using exponential moving average (0.8 current, 0.2 new)
    cameraVelocityRef.current = cameraVelocityRef.current * 0.8 + frameVelocity * 0.2
    prevCameraPosRef.current.copy(camera.position)
    // Enable ultra-fast mode when velocity exceeds threshold
    setUniform(u, 'uUltraFastMode', cameraVelocityRef.current > ULTRA_FAST_THRESHOLD)

    if (u.uResolution?.value) {
      // Use logical viewport size - consistent with other raymarching shaders
      // Ray direction now calculated from vPosition, not screen coordinates
      const res = u.uResolution.value as THREE.Vector2
      res.set(size.width, size.height)
    }
    if (u.uViewMatrix?.value) {
      ;(u.uViewMatrix.value as THREE.Matrix4).copy(camera.matrixWorldInverse)
    }
    if (u.uProjectionMatrix?.value) {
      ;(u.uProjectionMatrix.value as THREE.Matrix4).copy(camera.projectionMatrix)
    }

    // Get current state from stores
    const animState = useAnimationStore.getState()

    // Get black hole state for coverage and temporal calculations
    const extendedState = useExtendedObjectStore.getState()
    const bhState = extendedState.blackhole
    const bhVersion = extendedState.blackholeVersion
    // Get GLOBAL gravity settings (controlled by UI slider)
    const ppState = usePostProcessingStore.getState()
    const gravityVersion = ppState.gravityVersion
    // Get rotation version for dirty tracking
    const rotationVersion = useRotationStore.getState().version
    // Get appearance state for SSS/Fresnel/AO (from global appearance controls)
    const appearanceState = useAppearanceStore.getState()
    const appearanceVersion = appearanceState.appearanceVersion

    // ============================================
    // DIRTY-FLAG: Check which categories need updating
    // ============================================
    const bhChanged = bhVersion !== lastBHVersionRef.current
    const gravityChanged = gravityVersion !== lastGravityVersionRef.current
    const rotationChanged = rotationVersion !== lastRotationVersionRef.current
    const dimensionChanged = dimension !== lastDimensionRef.current
    const appearanceChanged = appearanceVersion !== lastAppearanceVersionRef.current

    // Update matrices from mesh transform (handles position/rotation/scale)
    // Only call expensive updateMatrixWorld when mesh might have moved
    // (materialChanged already resets version refs to -1, triggering bhChanged)
    if (bhChanged || dimensionChanged || materialChanged) {
      meshRef.current.updateMatrixWorld()
      if (u.uModelMatrix?.value) {
        ;(u.uModelMatrix.value as THREE.Matrix4).copy(meshRef.current.matrixWorld)
      }
      if (u.uInverseModelMatrix?.value) {
        ;(u.uInverseModelMatrix.value as THREE.Matrix4).copy(meshRef.current.matrixWorld).invert()
      }
    }

    // Calculate actual black hole visual radius for accurate coverage estimation
    // The visual extent is farRadius * horizonRadius (scale is always 1.0 now)
    const blackHoleVisualRadius = bhState.farRadius * bhState.horizonRadius

    // Calculate screen coverage for temporal and quality decisions
    const coverage =
      camera instanceof THREE.PerspectiveCamera
        ? getScreenCoverage(camera, blackHoleVisualRadius)
        : 0.5

    // Quality reduction for black hole raymarching
    // Combine UniformManager's quality (performance-based) with coverage-based reduction
    // Also enforce higher floor (0.5) than other objects since black hole needs more steps
    const coverageQuality = applyScreenCoverageReduction(1.0, coverage)

    // Apply centralized uniform sources
    // Note: 'quality' source updates uFastMode and uQualityMultiplier based on performance/rotation
    // We override uQualityMultiplier below to include coverage scaling
    // Note: 'pbr-face' provides uRoughness, uMetallic, uSpecularIntensity, uSpecularColor
    UniformManager.applyToMaterial(material, ['lighting', 'quality', 'color', 'pbr-face'])

    // Override quality multiplier to include coverage-based and dimension-based reduction
    // This composes with the base quality from UniformManager
    // PERF (OPT-BH-21): Dimension-aware quality reduction
    // Higher dimensions (4D+) have more visual complexity that masks fine detail,
    // so we can safely reduce quality for better performance:
    // 3D: 100%, 4D: 95%, 5D: 90%, 6D: 85%, 7D+: 80%
    if (u.uQualityMultiplier) {
      const baseQuality = u.uQualityMultiplier.value as number
      const dimensionQuality = Math.max(0.8, 1.0 - (dimension - 3) * 0.05)
      const effectiveQuality = Math.max(baseQuality * coverageQuality * dimensionQuality, 0.5)
      u.uQualityMultiplier.value = effectiveQuality
    }

    // NOTE: Temporal accumulation is intentionally disabled for black hole.
    // The full-screen reconstruction pass (3×3 neighborhood) is too expensive
    // and negates the quarter-res rendering savings. Black hole stays on
    // MAIN_OBJECT layer and benefits from adaptive quality (step reduction) instead.
    // Note: lightingState no longer needed here - specular now via 'pbr-face' source
    const cache = colorCacheRef.current

    // Update dimension (from subscribed value at top of hook)
    setUniform(u, 'uDimension', dimension)

    // Update time using global synced time
    setUniform(u, 'uTime', animState.accumulatedTime)

    // Pre-calculate dimension scaling factor for lensing
    // Formula: pow(N, alpha) where N is dimension
    const dimPower = Math.pow(dimension, bhState.dimensionEmphasis)
    setUniform(u, 'uDimPower', dimPower)

    // Pre-calculate origin offset length squared (sum of param values squared)
    // This represents the constant distance from the 3D slice to the N-D origin.
    let originOffsetLengthSq = 0
    for (let i = 0; i < bhState.parameterValues.length; i++) {
      const val = bhState.parameterValues[i] ?? 0
      originOffsetLengthSq += val * val
    }
    setUniform(u, 'uOriginOffsetLengthSq', originOffsetLengthSq)

    // ============================================
    // D-dimensional Rotation & Basis Vectors (via shared hook)
    // Only recomputes when rotations, dimension, or params change
    // ============================================
    // Uses rotationChanged flag from dirty-flag tracking above
    const {
      basisX,
      basisY,
      basisZ,
      changed: basisChanged,
    } = rotationUpdates.getBasisVectors(rotationChanged || dimensionChanged)

    // Copy basis vectors to uniforms (with null guards)
    if (basisChanged) {
      if (u.uBasisX?.value) (u.uBasisX.value as Float32Array).set(basisX)
      if (u.uBasisY?.value) (u.uBasisY.value as Float32Array).set(basisY)
      if (u.uBasisZ?.value) (u.uBasisZ.value as Float32Array).set(basisZ)
    }

    // Update rotation/dimension version refs
    if (rotationChanged) {
      lastRotationVersionRef.current = rotationVersion
    }
    if (dimensionChanged) {
      lastDimensionRef.current = dimension
    }

    // ============================================
    // Origin Update (separate from basis vectors)
    // ============================================
    // Build origin values array for rotation (using pre-allocated array)
    const originValues = originValuesRef.current
    // Clear the array before reuse
    originValues.fill(0)
    const currentParamValues = bhState.parameterValues
    for (let i = 3; i < dimension; i++) {
      originValues[i] = currentParamValues[i - 3] ?? 0
    }
    const { origin } = rotationUpdates.getOrigin(originValues)
    if (u.uOrigin?.value) (u.uOrigin.value as Float32Array).set(origin)

    // Update parameter values uniform
    if (u.uParamValues?.value) {
      const paramArray = u.uParamValues.value as Float32Array
      for (let i = 0; i < 8; i++) {
        paramArray[i] = currentParamValues[i] ?? 0
      }
    }

    // ============================================
    // BLACKHOLE CONFIG UNIFORMS (only on bhVersion change)
    // ============================================
    if (bhChanged) {
      // Update black hole uniforms (Kerr physics)
      setUniform(u, 'uHorizonRadius', bhState.horizonRadius)
      // Compute visual event horizon on-demand from horizonRadius and spin (Kerr physics)
      setUniform(
        u,
        'uVisualEventHorizon',
        computeVisualEventHorizon(bhState.horizonRadius, bhState.spin)
      )
      setUniform(u, 'uSpin', bhState.spin)
      setUniform(u, 'uDiskTemperature', bhState.diskTemperature)
      // ManifoldIntensity is for accretion disk, NOT gravity - keep from bhState
      setUniform(u, 'uManifoldIntensity', bhState.manifoldIntensity)
      setUniform(u, 'uManifoldThickness', bhState.manifoldThickness)
      setUniform(u, 'uPhotonShellWidth', bhState.photonShellWidth)
      setUniform(u, 'uTimeScale', bhState.timeScale)
      setUniform(u, 'uBloomBoost', bhState.bloomBoost)

      // Update colors (with null guards) using Global Appearance Store
      // Note: ColorSource handles algorithm uniforms, but these are material-specific colors
      const appearanceState = useAppearanceStore.getState()
      if (u.uBaseColor?.value) {
        updateLinearColorUniform(
          cache.baseColor,
          u.uBaseColor.value as THREE.Color,
          appearanceState.faceColor
        )
      }
      if (u.uShellGlowColor?.value) {
        updateLinearColorUniform(
          cache.shellGlowColor,
          u.uShellGlowColor.value as THREE.Color,
          bhState.shellGlowColor
        )
      }

      // Palette mode (still supported for black hole specific modes)
      setUniform(u, 'uPaletteMode', PALETTE_MODE_MAP[bhState.paletteMode] ?? 0)

      // Lensing - Use blackhole store's settings (except bendScale which uses global gravity)
      setUniform(u, 'uDimensionEmphasis', bhState.dimensionEmphasis)
      setUniform(u, 'uDistanceFalloff', bhState.distanceFalloff)
      setUniform(u, 'uEpsilonMul', bhState.epsilonMul)
      setUniform(u, 'uBendMaxPerStep', bhState.bendMaxPerStep)
      setUniform(u, 'uLensingClamp', bhState.lensingClamp)
      setUniform(u, 'uRayBendingMode', RAY_BENDING_MODE_MAP[bhState.rayBendingMode] ?? 0)

      // Photon shell
      setUniform(u, 'uPhotonShellRadiusMul', bhState.photonShellRadiusMul)
      setUniform(u, 'uPhotonShellRadiusDimBias', bhState.photonShellRadiusDimBias)
      setUniform(u, 'uShellGlowStrength', bhState.shellGlowStrength)
      setUniform(u, 'uShellStepMul', bhState.shellStepMul)
      setUniform(u, 'uShellContrastBoost', bhState.shellContrastBoost)

      // PERF OPTIMIZATION (OPT-BH-5): Pre-compute photon shell values on CPU
      const visualHorizon = computeVisualEventHorizon(bhState.horizonRadius, bhState.spin)
      // Shell center 15% outside shadow radius (so the ring is clearly visible)
      const shellCenterOffset = 1.15
      const shellRp = visualHorizon * shellCenterOffset
      // Shell width: use photonShellWidth directly (0.05 = 5% of horizon radius)
      const shellDelta = visualHorizon * bhState.photonShellWidth
      setUniform(u, 'uShellRpPrecomputed', shellRp)
      setUniform(u, 'uShellDeltaPrecomputed', shellDelta)

      // PERF OPTIMIZATION (OPT-BH-6): Pre-compute disk radii on CPU
      const diskInnerR = bhState.horizonRadius * bhState.diskInnerRadiusMul
      const diskOuterR = bhState.horizonRadius * bhState.diskOuterRadiusMul
      setUniform(u, 'uDiskInnerR', diskInnerR)
      setUniform(u, 'uDiskOuterR', diskOuterR)

      // PERF OPTIMIZATION (OPT-BH-26): Pre-compute lensing falloff boundaries
      // These only depend on horizonRadius and are computed per-ray-step otherwise
      setUniform(u, 'uLensingFalloffStart', bhState.horizonRadius * 3.5)
      setUniform(u, 'uLensingFalloffEnd', bhState.horizonRadius * 8.0)
      setUniform(u, 'uHorizonRadiusInv', 1.0 / Math.max(bhState.horizonRadius, 0.001))

      // PERF OPTIMIZATION (OPT-BH-13): Pre-compute effective thickness on CPU
      // This avoids per-pixel getManifoldThicknessScale() runtime branches
      const manifoldTypeInt = MANIFOLD_TYPE_MAP[bhState.manifoldType] ?? 0
      let thicknessScale = 1.0
      if (manifoldTypeInt === 0) {
        // Auto mode: select based on dimension
        if (dimension <= 3) thicknessScale = 1.0 // disk
        else if (dimension === 4) thicknessScale = 2.0 // sheet
        else if (dimension <= 6) thicknessScale = Math.min(dimension - 2, bhState.thicknessPerDimMax) // slab
        else thicknessScale = Math.min(dimension, bhState.thicknessPerDimMax) // field
      } else if (manifoldTypeInt === 1) thicknessScale = 1.0 // disk
      else if (manifoldTypeInt === 2) thicknessScale = 2.0 // sheet
      else if (manifoldTypeInt === 3) thicknessScale = Math.min(dimension - 2, bhState.thicknessPerDimMax) // slab
      else thicknessScale = Math.min(dimension, bhState.thicknessPerDimMax) // field
      const effectiveThickness = bhState.manifoldThickness * bhState.horizonRadius * thicknessScale
      setUniform(u, 'uEffectiveThickness', effectiveThickness)

      // Manifold
      setUniform(u, 'uManifoldType', MANIFOLD_TYPE_MAP[bhState.manifoldType] ?? 0)
      setUniform(u, 'uDiskInnerRadiusMul', bhState.diskInnerRadiusMul)
      setUniform(u, 'uDiskOuterRadiusMul', bhState.diskOuterRadiusMul)
      setUniform(u, 'uRadialSoftnessMul', bhState.radialSoftnessMul)
      setUniform(u, 'uThicknessPerDimMax', bhState.thicknessPerDimMax)
      setUniform(u, 'uHighDimWScale', bhState.highDimWScale)
      setUniform(u, 'uSwirlAmount', bhState.swirlAmount)
      setUniform(u, 'uNoiseScale', bhState.noiseScale)
      setUniform(u, 'uNoiseAmount', bhState.noiseAmount)
      setUniform(u, 'uMultiIntersectionGain', bhState.multiIntersectionGain)

      // Quality - Read from store (controlled by UI sliders in BlackHoleAdvanced)
      setUniform(u, 'uMaxSteps', bhState.maxSteps)
      setUniform(u, 'uStepBase', bhState.stepBase)
      setUniform(u, 'uStepMin', bhState.stepMin)
      setUniform(u, 'uStepMax', bhState.stepMax)
      setUniform(u, 'uStepAdaptG', bhState.stepAdaptG)
      setUniform(u, 'uStepAdaptR', bhState.stepAdaptR)
      setUniform(u, 'uEnableAbsorption', bhState.enableAbsorption)
      setUniform(u, 'uAbsorption', bhState.absorption)
      setUniform(u, 'uTransmittanceCutoff', bhState.transmittanceCutoff)
      setUniform(u, 'uFarRadius', bhState.farRadius)

      // Lighting (from Global Lighting Store)
      setUniform(u, 'uLightingMode', LIGHTING_MODE_MAP[bhState.lightingMode] ?? 0)
      setUniform(u, 'uAmbientTint', bhState.ambientTint)

      // Animation flags and speeds (static config, not per-frame)
      setUniform(u, 'uDopplerEnabled', bhState.dopplerEnabled)
      setUniform(u, 'uDopplerStrength', bhState.dopplerStrength)
      setUniform(u, 'uPulseEnabled', bhState.pulseEnabled)
      setUniform(u, 'uPulseSpeed', bhState.pulseSpeed)
      setUniform(u, 'uPulseAmount', bhState.pulseAmount)
      setUniform(u, 'uMotionBlurEnabled', bhState.motionBlurEnabled)
      setUniform(u, 'uMotionBlurStrength', bhState.motionBlurStrength)
      setUniform(u, 'uMotionBlurSamples', bhState.motionBlurSamples)
      setUniform(u, 'uMotionBlurRadialFalloff', bhState.motionBlurRadialFalloff)
      setUniform(u, 'uSliceSpeed', bhState.sliceSpeed)
      setUniform(u, 'uSliceAmplitude', bhState.sliceAmplitude)
      setUniform(u, 'uKeplerianDifferential', bhState.keplerianDifferential ?? 0.5)

      // Update version ref
      lastBHVersionRef.current = bhVersion
    }

    // ============================================
    // GRAVITY UNIFORMS (only on gravityVersion change)
    // ============================================
    if (gravityChanged) {
      // Use GLOBAL gravity settings from postProcessingStore (controlled by UI slider)
      setUniform(u, 'uGravityStrength', ppState.gravityStrength)
      setUniform(u, 'uBendScale', ppState.gravityDistortionScale)

      // Update version ref
      lastGravityVersionRef.current = gravityVersion
    }

    // ============================================
    // APPEARANCE UNIFORMS (SSS/Fresnel/AO from global controls)
    // ============================================
    if (appearanceChanged) {
      // SSS (Subsurface Scattering)
      setUniform(u, 'uSssEnabled', appearanceState.sssEnabled)
      setUniform(u, 'uSssIntensity', appearanceState.sssIntensity)
      setUniform(u, 'uSssThickness', appearanceState.sssThickness)
      setUniform(u, 'uSssJitter', appearanceState.sssJitter)
      if (u.uSssColor?.value) {
        ;(u.uSssColor.value as THREE.Color).set(appearanceState.sssColor)
      }

      // Fresnel Rim (from shared surface settings)
      setUniform(u, 'uFresnelEnabled', appearanceState.shaderSettings.surface.fresnelEnabled)
      setUniform(u, 'uFresnelIntensity', appearanceState.fresnelIntensity)
      if (u.uRimColor?.value) {
        // Rim color uses edgeColor from appearance (same as other objects)
        ;(u.uRimColor.value as THREE.Color).set(appearanceState.edgeColor)
      }

      // Update version ref
      lastAppearanceVersionRef.current = appearanceVersion
    }

    // ============================================
    // AO UNIFORM (from postProcessingStore - global toggle)
    // ============================================
    // Black hole uses volumetric AO (density-based), controlled by global ssaoEnabled toggle
    setUniform(u, 'uAoEnabled', usePostProcessingStore.getState().ssaoEnabled)

    // ========================================================================
    // Environment Map Update (Frame-Consistent via ExternalBridge)
    // ========================================================================
    // scene.background is set by CubemapCapturePass via ExternalBridge at FRAME END.
    // This hook runs at FRAME START (priority -10), so it reads the PREVIOUS frame's
    // cubemap. This one-frame delay is intentional and provides frame consistency:
    //
    // Frame N: CubemapCapturePass captures cubemap, queues export
    // Frame N: executeExports() sets scene.background at frame END
    // Frame N+1: This hook reads scene.background at frame START (reads frame N's value)
    //
    // This architecture replaces the old lastValidEnvMapRef workaround. The combination of:
    // 1. TemporalResource (ensures cubemap is only exported when valid history exists)
    // 2. ExternalBridge (batches exports to frame end)
    // 3. StateBarrier (saves/restores scene state around each pass)
    // ...guarantees the black hole shader never reads from an uninitialized cubemap.
    //
    // Note: PMREM textures are 2D textures with special mapping, NOT CubeTextures.
    // Our shader uses samplerCube, so we need textures compatible with cube sampling.
    // scene.background may be:
    //   - CubeTexture (from KTX2 loader): has isCubeTexture === true
    //   - WebGLCubeRenderTarget.texture (from procedural capture): Texture with cube mapping
    // Read from frozen frame context for frame-consistent state (instead of live scene.background)
    const bg = getLastFrameExternal('sceneBackground') as THREE.Texture | null
    const isCubeCompatible =
      bg &&
      ((bg as THREE.CubeTexture).isCubeTexture ||
        bg.mapping === THREE.CubeReflectionMapping ||
        bg.mapping === THREE.CubeRefractionMapping)

    if (isCubeCompatible) {
      setUniform(u, 'envMap', bg)
      setUniform(u, 'uEnvMapReady', 1.0)
    } else {
      // EnvMap not ready or skybox disabled - shader renders black background
      setUniform(u, 'uEnvMapReady', 0.0)
    }

    // Keplerian disk rotation (per-frame - disk angle animates)
    // Read rotation angle from rotationStore - XZ is the primary disk rotation plane
    const rotations = useRotationStore.getState().rotations
    const diskAngle = rotations.get('XZ') ?? 0
    setUniform(u, 'uDiskRotationAngle', diskAngle)

    // Note: Animation flags, Doppler, Motion blur, and keplerianDifferential
    // are now in the bhChanged block above (they're static config, not per-frame)

    // Note: Lighting and PBR uniforms already applied at line ~301 via UniformManager
    // ['lighting', 'quality', 'color', 'pbr-face']

    // Temporal accumulation uniforms
    // Compute inverse view-projection matrix for ray reconstruction
    if (u.uInverseViewProjectionMatrix?.value) {
      const invVP = u.uInverseViewProjectionMatrix.value as THREE.Matrix4
      invVP.copy(camera.projectionMatrixInverse).premultiply(camera.matrixWorld)
    }

    // NOTE: Temporal accumulation uniforms (uBayerOffset, uFullResolution) are not used
    // since black hole doesn't benefit from temporal rendering due to reconstruction overhead
  }, FRAME_PRIORITY.BLACK_HOLE_UNIFORMS)
}
