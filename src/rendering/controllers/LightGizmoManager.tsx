/**
 * Light Gizmo Manager Component
 *
 * Orchestrates the rendering of light gizmos and transform controls.
 * Manages selection state and syncs transforms back to the store.
 *
 * Features:
 * - Renders LightGizmo for each light in the store
 * - Handles TransformControls for selected light (translate/rotate modes)
 * - Syncs transform changes back to lightingStore
 * - Respects showLightGizmos toggle
 *
 * RENDER LAYER:
 * All gizmos are rendered on RENDER_LAYERS.DEBUG, which is processed by
 * DebugOverlayPass AFTER all post-processing. This allows standard Three.js
 * materials (MeshBasicMaterial, LineBasicMaterial, ArrowHelper, TransformControls)
 * to render without needing MRT-compatible shaders.
 */

import { memo, useRef, useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { TransformControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RENDER_LAYERS } from '@/rendering/core/layers'
import { useLightingStore } from '@/stores/lightingStore'
import { LightGizmo } from '@/components/canvas/gizmos/LightGizmo'
import { LightGroundVisualization } from '@/components/canvas/gizmos/LightGroundVisualization'
import type { LightSource, TransformMode } from '@/rendering/lights/types'

/**
 * Transform target component - handles ref setup for TransformControls
 * Separated to properly handle ref lifecycle
 */
interface TransformTargetProps {
  light: LightSource
  mode: TransformMode
  onTransformChange: (
    position: [number, number, number],
    rotation: [number, number, number]
  ) => void
  onDragStart: () => void
  onDragEnd: () => void
}

const TransformTarget = memo(function TransformTarget({
  light,
  mode,
  onTransformChange,
  onDragStart,
  onDragEnd,
}: TransformTargetProps) {
  const targetRef = useRef<THREE.Group>(null)
  // Use state to trigger re-render after ref is attached
  const [isReady, setIsReady] = useState(false)

  // Use layoutEffect for synchronous setup before first paint
  useLayoutEffect(() => {
    if (targetRef.current) {
      setIsReady(true)
    }
  }, [])

  // Update target position/rotation when light changes
  useLayoutEffect(() => {
    if (targetRef.current) {
      targetRef.current.position.set(light.position[0], light.position[1], light.position[2])
      targetRef.current.rotation.set(light.rotation[0], light.rotation[1], light.rotation[2])
    }
  }, [light.position, light.rotation])

  // Handle transform change
  const handleChange = useCallback(() => {
    if (!targetRef.current) return

    const obj = targetRef.current
    onTransformChange(
      [obj.position.x, obj.position.y, obj.position.z],
      [obj.rotation.x, obj.rotation.y, obj.rotation.z]
    )
  }, [onTransformChange])

  // Handle mouse down (drag start)
  const handleMouseDown = useCallback(() => {
    onDragStart()
  }, [onDragStart])

  // Handle mouse up (drag end)
  const handleMouseUp = useCallback(() => {
    onDragEnd()
  }, [onDragEnd])

  return (
    <>
      <group
        ref={targetRef}
        position={[light.position[0], light.position[1], light.position[2]]}
        rotation={[light.rotation[0], light.rotation[1], light.rotation[2]]}
      />
      {isReady && targetRef.current && (
        <TransformControls
          object={targetRef.current}
          mode={mode}
          onObjectChange={handleChange}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          size={0.5}
        />
      )}
    </>
  )
})

/**
 * Light Gizmo Manager - Main orchestrator for light gizmos
 */
export const LightGizmoManager = memo(function LightGizmoManager() {
  const { camera } = useThree()

  // Enable DEBUG layer on camera for raycasting/interaction.
  // R3F's event system uses camera.layers to filter raycast targets.
  // Without this, objects on layer 4 (DEBUG) wouldn't receive click events.
  // Note: This doesn't affect rendering - each render pass controls camera layers independently.
  useEffect(() => {
    camera.layers.enable(RENDER_LAYERS.DEBUG)
    return () => {
      camera.layers.disable(RENDER_LAYERS.DEBUG)
    }
  }, [camera])

  // Get state from store
  const lights = useLightingStore((state) => state.lights)
  const selectedLightId = useLightingStore((state) => state.selectedLightId)
  const transformMode = useLightingStore((state) => state.transformMode)
  const showLightGizmos = useLightingStore((state) => state.showLightGizmos)
  const isDraggingLight = useLightingStore((state) => state.isDraggingLight)
  const selectLight = useLightingStore((state) => state.selectLight)
  const updateLight = useLightingStore((state) => state.updateLight)
  const setIsDraggingLight = useLightingStore((state) => state.setIsDraggingLight)

  // Find selected light
  const selectedLight = lights.find((l) => l.id === selectedLightId)

  // Handle selection
  const handleSelect = useCallback(
    (lightId: string) => {
      selectLight(lightId)
    },
    [selectLight]
  )

  // Handle transform change from TransformTarget
  const handleTransformChange = useCallback(
    (position: [number, number, number], rotation: [number, number, number]) => {
      if (!selectedLightId) return

      if (transformMode === 'translate') {
        updateLight(selectedLightId, { position })
      } else if (transformMode === 'rotate') {
        updateLight(selectedLightId, { rotation })
      }
    },
    [selectedLightId, transformMode, updateLight]
  )

  // Handle drag start - disable camera controls
  const handleDragStart = useCallback(() => {
    setIsDraggingLight(true)
  }, [setIsDraggingLight])

  // Handle drag end - re-enable camera controls
  const handleDragEnd = useCallback(() => {
    setIsDraggingLight(false)
  }, [setIsDraggingLight])

  // Handle rotation change from ground visualization drag (spot/directional lights)
  const handleGroundRotationChange = useCallback(
    (lightId: string, rotation: [number, number, number]) => {
      updateLight(lightId, { rotation })
    },
    [updateLight]
  )

  // Handle position change from ground visualization drag (point lights)
  const handleGroundPositionChange = useCallback(
    (lightId: string, position: [number, number, number]) => {
      updateLight(lightId, { position })
    },
    [updateLight]
  )

  // Reset isDraggingLight when gizmos are hidden to prevent stuck state
  useEffect(() => {
    if (!showLightGizmos) {
      setIsDraggingLight(false)
    }
  }, [showLightGizmos, setIsDraggingLight])

  // Ref to set DEBUG layer on all gizmo objects
  const gizmoGroupRef = useRef<THREE.Group>(null)

  // Set DEBUG layer on all gizmo objects (recursive)
  // CRITICAL: useLayoutEffect ensures layers are set BEFORE first paint, preventing
  // objects from rendering on the wrong layer for even a single frame. This avoids
  // GL_INVALID_OPERATION errors when MRT passes render objects with non-MRT materials.
  // No dependency array = runs every render to catch dynamically added children
  // (like TransformControls internal meshes).
  useLayoutEffect(() => {
    if (gizmoGroupRef.current) {
      gizmoGroupRef.current.traverse((obj) => {
        obj.layers.set(RENDER_LAYERS.DEBUG)
      })
    }
  })

  // Don't render if gizmos are hidden
  if (!showLightGizmos) {
    return null
  }

  return (
    <group ref={gizmoGroupRef}>
      {/* Render gizmos for all lights */}
      {lights.map((light) => (
        <LightGizmo
          key={light.id}
          light={light}
          isSelected={light.id === selectedLightId}
          onSelect={() => handleSelect(light.id)}
        />
      ))}

      {/* Render ground visualizations for all light types */}
      {lights.map((light) => (
        <LightGroundVisualization
          key={`ground-vis-${light.id}`}
          light={light}
          isSelected={light.id === selectedLightId}
          isDragging={isDraggingLight}
          onRotationChange={(rotation: [number, number, number]) =>
            handleGroundRotationChange(light.id, rotation)
          }
          onPositionChange={(position: [number, number, number]) =>
            handleGroundPositionChange(light.id, position)
          }
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onSelect={() => handleSelect(light.id)}
        />
      ))}

      {/* Transform controls for selected light */}
      {selectedLight && (
        <TransformTarget
          key={selectedLightId}
          light={selectedLight}
          mode={transformMode}
          onTransformChange={handleTransformChange}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        />
      )}
    </group>
  )
})

export default LightGizmoManager
