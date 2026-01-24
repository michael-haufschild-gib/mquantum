/**
 * Scene Lighting Component
 *
 * Manages ambient and multi-light system for the 3D scene. Supports up to 4 lights
 * of type Point, Directional, or Spot with full configuration.
 *
 * Features:
 * - Ambient light with configurable intensity
 * - Multi-light system with up to 4 lights (Point, Directional, Spot)
 * - Per-light enable/disable, color, intensity, position, rotation
 * - Spot light cone angle and penumbra
 * - Backward compatible with legacy single-light system
 *
 * Note: Visual light indicators (gizmos) are handled separately by
 * LightGizmoManager on the DEBUG render layer to avoid MRT compatibility issues.
 *
 * @example
 * ```tsx
 * <Canvas>
 *   <SceneLighting />
 *   <PolytopeRenderer />
 * </Canvas>
 * ```
 *
 * @see {@link useLightingStore} for lighting configuration state
 * @see {@link LightGizmoManager} for light position indicators
 */

import type { LightSource } from '@/rendering/lights/types'
import { rotationToDirection } from '@/rendering/lights/types'
import type { ShadowQuality } from '@/rendering/shadows/types'
import { useLightingStore } from '@/stores/lightingStore'
import { getEffectiveShadowQuality, usePerformanceStore } from '@/stores/performanceStore'
import { memo, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Vector3 } from 'three'

/**
 * Shadow map size for each quality level.
 * Higher resolution = sharper shadows but more GPU memory.
 */
const SHADOW_MAP_SIZES: Record<ShadowQuality, number> = {
  low: 512,
  medium: 1024,
  high: 2048,
  ultra: 4096,
}

/**
 * Convert shadow softness (0-2) to shadow radius for PCFSoftShadowMap.
 * Higher radius = softer shadow edges.
 * @param softness - Shadow softness value (0-2)
 * @returns Shadow radius value (0-8)
 */
function getShadowRadius(softness: number): number {
  // Scale softness (0-2) to radius (0-8)
  return softness * 4
}

/**
 * Default distance for the legacy point light from the origin.
 */
const LIGHT_DISTANCE = 10

/**
 * Individual light renderer component for the multi-light system.
 * Renders the appropriate Three.js light based on light type.
 *
 * Note: Visual indicators (gizmos) are handled separately by LightGizmoManager
 * on the DEBUG render layer to avoid MRT compatibility issues.
 */
interface LightRendererProps {
  light: LightSource
  shadowEnabled: boolean
  shadowMapSize: number
  shadowRadius: number
  shadowBias: number
}

const LightRenderer = memo(function LightRenderer({
  light,
  shadowEnabled,
  shadowMapSize,
  shadowRadius,
  shadowBias,
}: LightRendererProps) {
  const position = light.position as [number, number, number]
  const direction = useMemo(() => {
    const dir = rotationToDirection(light.rotation)
    return new Vector3(dir[0], dir[1], dir[2])
  }, [light.rotation])

  // Refs for lights that need targets
  const spotLightRef = useRef<THREE.SpotLight>(null)
  const directionalLightRef = useRef<THREE.DirectionalLight>(null)
  const targetRef = useRef<THREE.Object3D>(null)

  // For directional/spot lights, calculate target position from direction
  const targetPosition = useMemo((): [number, number, number] => {
    // Target is position + direction
    return [
      light.position[0] + direction.x * 10,
      light.position[1] + direction.y * 10,
      light.position[2] + direction.z * 10,
    ]
  }, [light.position, direction])

  // Update light target when direction changes
  // Guard: Skip effect for disabled lights to prevent unnecessary updates
  useEffect(() => {
    if (!light.enabled) return

    if (spotLightRef.current && targetRef.current) {
      targetRef.current.position.set(...targetPosition)
      spotLightRef.current.target = targetRef.current
      spotLightRef.current.target.updateMatrixWorld()
    }
    if (directionalLightRef.current && targetRef.current) {
      targetRef.current.position.set(...targetPosition)
      directionalLightRef.current.target = targetRef.current
      directionalLightRef.current.target.updateMatrixWorld()
    }
  }, [targetPosition, light.enabled])

  // Disabled lights don't render any Three.js light
  // Visual indicators for disabled lights are handled by LightGizmoManager
  if (!light.enabled) {
    return null
  }

  // Determine if we need a target object (for spot and directional lights)
  const needsTarget = light.type === 'spot' || light.type === 'directional'

  return (
    <>
      {/* Target object for spot/directional lights - must be in scene graph */}
      {needsTarget && <object3D ref={targetRef} position={targetPosition} />}

      {light.type === 'point' && (
        <pointLight
          position={position}
          color={light.color}
          intensity={light.intensity * 10}
          distance={light.range}
          decay={light.decay}
          castShadow={shadowEnabled}
          shadow-mapSize-width={shadowMapSize}
          shadow-mapSize-height={shadowMapSize}
          shadow-camera-near={0.5}
          shadow-camera-far={light.range || 50}
          shadow-bias={shadowBias}
          shadow-radius={shadowRadius}
        />
      )}
      {light.type === 'directional' && (
        <directionalLight
          ref={directionalLightRef}
          position={position}
          color={light.color}
          intensity={light.intensity}
          castShadow={shadowEnabled}
          shadow-mapSize-width={shadowMapSize}
          shadow-mapSize-height={shadowMapSize}
          shadow-camera-near={0.5}
          shadow-camera-far={50}
          shadow-camera-left={-10}
          shadow-camera-right={10}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
          shadow-bias={shadowBias}
          shadow-radius={shadowRadius}
        />
      )}
      {light.type === 'spot' && (
        <spotLight
          ref={spotLightRef}
          position={position}
          color={light.color}
          intensity={light.intensity * 10}
          distance={light.range}
          angle={(light.coneAngle * Math.PI) / 180}
          penumbra={light.penumbra}
          decay={light.decay}
          castShadow={shadowEnabled}
          shadow-mapSize-width={shadowMapSize}
          shadow-mapSize-height={shadowMapSize}
          shadow-camera-near={0.5}
          shadow-camera-far={light.range || 50}
          shadow-bias={shadowBias}
          shadow-radius={shadowRadius}
        />
      )}
    </>
  )
})

/**
 * Renders ambient and multi-light system for the scene.
 *
 * @returns Three.js light components configured from visual store
 */
export const SceneLighting = memo(function SceneLighting() {
  // Multi-light system state
  const lights = useLightingStore((state) => state.lights)

  // Shadow system state
  const shadowEnabled = useLightingStore((state) => state.shadowEnabled)
  const shadowQuality = useLightingStore((state) => state.shadowQuality)
  const shadowSoftness = useLightingStore((state) => state.shadowSoftness)
  const shadowMapBias = useLightingStore((state) => state.shadowMapBias)
  const shadowMapBlur = useLightingStore((state) => state.shadowMapBlur)

  // Progressive Refinement: get quality multiplier to dynamically scale shadow map size
  const qualityMultiplier = usePerformanceStore((state) => state.qualityMultiplier)

  // Compute effective shadow map size based on progressive refinement
  // When user interacts (low quality multiplier), this drops to lower resolution
  // When idle (high quality multiplier), this restores to full resolution
  const effectiveShadowMapSize = useMemo(() => {
    const effectiveQuality = getEffectiveShadowQuality(shadowQuality, qualityMultiplier)
    return SHADOW_MAP_SIZES[effectiveQuality]
  }, [shadowQuality, qualityMultiplier])

  // Use shadowMapBlur for polytopes (mesh-based objects) which supports PCF radius
  // shadowSoftness is used for SDF raymarched shadows
  const shadowRadiusValue = shadowMapBlur > 0 ? shadowMapBlur : getShadowRadius(shadowSoftness)

  // Legacy single-light state (for backward compatibility)
  const lightEnabled = useLightingStore((state) => state.lightEnabled)
  const lightColor = useLightingStore((state) => state.lightColor)
  const lightHorizontalAngle = useLightingStore((state) => state.lightHorizontalAngle)
  const lightVerticalAngle = useLightingStore((state) => state.lightVerticalAngle)
  const ambientEnabled = useLightingStore((state) => state.ambientEnabled)
  const ambientIntensity = useLightingStore((state) => state.ambientIntensity)
  const ambientColor = useLightingStore((state) => state.ambientColor)
  // Note: diffuseIntensity removed - energy conservation derives diffuse from (1-kS)*(1-metallic)
  const lightStrength = useLightingStore((state) => state.lightStrength)

  /**
   * Legacy light position from spherical coordinates (backward compatibility)
   */
  const legacyLightPosition = useMemo(() => {
    const h = (lightHorizontalAngle * Math.PI) / 180
    const v = (lightVerticalAngle * Math.PI) / 180
    return [
      Math.cos(v) * Math.cos(h) * LIGHT_DISTANCE,
      Math.sin(v) * LIGHT_DISTANCE,
      Math.cos(v) * Math.sin(h) * LIGHT_DISTANCE,
    ] as [number, number, number]
  }, [lightHorizontalAngle, lightVerticalAngle])

  // Determine if we should use multi-light or legacy
  const useMultiLight = lights.length > 0

  return (
    <>
      {ambientEnabled && <ambientLight intensity={ambientIntensity} color={ambientColor} />}

      {useMultiLight ? (
        // Multi-light system
        // Key includes effectiveShadowMapSize to force remount when quality changes
        // Three.js doesn't recreate shadow map textures on prop changes, so key-based remount is required
        // Note: Visual indicators are handled by LightGizmoManager on DEBUG layer
        <>
          {lights.map((light) => (
            <LightRenderer
              key={`${light.id}-${effectiveShadowMapSize}`}
              light={light}
              shadowEnabled={shadowEnabled}
              shadowMapSize={effectiveShadowMapSize}
              shadowRadius={shadowRadiusValue}
              shadowBias={shadowMapBias}
            />
          ))}
        </>
      ) : (
        // Legacy single-light (backward compatibility)
        // Note: Visual indicator removed - handled by LightGizmoManager on DEBUG layer
        <>
          {lightEnabled && (
            <pointLight
              position={legacyLightPosition}
              color={lightColor}
              intensity={(lightStrength ?? 1.0) * 10}
              distance={0}
              decay={0}
            />
          )}
        </>
      )}
    </>
  )
})
