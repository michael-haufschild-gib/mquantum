/**
 * Scene Component
 *
 * Provides the Three.js scene foundation with lighting, camera, post-processing,
 * and ground plane. Delegates all object rendering to UnifiedRenderer.
 *
 * Architecture:
 * - Scene: Lighting, camera, effects, ground plane
 * - UnifiedRenderer: Routes to appropriate high-performance renderer
 */

import { DebugLayerGroup } from '@/components/canvas/DebugLayerGroup'
import { useSmoothResizing } from '@/hooks/useSmoothResizing'
import { useViewportOffset } from '@/hooks/useViewportOffset'
import { useWebGLCleanup } from '@/hooks/useWebGLCleanup'
import type { Face } from '@/lib/geometry/faces'
import type { NdGeometry, ObjectType } from '@/lib/geometry/types'
import type { Vector3D } from '@/lib/math/types'
import { CameraController } from '@/rendering/controllers/CameraController'
import { LightGizmoManager } from '@/rendering/controllers/LightGizmoManager'
import { PerformanceManager } from '@/rendering/controllers/PerformanceManager'
import { GroundPlane } from '@/rendering/environment/GroundPlane'
import { PostProcessingV2 } from '@/rendering/environment/PostProcessingV2'
import { SceneLighting } from '@/rendering/environment/SceneLighting'
import { Skybox } from '@/rendering/environment/Skybox'
import { UnifiedRenderer } from '@/rendering/renderers/UnifiedRenderer'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useUIStore } from '@/stores/uiStore'
import React from 'react'
import { useShallow } from 'zustand/react/shallow'

/**
 * Props for the Scene component.
 */
export interface SceneProps {
  /** Generated geometry containing vertices, edges, and metadata (optional during loading) */
  geometry: NdGeometry | null
  /** Current dimension of the object */
  dimension: number
  /** Type of object being rendered */
  objectType: ObjectType
  /** Detected faces for surface rendering */
  faces?: Face[]
  /** Per-face depth values for palette coloring */
  faceDepths?: number[]
  /** 3D projected vertices for ground plane positioning */
  projectedVertices?: Vector3D[]
  /** Enable auto-rotation (default: false) */
  autoRotate?: boolean
  /** Overall opacity (default: 1.0) */
  opacity?: number
  /**
   * Minimum bounding radius for ground plane positioning.
   * Used when raymarched objects need to be accounted for.
   */
  minBoundingRadius?: number
}

/**
 * Main Three.js scene component.
 *
 * Provides the scene foundation and delegates rendering to UnifiedRenderer.
 * All object rendering uses useFrame for high-performance animation.
 */
export const Scene = React.memo(function Scene({
  geometry,
  dimension,
  objectType,
  faces,
  faceDepths,
  projectedVertices,
  autoRotate = false,
  opacity = 1.0,
  minBoundingRadius,
}: SceneProps) {
  // Get environment settings with shallow comparison
  // Note: PBR properties (roughness, metallic, specularIntensity, specularColor)
  // are now managed via UniformManager using 'pbr-ground' source
  const {
    activeWalls,
    groundPlaneOffset,
    groundPlaneColor,
    groundPlaneType,
    groundPlaneSizeScale,
    showGroundGrid,
    groundGridColor,
    groundGridSpacing,
  } = useEnvironmentStore(
    useShallow((state) => ({
      activeWalls: state.activeWalls,
      groundPlaneOffset: state.groundPlaneOffset,
      groundPlaneColor: state.groundPlaneColor,
      groundPlaneType: state.groundPlaneType,
      groundPlaneSizeScale: state.groundPlaneSizeScale,
      showGroundGrid: state.showGroundGrid,
      groundGridColor: state.groundGridColor,
      groundGridSpacing: state.groundGridSpacing,
    }))
  )

  const showAxisHelper = useUIStore((state) => state.showAxisHelper)

  // Handle camera viewport offset for smooth sidebar animations
  useViewportOffset()

  // Handle smooth resizing for browser chrome changes (fullscreen)
  useSmoothResizing()

  // Clean up WebGL state during scene transitions to prevent memory accumulation
  useWebGLCleanup()

  return (
    <>
      {/* Performance optimization manager */}
      <PerformanceManager />

      {/* Skybox Environment */}
      <Skybox />

      {/* Scene lighting from visual store */}
      <SceneLighting />

      {/* Light gizmos for manipulating lights */}
      <LightGizmoManager />

      {/* Post-processing effects (Render Graph V2) */}
      <PostProcessingV2 />

      {/* Camera controls */}
      <CameraController autoRotate={autoRotate} />

      {/* Axis helper for orientation reference (DEBUG layer for MRT compatibility) */}
      {showAxisHelper && (
        <DebugLayerGroup>
          <axesHelper args={[5]} />
        </DebugLayerGroup>
      )}

      {/* Unified renderer for all object types - MUST render before GroundPlane */}
      {/* The floor's shader compilation can block main thread; hypercube needs to schedule its */}
      {/* deferred material creation first */}
      {/* Only render when geometry is available - during loading, scene shows environment only */}
      {geometry && (
        <UnifiedRenderer
          geometry={geometry}
          dimension={dimension}
          objectType={objectType}
          faces={faces}
          faceDepths={faceDepths}
          opacity={opacity}
        />
      )}

      {/* Environment walls with optional grid overlay */}
      {/* PBR properties managed via 'pbr-ground' UniformManager source */}
      <GroundPlane
        vertices={projectedVertices}
        offset={groundPlaneOffset}
        activeWalls={activeWalls}
        minBoundingRadius={minBoundingRadius}
        color={groundPlaneColor}
        surfaceType={groundPlaneType}
        sizeScale={groundPlaneSizeScale}
        showGrid={showGroundGrid}
        gridColor={groundGridColor}
        gridSpacing={groundGridSpacing}
      />
    </>
  )
})
