/**
 * GroundPlaneMaterial - Custom PBR shader material for ground plane surfaces
 *
 * Uses the same GGX BRDF as other custom shaders for visual consistency.
 * Supports multi-light system, shadow maps, and IBL.
 */

import { createColorCache, updateLinearColorUniform } from '@/rendering/colors/linearCache'
import { FRAME_PRIORITY } from '@/rendering/core/framePriorities'
import {
  blurToPCFSamples,
  collectShadowDataCached,
  createShadowMapUniforms,
  SHADOW_MAP_SIZES,
  updateShadowMapUniforms,
} from '@/rendering/shadows'
import { UniformManager } from '@/rendering/uniforms/UniformManager'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useLightingStore } from '@/stores/lightingStore'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type Ref } from 'react'
import * as THREE from 'three'
import {
  composeGroundPlaneFragmentShader,
  composeGroundPlaneVertexShader,
} from '../shaders/groundplane/compose'

export interface GroundPlaneMaterialProps {
  color: string
  opacity: number
  side?: THREE.Side
  // Grid properties
  showGrid?: boolean
  gridColor?: string
  sectionColor?: string
  gridSpacing?: number
  gridThickness?: number
  sectionThickness?: number
  gridFadeDistance?: number
  gridFadeStrength?: number
  // React 19: ref as regular prop
  ref?: Ref<THREE.ShaderMaterial>
  // Note: PBR properties (metallic, roughness, specularIntensity, specularColor)
  // are managed via UniformManager using 'pbr-ground' source
}

/**
 * Custom shader material for ground plane that matches GGX BRDF of other objects.
 * React 19: Uses ref as regular prop instead of forwardRef.
 */
export function GroundPlaneMaterial({
  color,
  opacity,
  side = THREE.DoubleSide,
  showGrid = false,
  gridColor = '#3a3a3a',
  sectionColor = '#4a4a4a',
  gridSpacing = 1,
  gridThickness = 0.5,
  sectionThickness = 1.0,
  gridFadeDistance = 20,
  gridFadeStrength = 2,
  ref,
}: GroundPlaneMaterialProps) {
  const { scene } = useThree()
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const colorCacheRef = useRef(createColorCache())

  // DIRTY-FLAG TRACKING: Track store versions to skip unchanged uniform categories
  const lastIblVersionRef = useRef(-1) // -1 forces full sync on first frame
  const lastGroundVersionRef = useRef(-1)
  const prevMaterialRef = useRef<THREE.ShaderMaterial | null>(null)

  // Get shadow settings for shader compilation
  const shadowEnabled = useLightingStore((state) => state.shadowEnabled)

  // Compile shaders
  const { glsl: fragmentShader } = useMemo(
    () => composeGroundPlaneFragmentShader({ shadows: shadowEnabled }),
    [shadowEnabled]
  )
  const vertexShader = useMemo(() => composeGroundPlaneVertexShader(), [])

  // Create uniforms
  const uniforms = useMemo(
    () => ({
      // Material properties
      uColor: { value: new THREE.Color(color).convertSRGBToLinear() },
      uOpacity: { value: opacity },

      // Lighting and PBR uniforms (via UniformManager)
      // PBR properties (uMetallic, uRoughness, uSpecularIntensity, uSpecularColor)
      // are provided by 'pbr-ground' source
      ...UniformManager.getCombinedUniforms(['lighting', 'pbr-ground']),

      // Shadow map uniforms
      ...createShadowMapUniforms(),

      // IBL uniforms - PMREM texture (sampler2D)
      uEnvMap: { value: null },
      uEnvMapSize: { value: 256.0 },
      uIBLIntensity: { value: 1.0 },
      uIBLQuality: { value: 0 },

      // Grid uniforms
      uShowGrid: { value: showGrid },
      uGridColor: { value: new THREE.Color(gridColor).convertSRGBToLinear() },
      uSectionColor: { value: new THREE.Color(sectionColor).convertSRGBToLinear() },
      uGridSpacing: { value: gridSpacing },
      uSectionSpacing: { value: gridSpacing * 5 },
      uGridThickness: { value: gridThickness },
      uSectionThickness: { value: sectionThickness },
      uGridFadeDistance: { value: gridFadeDistance },
      uGridFadeStrength: { value: gridFadeStrength },
    }),
    // Only recreate when shader config changes, not when prop values change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shadowEnabled]
  )

  // Forward ref to parent
  useEffect(() => {
    if (ref && materialRef.current) {
      if (typeof ref === 'function') {
        ref(materialRef.current)
      } else {
        ref.current = materialRef.current
      }
    }
  }, [ref])

  // Update uniforms every frame
  useFrame((state) => {
    const material = materialRef.current
    if (!material?.uniforms) return

    // --- DIRTY-FLAG: Material change detection ---
    const materialChanged = material !== prevMaterialRef.current
    if (materialChanged) {
      prevMaterialRef.current = material
      lastIblVersionRef.current = -1 // Force full sync
      lastGroundVersionRef.current = -1
    }

    // Get version counters from stores
    const iblVersion = useEnvironmentStore.getState().iblVersion
    const groundVersion = useEnvironmentStore.getState().groundVersion

    const iblChanged = iblVersion !== lastIblVersionRef.current
    const groundChanged = groundVersion !== lastGroundVersionRef.current

    const u = material.uniforms
    const cache = colorCacheRef.current
    const lightingState = useLightingStore.getState()

    // Update material properties (props-based, always update)
    // Note: PBR properties (uMetallic, uRoughness, uSpecularIntensity, uSpecularColor)
    // are applied via UniformManager using 'pbr-ground' source
    updateLinearColorUniform(cache.faceColor, u.uColor!.value as THREE.Color, color)
    u.uOpacity!.value = opacity

    // Update transparency
    const isTransparent = opacity < 1
    if (material.transparent !== isTransparent) {
      material.transparent = isTransparent
      material.depthWrite = !isTransparent
      material.needsUpdate = true
    }

    // Update multi-light system and PBR
    UniformManager.applyToMaterial(material, ['lighting', 'pbr-ground'])

    // Update shadow maps - matrices must update every frame, but use cached scene traversal
    if (shadowEnabled && lightingState.shadowEnabled) {
      const shadowData = collectShadowDataCached(scene, lightingState.lights)
      const shadowQuality = lightingState.shadowQuality
      const shadowMapSize = SHADOW_MAP_SIZES[shadowQuality]
      const pcfSamples = blurToPCFSamples(lightingState.shadowMapBlur)
      updateShadowMapUniforms(
        u as Record<string, { value: unknown }>,
        shadowData,
        lightingState.shadowMapBias,
        shadowMapSize,
        pcfSamples
      )
    }

    // Update IBL (env texture is per-frame, settings use dirty-flag)
    // Use scene.environment (PMREM texture) which is set at the END of each frame
    // by CubemapCapturePass. This means we read the PREVIOUS frame's environment,
    // which provides frame consistency and avoids feedback loops.
    const env = state.scene.environment
    const isPMREM = env && env.mapping === THREE.CubeUVReflectionMapping
    u.uEnvMap!.value = isPMREM ? env : null

    // --- DIRTY-FLAG: IBL settings (only update when store changes) ---
    if (iblChanged) {
      const iblState = useEnvironmentStore.getState()
      const qualityMap = { off: 0, low: 1, high: 2 } as const
      // Force IBL off when no valid PMREM texture (prevents null texture sampling)
      u.uIBLQuality!.value = isPMREM ? qualityMap[iblState.iblQuality] : 0
      u.uIBLIntensity!.value = iblState.iblIntensity
      lastIblVersionRef.current = iblVersion
    }

    // --- DIRTY-FLAG: Grid uniforms (only update when store changes) ---
    if (groundChanged) {
      u.uShowGrid!.value = showGrid
      updateLinearColorUniform(cache.gridColor, u.uGridColor!.value as THREE.Color, gridColor)
      updateLinearColorUniform(
        cache.sectionColor,
        u.uSectionColor!.value as THREE.Color,
        sectionColor
      )
      u.uGridSpacing!.value = gridSpacing
      u.uSectionSpacing!.value = gridSpacing * 5
      u.uGridThickness!.value = gridThickness
      u.uSectionThickness!.value = sectionThickness
      u.uGridFadeDistance!.value = gridFadeDistance
      u.uGridFadeStrength!.value = gridFadeStrength
      lastGroundVersionRef.current = groundVersion
    }
  }, FRAME_PRIORITY.RENDERER_UNIFORMS)

  return (
    <shaderMaterial
      ref={materialRef}
      glslVersion={THREE.GLSL3}
      vertexShader={vertexShader}
      fragmentShader={fragmentShader}
      uniforms={uniforms}
      side={side}
      transparent={opacity < 1}
      depthWrite={opacity >= 1}
      polygonOffset={true}
      polygonOffsetFactor={1}
      polygonOffsetUnits={1}
    />
  )
}
