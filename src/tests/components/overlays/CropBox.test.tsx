/**
 * CropBox component tests.
 *
 * Verifies: renders with correct position/size from crop props, resize handles present,
 * handle pointerdown triggers resize, window pointermove calls onCropChange, pointerup ends resize.
 */
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CropBox } from '@/components/overlays/CropBox'

// Mock motion/react — CropBox uses m.div with drag props; render as plain div
vi.mock('motion/react', () => {
  const MotionDiv = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & {
      drag?: boolean
      style?: React.CSSProperties
      dragMomentum?: boolean
      dragElastic?: unknown
      dragConstraints?: unknown
      onDragEnd?: unknown
    }
  >(
    (
      {
        children,
        style,
        drag: _drag,
        dragMomentum: _dm,
        dragElastic: _de,
        dragConstraints: _dc,
        onDragEnd: _ode,
        ...rest
      },
      ref
    ) => (
      <div ref={ref} style={style} {...rest}>
        {children}
      </div>
    )
  )
  MotionDiv.displayName = 'MotionDiv'
  return {
    m: { div: MotionDiv },
    useMotionValue: (initial: number) => {
      let val = initial
      return {
        get: () => val,
        set: (v: number) => {
          val = v
        },
      }
    },
  }
})

// ResizeObserver mock — fires callback synchronously on observe
class MockResizeObserver {
  private cb: ResizeObserverCallback
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb
  }
  observe(target: Element) {
    // Fire synchronously so bounds update before test assertions
    this.cb(
      [{ target, contentRect: target.getBoundingClientRect() } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver
    )
  }
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', MockResizeObserver)

function makeContainerRef(width = 800, height = 600) {
  const div = document.createElement('div')
  Object.defineProperty(div, 'getBoundingClientRect', {
    value: () =>
      ({ width, height, left: 0, top: 0, right: width, bottom: height, x: 0, y: 0 }) as DOMRect,
  })
  // Attach to document so React effects can access it
  document.body.appendChild(div)
  const ref = { current: div } as React.RefObject<HTMLDivElement>
  return { ref, div }
}

describe('CropBox', () => {
  const defaultCrop = { x: 0.1, y: 0.2, width: 0.6, height: 0.5 }
  let containerRef: React.RefObject<HTMLDivElement>
  let containerDiv: HTMLDivElement

  beforeEach(() => {
    const { ref, div } = makeContainerRef()
    containerRef = ref
    containerDiv = div
  })

  afterEach(() => {
    containerDiv.remove()
  })

  it('renders with data-testid="crop-box"', () => {
    const onCropChange = vi.fn()
    render(<CropBox containerRef={containerRef} crop={defaultCrop} onCropChange={onCropChange} />)
    expect(screen.getByTestId('crop-box')).toBeInTheDocument()
  })

  it('applies crop position and size as inline styles', () => {
    const onCropChange = vi.fn()
    render(<CropBox containerRef={containerRef} crop={defaultCrop} onCropChange={onCropChange} />)
    const box = screen.getByTestId('crop-box')
    expect(box).toHaveStyle({ left: '10%', top: '20%', width: '60%', height: '50%' })
  })

  it('sanitizes invalid crop props before writing inline styles', () => {
    const onCropChange = vi.fn()
    render(
      <CropBox
        containerRef={containerRef}
        crop={{ x: Number.NaN, y: Infinity, width: -1, height: 0 }}
        onCropChange={onCropChange}
      />
    )

    const box = screen.getByTestId('crop-box')
    expect(box).toHaveStyle({ left: '0%', top: '0%', width: '100%', height: '100%' })
    expect(box).not.toHaveAttribute('style', expect.stringContaining('NaN'))
    expect(box).not.toHaveAttribute('style', expect.stringContaining('Infinity'))
  })

  it('renders all 4 corner resize handles', () => {
    const onCropChange = vi.fn()
    render(<CropBox containerRef={containerRef} crop={defaultCrop} onCropChange={onCropChange} />)
    expect(screen.getByTestId('crop-handle-nw')).toBeInTheDocument()
    expect(screen.getByTestId('crop-handle-ne')).toBeInTheDocument()
    expect(screen.getByTestId('crop-handle-sw')).toBeInTheDocument()
    expect(screen.getByTestId('crop-handle-se')).toBeInTheDocument()
  })

  it('east handle resize dispatches onCropChange with wider width', async () => {
    const onCropChange = vi.fn()
    render(<CropBox containerRef={containerRef} crop={defaultCrop} onCropChange={onCropChange} />)

    const handle = screen.getByTestId('crop-handle-se')
    act(() => {
      handle.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, clientX: 600, clientY: 400 })
      )
    })

    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 680, clientY: 460 }))
    })

    // Width should increase: dx = 80/800 = 0.1
    expect(onCropChange).toHaveBeenCalled()
    const newCrop = onCropChange.mock.calls[0]![0] as {
      x: number
      y: number
      width: number
      height: number
    }
    expect(newCrop.width).toBeGreaterThan(defaultCrop.width)
  })

  it('west handle resize clamps width to minSize', async () => {
    const onCropChange = vi.fn()
    const narrowCrop = { x: 0.0, y: 0.0, width: 0.15, height: 0.5 }
    render(
      <CropBox
        containerRef={containerRef}
        crop={narrowCrop}
        onCropChange={onCropChange}
        minSize={0.1}
      />
    )

    const handle = screen.getByTestId('crop-handle-nw')
    act(() => {
      handle.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 })
      )
    })

    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 800, clientY: 0 }))
    })

    expect(onCropChange).toHaveBeenCalled()
    const newCrop = onCropChange.mock.calls[0]![0] as {
      x: number
      y: number
      width: number
      height: number
    }
    expect(newCrop.width).toBeGreaterThanOrEqual(0.1)
  })

  it('pointerup ends resize (no further onCropChange after pointerup)', async () => {
    const onCropChange = vi.fn()
    render(<CropBox containerRef={containerRef} crop={defaultCrop} onCropChange={onCropChange} />)

    const handle = screen.getByTestId('crop-handle-se')
    act(() => {
      handle.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, clientX: 600, clientY: 400 })
      )
    })

    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 650, clientY: 450 }))
    })
    const callsAfterMove = onCropChange.mock.calls.length

    act(() => {
      window.dispatchEvent(new PointerEvent('pointerup', {}))
    })
    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 700, clientY: 500 }))
    })

    // No additional calls after pointerup
    expect(onCropChange.mock.calls.length).toBe(callsAfterMove)
  })

  it('ignores resize movement while container height is zero', async () => {
    containerDiv.remove()
    const zeroHeight = makeContainerRef(800, 0)
    containerRef = zeroHeight.ref
    containerDiv = zeroHeight.div
    const onCropChange = vi.fn()
    render(<CropBox containerRef={containerRef} crop={defaultCrop} onCropChange={onCropChange} />)

    const handle = screen.getByTestId('crop-handle-se')
    act(() => {
      handle.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, clientX: 600, clientY: 400 })
      )
    })

    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 650, clientY: 400 }))
    })

    expect(onCropChange).not.toHaveBeenCalled()
  })

  it('north handle resize moves top edge upward', async () => {
    const onCropChange = vi.fn()
    render(<CropBox containerRef={containerRef} crop={defaultCrop} onCropChange={onCropChange} />)

    const handle = screen.getByTestId('crop-handle-nw')
    act(() => {
      handle.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, clientX: 80, clientY: 120 })
      )
    })
    // Move up 60px → dy = -60/600 = -0.1; y decreases, height increases
    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 80, clientY: 60 }))
    })

    expect(onCropChange).toHaveBeenCalled()
    const newCrop = onCropChange.mock.calls[0]![0] as {
      x: number
      y: number
      width: number
      height: number
    }
    expect(newCrop.y).toBeLessThan(defaultCrop.y)
    expect(newCrop.height).toBeGreaterThan(defaultCrop.height)
  })

  it('renders crop dimensions based on crop prop values', async () => {
    const onCropChange = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(
      <CropBox containerRef={containerRef} crop={defaultCrop} onCropChange={onCropChange} />
    )
    const newCrop = { x: 0.3, y: 0.3, width: 0.4, height: 0.4 }
    rerender(<CropBox containerRef={containerRef} crop={newCrop} onCropChange={onCropChange} />)
    const box = screen.getByTestId('crop-box')
    expect(box).toHaveStyle({ left: '30%', top: '30%', width: '40%', height: '40%' })
    void user // satisfy import
  })
})
