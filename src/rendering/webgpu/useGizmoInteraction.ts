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

      // Test gizmo hit before entering camera drag
      if (cameraRef.current && overlayRef.current) {
        const lighting = useLightingStore.getState()
        if (lighting.showLightGizmos && lighting.lights.length) {
          const rect = overlayRef.current.getBoundingClientRect()
          const matrices = cameraRef.current.getMatrices()
          const ray = computeMouseRay(e.clientX, e.clientY, rect, matrices)

          if (ray) {
            const cp = matrices.cameraPosition
            const camPos: [number, number, number] = [cp.x, cp.y, cp.z]

            // Test transform gizmo on selected light
            if (lighting.selectedLightId) {
              const selLight = lighting.lights.find((l) => l.id === lighting.selectedLightId)
              if (selLight) {
                const scale = gizmoScale(selLight.position, camPos)
                const mode = lighting.transformMode || 'translate'
                const hit = testGizmoHit(ray, selLight.position, scale, mode)

                if (hit) {
                  gizmoDragRef.current = {
                    kind: hit.kind,
                    lightId: selLight.id,
                    startLightPos: [...selLight.position],
                    startLightRot: [...selLight.rotation],
                    startAxisT: hit.axisT,
                    startAngle: hit.angle,
                    startGroundPos: [0, 0, 0],
                    lightType: selLight.type,
                  }
                  lighting.setIsDraggingLight(true)
                  startInteraction()
                  return
                }
              }
            }

            // Test ground target hit
            const groundHitId = testGroundTargetHit(ray, lighting.lights)
            if (groundHitId) {
              const hitLight = lighting.lights.find((l) => l.id === groundHitId)
              if (hitLight) {
                if (lighting.selectedLightId !== groundHitId) {
                  lighting.selectLight(groundHitId)
                }

                const groundHit = rayPlaneIntersect(ray.origin, ray.dir, [0, 1, 0], [0, 0, 0])

                gizmoDragRef.current = {
                  kind: 'ground-target',
                  lightId: groundHitId,
                  startLightPos: [...hitLight.position],
                  startLightRot: [...hitLight.rotation],
                  startAxisT: 0,
                  startAngle: 0,
                  startGroundPos: groundHit ?? [0, 0, 0],
                  lightType: hitLight.type,
                }
                lighting.setIsDraggingLight(true)
                startInteraction()
                return
              }
            }
          }
        }
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
        const wasGizmoClick =
          Math.abs(e.clientX - mouseDownPosRef.current.x) < 5 &&
          Math.abs(e.clientY - mouseDownPosRef.current.y) < 5

        if (wasGizmoClick && gizmoDragRef.current.kind === 'ground-target') {
          useLightingStore.getState().selectLight(gizmoDragRef.current.lightId)
        }

        gizmoDragRef.current = null
        useLightingStore.getState().setIsDraggingLight(false)
        scheduleEndInteraction()
        return
      }

      const wasClick =
        Math.abs(e.clientX - mouseDownPosRef.current.x) < 5 &&
        Math.abs(e.clientY - mouseDownPosRef.current.y) < 5

      isDraggingRef.current = false
      scheduleEndInteraction()

      // Click-to-select light gizmo
      if (wasClick && cameraRef.current && overlayRef.current) {
        const lighting = useLightingStore.getState()
        if (!lighting.showLightGizmos || !lighting.lights.length) return

        const rect = overlayRef.current.getBoundingClientRect()
        const matrices = cameraRef.current.getMatrices()
        const ray = computeMouseRay(e.clientX, e.clientY, rect, matrices)
        if (!ray) return

        // Test ray-sphere intersection against each light
        let closestDist = Infinity
        let closestId: string | null = null
        const hitRadius = 0.5

        for (const light of lighting.lights) {
          const lp = light.position
          const ocX = lp[0] - ray.origin[0]
          const ocY = lp[1] - ray.origin[1]
          const ocZ = lp[2] - ray.origin[2]
          const tca = ocX * ray.dir[0] + ocY * ray.dir[1] + ocZ * ray.dir[2]
          if (tca < 0) continue
          const ocLenSq = ocX ** 2 + ocY ** 2 + ocZ ** 2
          const d2 = ocLenSq - tca * tca
          const dist = Math.sqrt(ocLenSq)
          const scaledRadius = Math.max(hitRadius, dist * 0.05)
          if (d2 > scaledRadius * scaledRadius) continue
          if (tca < closestDist) {
            closestDist = tca
            closestId = light.id
          }
        }

        if (closestId) {
          lighting.selectLight(closestId)
        } else {
          lighting.selectLight(null)
        }
      }
    },
    [cameraRef, scheduleEndInteraction]
  )

  // ── mouseMove: gizmo drag or camera orbit/pan ──
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Handle gizmo dragging
      const drag = gizmoDragRef.current
      if (drag && cameraRef.current && overlayRef.current) {
        // Require minimum mouse movement before actually dragging
        const movedX = Math.abs(e.clientX - mouseDownPosRef.current.x)
        const movedY = Math.abs(e.clientY - mouseDownPosRef.current.y)
        if (movedX < 3 && movedY < 3) return

        const rect = overlayRef.current.getBoundingClientRect()
        const matrices = cameraRef.current.getMatrices()
        const ray = computeMouseRay(e.clientX, e.clientY, rect, matrices)
        if (!ray) return

        const lighting = useLightingStore.getState()
        applyGizmoDrag(drag, ray, lighting)
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
    const axisIdx = drag.kind === 'translate-x' ? 0 : drag.kind === 'translate-y' ? 1 : 2
    const axisDir: [number, number, number] = [0, 0, 0]
    axisDir[axisIdx] = 1

    const [currentT] = rayAxisClosest(ray.origin, ray.dir, drag.startLightPos, axisDir)
    const delta = currentT - drag.startAxisT

    const newPos: [number, number, number] = [...drag.startLightPos]
    newPos[axisIdx] += delta
    lighting.updateLight(drag.lightId, { position: newPos })
  } else if (drag.kind.startsWith('rotate-')) {
    const axisIdx = drag.kind === 'rotate-x' ? 0 : drag.kind === 'rotate-y' ? 1 : 2
    const normal: [number, number, number] = [0, 0, 0]
    normal[axisIdx] = 1

    const hit = rayPlaneIntersect(ray.origin, ray.dir, normal, drag.startLightPos)
    if (hit) {
      const dx = hit[0] - drag.startLightPos[0]
      const dy = hit[1] - drag.startLightPos[1]
      const dz = hit[2] - drag.startLightPos[2]

      let currentAngle: number
      if (axisIdx === 0) currentAngle = Math.atan2(dz, dy)
      else if (axisIdx === 1) currentAngle = Math.atan2(dx, dz)
      else currentAngle = Math.atan2(dy, dx)

      const rawDelta = currentAngle - drag.startAngle
      const deltaAngle = Math.atan2(Math.sin(rawDelta), Math.cos(rawDelta))

      const newRot: [number, number, number] = [...drag.startLightRot]
      newRot[axisIdx] += deltaAngle
      lighting.updateLight(drag.lightId, { rotation: newRot })
    }
  } else if (drag.kind === 'ground-target') {
    const groundHit = rayPlaneIntersect(ray.origin, ray.dir, [0, 1, 0], [0, 0, 0])
    if (!groundHit) return

    if (drag.lightType === 'point') {
      lighting.updateLight(drag.lightId, {
        position: [groundHit[0], drag.startLightPos[1], groundHit[2]],
      })
    } else {
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
  }
}
