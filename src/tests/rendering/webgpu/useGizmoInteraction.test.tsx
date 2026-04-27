/**
 * Regression tests for useGizmoInteraction camera-drag path.
 *
 * Locks in the pointer-capture fix that eliminated the "camera suddenly
 * jumping to a completely different angle" bug. The original
 * mouse-event implementation used `onMouseLeave` as a fallback for
 * off-element release; when the cursor stayed over the overlay through a
 * window blur, no leave fired, `isDraggingRef` stayed true, and the next
 * move computed a stale-baseline delta that swung the orbit by hundreds
 * of degrees in one event.
 */

import { renderHook } from '@testing-library/react'
import type React from 'react'
import { type RefObject, useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { WebGPUCamera } from '@/rendering/webgpu/core/WebGPUCamera'
import { useGizmoInteraction } from '@/rendering/webgpu/useGizmoInteraction'

interface CameraStub {
  orbit: ReturnType<typeof vi.fn>
  pan: ReturnType<typeof vi.fn>
  getMatrices: () => ReturnType<WebGPUCamera['getMatrices']>
  getState: () => ReturnType<WebGPUCamera['getState']>
}

function makeCameraStub(): CameraStub {
  return {
    orbit: vi.fn(),
    pan: vi.fn(),
    getMatrices: () =>
      ({
        viewMatrix: new Float32Array(16),
        projectionMatrix: new Float32Array(16),
        viewProjectionMatrix: new Float32Array(16),
        inverseViewMatrix: new Float32Array(16),
        inverseProjectionMatrix: new Float32Array(16),
        cameraPosition: { x: 0, y: 0, z: 5 },
        cameraNear: 0.1,
        cameraFar: 100,
        fov: 60,
      }) as ReturnType<WebGPUCamera['getMatrices']>,
    getState: () =>
      ({
        position: [0, 0, 5],
        target: [0, 0, 0],
        up: [0, 1, 0],
        fov: 60,
        near: 0.1,
        far: 100,
        aspect: 1,
      }) as ReturnType<WebGPUCamera['getState']>,
  }
}

interface PointerEventInit {
  clientX: number
  clientY: number
  pointerId?: number
  button?: number
}

interface MockPointerEvent {
  clientX: number
  clientY: number
  pointerId: number
  button: number
  currentTarget: {
    setPointerCapture: ReturnType<typeof vi.fn>
    releasePointerCapture: ReturnType<typeof vi.fn>
  }
  target: HTMLElement
  preventDefault: () => void
  stopPropagation: () => void
}

function makePointerEvent(target: HTMLElement, init: PointerEventInit): MockPointerEvent {
  return {
    clientX: init.clientX,
    clientY: init.clientY,
    pointerId: init.pointerId ?? 1,
    button: init.button ?? 0,
    currentTarget: {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    },
    target,
    preventDefault: () => undefined,
    stopPropagation: () => undefined,
  }
}

interface SetupResult {
  handlers: ReturnType<typeof useGizmoInteraction>
  cameraRef: RefObject<CameraStub>
  startInteraction: ReturnType<typeof vi.fn>
  scheduleEndInteraction: ReturnType<typeof vi.fn>
  overlayEl: HTMLDivElement
}

function setup(dimension = 3): SetupResult {
  const camera = makeCameraStub()
  const startInteraction = vi.fn()
  const scheduleEndInteraction = vi.fn()
  const overlayEl = document.createElement('div')
  // Provide a non-degenerate bounding rect for ray computation paths.
  overlayEl.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0 }) as DOMRect
  document.body.appendChild(overlayEl)

  const { result } = renderHook(() => {
    const cameraRef = useRef<CameraStub | null>(camera)
    const dimensionRef = useRef(dimension)
    const handlers = useGizmoInteraction({
      cameraRef: cameraRef as unknown as RefObject<WebGPUCamera | null>,
      dimensionRef,
      startInteraction,
      scheduleEndInteraction,
    })
    // Wire the overlayRef to a real element so helpers that read its rect work.
    ;(handlers.overlayRef as { current: HTMLDivElement | null }).current = overlayEl
    return { handlers, cameraRef }
  })

  return {
    handlers: result.current.handlers,
    cameraRef: result.current.cameraRef as unknown as RefObject<CameraStub>,
    startInteraction,
    scheduleEndInteraction,
    overlayEl,
  }
}

describe('useGizmoInteraction — camera drag (pointer events with capture)', () => {
  let baseSetup: SetupResult

  beforeEach(() => {
    baseSetup = setup()
  })

  afterEach(() => {
    baseSetup.overlayEl.remove()
    vi.restoreAllMocks()
  })

  it('captures the pointer on pointerdown so the drag survives off-element release', () => {
    const { handlers, overlayEl } = baseSetup
    const downEvent = makePointerEvent(overlayEl, { clientX: 100, clientY: 100, pointerId: 7 })
    handlers.handlePointerDown(downEvent as unknown as React.PointerEvent)
    expect(downEvent.currentTarget.setPointerCapture).toHaveBeenCalledWith(7)
  })

  it('orbits the camera by the move delta during a normal drag', () => {
    const { handlers, cameraRef, overlayEl } = baseSetup
    handlers.handlePointerDown(
      makePointerEvent(overlayEl, { clientX: 100, clientY: 100 }) as unknown as React.PointerEvent
    )
    handlers.handlePointerMove(
      makePointerEvent(overlayEl, { clientX: 110, clientY: 100 }) as unknown as React.PointerEvent
    )

    expect(cameraRef.current!.orbit).toHaveBeenCalledTimes(1)
    // sensitivity = 0.005, dx = 10, expected azimuth = -dx*sensitivity = -0.05
    const [azimuth, elevation] = cameraRef.current!.orbit.mock.calls[0] as [number, number]
    expect(azimuth).toBeCloseTo(-0.05, 6)
    expect(elevation).toBeCloseTo(0, 6)
  })

  it('does not fire orbit after pointercancel even if subsequent moves arrive', () => {
    const { handlers, cameraRef, overlayEl } = baseSetup

    handlers.handlePointerDown(
      makePointerEvent(overlayEl, { clientX: 100, clientY: 100 }) as unknown as React.PointerEvent
    )
    handlers.handlePointerMove(
      makePointerEvent(overlayEl, { clientX: 200, clientY: 200 }) as unknown as React.PointerEvent
    )
    expect(cameraRef.current!.orbit).toHaveBeenCalledTimes(1)

    handlers.handlePointerCancel(
      makePointerEvent(overlayEl, { clientX: 200, clientY: 200 }) as unknown as React.PointerEvent
    )

    // Stale-baseline scenario: a later move arrives far from the last known
    // position. Without pointer capture + cancel handling, the original code
    // would orbit the camera by hundreds of degrees here.
    handlers.handlePointerMove(
      makePointerEvent(overlayEl, { clientX: 900, clientY: 900 }) as unknown as React.PointerEvent
    )
    expect(cameraRef.current!.orbit).toHaveBeenCalledTimes(1)
  })

  it('skips orbit on the first pointermove after the cursor returns from off-document', () => {
    // Vertical drag scenario: cursor exits the viewport at the top (or
    // bottom — same code path). Pointer events resume with the cursor at
    // an arbitrary new position because the OS moved freely off-screen.
    // The first move after re-entry must not orbit; otherwise the camera
    // jerks by an off-screen delta — what the user perceived as the
    // "reset" effect when reaching the top or bottom of the screen.
    const { handlers, cameraRef, overlayEl } = baseSetup

    handlers.handlePointerDown(
      makePointerEvent(overlayEl, { clientX: 400, clientY: 400 }) as unknown as React.PointerEvent
    )
    handlers.handlePointerMove(
      makePointerEvent(overlayEl, { clientX: 400, clientY: 200 }) as unknown as React.PointerEvent
    )
    expect(cameraRef.current!.orbit).toHaveBeenCalledTimes(1)

    // Cursor leaves the document (e.g., off the top of the viewport).
    document.documentElement.dispatchEvent(new MouseEvent('mouseleave'))

    // Cursor returns at a far-away vertical position.
    handlers.handlePointerMove(
      makePointerEvent(overlayEl, { clientX: 400, clientY: 700 }) as unknown as React.PointerEvent
    )
    // Gap-recovery move: no additional orbit call.
    expect(cameraRef.current!.orbit).toHaveBeenCalledTimes(1)

    // Subsequent moves resume orbiting from the new baseline (700, not 200).
    handlers.handlePointerMove(
      makePointerEvent(overlayEl, { clientX: 400, clientY: 720 }) as unknown as React.PointerEvent
    )
    expect(cameraRef.current!.orbit).toHaveBeenCalledTimes(2)
    const [, elevation] = cameraRef.current!.orbit.mock.calls[1] as [number, number]
    // dy = 720 - 700 = 20, sensitivity 0.005, orbit param = -dy * sensitivity
    expect(elevation).toBeCloseTo(-0.1, 6)
  })

  it('aborts an in-flight drag on window blur (Safari fallback)', () => {
    const { handlers, cameraRef, overlayEl, scheduleEndInteraction } = baseSetup

    handlers.handlePointerDown(
      makePointerEvent(overlayEl, { clientX: 100, clientY: 100 }) as unknown as React.PointerEvent
    )
    handlers.handlePointerMove(
      makePointerEvent(overlayEl, { clientX: 150, clientY: 100 }) as unknown as React.PointerEvent
    )
    expect(cameraRef.current!.orbit).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event('blur'))
    expect(scheduleEndInteraction).toHaveBeenCalled()

    handlers.handlePointerMove(
      makePointerEvent(overlayEl, { clientX: 900, clientY: 100 }) as unknown as React.PointerEvent
    )
    // No additional orbit call — drag was aborted by blur.
    expect(cameraRef.current!.orbit).toHaveBeenCalledTimes(1)
  })

  it('releases pointer capture on pointerup', () => {
    const { handlers, overlayEl } = baseSetup
    handlers.handlePointerDown(
      makePointerEvent(overlayEl, {
        clientX: 100,
        clientY: 100,
        pointerId: 3,
      }) as unknown as React.PointerEvent
    )
    const upEvent = makePointerEvent(overlayEl, { clientX: 200, clientY: 200, pointerId: 3 })
    handlers.handlePointerUp(upEvent as unknown as React.PointerEvent)
    expect(upEvent.currentTarget.releasePointerCapture).toHaveBeenCalledWith(3)
  })

  it('orbit math gracefully tolerates a missing capture API (e.g., happy-dom)', () => {
    const { handlers, cameraRef, overlayEl } = baseSetup
    const ev = makePointerEvent(overlayEl, { clientX: 100, clientY: 100 })
    ev.currentTarget.setPointerCapture = vi.fn(() => {
      throw new Error('not supported')
    })
    expect(() => {
      handlers.handlePointerDown(ev as unknown as React.PointerEvent)
    }).not.toThrow()
    handlers.handlePointerMove(
      makePointerEvent(overlayEl, { clientX: 110, clientY: 100 }) as unknown as React.PointerEvent
    )
    expect(cameraRef.current!.orbit).toHaveBeenCalledTimes(1)
  })

  it('uses pan instead of orbit when in 2D mode (dimension = 2)', () => {
    baseSetup.overlayEl.remove()
    const local = setup(2)
    local.handlers.handlePointerDown(
      makePointerEvent(local.overlayEl, {
        clientX: 100,
        clientY: 100,
      }) as unknown as React.PointerEvent
    )
    local.handlers.handlePointerMove(
      makePointerEvent(local.overlayEl, {
        clientX: 110,
        clientY: 105,
      }) as unknown as React.PointerEvent
    )
    expect(local.cameraRef.current!.orbit).not.toHaveBeenCalled()
    expect(local.cameraRef.current!.pan).toHaveBeenCalledTimes(1)
    local.overlayEl.remove()
    baseSetup = setup()
  })

  it('ignores secondary pointers while a drag from another pointer is active', () => {
    const { handlers, overlayEl, cameraRef } = baseSetup

    // Pointer A starts a drag.
    handlers.handlePointerDown(
      makePointerEvent(overlayEl, {
        clientX: 100,
        clientY: 100,
        pointerId: 1,
      }) as unknown as React.PointerEvent
    )
    handlers.handlePointerMove(
      makePointerEvent(overlayEl, {
        clientX: 120,
        clientY: 110,
        pointerId: 1,
      }) as unknown as React.PointerEvent
    )
    expect(cameraRef.current!.orbit).toHaveBeenCalledTimes(1)

    // Pointer B's down/move/up must be ignored — they would otherwise
    // overwrite lastMouseRef or end the active drag prematurely.
    handlers.handlePointerDown(
      makePointerEvent(overlayEl, {
        clientX: 50,
        clientY: 50,
        pointerId: 2,
      }) as unknown as React.PointerEvent
    )
    handlers.handlePointerMove(
      makePointerEvent(overlayEl, {
        clientX: 200,
        clientY: 200,
        pointerId: 2,
      }) as unknown as React.PointerEvent
    )
    handlers.handlePointerUp(
      makePointerEvent(overlayEl, {
        clientX: 200,
        clientY: 200,
        pointerId: 2,
      }) as unknown as React.PointerEvent
    )
    // Pointer B's move was ignored, so orbit count stays at 1.
    expect(cameraRef.current!.orbit).toHaveBeenCalledTimes(1)

    // Pointer A's drag is still alive and producing orbits.
    handlers.handlePointerMove(
      makePointerEvent(overlayEl, {
        clientX: 130,
        clientY: 115,
        pointerId: 1,
      }) as unknown as React.PointerEvent
    )
    expect(cameraRef.current!.orbit).toHaveBeenCalledTimes(2)

    // Pointer A ends the drag — and after that, B's pointerdown can
    // start a fresh drag.
    handlers.handlePointerUp(
      makePointerEvent(overlayEl, {
        clientX: 130,
        clientY: 115,
        pointerId: 1,
      }) as unknown as React.PointerEvent
    )
    handlers.handlePointerDown(
      makePointerEvent(overlayEl, {
        clientX: 70,
        clientY: 70,
        pointerId: 2,
      }) as unknown as React.PointerEvent
    )
    handlers.handlePointerMove(
      makePointerEvent(overlayEl, {
        clientX: 80,
        clientY: 80,
        pointerId: 2,
      }) as unknown as React.PointerEvent
    )
    expect(cameraRef.current!.orbit).toHaveBeenCalledTimes(3)
  })
})
