/**
 * Gizmo interaction hook for the WebGPU scene.
 *
 * Encapsulates the light gizmo drag state machine: translate axis,
 * rotate ring, ground-target drag, and click-to-select. Produces
 * pointer event handlers that the scene component attaches to its overlay.
 *
 * Uses Pointer Events with `setPointerCapture` so drag state survives the
 * cursor leaving the overlay, releasing off-element, or the window losing
 * focus — the failure modes that previously stranded `lastMouseRef` and
 * caused the camera to leap by hundreds of degrees on the next move.
 *
 * @module rendering/webgpu/useGizmoInteraction
 */

import React, { useCallback, useEffect, useRef } from 'react'

import { directionToRotation } from '@/lib/lighting/lightSource'
import { useLightingStore } from '@/stores/scene/lightingStore'

import type { WebGPUCamera } from './core/WebGPUCamera'
import {
  computeMouseRay,
  computeRotateDragRotation,
  computeTranslateDragPosition,
  type GizmoDragState,
  gizmoScale,
  rayPlaneIntersect,
  testGizmoHit,
  testGroundTargetHit,
} from './utils/gizmoHitTesting'

/** Dependencies injected from the scene component. */
export interface GizmoInteractionDeps {
  cameraRef: React.RefObject<WebGPUCamera | null>
  dimensionRef: React.RefObject<number>
}

/** Return value: pointer event handlers and overlay ref. */
export interface GizmoInteractionHandlers {
  overlayRef: React.RefObject<HTMLDivElement | null>
  handlePointerDown: (e: React.PointerEvent) => void
  handlePointerUp: (e: React.PointerEvent) => void
  handlePointerMove: (e: React.PointerEvent) => void
  handlePointerCancel: (e: React.PointerEvent) => void
}

/**
 * Hook that manages light gizmo interaction state and produces pointer handlers.
 *
 * Drag state machine:
 * - pointerDown: capture pointer, test gizmo hit (translate/rotate/ground-target) → enter gizmo drag, or fall through to camera drag
 * - pointerMove: update light position/rotation based on drag kind, or orbit/pan camera
 * - pointerUp: release capture, commit drag, handle click-to-select
 * - pointerCancel: release capture, abort drag without commit
 */
export function useGizmoInteraction(deps: GizmoInteractionDeps): GizmoInteractionHandlers {
  const { cameraRef, dimensionRef } = deps

  const isDraggingRef = useRef(false)
  const lastMouseRef = useRef({ x: 0, y: 0 })
  const mouseDownPosRef = useRef({ x: 0, y: 0 })
  const gizmoDragRef = useRef<GizmoDragState | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Track the pointer that opened the active drag. Secondary contacts
  // (a second touch, a stylus while a finger is down) must not overwrite
  // the baseline or end the first drag — otherwise multi-touch behaves
  // erratically. `null` means no drag is in progress.
  const activePointerIdRef = useRef<number | null>(null)

  // Set when the cursor leaves the document (top/bottom of the screen on
  // desktop, where the canvas is full-bleed). The next pointermove after
  // re-entry must NOT apply orbit — between the leave and the re-entry the
  // cursor moved freely off-screen, so the delta computed against
  // `lastMouseRef` would jerk the camera by an arbitrary amount. Instead we
  // re-baseline `lastMouseRef` to the new position and skip the orbit for
  // exactly that one event. Without this, vertical drags felt like a
  // "reset" near the top/bottom of the screen.
  const cursorOutsideDocumentRef = useRef(false)

  // Abort any in-flight drag without committing — used by pointercancel and
  // the window-blur safety net. Without this, a missed pointerup leaves
  // `isDraggingRef === true` and the next pointermove computes a stale
  // delta from the now-far-away `lastMouseRef`, jumping the camera.
  const abortDrag = useCallback(() => {
    if (gizmoDragRef.current) {
      gizmoDragRef.current = null
      useLightingStore.getState().setIsDraggingLight(false)
    }
    if (isDraggingRef.current) {
      isDraggingRef.current = false
    }
    cursorOutsideDocumentRef.current = false
    activePointerIdRef.current = null
  }, [])

  // Window-blur safeguard: some browsers (notably Safari historically) do not
  // emit pointercancel reliably on focus loss, so we mirror the abort here.
  useEffect(() => {
    const handleBlur = () => abortDrag()
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('blur', handleBlur)
    }
  }, [abortDrag])

  // Document-level cursor leave: fires when the cursor exits the viewport
  // (top, bottom, or sides of the screen on a full-bleed canvas). With
  // pointer capture the drag stays alive, but pointermove events stop until
  // the cursor returns. We mark the next pointermove as "gap recovery" so
  // it re-baselines `lastMouseRef` instead of orbiting by an off-screen
  // delta. Listened on `document.documentElement` because that is the
  // element whose `mouseleave` fires when the cursor exits the viewport.
  useEffect(() => {
    const root = document.documentElement
    const handleDocLeave = () => {
      if (isDraggingRef.current || gizmoDragRef.current) {
        cursorOutsideDocumentRef.current = true
      }
    }
    root.addEventListener('mouseleave', handleDocLeave)
    return () => {
      root.removeEventListener('mouseleave', handleDocLeave)
    }
  }, [])

  // ── pointerDown: capture pointer, test gizmo hit or enter camera drag ──
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return
      // Ignore secondary contacts while a drag is already in flight.
      if (activePointerIdRef.current !== null) return

      activePointerIdRef.current = e.pointerId
      mouseDownPosRef.current = { x: e.clientX, y: e.clientY }
      lastMouseRef.current = { x: e.clientX, y: e.clientY }

      // Capture the pointer so subsequent move/up/cancel events route here
      // even when the cursor leaves the overlay or the user releases over
      // a panel. Wrap in try/catch — capture can throw on detached nodes.
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // Capture not available (jsdom/happy-dom in tests, or detached node).
        // Drag still works for events delivered to this element.
      }

      const dragState = tryGizmoDragStart(cameraRef, overlayRef, e)
      if (dragState) {
        gizmoDragRef.current = dragState
        useLightingStore.getState().setIsDraggingLight(true)
        return
      }

      isDraggingRef.current = true
    },
    [cameraRef]
  )

  // ── pointerUp: release capture, commit gizmo drag or handle click-to-select ──
  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (activePointerIdRef.current === null) return
      // Ignore secondary contacts — only the pointer that opened the drag
      // ends it. A stray pointerup from a competing finger/stylus would
      // otherwise terminate the in-flight drag mid-gesture.
      if (e.pointerId !== activePointerIdRef.current) return
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // Already released or never captured — safe to ignore.
      }

      // End gizmo drag if active
      if (gizmoDragRef.current) {
        const wasGizmoClick = isClick(e, mouseDownPosRef.current)

        if (wasGizmoClick && gizmoDragRef.current.kind === 'ground-target') {
          useLightingStore.getState().selectLight(gizmoDragRef.current.lightId)
        }

        gizmoDragRef.current = null
        useLightingStore.getState().setIsDraggingLight(false)
        activePointerIdRef.current = null
        return
      }

      const wasClick = isClick(e, mouseDownPosRef.current)

      isDraggingRef.current = false
      activePointerIdRef.current = null

      if (!wasClick) return
      handleClickToSelect(cameraRef, overlayRef, e)
    },
    [cameraRef]
  )

  // ── pointerCancel: capture interrupted (focus loss, OS gesture). Abort drag. ──
  const handlePointerCancel = useCallback(
    (e: React.PointerEvent) => {
      if (activePointerIdRef.current === null) return
      // Cancel only when the active pointer is the one being cancelled.
      if (e.pointerId !== activePointerIdRef.current) return
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // Already released — safe to ignore.
      }
      abortDrag()
    },
    [abortDrag]
  )

  // ── pointerMove: gizmo drag or camera orbit/pan ──
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      // Ignore moves from a different pointer while a drag is active —
      // a secondary contact would otherwise overwrite lastMouseRef and
      // jump the camera once the active drag delta is recomputed.
      if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) {
        return
      }
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

      // Gap recovery: cursor returned from off-document. Re-baseline without
      // applying the off-screen delta — that delta represents OS-level cursor
      // motion the user made outside the viewport, not intent to rotate.
      if (cursorOutsideDocumentRef.current) {
        cursorOutsideDocumentRef.current = false
        lastMouseRef.current = { x: e.clientX, y: e.clientY }
        return
      }

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

  return {
    overlayRef,
    handlePointerDown,
    handlePointerUp,
    handlePointerMove,
    handlePointerCancel,
  }
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
  const newPos = computeTranslateDragPosition(drag, ray)
  if (!newPos) return
  lighting.updateLight(drag.lightId, { position: newPos })
}

/** Apply rotate ring drag. */
function applyRotateDrag(drag: GizmoDragState, ray: GizmoDragRay, lighting: LightingActions): void {
  const newRot = computeRotateDragRotation(drag, ray)
  if (!newRot) return
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
