/**
 * Ground Plane Component
 *
 * Renders environment walls around the polytope for visual depth.
 * Features:
 * - Multiple wall positions: floor, back, left, right, top
 * - Two surface types: 'two-sided' (visible from both sides) or 'plane' (single-sided)
 * - Configurable surface color
 * - Optional grid overlay with customizable color and spacing
 * - Shadow receiving for realistic lighting
 * - Dynamic positioning based on object bounds
 *
 * @example
 * ```tsx
 * <GroundPlane
 *   vertices={projectedVertices}
 *   offset={0.5}
 *   activeWalls={['floor', 'back']}
 *   color="#101010"
 *   surfaceType="two-sided"
 *   showGrid={true}
 *   gridColor="#3a3a3a"
 *   gridSpacing={1}
 * />
 * ```
 */

import type { Vector3D } from '@/lib/math/types'
import { RENDER_LAYERS } from '@/rendering/core/layers'
import type { GroundPlaneType, WallPosition } from '@/stores/defaults/visualDefaults'
import { useCallback, useMemo } from 'react'
import { Color, DoubleSide, FrontSide, Object3D } from 'three'
import { GroundPlaneMaterial } from './GroundPlaneMaterial'

/**
 * Props for the GroundPlane component
 */
export interface GroundPlaneProps {
  /** 3D projected vertices to calculate bounds from */
  vertices?: Vector3D[]
  /** Additional offset below the lowest point (default: 0.5) */
  offset?: number
  /** Which walls are currently active/visible */
  activeWalls?: WallPosition[]
  /**
   * Minimum bounding radius to consider for positioning.
   * Used when external objects (like raymarched Mandelbulb) need to be
   * accounted for even if they don't contribute to vertices array.
   */
  minBoundingRadius?: number
  /** Surface color (default: '#101010') */
  color?: string
  /** Surface type: 'two-sided' (visible from both sides) or 'plane' (single-sided) */
  surfaceType?: GroundPlaneType
  /** Whether to show the grid overlay (default: true) */
  showGrid?: boolean
  /** Grid line color (default: '#3a3a3a') */
  gridColor?: string
  /** Grid cell spacing (default: 1) */
  gridSpacing?: number
  /** Size scale multiplier (1-5, 1 = auto-calculated minimum) */
  sizeScale?: number
  // Note: PBR properties (metallic, roughness, specularIntensity, specularColor)
  // are managed via UniformManager using 'pbr-ground' source
}

/**
 * Calculate the wall distance based on object's bounding sphere.
 * Uses the maximum distance from origin to ensure stable positioning during rotation.
 * The result is rounded to prevent jitter from small vertex position changes.
 *
 * @param vertices - Array of 3D vertices
 * @param offset - Additional distance from the bounding sphere
 * @param minBoundingRadius - Minimum radius to consider (for external objects like raymarched Mandelbulb)
 * @returns Distance for wall positioning (positive value)
 */
function calculateWallDistance(
  vertices: Vector3D[] | undefined,
  offset: number,
  minBoundingRadius?: number
): number {
  // Calculate bounding sphere radius from vertices (max distance from origin)
  // This gives a stable position that doesn't change during rotation
  let maxRadius = 0
  if (vertices && vertices.length > 0) {
    for (const v of vertices) {
      const dist = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
      if (dist > maxRadius) {
        maxRadius = dist
      }
    }
  }

  // Use the larger of calculated radius and minimum bounding radius
  // This ensures walls account for external objects (e.g., raymarched Mandelbulb)
  if (minBoundingRadius !== undefined && minBoundingRadius > maxRadius) {
    maxRadius = minBoundingRadius
  }

  // Default distance when no vertices and no minBoundingRadius
  if (maxRadius === 0) {
    return 2
  }

  // Round to nearest 0.25 to prevent jitter from small position changes
  const roundedRadius = Math.ceil(maxRadius * 4) / 4

  // Return distance from origin
  return roundedRadius + offset
}

/**
 * Calculate appropriate plane size based on object extents.
 *
 * @param vertices - Array of 3D vertices
 * @returns Size for the wall surfaces (width/depth)
 */
function calculatePlaneSize(vertices: Vector3D[] | undefined): number {
  if (!vertices || vertices.length === 0) {
    return 20
  }

  // Find bounding box in X and Z
  let minX = Infinity,
    maxX = -Infinity
  let minZ = Infinity,
    maxZ = -Infinity

  for (const v of vertices) {
    if (v[0] < minX) minX = v[0]
    if (v[0] > maxX) maxX = v[0]
    if (v[2] < minZ) minZ = v[2]
    if (v[2] > maxZ) maxZ = v[2]
  }

  // Calculate max extent and add padding
  const extentX = maxX - minX
  const extentZ = maxZ - minZ
  const maxExtent = Math.max(extentX, extentZ, 4)

  // Return size with generous padding for visual appeal
  return Math.max(maxExtent * 3, 10)
}

/**
 * Lighten a hex color by a percentage for grid section lines.
 *
 * @param hex - Hex color string (e.g., '#3a3a3a')
 * @param percent - Amount to lighten (0-100)
 * @returns Lightened hex color
 */
function lightenColor(hex: string, percent: number): string {
  const color = new Color(hex)
  const hsl = { h: 0, s: 0, l: 0 }
  color.getHSL(hsl)
  hsl.l = Math.min(1, hsl.l + percent / 100)
  color.setHSL(hsl.h, hsl.s, hsl.l)
  return '#' + color.getHexString()
}

/** Configuration for a single wall */
interface WallConfig {
  position: [number, number, number]
  surfaceRotation: [number, number, number]
  gridRotation: [number, number, number]
  /** Offset for grid to prevent z-fighting (in direction of wall normal) */
  gridOffset: [number, number, number]
}

/**
 * Offset to prevent z-fighting between grid and surface.
 */
const Z_OFFSET = 0.05

/**
 * Get wall configuration for a given wall position and distance.
 *
 * PlaneGeometry default: XY plane, normal +Z
 * drei Grid default: XZ plane (horizontal), normal -Y (faces down)
 *
 * @param wall - Wall position type
 * @param distance - Distance from origin
 * @returns Wall configuration with position and rotations
 */
function getWallConfig(wall: WallPosition, distance: number): WallConfig {
  switch (wall) {
    case 'floor':
      // Floor at y=-distance, horizontal, facing up
      // Surface: rotate -90° around X to lay flat (XY -> XZ, normal +Z -> +Y)
      // Grid: flip 180° around X to face up (normal -Y -> +Y)
      // Grid offset: +Y (up, toward interior)
      return {
        position: [0, -distance, 0],
        surfaceRotation: [-Math.PI / 2, 0, 0],
        gridRotation: [Math.PI, 0, 0],
        gridOffset: [0, Z_OFFSET, 0],
      }
    case 'top':
      // Ceiling at y=+distance, horizontal, facing down
      // Surface: rotate +90° around X (XY -> XZ, normal +Z -> -Y)
      // Grid: default faces down, no rotation needed
      // Grid offset: -Y (down, toward interior)
      return {
        position: [0, distance, 0],
        surfaceRotation: [Math.PI / 2, 0, 0],
        gridRotation: [0, 0, 0],
        gridOffset: [0, -Z_OFFSET, 0],
      }
    case 'back':
      // Back wall at z=-distance, vertical (XY plane), facing +Z
      // Surface: no rotation needed (already XY, normal +Z)
      // Grid: rotate -90° around X to stand vertical (XZ -> XY, normal -Y -> +Z)
      // Grid offset: +Z (forward, toward interior)
      return {
        position: [0, 0, -distance],
        surfaceRotation: [0, 0, 0],
        gridRotation: [-Math.PI / 2, 0, 0],
        gridOffset: [0, 0, Z_OFFSET],
      }
    case 'left':
      // Left wall at x=-distance, vertical (YZ plane), facing +X
      // Surface: rotate +90° around Y (XY -> YZ, normal +Z -> +X)
      // Grid: rotate to be vertical in YZ plane facing +X
      // Grid offset: +X (right, toward interior)
      return {
        position: [-distance, 0, 0],
        surfaceRotation: [0, Math.PI / 2, 0],
        gridRotation: [0, 0, Math.PI / 2],
        gridOffset: [Z_OFFSET, 0, 0],
      }
    case 'right':
      // Right wall at x=+distance, vertical (YZ plane), facing -X
      // Surface: rotate -90° around Y (XY -> YZ, normal +Z -> -X)
      // Grid: rotate to be vertical in YZ plane facing -X
      // Grid offset: -X (left, toward interior)
      return {
        position: [distance, 0, 0],
        surfaceRotation: [0, -Math.PI / 2, 0],
        gridRotation: [0, 0, -Math.PI / 2],
        gridOffset: [-Z_OFFSET, 0, 0],
      }
    default:
      return {
        position: [0, -distance, 0],
        surfaceRotation: [-Math.PI / 2, 0, 0],
        gridRotation: [Math.PI, 0, 0],
        gridOffset: [0, Z_OFFSET, 0],
      }
  }
}

/**
 * Renders environment walls with optional grid overlay.
 *
 * The walls automatically position themselves around the object and scale
 * to provide adequate visual coverage. Supports multiple wall positions
 * and two surface types.
 *
 * Uses instanced rendering for the wall surfaces to reduce draw calls.
 * @param root0 - Component props
 * @param root0.vertices - Vertex data for positioning
 * @param root0.offset - Wall offset distance
 * @param root0.activeWalls - Which walls to render
 * @param root0.minBoundingRadius - Minimum bounding radius
 * @param root0.color - Wall color
 * @param root0.surfaceType - Surface material type
 * @param root0.showGrid - Whether to show grid overlay
 * @param root0.gridColor - Grid line color
 * @param root0.gridSpacing - Grid line spacing
 * @param root0.sizeScale - Size scaling factor
 * @returns React element rendering the environment walls
 */
export function GroundPlane({
  vertices,
  offset = 0.5,
  activeWalls = ['floor'],
  minBoundingRadius,
  color = '#101010',
  surfaceType = 'two-sided',
  showGrid = true,
  gridColor = '#3a3a3a',
  gridSpacing = 1,
  sizeScale = 1,
}: GroundPlaneProps) {
  // Calculate position and size based on vertex count (not positions)
  const vertexCount = vertices?.length ?? 0

  const wallDistance = useMemo(
    () => calculateWallDistance(vertices, offset, minBoundingRadius),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vertexCount, offset, minBoundingRadius]
  )

  const basePlaneSize = useMemo(
    () => calculatePlaneSize(vertices),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vertexCount]
  )

  // Apply size scale to the base plane size
  const planeSize = basePlaneSize * sizeScale

  // Calculate grid section color
  const sectionColor = useMemo(() => lightenColor(gridColor, 15), [gridColor])

  // Determine material side
  const side = surfaceType === 'two-sided' ? DoubleSide : FrontSide

  // Callback ref to set layer on wall meshes
  // IMPORTANT: Must be called before any early returns to maintain hook order
  // Floor is on ENVIRONMENT layer (0), NOT SKYBOX layer (2).
  //
  // WHY NOT SKYBOX LAYER:
  // CubemapCapturePass captures SKYBOX layer to create the environment cubemap.
  // If floor is on SKYBOX layer, it would be rendered into the cubemap while
  // potentially sampling from that same cubemap (feedback loop).
  //
  // The floor is rendered by:
  // - ScenePass: [MAIN_OBJECT, ENVIRONMENT, SKYBOX] - includes floor
  // - NormalPass: [ENVIRONMENT] - includes floor for SSAO/edge detection
  const setWallLayer = useCallback((obj: Object3D | null) => {
    if (obj) {
      obj.layers.set(RENDER_LAYERS.ENVIRONMENT)
    }
  }, [])

  // Don't render if no walls are active
  if (!activeWalls || activeWalls.length === 0) {
    return null
  }

  return (
    <>
      {/*
        Wall Surfaces with Custom PBR Shader and Procedural Grid
        Uses same GGX BRDF as other objects for visual consistency.
        Grid is rendered directly in the shader for MRT compatibility.
      */}
      {activeWalls.map((wall) => {
        const config = getWallConfig(wall, wallDistance)
        return (
          <mesh
            key={wall}
            ref={setWallLayer}
            position={config.position}
            rotation={config.surfaceRotation}
            receiveShadow
          >
            <planeGeometry args={[planeSize, planeSize]} />
            {/* PBR properties managed via 'pbr-ground' UniformManager source */}
            <GroundPlaneMaterial
              color={color}
              opacity={1}
              side={side}
              showGrid={showGrid}
              gridColor={gridColor}
              sectionColor={sectionColor}
              gridSpacing={gridSpacing}
              gridFadeDistance={planeSize * 0.5}
              gridFadeStrength={2}
            />
          </mesh>
        )
      })}
    </>
  )
}
