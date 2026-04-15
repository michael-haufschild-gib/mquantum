/**
 * Tests for HawkingPageCurvePanel — the analog Hawking Page-curve HUD overlay.
 *
 * Covers the four production bugs reported against Round 3 of the
 * BEC analog-Hawking work:
 *
 *   1. With default `hawkingVmax` and default `g`, the panel has no horizon
 *      and must show an explicit empty-state message rather than a flat
 *      "trace at zero" deception.
 *   2. With the canonical "Sonic Horizon (Waterfall)" parameters, pushing
 *      diagnostic ticks must cause `S_therm` to grow above noise floor, and
 *      eventually a finite Page time must be recorded.
 *   3. The page-curve sliders (`G_eff`, `sbCoefficient`) must produce
 *      observable, deterministic effects on the next pushed sample.
 *   4. The `islandOverlayEnabled` toggle must produce a user-visible DOM
 *      change (mirrored as `data-island-overlay` on the SVG root).
 *
 * The first four tests are written to fail on the current (broken) code,
 * then pass after the fix. See the surrounding /quantum-discovery PR for
 * the corresponding production changes.
 *
 * @module tests/components/overlays/HawkingPageCurvePanel
 */

import { act, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock motion/react — avoid framer drag/animation in happy-dom.
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
    // eslint-disable-next-line project-rules/no-raw-html-controls -- motion/react mock
    <button ref={ref} type="button" {...rest}>
      {children}
    </button>
  ))
  MotionButton.displayName = 'MotionButton'
  return {
    m: { div: MotionDiv, button: MotionButton },
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

// Mock usePanelCollision — no-op in tests.
vi.mock('@/hooks/usePanelCollision', () => ({ usePanelCollision: vi.fn() }))

// Mock useIsDesktop → always true so the panel mounts under happy-dom.
vi.mock('@/hooks/useMediaQuery', () => ({
  useIsDesktop: () => true,
  useMediaQuery: vi.fn(() => false),
}))

// Mock Icon — SVG imports not available in happy-dom.
vi.mock('@/components/ui/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>{name}</span>,
}))

import { HawkingPageCurvePanel } from '@/components/overlays/HawkingPageCurvePanel'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { usePageCurveStore } from '@/stores/pageCurveStore'

/**
 * Reset every store this panel observes, so tests start from a clean slate
 * instead of inheriting state mutated by sibling specs in the same worker.
 */
function resetAllStores(): void {
  act(() => {
    usePageCurveStore.setState(usePageCurveStore.getInitialState())
    usePageCurveStore.getState().clear()
    useDiagnosticsStore.setState(useDiagnosticsStore.getInitialState())
    useGeometryStore.setState(useGeometryStore.getInitialState())
    useExtendedObjectStore.setState(useExtendedObjectStore.getInitialState())
  })
}

/**
 * Switch the global geometry / extended-object stores into BEC waterfall
 * mode at dimension 3, optionally overriding any BEC config keys for the
 * test in question.
 */
function configureBecWaterfall(overrides: Partial<{ hawkingVmax: number }> = {}): void {
  act(() => {
    useGeometryStore.getState().setObjectType('schroedinger')
    useGeometryStore.getState().setDimension(3)
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('becDynamics')
    useExtendedObjectStore.getState().setBecInitialCondition('blackHoleAnalog')
    if (typeof overrides.hawkingVmax === 'number') {
      useExtendedObjectStore.getState().setBecHawkingVmax(overrides.hawkingVmax)
    }
  })
}

/** Bump the BEC readback generation, which the panel watches to push samples. */
function advanceBecGen(targetGen: number): void {
  act(() => {
    useDiagnosticsStore.setState((s) => ({
      bec: { ...s.bec, readbackGeneration: targetGen },
    }))
  })
}

describe('HawkingPageCurvePanel', () => {
  beforeEach(() => {
    resetAllStores()
    act(() => {
      usePageCurveStore.getState().setPageCurveHudEnabled(true)
    })
  })

  afterEach(() => {
    resetAllStores()
  })

  it('renders an explicit empty state when default v_max gives no sonic horizon', () => {
    // Default `hawkingVmax = 2.0`, default `g = 500`, default `mass = 1`.
    // The simulator's actual background density is
    //   n0 = max(g·0.01, 1)/g = 0.01 (for g = 500),
    // so c_s0 = √(g·n0/m) = √5 ≈ 2.236 > v_max = 2.0 — no horizon exists.
    // The panel must surface this as a visible message instead of a flat
    // baseline that misleads the user into thinking the system is silent.
    configureBecWaterfall()
    // Force the legacy default explicitly so this test stays meaningful even
    // after the production default is bumped.
    act(() => {
      useExtendedObjectStore.getState().setBecHawkingVmax(2.0)
    })

    render(<HawkingPageCurvePanel />)
    advanceBecGen(1)
    advanceBecGen(2)

    const root = screen.getByTestId('hawking-page-curve-svg')
    expect(root.textContent ?? '').toMatch(/No horizon/i)
  })

  it('S_therm grows above noise floor under canonical waterfall parameters', () => {
    // v_max = 3.5, L_h = 0.6, default g = 500 → c_s0 = √5 ≈ 2.236, v_max
    // exceeds c_s0 so a horizon exists and the analog Hawking rate is
    // strictly positive (rate ≈ 2.7 in natural units for the 64³ default
    // grid). 50 readback ticks should accumulate S_therm well above 1e-4.
    configureBecWaterfall({ hawkingVmax: 3.5 })

    render(<HawkingPageCurvePanel />)
    for (let g = 1; g <= 50; g++) advanceBecGen(g)

    const store = usePageCurveStore.getState()
    expect(store.buffer.count).toBeGreaterThan(0)
    expect(store.lastSTherm).toBeGreaterThan(1e-4)
  })

  it('records a finite Page time once S_therm crosses S_BH', () => {
    // Crank G_eff up so S_BH = A_h / (4·G_eff) shrinks to ~2.3 for the
    // canonical 64³ grid (A_h = 92.16). The analytic Hawking rate at
    // v_max=3.5, g=500, m=1 is ≈ 0.316; with frameTime ≈ 0.04 per readback
    // tick the integrated S_therm crosses S_BH at t ≈ 7.3, well within
    // 250 ticks.
    configureBecWaterfall({ hawkingVmax: 3.5 })
    act(() => {
      usePageCurveStore.getState().setGEff(10)
    })

    render(<HawkingPageCurvePanel />)
    for (let g = 1; g <= 250; g++) advanceBecGen(g)

    const tPage = usePageCurveStore.getState().getPageTime()
    // tPage is a finite positive number once S_therm crosses S_BH.
    if (tPage === null) throw new Error('expected a finite Page time')
    expect(Number.isFinite(tPage)).toBe(true)
    expect(tPage).toBeGreaterThan(0)
  })

  it('G_eff slider scales S_BH by exactly 1/x on the next pushed sample', () => {
    configureBecWaterfall({ hawkingVmax: 3.5 })
    render(<HawkingPageCurvePanel />)

    // Establish a baseline sample with G_eff = 1.
    advanceBecGen(1)
    advanceBecGen(2)
    const sBHWithGEff1 = usePageCurveStore.getState().lastSBH
    expect(sBHWithGEff1).toBeGreaterThan(0)

    // Push more samples after raising G_eff to 10. S_BH = A_h/(4·G_eff)
    // must drop by exactly a factor of 10 for the same horizon area.
    act(() => {
      usePageCurveStore.getState().setGEff(10)
    })
    advanceBecGen(3)
    advanceBecGen(4)
    const sBHWithGEff10 = usePageCurveStore.getState().lastSBH
    expect(sBHWithGEff10).toBeGreaterThan(0)
    expect(sBHWithGEff10 / sBHWithGEff1).toBeCloseTo(0.1, 6)
  })

  it('Stefan–Boltzmann slider raises the entropy rate proportionally', () => {
    configureBecWaterfall({ hawkingVmax: 3.5 })
    render(<HawkingPageCurvePanel />)

    // Lock sb to a known value BEFORE any sample is pushed, so baseRate is
    // measured under the known sb and the ratio is unambiguous.
    act(() => {
      usePageCurveStore.getState().setSbCoefficient(1.0)
    })

    advanceBecGen(1)
    advanceBecGen(2)
    const baseRate = usePageCurveStore.getState().lastRate
    expect(baseRate).toBeGreaterThan(0)

    const factor = 3
    act(() => {
      usePageCurveStore.getState().setSbCoefficient(factor)
    })
    advanceBecGen(3)
    advanceBecGen(4)
    const newRate = usePageCurveStore.getState().lastRate
    // Rate ∝ sb for fixed horizon parameters (thermalEntropyDensityRate's
    // closed form). Require proportional scaling within 5%.
    const ratio = newRate / baseRate
    expect(ratio).toBeGreaterThan(factor * 0.95)
    expect(ratio).toBeLessThan(factor * 1.05)
  })

  it('flips data-island-overlay on the SVG root when the toggle changes', () => {
    configureBecWaterfall({ hawkingVmax: 3.5 })
    render(<HawkingPageCurvePanel />)
    const svg = screen.getByTestId('hawking-page-curve-svg')
    expect(svg).toHaveAttribute('data-island-overlay', 'off')

    act(() => {
      usePageCurveStore.getState().setIslandOverlayEnabled(true)
    })
    expect(screen.getByTestId('hawking-page-curve-svg')).toHaveAttribute(
      'data-island-overlay',
      'on'
    )
  })
})
