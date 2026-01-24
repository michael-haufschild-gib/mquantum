/**
 * Light Gizmo Component
 *
 * Renders a visual gizmo for a single light source with type-specific visualization:
 * - Point Light: Sphere icon
 * - Directional Light: Sun icon with arrow
 * - Spot Light: Cone wireframe
 *
 * Features:
 * - Camera-distance scaling (constant screen size)
 * - Selection highlighting
 * - Click-to-select interaction
 * - Disabled state visualization (30% opacity)
 *
 * RENDER LAYER:
 * This component is rendered on RENDER_LAYERS.DEBUG via LightGizmoManager.
 * The DEBUG layer is processed by DebugOverlayPass AFTER all post-processing,
 * which means we can use standard Three.js materials (MeshBasicMaterial,
 * LineBasicMaterial, ArrowHelper) WITHOUT needing MRT-compatible shaders
 * that output to gColor/gNormal/gPosition.
 */

import { FRAME_PRIORITY } from '@/rendering/core/framePriorities'
import { memo, useMemo, useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Billboard } from '@react-three/drei'
import * as THREE from 'three'
import { rotationToDirection } from '@/rendering/lights/types'
import type { LightSource } from '@/rendering/lights/types'

/**
 * Props for LightGizmo component
 */
export interface LightGizmoProps {
  /** Light configuration */
  light: LightSource
  /** Whether this light is selected */
  isSelected: boolean
  /** Callback when gizmo is clicked */
  onSelect: () => void
}

/** Base size for gizmos (before camera-distance scaling) */
const BASE_GIZMO_SIZE = 0.3

/** Minimum scale to prevent gizmo from becoming too small */
const MIN_SCALE = 0.1

/** Maximum scale to prevent gizmo from becoming too large */
const MAX_SCALE = 2.0

/**
 * Point Light Gizmo - Sphere icon
 *
 * Uses standard MeshBasicMaterial - no MRT outputs needed because
 * this renders on DEBUG layer via DebugOverlayPass.
 */
const PointLightGizmo = memo(function PointLightGizmo({
  light,
  isSelected,
}: {
  light: LightSource
  isSelected: boolean
}) {
  const meshRef = useRef<THREE.Mesh>(null)

  const material = useMemo(() => {
    const color = new THREE.Color(light.color)
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: light.enabled ? 1.0 : 0.3,
      wireframe: !isSelected,
      depthTest: false,
      depthWrite: false,
    })
  }, [light.color, light.enabled, isSelected])

  // Cleanup material on unmount
  useEffect(() => {
    return () => {
      material.dispose()
    }
  }, [material])

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[1, 2]} />
      <primitive object={material} />
      {isSelected && (
        <Billboard>
          <mesh>
            <ringGeometry args={[1.2, 1.4, 32]} />
            <meshBasicMaterial
              color="#00ff00"
              transparent
              opacity={0.8}
              side={THREE.DoubleSide}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
        </Billboard>
      )}
    </mesh>
  )
})

/**
 * Directional Light Gizmo - Sun with arrow
 *
 * Uses standard MeshBasicMaterial and ArrowHelper - no MRT outputs needed
 * because this renders on DEBUG layer via DebugOverlayPass.
 */
const DirectionalLightGizmo = memo(function DirectionalLightGizmo({
  light,
  isSelected,
}: {
  light: LightSource
  isSelected: boolean
}) {
  const direction = useMemo(() => {
    const dir = rotationToDirection(light.rotation)
    return new THREE.Vector3(dir[0], dir[1], dir[2])
  }, [light.rotation])

  const material = useMemo(() => {
    const color = new THREE.Color(light.color)
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: light.enabled ? 1.0 : 0.3,
      depthTest: false,
      depthWrite: false,
    })
  }, [light.color, light.enabled])

  // Cleanup material on unmount
  useEffect(() => {
    return () => {
      material.dispose()
    }
  }, [material])

  // Arrow direction and length
  const arrowLength = 2
  const arrowHelper = useMemo(() => {
    const helper = new THREE.ArrowHelper(
      direction,
      new THREE.Vector3(0, 0, 0),
      arrowLength,
      light.enabled ? 0xffff00 : 0x666666,
      0.3,
      0.15
    )
    return helper
  }, [direction, light.enabled])

  // Cleanup arrowHelper on unmount (ArrowHelper has its own geometry and materials)
  useEffect(() => {
    return () => {
      arrowHelper.dispose()
    }
  }, [arrowHelper])

  return (
    <group>
      {/* Sun icon */}
      <mesh>
        <octahedronGeometry args={[1, 0]} />
        <primitive object={material} />
      </mesh>
      {/* Direction arrow */}
      <primitive object={arrowHelper} />
      {isSelected && (
        <Billboard>
          <mesh>
            <ringGeometry args={[1.2, 1.4, 32]} />
            <meshBasicMaterial
              color="#00ff00"
              transparent
              opacity={0.8}
              side={THREE.DoubleSide}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
        </Billboard>
      )}
    </group>
  )
})

/**
 * Spot Light Gizmo - Cone wireframe
 *
 * Uses standard MeshBasicMaterial - no MRT outputs needed because
 * this renders on DEBUG layer via DebugOverlayPass.
 */
const SpotLightGizmo = memo(function SpotLightGizmo({
  light,
  isSelected,
}: {
  light: LightSource
  isSelected: boolean
}) {
  const direction = useMemo(() => {
    const dir = rotationToDirection(light.rotation)
    return new THREE.Vector3(dir[0], dir[1], dir[2])
  }, [light.rotation])

  // Calculate cone geometry from angle
  const coneHeight = 2
  const coneRadius = Math.tan((light.coneAngle * Math.PI) / 180) * coneHeight

  const material = useMemo(() => {
    const color = new THREE.Color(light.color)
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: light.enabled ? 0.5 : 0.15,
      wireframe: true,
      depthTest: false,
      depthWrite: false,
    })
  }, [light.color, light.enabled])

  // Cleanup material on unmount
  useEffect(() => {
    return () => {
      material.dispose()
    }
  }, [material])

  // Rotation to align cone with direction
  const coneRotation = useMemo(() => {
    const quaternion = new THREE.Quaternion()
    const defaultDir = new THREE.Vector3(0, -1, 0) // Cone default points down
    quaternion.setFromUnitVectors(defaultDir, direction)
    const euler = new THREE.Euler().setFromQuaternion(quaternion)
    return [euler.x, euler.y, euler.z] as [number, number, number]
  }, [direction])

  return (
    <group>
      {/* Apex sphere */}
      <mesh>
        <sphereGeometry args={[0.3, 8, 8]} />
        <meshBasicMaterial
          color={light.color}
          transparent
          opacity={light.enabled ? 1.0 : 0.3}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
      {/* Cone wireframe */}
      <mesh
        rotation={coneRotation}
        position={direction
          .clone()
          .multiplyScalar(coneHeight / 2)
          .toArray()}
      >
        <coneGeometry args={[coneRadius, coneHeight, 16, 1, true]} />
        <primitive object={material} />
      </mesh>
      {isSelected && (
        <Billboard>
          <mesh>
            <ringGeometry args={[0.5, 0.6, 32]} />
            <meshBasicMaterial
              color="#00ff00"
              transparent
              opacity={0.8}
              side={THREE.DoubleSide}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
        </Billboard>
      )}
    </group>
  )
})

/**
 * Light Gizmo - Unified wrapper with camera-distance scaling
 */
/** Reusable Vector3 for distance calculation (avoid per-frame allocation) */
const tempLightPosition = new THREE.Vector3()

/** Threshold for detecting distance changes (skip recalculation if below) */
const DISTANCE_THRESHOLD = 0.1

export const LightGizmo = memo(function LightGizmo({
  light,
  isSelected,
  onSelect,
}: LightGizmoProps) {
  const groupRef = useRef<THREE.Group>(null)
  const { camera } = useThree()
  // Track last distance to skip unnecessary scale updates
  const lastDistanceRef = useRef(0)

  // Update scale based on camera distance (only when distance changes significantly)
  useFrame(() => {
    if (groupRef.current) {
      tempLightPosition.set(light.position[0], light.position[1], light.position[2])
      const distance = camera.position.distanceTo(tempLightPosition)

      // Skip if distance hasn't changed significantly
      if (Math.abs(distance - lastDistanceRef.current) < DISTANCE_THRESHOLD) {
        return
      }
      lastDistanceRef.current = distance

      const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, distance * 0.1)) * BASE_GIZMO_SIZE
      groupRef.current.scale.setScalar(scale)
    }
  }, FRAME_PRIORITY.RENDERERS)

  // Handle click
  const handleClick = (e: { stopPropagation?: () => void }) => {
    e.stopPropagation?.()
    onSelect()
  }

  return (
    <group
      ref={groupRef}
      position={[light.position[0], light.position[1], light.position[2]]}
      onClick={handleClick}
    >
      {light.type === 'point' && <PointLightGizmo light={light} isSelected={isSelected} />}
      {light.type === 'directional' && (
        <DirectionalLightGizmo light={light} isSelected={isSelected} />
      )}
      {light.type === 'spot' && <SpotLightGizmo light={light} isSelected={isSelected} />}
    </group>
  )
})

export default LightGizmo
