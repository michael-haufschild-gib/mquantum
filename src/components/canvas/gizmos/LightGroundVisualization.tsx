/**
 * Light Ground Visualization Component
 *
 * Renders ground-plane visualizations for all light types:
 *
 * Spot/Directional lights:
 * 1. Ray from light position to ground intersection
 * 2. Ellipse showing spotlight cone intersection with ground
 * 3. Draggable ground target for adjusting light direction
 *
 * Point lights:
 * 1. Circle showing sphere intersection with ground (based on range)
 * 2. Draggable target for adjusting light X,Z position
 *
 * RENDER LAYER:
 * This component is rendered on RENDER_LAYERS.DEBUG via LightGizmoManager.
 * The DEBUG layer is processed by DebugOverlayPass AFTER all post-processing,
 * which means we can use standard Three.js materials (MeshBasicMaterial,
 * Line from drei) WITHOUT needing MRT-compatible shaders that output to
 * gColor/gNormal/gPosition.
 */

import type { LightSource } from '@/rendering/lights/types'
import { directionToRotation, rotationToDirection } from '@/rendering/lights/types'
import { DragControls, Line } from '@react-three/drei'
import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

/** Ground plane Y position */
const GROUND_Y = 0

/** Minimum height above ground for visualization */
const MIN_HEIGHT = 0.1

/** Maximum ellipse size to prevent extreme scaling */
const MAX_ELLIPSE_RADIUS = 50

/** Number of segments for ellipse/circle approximation */
const ELLIPSE_SEGMENTS = 64

/** Number of segments for point light circle */
const CIRCLE_SEGMENTS = 64

/** Draggable target circle radius */
const TARGET_RING_OUTER = 0.5

/**
 * Props for LightGroundVisualization
 */
export interface LightGroundVisualizationProps {
  /** Light configuration */
  light: LightSource
  /** Whether this light is selected */
  isSelected: boolean
  /** Whether any light is currently being dragged */
  isDragging: boolean
  /** Callback when rotation changes via drag (spot/directional lights) */
  onRotationChange: (rotation: [number, number, number]) => void
  /** Callback when position changes via drag (point lights) */
  onPositionChange: (position: [number, number, number]) => void
  /** Callback when drag starts */
  onDragStart: () => void
  /** Callback when drag ends */
  onDragEnd: () => void
  /** Callback to select this light */
  onSelect: () => void
}

/**
 * Calculate ray-ground intersection point
 * Returns null if light is below ground or pointing upward
 * @param position - Light position as [x, y, z]
 * @param direction - Light direction as [x, y, z]
 * @returns The intersection point or null if no valid intersection
 */
function calculateGroundIntersection(
  position: [number, number, number],
  direction: [number, number, number]
): THREE.Vector3 | null {
  const [px, py, pz] = position
  const [dx, dy, dz] = direction

  // Light must be above ground
  if (py <= GROUND_Y + MIN_HEIGHT) {
    return null
  }

  // Direction must point downward (negative Y component)
  if (dy >= 0) {
    return null
  }

  // Ray-plane intersection: t = (groundY - py) / dy
  const t = (GROUND_Y - py) / dy

  // Intersection must be in front of light
  if (t <= 0) {
    return null
  }

  return new THREE.Vector3(px + t * dx, GROUND_Y, pz + t * dz)
}

/**
 * Calculate ellipse points for spotlight cone intersection with ground
 * @param position - Light position
 * @param direction - Light direction
 * @param coneAngle - Spotlight cone angle
 * @param intersection - Ground intersection point
 * @returns Array of 3D points forming the ellipse
 */
function calculateEllipsePoints(
  position: [number, number, number],
  direction: [number, number, number],
  coneAngle: number,
  intersection: THREE.Vector3
): THREE.Vector3[] {
  const lightPos = new THREE.Vector3(position[0], position[1], position[2])
  const dir = new THREE.Vector3(direction[0], direction[1], direction[2]).normalize()

  // Distance from light to ground intersection
  const distance = lightPos.distanceTo(intersection)

  // Base cone radius at intersection distance
  const coneRadians = (coneAngle * Math.PI) / 180
  const baseRadius = distance * Math.tan(coneRadians)

  // Ellipse stretching based on angle of incidence
  // When light is straight down, semiMajor = semiMinor
  // As angle becomes shallower, semiMajor increases
  const cosAngle = Math.abs(dir.y)
  const semiMajor = Math.min(baseRadius / Math.max(cosAngle, 0.1), MAX_ELLIPSE_RADIUS)
  const semiMinor = Math.min(baseRadius, MAX_ELLIPSE_RADIUS)

  // Rotation of ellipse based on light direction projected onto XZ plane
  const ellipseRotation = Math.atan2(dir.x, dir.z)

  // Generate ellipse points
  const points: THREE.Vector3[] = []
  for (let i = 0; i <= ELLIPSE_SEGMENTS; i++) {
    const angle = (i / ELLIPSE_SEGMENTS) * Math.PI * 2
    const localX = Math.cos(angle) * semiMinor
    const localZ = Math.sin(angle) * semiMajor

    // Rotate around Y axis
    const rotatedX = localX * Math.cos(ellipseRotation) - localZ * Math.sin(ellipseRotation)
    const rotatedZ = localX * Math.sin(ellipseRotation) + localZ * Math.cos(ellipseRotation)

    points.push(
      new THREE.Vector3(
        intersection.x + rotatedX,
        GROUND_Y + 0.01, // Slight offset to prevent z-fighting
        intersection.z + rotatedZ
      )
    )
  }

  return points
}

/**
 * Calculate point light sphere intersection with ground plane.
 * Returns circle center and radius, or null if no intersection.
 *
 * @param position - Light position [x, y, z]
 * @param range - Light range (sphere radius). 0 = infinite, no visualization.
 * @returns Circle center and radius, or null if no intersection
 */
function calculateSphereGroundIntersection(
  position: [number, number, number],
  range: number
): { center: THREE.Vector3; radius: number } | null {
  const [px, py, pz] = position

  // Range must be > 0 (0 = infinite, no visualization)
  if (range <= 0) {
    return null
  }

  // Light must be above ground
  if (py <= 0) {
    return null
  }

  // Sphere must touch ground (light height < range)
  if (py >= range) {
    return null
  }

  // Circle radius from Pythagorean theorem: r = sqrt(range² - height²)
  const circleRadius = Math.sqrt(range * range - py * py)

  return {
    center: new THREE.Vector3(px, GROUND_Y + 0.01, pz),
    radius: circleRadius,
  }
}

/**
 * Light Ground Ray - Feature 1
 * Dashed line from light position to ground intersection
 */
const LightGroundRay = memo(function LightGroundRay({
  light,
  intersection,
}: {
  light: LightSource
  intersection: THREE.Vector3
}) {
  const points = useMemo(
    () => [
      new THREE.Vector3(light.position[0], light.position[1], light.position[2]),
      intersection,
    ],
    [light.position, intersection]
  )

  const color = useMemo(() => {
    return light.enabled ? light.color : '#666666'
  }, [light.enabled, light.color])

  return (
    <Line
      points={points}
      color={color}
      lineWidth={1}
      dashed
      dashSize={0.3}
      gapSize={0.15}
      opacity={light.enabled ? 0.6 : 0.3}
      transparent
    />
  )
})

/**
 * Spotlight Ground Circle - Feature 2
 * Ellipse showing cone intersection with ground plane
 */
const SpotlightGroundCircle = memo(function SpotlightGroundCircle({
  light,
  direction,
  intersection,
}: {
  light: LightSource
  direction: [number, number, number]
  intersection: THREE.Vector3
}) {
  const points = useMemo(() => {
    return calculateEllipsePoints(light.position, direction, light.coneAngle, intersection)
  }, [light.position, direction, light.coneAngle, intersection])

  const color = useMemo(() => {
    return light.enabled ? light.color : '#666666'
  }, [light.enabled, light.color])

  return (
    <Line
      points={points}
      color={color}
      lineWidth={2}
      opacity={light.enabled ? 0.8 : 0.4}
      transparent
    />
  )
})

/**
 * Draggable Ground Target - Feature 3
 * Filled circle at ground intersection that can be dragged to change light direction
 */
const DraggableGroundTarget = memo(function DraggableGroundTarget({
  light,
  intersection,
  isSelected,
  isDragging,
  onRotationChange,
  onDragStart,
  onDragEnd,
  onSelect,
}: {
  light: LightSource
  intersection: THREE.Vector3
  isSelected: boolean
  isDragging: boolean
  onRotationChange: (rotation: [number, number, number]) => void
  onDragStart: () => void
  onDragEnd: () => void
  onSelect: () => void
}) {
  const groupRef = useRef<THREE.Group>(null)
  const lightPosRef = useRef(new THREE.Vector3())
  const tempPosition = useRef(new THREE.Vector3())

  // Matrix for DragControls - initialized with correct position
  const matrix = useRef<THREE.Matrix4>(null!)
  if (matrix.current === null) {
    matrix.current = new THREE.Matrix4()
    matrix.current.setPosition(intersection.x, GROUND_Y + 0.02, intersection.z)
  }

  // Update matrix when intersection changes (only when not dragging)
  useEffect(() => {
    if (!isDragging) {
      matrix.current.setPosition(intersection.x, GROUND_Y + 0.02, intersection.z)
    }
  }, [intersection.x, intersection.z, isDragging])

  // Handle drag start - select light and disable camera controls
  const handleDragStart = useCallback(() => {
    onSelect()
    onDragStart()
  }, [onSelect, onDragStart])

  // Handle drag - extract position from world matrix and calculate new rotation
  const handleDrag = useCallback(
    (localMatrix: THREE.Matrix4, _deltaLocalMatrix: THREE.Matrix4, _worldMatrix: THREE.Matrix4) => {
      // Copy local matrix to our tracked matrix
      matrix.current.copy(localMatrix)

      // Extract position from matrix
      tempPosition.current.setFromMatrixPosition(matrix.current)

      // Constrain to ground plane
      tempPosition.current.y = GROUND_Y

      // Update group position for visual feedback
      if (groupRef.current) {
        groupRef.current.position.copy(tempPosition.current)
      }

      // Calculate direction from light to target
      lightPosRef.current.set(light.position[0], light.position[1], light.position[2])
      const direction = new THREE.Vector3()
        .subVectors(tempPosition.current, lightPosRef.current)
        .normalize()

      // Convert to rotation
      const newRotation = directionToRotation([direction.x, direction.y, direction.z])
      onRotationChange(newRotation)
    },
    [light.position, onRotationChange]
  )

  // Handle drag end - re-enable camera controls
  const handleDragEnd = useCallback(() => {
    onDragEnd()
  }, [onDragEnd])

  const targetColor = useMemo(() => {
    if (!light.enabled) return '#666666'
    if (isSelected) return '#00ff00'
    return light.color
  }, [light.enabled, isSelected, light.color])

  return (
    <DragControls
      autoTransform={false}
      matrix={matrix.current}
      onDragStart={handleDragStart}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
    >
      <group ref={groupRef} position={[intersection.x, GROUND_Y + 0.02, intersection.z]}>
        {/* Solid filled circle for reliable drag detection
            Uses standard MeshBasicMaterial - no MRT outputs needed because
            this renders on DEBUG layer via DebugOverlayPass. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[TARGET_RING_OUTER, 32]} />
          <meshBasicMaterial
            color={targetColor}
            transparent
            opacity={isSelected ? 0.7 : 0.5}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    </DragControls>
  )
})

/**
 * Point Light Ground Circle
 * Circle showing sphere intersection with ground, with draggable center
 */
const PointLightGroundCircle = memo(function PointLightGroundCircle({
  light,
  intersection,
  isSelected,
  isDragging,
  onPositionChange,
  onDragStart,
  onDragEnd,
  onSelect,
}: {
  light: LightSource
  intersection: { center: THREE.Vector3; radius: number }
  isSelected: boolean
  isDragging: boolean
  onPositionChange: (position: [number, number, number]) => void
  onDragStart: () => void
  onDragEnd: () => void
  onSelect: () => void
}) {
  const groupRef = useRef<THREE.Group>(null)
  const tempPosition = useRef(new THREE.Vector3())

  // Matrix for DragControls - initialized with correct position
  const matrix = useRef<THREE.Matrix4>(null!)
  if (matrix.current === null) {
    matrix.current = new THREE.Matrix4()
    matrix.current.setPosition(intersection.center.x, GROUND_Y + 0.02, intersection.center.z)
  }

  // Update matrix when intersection center changes (only when not dragging)
  useEffect(() => {
    if (!isDragging) {
      matrix.current.setPosition(intersection.center.x, GROUND_Y + 0.02, intersection.center.z)
    }
  }, [intersection.center.x, intersection.center.z, isDragging])

  // Generate circle points for the range outline
  const circlePoints = useMemo(() => {
    const points: THREE.Vector3[] = []
    for (let i = 0; i <= CIRCLE_SEGMENTS; i++) {
      const angle = (i / CIRCLE_SEGMENTS) * Math.PI * 2
      points.push(
        new THREE.Vector3(
          intersection.center.x + Math.cos(angle) * intersection.radius,
          GROUND_Y + 0.01,
          intersection.center.z + Math.sin(angle) * intersection.radius
        )
      )
    }
    return points
  }, [intersection])

  const color = useMemo(() => {
    return light.enabled ? light.color : '#666666'
  }, [light.enabled, light.color])

  const targetColor = useMemo(() => {
    if (!light.enabled) return '#666666'
    if (isSelected) return '#00ff00'
    return light.color
  }, [light.enabled, isSelected, light.color])

  // Handle drag start - select light and disable camera controls
  const handleDragStart = useCallback(() => {
    onSelect()
    onDragStart()
  }, [onSelect, onDragStart])

  // Handle drag - updates X,Z position (keeps Y unchanged)
  const handleDrag = useCallback(
    (localMatrix: THREE.Matrix4, _deltaLocalMatrix: THREE.Matrix4, _worldMatrix: THREE.Matrix4) => {
      // Copy local matrix to our tracked matrix
      matrix.current.copy(localMatrix)

      // Extract position from matrix
      tempPosition.current.setFromMatrixPosition(matrix.current)

      // Constrain to ground plane for visual feedback
      tempPosition.current.y = GROUND_Y

      // Update group position for visual feedback
      if (groupRef.current) {
        groupRef.current.position.copy(tempPosition.current)
      }

      // Update light position - keep Y unchanged, only modify X and Z
      onPositionChange([tempPosition.current.x, light.position[1], tempPosition.current.z])
    },
    [light.position, onPositionChange]
  )

  // Handle drag end - re-enable camera controls
  const handleDragEnd = useCallback(() => {
    onDragEnd()
  }, [onDragEnd])

  return (
    <group>
      {/* Circle outline showing sphere intersection */}
      <Line
        points={circlePoints}
        color={color}
        lineWidth={2}
        opacity={light.enabled ? 0.8 : 0.4}
        transparent
      />

      {/* Draggable center target - solid circle for reliable drag detection
          Uses standard MeshBasicMaterial - no MRT outputs needed because
          this renders on DEBUG layer via DebugOverlayPass. */}
      <DragControls
        autoTransform={false}
        matrix={matrix.current}
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
      >
        <group
          ref={groupRef}
          position={[intersection.center.x, GROUND_Y + 0.02, intersection.center.z]}
        >
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[TARGET_RING_OUTER, 32]} />
            <meshBasicMaterial
              color={targetColor}
              transparent
              opacity={isSelected ? 0.7 : 0.5}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      </DragControls>
    </group>
  )
})

/**
 * Light Ground Visualization - Main component
 * Renders visualization for all light types
 */
export const LightGroundVisualization = memo(function LightGroundVisualization({
  light,
  isSelected,
  isDragging,
  onRotationChange,
  onPositionChange,
  onDragStart,
  onDragEnd,
  onSelect,
}: LightGroundVisualizationProps) {
  // IMPORTANT: All hooks must be called unconditionally at the top level
  // to follow React's Rules of Hooks

  // Calculate direction from rotation (used for spot/directional lights)
  const direction = useMemo(() => {
    return rotationToDirection(light.rotation)
  }, [light.rotation])

  // Calculate ground intersection (used for spot/directional lights)
  const rayIntersection = useMemo(() => {
    return calculateGroundIntersection(light.position, direction)
  }, [light.position, direction])

  // Handle POINT LIGHTS - sphere intersection with ground
  if (light.type === 'point') {
    const sphereIntersection = calculateSphereGroundIntersection(light.position, light.range)

    // No visualization if no intersection (range=0, below ground, or sphere doesn't touch ground)
    if (!sphereIntersection) {
      return null
    }

    return (
      <PointLightGroundCircle
        light={light}
        intersection={sphereIntersection}
        isSelected={isSelected}
        isDragging={isDragging}
        onPositionChange={onPositionChange}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onSelect={onSelect}
      />
    )
  }

  // Handle SPOT and DIRECTIONAL LIGHTS - ray/cone intersection with ground

  // Don't render if no valid intersection (light below ground or pointing up)
  if (!rayIntersection) {
    return null
  }

  return (
    <group>
      {/* Feature 1: Ray from light to ground */}
      <LightGroundRay light={light} intersection={rayIntersection} />

      {/* Feature 2: Spotlight cone ellipse (only for spot lights) */}
      {light.type === 'spot' && (
        <SpotlightGroundCircle light={light} direction={direction} intersection={rayIntersection} />
      )}

      {/* Feature 3: Draggable ground target */}
      <DraggableGroundTarget
        light={light}
        intersection={rayIntersection}
        isSelected={isSelected}
        isDragging={isDragging}
        onRotationChange={onRotationChange}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onSelect={onSelect}
      />
    </group>
  )
})

export default LightGroundVisualization
