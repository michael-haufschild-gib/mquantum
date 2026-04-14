/**
 * Gizmo interaction hook for the WebGPU scene.
 *
 * Encapsulates the light gizmo drag state machine: translate axis,
 * rotate ring, ground-target drag, and click-to-select. Produces
 * mouse event handlers that the scene component attaches to its overlay.
 *
 * @module rendering/webgpu/useGizmoInteraction
 */

import React, { useCallback, useRef } from 'react'

import { directionToRotation } from '@/rendering/lights/types'
import { useLightingStore } from '@/stores/lightingStore'

import type { WebGPUCamera } from './core/WebGPUCamera'
import {
  computeMouseRay,
  type GizmoDragState,
  gizmoScale,
  rayAxisClosest,
  rayPlaneIntersect,
  testGizmoHit,
  testGroundTargetHit,
} from './utils/gizmoHitTesting'

/** Dependencies injected from the scene component. */
export interface GizmoInteractionDeps {
  cameraRef: React.RefObject<WebGPUCamera | null>
  dimensionRef: React.RefObject<number>
  startInteraction: () => void
  scheduleEndInteraction: () => void
}

/** Return value: mouse event handlers and overlay ref. */
export interface GizmoInteractionHandlers {
  overlayRef: React.RefObject<HTMLDivElement | null>
  handleMouseDown: (e: React.MouseEvent) => void
  handleMouseUp: (e: React.MouseEvent) => void
  handleMouseMove: (e: React.MouseEvent) => void
}

/**
 * Hook that manages light gizmo interaction state and produces mouse handlers.
 *
 * Drag state machine:
 * - mouseDown: test gizmo hit (translate/rotate/ground-target) → enter gizmo drag, or fall through to camera drag
 * - mouseMove: update light position/rotation based on drag kind
 * - mouseUp: commit drag, handle click-to-select
 */
export function useGizmoInteraction(deps: GizmoInteractionDeps): GizmoInteractionHandlers {
  const { cameraRef, dimensionRef, startInteraction, scheduleEndInteraction } = deps

  const isDraggingRef = useRef(false)
  const lastMouseRef = useRef({ x: 0, y: 0 })
  const mouseDownPosRef = useRef({ x: 0, y: 0 })
  const gizmoDragRef = useRef<GizmoDragState | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  // ── mouseDown: test gizmo hit or enter camera drag ──
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      mouseDownPosRef.current = { x: e.clientX, y: e.clientY }
      lastMouseRef.current = { x: e.clientX, y: e.clientY }

      const dragState = tryGizmoDragStart(cameraRef, overlayRef, e)
      if (dragState) {
        gizmoDragRef.current = dragState
        useLightingStore.getState().setIsDraggingLight(true)
        startInteraction()
        return
      }

      isDraggingRef.current = true
      startInteraction()
    },
    [cameraRef, startInteraction]
  )

  // ── mouseUp: commit gizmo drag or handle click-to-select ──
  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      // End gizmo drag if active
      if (gizmoDragRef.current) {
        const wasGizmoClick = isClick(e, mouseDownPosRef.current)

        if (wasGizmoClick && gizmoDragRef.current.kind === 'ground-target') {
          useLightingStore.getState().selectLight(gizmoDragRef.current.lightId)
        }

        gizmoDragRef.current = null
        useLightingStore.getState().setIsDraggingLight(false)
        scheduleEndInteraction()
        return
      }

      const wasClick = isClick(e, mouseDownPosRef.current)

      isDraggingRef.current = false
      scheduleEndInteraction()

      if (!wasClick) return
      handleClickToSelect(cameraRef, overlayRef, e)
    },
    [cameraRef, scheduleEndInteraction]
  )

  // ── mouseMove: gizmo drag or camera orbit/pan ──
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Handle gizmo dragging
      const drag = gizmoDragRef.current
      if (drag) {
        // Require minimum mouse movement before actually dragging
        const movedX = Math.abs(e.clientX - mouseDownPosRef.current.x)
        const movedY = Math.abs(e.clientY - mouseDownPosRef.current.y)
        if (movedX < 3 && movedY < 3) return

        const result = computeRayFromEvent(cameraRef, overlayRef, e)
        if (!result) return

        applyGizmoDrag(drag, result.ray, useLightingStore.getState())
        return
      }

      if (!isDraggingRef.current || !cameraRef.current) return

      const dx = e.clientX - lastMouseRef.current.x
      const dy = e.clientY - lastMouseRef.current.y
      lastMouseRef.current = { x: e.clientX, y: e.clientY }

      if (dimensionRef.current === 2) {
        const panSensitivity = 0.01
        cameraRef.current.pan(-dx * panSensitivity, dy * panSensitivity)
      } else {
        const sensitivity = 0.005
        cameraRef.current.orbit(-dx * sensitivity, -dy * sensitivity)
      }
    },
    [cameraRef, dimensionRef]
  )

  return { overlayRef, handleMouseDown, handleMouseUp, handleMouseMove }
}

// ── Helper: click detection ──

const CLICK_THRESHOLD = 5

/**
 * Check if a mouse event is a click (less than 5px movement from down position).
 */
function isClick(e: React.MouseEvent, downPos: { x: number; y: number }): boolean {
  return (
    Math.abs(e.clientX - downPos.x) < CLICK_THRESHOLD &&
    Math.abs(e.clientY - downPos.y) < CLICK_THRESHOLD
  )
}

// ── Helper: compute ray from camera+overlay ──

/**
 * Compute a mouse ray from the current camera and overlay element.
 * Returns null if camera, overlay, or ray computation fails.
 */
function computeRayFromEvent(
  cameraRef: React.RefObject<WebGPUCamera | null>,
  overlayRef: React.RefObject<HTMLDivElement | null>,
  e: React.MouseEvent
): {
  ray: { origin: [number, number, number]; dir: [number, number, number] }
  matrices: ReturnType<WebGPUCamera['getMatrices']>
} | null {
  if (!cameraRef.current || !overlayRef.current) return null
  const rect = overlayRef.current.getBoundingClientRect()
  const matrices = cameraRef.current.getMatrices()
  const ray = computeMouseRay(e.clientX, e.clientY, rect, matrices)
  if (!ray) return null
  return { ray, matrices }
}

// ── Helper: try gizmo drag start on mouseDown ──

/**
 * Attempt to start a gizmo drag from a mouseDown event.
 * Tests the transform gizmo on the selected light, then ground targets.
 * Returns a GizmoDragState if a gizmo was hit, or null to fall through to camera drag.
 */
function tryGizmoDragStart(
  cameraRef: React.RefObject<WebGPUCamera | null>,
  overlayRef: React.RefObject<HTMLDivElement | null>,
  e: React.MouseEvent
): GizmoDragState | null {
  const result = computeRayFromEvent(cameraRef, overlayRef, e)
  if (!result) return null

  const { ray, matrices } = result
  const lighting = useLightingStore.getState()
  if (!lighting.showLightGizmos || !lighting.lights.length) return null

  const cp = matrices.cameraPosition
  const camPos: [number, number, number] = [cp.x, cp.y, cp.z]

  const transformDrag = tryTransformGizmoHit(ray, lighting, camPos)
  if (transformDrag) return transformDrag

  return tryGroundTargetDrag(ray, lighting)
}

/**
 * Test if the ray hits the transform gizmo on the currently selected light.
 */
function tryTransformGizmoHit(
  ray: { origin: [number, number, number]; dir: [number, number, number] },
  lighting: ReturnType<typeof useLightingStore.getState>,
  camPos: [number, number, number]
): GizmoDragState | null {
  if (!lighting.selectedLightId) return null

  const selLight = lighting.lights.find((l) => l.id === lighting.selectedLightId)
  if (!selLight) return null

  const scale = gizmoScale(selLight.position, camPos)
  const mode = lighting.transformMode || 'translate'
  const hit = testGizmoHit(ray, selLight.position, scale, mode)
  if (!hit) return null

  return {
    kind: hit.kind,
    lightId: selLight.id,
    startLightPos: [...selLight.position],
    startLightRot: [...selLight.rotation],
    startAxisT: hit.axisT,
    startAngle: hit.angle,
    startGroundPos: [0, 0, 0],
    lightType: selLight.type,
  }
}

/**
 * Test if the ray hits a ground target and build the drag state for it.
 */
function tryGroundTargetDrag(
  ray: { origin: [number, number, number]; dir: [number, number, number] },
  lighting: ReturnType<typeof useLightingStore.getState>
): GizmoDragState | null {
  const groundHitId = testGroundTargetHit(ray, lighting.lights)
  if (!groundHitId) return null

  const hitLight = lighting.lights.find((l) => l.id === groundHitId)
  if (!hitLight) return null

  if (lighting.selectedLightId !== groundHitId) {
    lighting.selectLight(groundHitId)
  }

  const groundHit = rayPlaneIntersect(ray.origin, ray.dir, [0, 1, 0], [0, 0, 0])

  return {
    kind: 'ground-target',
    lightId: groundHitId,
    startLightPos: [...hitLight.position],
    startLightRot: [...hitLight.rotation],
    startAxisT: 0,
    startAngle: 0,
    startGroundPos: groundHit ?? [0, 0, 0],
    lightType: hitLight.type,
  }
}

// ── Helper: click-to-select on mouseUp ──

const LIGHT_HIT_RADIUS = 0.5

/**
 * Find the closest light hit by a ray-sphere intersection test.
 */
function findClosestLightHit(
  ray: { origin: [number, number, number]; dir: [number, number, number] },
  lights: Array<{ id: string; position: [number, number, number] }>
): string | null {
  let closestDist = Infinity
  let closestId: string | null = null

  for (const light of lights) {
    const lp = light.position
    const ocX = lp[0] - ray.origin[0]
    const ocY = lp[1] - ray.origin[1]
    const ocZ = lp[2] - ray.origin[2]
    const tca = ocX * ray.dir[0] + ocY * ray.dir[1] + ocZ * ray.dir[2]
    if (tca < 0) continue
    const ocLenSq = ocX ** 2 + ocY ** 2 + ocZ ** 2
    const d2 = ocLenSq - tca * tca
    const dist = Math.sqrt(ocLenSq)
    const scaledRadius = Math.max(LIGHT_HIT_RADIUS, dist * 0.05)
    if (d2 > scaledRadius * scaledRadius) continue
    if (tca < closestDist) {
      closestDist = tca
      closestId = light.id
    }
  }

  return closestId
}

/**
 * Handle click-to-select a light gizmo on mouseUp.
 */
function handleClickToSelect(
  cameraRef: React.RefObject<WebGPUCamera | null>,
  overlayRef: React.RefObject<HTMLDivElement | null>,
  e: React.MouseEvent
): void {
  const result = computeRayFromEvent(cameraRef, overlayRef, e)
  if (!result) return

  const lighting = useLightingStore.getState()
  if (!lighting.showLightGizmos || !lighting.lights.length) return

  const closestId = findClosestLightHit(result.ray, lighting.lights)
  lighting.selectLight(closestId)
}

// ── Gizmo drag application (pure logic, no hooks) ──

interface GizmoDragRay {
  origin: [number, number, number]
  dir: [number, number, number]
}

interface LightingActions {
  updateLight: (id: string, update: Record<string, unknown>) => void
}

/** Axis index lookup for translate/rotate drag kinds. */
const DRAG_AXIS_INDEX: Record<string, number> = {
  'translate-x': 0,
  'translate-y': 1,
  'translate-z': 2,
  'rotate-x': 0,
  'rotate-y': 1,
  'rotate-z': 2,
}

/**
 * Apply a single frame of gizmo drag to the lighting store.
 *
 * Extracted to keep the useCallback body small and testable.
 */
function applyGizmoDrag(drag: GizmoDragState, ray: GizmoDragRay, lighting: LightingActions): void {
  if (drag.kind.startsWith('translate-')) {
    applyTranslateDrag(drag, ray, lighting)
  } else if (drag.kind.startsWith('rotate-')) {
    applyRotateDrag(drag, ray, lighting)
  } else if (drag.kind === 'ground-target') {
    applyGroundTargetDrag(drag, ray, lighting)
  }
}

/** Apply translate axis drag. */
function applyTranslateDrag(
  drag: GizmoDragState,
  ray: GizmoDragRay,
  lighting: LightingActions
): void {
  const axisIdx = DRAG_AXIS_INDEX[drag.kind]!
  const axisDir: [number, number, number] = [0, 0, 0]
  axisDir[axisIdx] = 1

  const [currentT] = rayAxisClosest(ray.origin, ray.dir, drag.startLightPos, axisDir)
  const delta = currentT - drag.startAxisT

  const newPos: [number, number, number] = [...drag.startLightPos]
  newPos[axisIdx as 0 | 1 | 2] += delta
  lighting.updateLight(drag.lightId, { position: newPos })
}

/** Compute the angle on a ring plane given the axis index and displacement from center. */
function ringAngle(axisIdx: number, dx: number, dy: number, dz: number): number {
  if (axisIdx === 0) return Math.atan2(dz, dy)
  if (axisIdx === 1) return Math.atan2(dx, dz)
  return Math.atan2(dy, dx)
}

/** Apply rotate ring drag. */
function applyRotateDrag(drag: GizmoDragState, ray: GizmoDragRay, lighting: LightingActions): void {
  const axisIdx = DRAG_AXIS_INDEX[drag.kind]!
  const normal: [number, number, number] = [0, 0, 0]
  normal[axisIdx] = 1

  const hit = rayPlaneIntersect(ray.origin, ray.dir, normal, drag.startLightPos)
  if (!hit) return

  const dx = hit[0] - drag.startLightPos[0]
  const dy = hit[1] - drag.startLightPos[1]
  const dz = hit[2] - drag.startLightPos[2]

  const currentAngle = ringAngle(axisIdx, dx, dy, dz)
  const rawDelta = currentAngle - drag.startAngle
  const deltaAngle = Math.atan2(Math.sin(rawDelta), Math.cos(rawDelta))

  const newRot: [number, number, number] = [...drag.startLightRot]
  newRot[axisIdx as 0 | 1 | 2] += deltaAngle
  lighting.updateLight(drag.lightId, { rotation: newRot })
}

/** Apply ground target drag (point lights move XZ, directional/spot lights rotate toward target). */
function applyGroundTargetDrag(
  drag: GizmoDragState,
  ray: GizmoDragRay,
  lighting: LightingActions
): void {
  const groundHit = rayPlaneIntersect(ray.origin, ray.dir, [0, 1, 0], [0, 0, 0])
  if (!groundHit) return

  if (drag.lightType === 'point') {
    lighting.updateLight(drag.lightId, {
      position: [groundHit[0], drag.startLightPos[1], groundHit[2]],
    })
    return
  }

  const lp = drag.startLightPos
  const dirX = groundHit[0] - lp[0]
  const dirY = groundHit[1] - lp[1]
  const dirZ = groundHit[2] - lp[2]
  const dirLen = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ)
  if (dirLen > 0.01) {
    const newRot = directionToRotation([dirX / dirLen, dirY / dirLen, dirZ / dirLen])
    lighting.updateLight(drag.lightId, { rotation: newRot })
  }
}
