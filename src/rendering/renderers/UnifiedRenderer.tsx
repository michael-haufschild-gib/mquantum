/**
 * Unified Renderer Entry Point
 *
 * Single component that determines render mode and delegates to the appropriate
 * high-performance useFrame-based renderer.
 *
 * Render modes:
 * - polytope: Traditional polytopes (hypercube, simplex, cross-polytope) with faces/edges/vertices
 * - raymarch-mandelbulb: Raymarched 3D-11D surfaces (unified Mandelbulb for all dimensions)
 *
 * All renderers use useFrame for transformations, reading from stores via getState()
 * to bypass React's render cycle completely during animation.
 */

import type { Face } from '@/lib/geometry/faces'
import type { NdGeometry, ObjectType } from '@/lib/geometry/types'
import { useAppearanceStore } from '@/stores/appearanceStore'
import React, { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { BlackHoleMesh } from './BlackHole'
import MandelbulbMesh from './Mandelbulb/MandelbulbMesh'
import { PolytopeScene } from './Polytope'
import QuaternionJuliaMesh from './QuaternionJulia/QuaternionJuliaMesh'
import SchroedingerMesh from './Schroedinger/SchroedingerMesh'
import { determineRenderMode } from './utils'

/**
 * Props for UnifiedRenderer
 */
export interface UnifiedRendererProps {
  /** Generated geometry containing vertices, edges, and metadata */
  geometry: NdGeometry
  /** Current dimension of the object */
  dimension: number
  /** Type of object being rendered */
  objectType: ObjectType
  /** Detected faces for surface rendering (polytopes only) */
  faces?: Face[]
  /** Per-face depth values for palette coloring (polytopes only) */
  faceDepths?: number[]
  /** Overall opacity (default: 1.0) */
  opacity?: number
}

/**
 * Unified renderer that delegates to appropriate high-performance renderer.
 *
 * Benefits:
 * - Single entry point for all rendering
 * - Clean separation of render modes
 * - All renderers use useFrame for zero React re-renders during animation
 * - Consistent architecture across object types
 */
export const UnifiedRenderer = React.memo(function UnifiedRenderer({
  geometry,
  dimension,
  objectType,
  faces = [],
  faceDepths = [],
  opacity = 1.0,
}: UnifiedRendererProps) {
  // Get facesVisible from store to determine raymarch mode
  const facesVisible = useAppearanceStore(useShallow((state) => state.facesVisible))

  // Determine render mode
  const renderMode = useMemo(
    () => determineRenderMode(geometry, objectType, dimension, facesVisible),
    [geometry, objectType, dimension, facesVisible]
  )

  // Type assertion for edges (no computation needed, just cast)
  const edges = geometry.edges as [number, number][]

  return (
    <>
      {/* Polytope rendering (hypercube, simplex, cross-polytope) */}
      {renderMode === 'polytope' && (
        <PolytopeScene
          baseVertices={geometry.vertices}
          edges={edges}
          faces={faces}
          dimension={dimension}
          faceDepths={faceDepths}
          opacity={opacity}
        />
      )}

      {/* Raymarched 3D-11D Mandelbulb/Mandelbulb surface (unified renderer) */}
      {renderMode === 'raymarch-mandelbulb' && <MandelbulbMesh />}

      {/* Raymarched 3D-11D Quaternion Julia */}
      {renderMode === 'raymarch-quaternion-julia' && <QuaternionJuliaMesh />}

      {/* Raymarched 3D-11D Schroedinger */}
      {renderMode === 'raymarch-schroedinger' && <SchroedingerMesh />}

      {/* Raymarched 3D-11D Black Hole */}
      {renderMode === 'raymarch-blackhole' && <BlackHoleMesh />}
    </>
  )
})
