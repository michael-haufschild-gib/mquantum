/**
 * QuaternionJuliaMesh - Renders 3D-11D Quaternion Julia fractals using GPU raymarching
 *
 * Mathematical basis: z = z^n + c where c is a fixed Julia constant
 * Unlike Mandelbulb where c varies per sample point, Julia uses a fixed c.
 *
 * @see docs/prd/quaternion-julia-fractal.md
 */

import {
    createColorCache,
    updateLinearColorUniform,
} from '@/rendering/colors/linearCache'
import { FRAME_PRIORITY } from '@/rendering/core/framePriorities'
import { useTemporalDepth } from '@/rendering/core/temporalDepth'
import { TrackedShaderMaterial } from '@/rendering/materials/TrackedShaderMaterial'
import {
    MAX_DIMENSION,
    useLayerAssignment,
    useQualityTracking,
    useRotationUpdates,
} from '@/rendering/renderers/base'
import { composeJuliaShader } from '@/rendering/shaders/julia/compose'
import {
    SHADOW_QUALITY_TO_INT,
} from '@/rendering/shadows/types'
import { UniformManager } from '@/rendering/uniforms/UniformManager'
import { useAnimationStore } from '@/stores/animationStore'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { useLightingStore } from '@/stores/lightingStore'
import {
    getEffectiveShadowQuality,
    usePerformanceStore,
} from '@/stores/performanceStore'
import { usePostProcessingStore } from '@/stores/postProcessingStore'
import { useWebGLContextStore } from '@/stores/webglContextStore'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import vertexShader from './quaternion-julia.vert?raw'

/**
 * QuaternionJuliaMesh - Renders Quaternion Julia fractals
 * @returns The quaternion Julia fractal mesh component
 */
const QuaternionJuliaMesh = () => {
  const meshRef = useRef<THREE.Mesh>(null)
  const { camera, size } = useThree()

  // Get temporal depth state from context for temporal reprojection
  const temporalDepth = useTemporalDepth()

  // Get scale for mesh scaling
  const scale = useExtendedObjectStore((state) => state.quaternionJulia.scale)

  // Use shared quality tracking hook
  const { qualityMultiplier, rotationsChanged } = useQualityTracking()

  // Use shared layer assignment hook
  useLayerAssignment(meshRef)

  // Animation time tracking (respects pause state)
  const animationTimeRef = useRef(0)
  const lastFrameTimeRef = useRef(0)

  // Cached uniform values
  // Note: prevPowerRef, prevIterationsRef, prevEscapeRadiusRef were removed
  // because the optimization caused uniforms to not update after TrackedShaderMaterial
  // transitions from placeholder to shader material.
  // Note: Lighting version tracking and color caching now handled by LightingSource via UniformManager

  // Cached colors for non-lighting uniforms
  const colorCacheRef = useRef(createColorCache())

  // PERF: Pre-allocated array for origin values to avoid allocation every frame
  const originValuesRef = useRef(new Array(MAX_DIMENSION).fill(0) as number[])

  // DIRTY-FLAG TRACKING: Track store versions to skip unchanged uniform categories
  const lastQuaternionJuliaVersionRef = useRef(-1) // -1 forces full sync on first frame
  const lastAppearanceVersionRef = useRef(-1)
  const lastIblVersionRef = useRef(-1)
  const prevMaterialRef = useRef<THREE.ShaderMaterial | null>(null)

  // Get dimension from geometry store (used for useEffect dependency)
  const dimension = useGeometryStore((state) => state.dimension)

  // Context restore counter - forces material recreation when context is restored
  const restoreCount = useWebGLContextStore((state) => state.restoreCount)

  // Get parameterValues for useEffect dependency (triggers basis vector recomputation)
  const parameterValues = useExtendedObjectStore(
    (state) => state.quaternionJulia.parameterValues
  )

  // Use shared rotation hook for basis vector computation with caching
  const rotationUpdates = useRotationUpdates({ dimension, parameterValues })

  // Get config for shader compilation (re-compiles when these change)
  const shadowEnabled = useLightingStore((state) => state.shadowEnabled)
  const temporalEnabled = usePerformanceStore((state) => state.temporalReprojectionEnabled)
  const setShaderDebugInfo = usePerformanceStore((state) => state.setShaderDebugInfo)
  const shaderOverrides = usePerformanceStore((state) => state.shaderOverrides)
  const resetShaderOverrides = usePerformanceStore((state) => state.resetShaderOverrides)

  // Conditionally compiled feature toggles (affect shader compilation)
  const sssEnabled = useAppearanceStore((state) => state.sssEnabled)
  const edgesVisible = useAppearanceStore((state) => state.edgesVisible)

  // Reset overrides when base configuration changes
  useEffect(() => {
    resetShaderOverrides()
  }, [dimension, shadowEnabled, temporalEnabled, sssEnabled, edgesVisible, resetShaderOverrides])

  const { glsl: shaderString, modules, features } = useMemo(() => {
    return composeJuliaShader({
      dimension,
      shadows: shadowEnabled,
      temporal: temporalEnabled,
      ambientOcclusion: true,
      overrides: shaderOverrides,
      sss: sssEnabled,
      fresnel: edgesVisible,
    })
  }, [dimension, shadowEnabled, temporalEnabled, shaderOverrides, sssEnabled, edgesVisible])

  useEffect(() => {
    setShaderDebugInfo('object', {
      name: 'Quaternion Julia Raymarcher',
      vertexShaderLength: vertexShader.length,
      fragmentShaderLength: shaderString.length,
      activeModules: modules,
      features: features,
    })
    return () => setShaderDebugInfo('object', null)
  }, [shaderString, modules, features, setShaderDebugInfo])

  // NOTE: All other store values are read via getState() inside useFrame
  // to avoid React re-renders during animation. This is the high-performance
  // pattern used by Mandelbulb and other raymarched renderers.

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2() },
      uCameraPosition: { value: new THREE.Vector3() },

      uDimension: { value: 4 },
      uPower: { value: 2.0 },
      uIterations: { value: 64.0 },
      uEscapeRadius: { value: 4.0 },

      // Julia constant (unique to this fractal type)
      uJuliaConstant: { value: new THREE.Vector4(0.3, 0.5, 0.4, 0.2) },

      // D-dimensional basis
      uBasisX: { value: new Float32Array(11) },
      uBasisY: { value: new Float32Array(11) },
      uBasisZ: { value: new Float32Array(11) },
      uOrigin: { value: new Float32Array(11) },

      // Color
      uColor: { value: new THREE.Color().convertSRGBToLinear() },

      // Matrices
      uModelMatrix: { value: new THREE.Matrix4() },
      uInverseModelMatrix: { value: new THREE.Matrix4() },
      uProjectionMatrix: { value: new THREE.Matrix4() },
      uViewMatrix: { value: new THREE.Matrix4() },

      // Centralized Uniform Sources:
      // - Lighting: Ambient, Diffuse, Specular, Multi-lights
      // - Temporal: Matrices, Enabled state (matrices updated via source)
      // - Quality: FastMode, QualityMultiplier
      // - Color: Algorithm, Cosine coeffs, Distribution, LCH
      ...UniformManager.getCombinedUniforms(['lighting', 'temporal', 'quality', 'color']),

      // Material property for G-buffer (reflectivity for SSR)
      uMetallic: { value: 0.0 },

      // Advanced Rendering
      uRoughness: { value: 0.3 },
      uSssEnabled: { value: false },
      uSssIntensity: { value: 1.0 },
      uSssColor: { value: new THREE.Color('#ff8844') },
      uSssThickness: { value: 1.0 },
      uSssJitter: { value: 0.2 },

      // Fresnel
      uFresnelEnabled: { value: true },
      uFresnelIntensity: { value: 0.5 },
      uRimColor: { value: new THREE.Color('#FFFFFF').convertSRGBToLinear() },

      // Shadow
      uShadowEnabled: { value: false },
      uShadowQuality: { value: 1 },
      uShadowSoftness: { value: 1.0 },

      // Ambient Occlusion
      uAoEnabled: { value: true },

      // Temporal Reprojection - Texture must be manually handled as it comes from context
      uPrevDepthTexture: { value: null },

      // IBL (Image-Based Lighting) uniforms - PMREM texture (sampler2D)
      uEnvMap: { value: null },
      uEnvMapSize: { value: 256.0 },
      uIBLIntensity: { value: 1.0 },
      uIBLQuality: { value: 0 }, // 0=off, 1=low, 2=high
    }),
    []
  )

  // Per-frame updates
  useFrame((state) => {
    if (!meshRef.current) return

    const mesh = meshRef.current
    const material = mesh.material as THREE.ShaderMaterial
    if (!material?.uniforms) return

    // Cast to any for now to allow property access, but we know the structure from useMemo above
    // A full type definition would be very large and duplicate the useMemo structure
    // We suppress the lint error as this is a deliberate trade-off for performance/complexity
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u = material.uniforms as any;
    if (!u) return;

    // ============================================
    // DIRTY-FLAG: Detect material change and reset version refs
    // ============================================
    const materialChanged = material !== prevMaterialRef.current
    if (materialChanged) {
      prevMaterialRef.current = material
      lastQuaternionJuliaVersionRef.current = -1 // Force full sync on material change
      lastAppearanceVersionRef.current = -1
      lastIblVersionRef.current = -1
    }

    // Get current state directly from stores
    const geoStore = useGeometryStore.getState()
    const extStore = useExtendedObjectStore.getState()
    const appStore = useAppearanceStore.getState()
    const lightStore = useLightingStore.getState()

    // ============================================
    // DIRTY-FLAG: Get versions and check for changes
    // ============================================
    const quaternionJuliaVersion = extStore.quaternionJuliaVersion
    const appearanceVersion = appStore.appearanceVersion
    const iblVersion = useEnvironmentStore.getState().iblVersion

    const quaternionJuliaChanged = quaternionJuliaVersion !== lastQuaternionJuliaVersionRef.current
    const appearanceChanged = appearanceVersion !== lastAppearanceVersionRef.current
    const iblChanged = iblVersion !== lastIblVersionRef.current

    const currentDimension = geoStore.dimension
    const config = extStore.quaternionJulia

    // Update animation time (respects pause state)
    const currentTime = state.clock.elapsedTime
    const deltaTime = currentTime - lastFrameTimeRef.current
    lastFrameTimeRef.current = currentTime
    const isPlaying = useAnimationStore.getState().isPlaying
    if (isPlaying) {
      animationTimeRef.current += deltaTime
    }

    // Update time uniform using paused animation time
    u.uTime.value = animationTimeRef.current

    // Update dimension
    u.uDimension.value = currentDimension

    // ============================================
    // DIRTY-FLAG: Only update quaternionJulia uniforms when settings change
    // ============================================
    if (quaternionJuliaChanged) {
      // Update fractal parameters
      u.uPower.value = config.power
      u.uIterations.value = config.maxIterations
      u.uEscapeRadius.value = config.bailoutRadius

      // Julia constant
      u.uJuliaConstant.value.set(...config.juliaConstant)

      // Update version ref
      lastQuaternionJuliaVersionRef.current = quaternionJuliaVersion
    }

    // ============================================
    // D-dimensional Rotation & Basis Vectors (via shared hook)
    // Only recomputes when rotations, dimension, or params change
    // ============================================
    const { basisX, basisY, basisZ, changed: basisChanged } = rotationUpdates.getBasisVectors(rotationsChanged)

    if (basisChanged) {
      // Copy basis vectors to uniforms
      u.uBasisX.value.set(basisX)
      u.uBasisY.value.set(basisY)
      u.uBasisZ.value.set(basisZ)
    }

    // ============================================
    // Origin Update (separate from basis vectors)
    // ============================================
    if (basisChanged) {
      // Build origin values array for rotation (using pre-allocated array)
      const originValues = originValuesRef.current
      // Clear the array before reuse
      originValues.fill(0)

      // Set extra dimension values from parameters
      for (let i = 0; i < config.parameterValues.length; i++) {
        originValues[3 + i] = config.parameterValues[i] ?? 0
      }

      // Get rotated origin from hook
      const { origin } = rotationUpdates.getOrigin(originValues)

      // Copy origin to uniform
      u.uOrigin.value.set(origin)
    }

    // ============================================
    // DIRTY-FLAG: Only update appearance uniforms when settings change
    // ============================================
    if (appearanceChanged) {
      // Update color
      updateLinearColorUniform(
        colorCacheRef.current.faceColor,
        u.uColor.value as THREE.Color,
        appStore.faceColor
      )
    }

    // Update matrices
    u.uModelMatrix.value.copy(mesh.matrixWorld)
    u.uInverseModelMatrix.value.copy(mesh.matrixWorld).invert()
    u.uProjectionMatrix.value.copy(camera.projectionMatrix)
    u.uViewMatrix.value.copy(camera.matrixWorldInverse)
    u.uCameraPosition.value.copy(camera.position)

    // Update resolution
    if (u.uResolution) {
      u.uResolution.value.set(size.width, size.height)
    }

    // Update temporal reprojection uniforms from context
    // Only uPrevDepthTexture comes from context; matrices/enabled are handled by UniformManager
    const temporalUniforms = temporalDepth.getUniforms()
    if (u.uPrevDepthTexture) {
      u.uPrevDepthTexture.value = temporalUniforms.uPrevDepthTexture
    }

    // Update centralized uniform sources (Lighting, Temporal, Quality, Color, PBR)
    UniformManager.applyToMaterial(material, ['lighting', 'temporal', 'quality', 'color', 'pbr-face'])

    // IMPORTANT: Override temporal safety margin AFTER applyToMaterial
    // TemporalSource uses 0.95 (aggressive), but Julia needs 0.33 (very conservative)
    // because shape changes significantly during N-dimensional rotation
    if (u.uTemporalSafetyMargin) {
      u.uTemporalSafetyMargin.value = 0.33
    }

    // SSS (Subsurface Scattering) and Fresnel properties - inside appearance conditional
    if (appearanceChanged) {
      if (u.uSssEnabled) u.uSssEnabled.value = appStore.sssEnabled
      if (u.uSssIntensity) u.uSssIntensity.value = appStore.sssIntensity
      if (u.uSssColor) {
        updateLinearColorUniform(colorCacheRef.current.faceColor /* reuse helper */, u.uSssColor.value as THREE.Color, appStore.sssColor || '#ff8844')
      }
      if (u.uSssThickness) u.uSssThickness.value = appStore.sssThickness
      if (u.uSssJitter) u.uSssJitter.value = appStore.sssJitter

      // Update fresnel
      u.uFresnelEnabled.value = appStore.edgesVisible
      u.uFresnelIntensity.value = appStore.fresnelIntensity
      updateLinearColorUniform(
        colorCacheRef.current.rimColor,
        u.uRimColor.value as THREE.Color,
        appStore.edgeColor
      )

      // Update version ref
      lastAppearanceVersionRef.current = appearanceVersion
    }

    // Quaternion Julia is always fully opaque (solid mode)
    if (material.transparent !== false) {
      material.transparent = false
      material.depthWrite = true
      material.needsUpdate = true
    }

    // Update shadow settings
    u.uShadowEnabled.value = lightStore.shadowEnabled
    const effectiveShadowQuality = getEffectiveShadowQuality(
      lightStore.shadowQuality,
      qualityMultiplier
    )
    u.uShadowQuality.value = SHADOW_QUALITY_TO_INT[effectiveShadowQuality]
    u.uShadowSoftness.value = lightStore.shadowSoftness

    // Update ambient occlusion (controlled by global SSAO toggle)
    u.uAoEnabled.value = usePostProcessingStore.getState().ssaoEnabled

    // ============================================
    // DIRTY-FLAG: Only update IBL uniforms when settings change
    // ============================================
    if (iblChanged) {
      // IBL (Image-Based Lighting) uniforms
      // Compute isPMREM first to gate quality (prevents null texture sampling)
      const env = state.scene.environment
      const isPMREM = env && env.mapping === THREE.CubeUVReflectionMapping
      u.uEnvMap.value = isPMREM ? env : null

      const environmentState = useEnvironmentStore.getState()
      const qualityMap = { off: 0, low: 1, high: 2 } as const
      // Force IBL off when no valid PMREM texture
      u.uIBLQuality.value = isPMREM ? qualityMap[environmentState.iblQuality] : 0
      u.uIBLIntensity.value = environmentState.iblIntensity

      // Update version ref
      lastIblVersionRef.current = iblVersion
    }
  }, FRAME_PRIORITY.RENDERER_UNIFORMS)

  // Generate unique key to force material recreation when shader changes or context is restored
  const materialKey = `julia-material-${shaderString.length}-${features.join(',')}-${restoreCount}`

  return (
    <mesh ref={meshRef} scale={[scale ?? 1.0, scale ?? 1.0, scale ?? 1.0]} frustumCulled={true}>
      <boxGeometry args={[4, 4, 4]} />
      <TrackedShaderMaterial
        shaderName="Quaternion Julia Raymarcher"
        materialKey={materialKey}
        glslVersion={THREE.GLSL3}
        vertexShader={vertexShader}
        fragmentShader={shaderString}
        uniforms={uniforms}
        side={THREE.BackSide}
      />
    </mesh>
  )
}

export default QuaternionJuliaMesh
