/**
 * QuantumCarpetPanel tests.
 *
 * Verifies: gate logic (hidden when disabled/cinematic/mobile), renders panel when enabled,
 * axis/colormap controls present, play/pause toggle, clear and close buttons, frame count.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { QuantumCarpetPanel } from '@/components/canvas/QuantumCarpetPanel'
import { useCarpetStore } from '@/stores/diagnostics/carpetStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'
import { useLayoutStore } from '@/stores/ui/layoutStore'

// Mock motion/react — draggable m.div and m.button with useMotionValue
vi.mock('motion/react', () => {
  const MotionDiv = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & { drag?: boolean; dragMomentum?: boolean }
  >(
    (
      { children, drag: _d, dragMomentum: _dm, onDragStart: _ods, onDragEnd: _ode, style, ...rest },
      ref
    ) => (
      <div ref={ref} style={style as React.CSSProperties} {...rest}>
        {children}
      </div>
    )
  )
  MotionDiv.displayName = 'MotionDiv'

  const MotionButton = React.forwardRef<
    HTMLButtonElement,
    React.ButtonHTMLAttributes<HTMLButtonElement> & {
      whileHover?: unknown
      whileTap?: unknown
      initial?: unknown
      animate?: unknown
    }
  >(({ children, whileHover: _wh, whileTap: _wt, initial: _i, animate: _a, ...rest }, ref) => (
    // eslint-disable-next-line project-rules/no-raw-html-controls -- test mock for motion/react; not production UI
    <button ref={ref} type="button" {...rest}>
      {children}
    </button>
  ))
  MotionButton.displayName = 'MotionButton'

  // Render whatever children AnimatePresence wraps as a plain fragment;
  // happy-dom never animates so the exit/initial transitions don't matter.
  const AnimatePresence = ({ children }: { children?: React.ReactNode }) => <>{children}</>
  AnimatePresence.displayName = 'AnimatePresence'

  return {
    m: { div: MotionDiv, button: MotionButton },
    AnimatePresence,
    useMotionValue: (initial: number) => {
      let val = initial
      return {
        get: () => val,
        set: (v: number) => {
          val = v
        },
      }
    },
    HTMLMotionProps: {},
  }
})

// Mock usePanelCollision — no-op
vi.mock('@/hooks/usePanelCollision', () => ({ usePanelCollision: vi.fn() }))

// Mock useIsDesktop to return true (desktop) by default
const mockIsDesktop = { value: true }
vi.mock('@/hooks/useMediaQuery', () => ({
  useIsDesktop: () => mockIsDesktop.value,
  useMediaQuery: vi.fn(() => false),
}))

// Mock Icon component — SVG imports not supported in test env
vi.mock('@/components/ui/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>{name}</span>,
}))

// Mock colormaps to avoid canvas 2D errors in happy-dom
vi.mock('@/lib/physics/colormaps', () => ({
  getColormapLUT: vi.fn(() => new Uint8ClampedArray(256 * 4)),
  paintCarpetToCanvas: vi.fn(),
}))

// Patch canvas 2D mock to add createImageData (missing from global mock)
const mockImageData = { data: new Uint8ClampedArray(256 * 4) }
HTMLCanvasElement.prototype.getContext = new Proxy(HTMLCanvasElement.prototype.getContext, {
  apply(target, thisArg, args: [string, ...unknown[]]) {
    const ctx = target.apply(thisArg, args as Parameters<HTMLCanvasElement['getContext']>)
    if (args[0] === '2d' && ctx && !('createImageData' in (ctx as object))) {
      ;(ctx as unknown as Record<string, unknown>).createImageData = () => mockImageData
    }
    return ctx
  },
}) as typeof HTMLCanvasElement.prototype.getContext

const initialCarpetState = useCarpetStore.getState()
const initialLayoutState = useLayoutStore.getState()

describe('QuantumCarpetPanel', () => {
  beforeEach(() => {
    useCarpetStore.setState(initialCarpetState, true)
    useLayoutStore.setState(initialLayoutState, true)
    mockIsDesktop.value = true
    // Enable carpet so CarpetPanelInner mounts
    useCarpetStore.setState({ enabled: true })
  })

  it('renders null when carpet is disabled', () => {
    useCarpetStore.setState({ enabled: false })
    render(<QuantumCarpetPanel />)
    expect(screen.queryByTestId('quantum-carpet-panel')).not.toBeInTheDocument()
  })

  it('renders null in cinematic mode', () => {
    useLayoutStore.setState({ isCinematicMode: true })
    render(<QuantumCarpetPanel />)
    expect(screen.queryByTestId('quantum-carpet-panel')).not.toBeInTheDocument()
  })

  it('renders null on mobile (non-desktop)', () => {
    mockIsDesktop.value = false
    render(<QuantumCarpetPanel />)
    expect(screen.queryByTestId('quantum-carpet-panel')).not.toBeInTheDocument()
  })

  it('renders panel when enabled on desktop', () => {
    render(<QuantumCarpetPanel />)
    expect(screen.getByTestId('quantum-carpet-panel')).toBeInTheDocument()
    expect(screen.getByText('Quantum Carpet')).toBeInTheDocument()
  })

  it('shows carpet canvas and color bar canvas', () => {
    render(<QuantumCarpetPanel />)
    expect(screen.getByTestId('carpet-canvas')).toBeInTheDocument()
  })

  it('shows frame counter from store', () => {
    useCarpetStore.setState({ totalFrames: 42, historyLength: 256 })
    render(<QuantumCarpetPanel />)
    expect(screen.getByText('Frames: 42')).toBeInTheDocument()
    expect(screen.getByText('42/256')).toBeInTheDocument()
  })

  it('play/pause button calls togglePaused', async () => {
    const user = userEvent.setup()
    useCarpetStore.setState({ paused: false })
    render(<QuantumCarpetPanel />)

    await user.click(screen.getByTestId('carpet-play-pause'))
    expect(useCarpetStore.getState().paused).toBe(true)
  })

  it('pause button label reflects paused state', () => {
    useCarpetStore.setState({ paused: true })
    render(<QuantumCarpetPanel />)
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument()
  })

  it('clear button calls clear action', async () => {
    const user = userEvent.setup()
    render(<QuantumCarpetPanel />)
    await user.click(screen.getByTestId('carpet-clear'))
    // After clear, totalFrames resets to 0
    expect(useCarpetStore.getState().totalFrames).toBe(0)
  })

  it('close button sets enabled to false', async () => {
    const user = userEvent.setup()
    render(<QuantumCarpetPanel />)
    await user.click(screen.getByTestId('carpet-close'))
    expect(useCarpetStore.getState().enabled).toBe(false)
  })

  it('log scale toggle button is present', () => {
    render(<QuantumCarpetPanel />)
    expect(screen.getByRole('button', { name: 'Toggle log scale' })).toBeInTheDocument()
  })

  it('axis options limited to 2 when dimension is 2', () => {
    const prev = useGeometryStore.getState().dimension
    useGeometryStore.setState({ dimension: 2 })
    render(<QuantumCarpetPanel />)
    const axisSelect = screen.getByTestId('carpet-axis-select')
    expect(axisSelect).toBeInTheDocument()
    useGeometryStore.setState({ dimension: prev })
  })
})
