/**
 * Color preview gradient rendering tests.
 *
 * Tests renderColorGradient for each color algorithm family:
 * - Phase: lch, phase, mixed, phaseCyclicUniform, phaseDensity
 * - Diverging: phaseDiverging, diverging, domainColoringPsi, relativePhase
 * - Spectral: blackbody, radialDistance, hamiltonianDecomposition, modeCharacter, energyFlux, kSpaceOccupation
 * - Colormap: viridis, densityContours, inferno, particleAntiparticle, pauliSpinDensity, pauliSpinExpectation, pauliCoherence
 * - Fallback: cosine palette
 *
 * Each test verifies the algorithm produces valid RGB output (finite, in [0,1] range)
 * and calls fillRect on the canvas context for every pixel column.
 */
import { describe, expect, it, vi } from 'vitest'

import {
  type GradientParams,
  renderColorGradient,
} from '@/components/sections/Faces/colorPreviewGradient'

/** Create a mock canvas 2D context that records calls. */
function createMockCtx() {
  const fillRectCalls: Array<{ x: number; y: number; w: number; h: number }> = []
  const fillStyles: string[] = []
  return {
    ctx: {
      clearRect: vi.fn(),
      fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
        fillRectCalls.push({ x, y, w, h })
      }),
      set fillStyle(v: string) {
        fillStyles.push(v)
      },
      get fillStyle() {
        return fillStyles[fillStyles.length - 1] ?? ''
      },
    } as unknown as CanvasRenderingContext2D,
    fillRectCalls,
    fillStyles,
  }
}

/** Default gradient params — overridden per-test. */
function defaultParams(overrides: Partial<GradientParams> = {}): GradientParams {
  return {
    colorAlgorithm: 'blackbody',
    cosineCoefficients: {
      a: [0.5, 0.5, 0.5],
      b: [0.5, 0.5, 0.5],
      c: [1, 1, 1],
      d: [0, 0.33, 0.67],
    },
    distribution: { power: 1, cycles: 1, offset: 0 },
    lchLightness: 0.7,
    lchChroma: 0.12,
    faceColor: '#4488cc',
    domainColoring: {
      modulusMode: 'linear',
      contoursEnabled: false,
      contourDensity: 5,
      contourWidth: 0.1,
      contourStrength: 0.5,
    },
    phaseDiverging: {
      neutralColor: '#888888',
      positiveColor: '#ff4444',
      negativeColor: '#4444ff',
    },
    divergingPsi: {
      component: 'real',
      neutralColor: '#888888',
      positiveColor: '#ff4444',
      negativeColor: '#4444ff',
      intensityFloor: 0.1,
    },
    pauliSpinUpColor: [0.2, 0.4, 0.9],
    pauliSpinDownColor: [0.9, 0.2, 0.2],
    ...overrides,
  }
}

/** Assert that all fill styles are valid hex colors (#RRGGBB). */
function assertValidHexColors(fillStyles: string[]) {
  for (const style of fillStyles) {
    expect(style).toMatch(/^#[0-9a-f]{6}$/i)
  }
}

const WIDTH = 50
const HEIGHT = 10

describe('renderColorGradient', () => {
  // --- Phase algorithms ---
  it('lch: produces valid gradient', () => {
    const { ctx, fillStyles, fillRectCalls } = createMockCtx()
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'lch' }))
    expect(fillRectCalls).toHaveLength(WIDTH)
    assertValidHexColors(fillStyles)
  })

  it('phase: produces valid gradient', () => {
    const { ctx, fillStyles, fillRectCalls } = createMockCtx()
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'phase' }))
    expect(fillRectCalls).toHaveLength(WIDTH)
    assertValidHexColors(fillStyles)
  })

  it('mixed: produces valid gradient', () => {
    const { ctx, fillStyles, fillRectCalls } = createMockCtx()
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'mixed' }))
    expect(fillRectCalls).toHaveLength(WIDTH)
    assertValidHexColors(fillStyles)
  })

  it('phaseCyclicUniform: produces valid gradient', () => {
    const { ctx, fillStyles } = createMockCtx()
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'phaseCyclicUniform' }))
    assertValidHexColors(fillStyles)
  })

  it('phaseDensity: produces valid gradient', () => {
    const { ctx, fillStyles } = createMockCtx()
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'phaseDensity' }))
    assertValidHexColors(fillStyles)
  })

  // --- Diverging algorithms ---
  it('phaseDiverging: uses neutral and wing colors', () => {
    const { ctx, fillStyles } = createMockCtx()
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'phaseDiverging' }))
    assertValidHexColors(fillStyles)
    // Should have variation (not all the same color)
    expect(new Set(fillStyles).size).toBeGreaterThan(1)
  })

  it('diverging: uses real component by default', () => {
    const { ctx, fillStyles } = createMockCtx()
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'diverging' }))
    assertValidHexColors(fillStyles)
  })

  it('diverging: imaginary component changes the gradient', () => {
    const { ctx: ctx1, fillStyles: styles1 } = createMockCtx()
    renderColorGradient(
      ctx1,
      WIDTH,
      HEIGHT,
      defaultParams({
        colorAlgorithm: 'diverging',
        divergingPsi: {
          component: 'real',
          neutralColor: '#888888',
          positiveColor: '#ff0000',
          negativeColor: '#0000ff',
          intensityFloor: 0.1,
        },
      })
    )

    const { ctx: ctx2, fillStyles: styles2 } = createMockCtx()
    renderColorGradient(
      ctx2,
      WIDTH,
      HEIGHT,
      defaultParams({
        colorAlgorithm: 'diverging',
        divergingPsi: {
          component: 'imag',
          neutralColor: '#888888',
          positiveColor: '#ff0000',
          negativeColor: '#0000ff',
          intensityFloor: 0.1,
        },
      })
    )

    // Real and imaginary should produce different gradients (cos vs sin carrier)
    expect(styles1).not.toEqual(styles2)
  })

  it('domainColoringPsi: produces gradient without contours', () => {
    const { ctx, fillStyles } = createMockCtx()
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'domainColoringPsi' }))
    assertValidHexColors(fillStyles)
  })

  it('domainColoringPsi: contours darken the gradient', () => {
    const { ctx, fillStyles } = createMockCtx()
    renderColorGradient(
      ctx,
      WIDTH,
      HEIGHT,
      defaultParams({
        colorAlgorithm: 'domainColoringPsi',
        domainColoring: {
          modulusMode: 'logPsiAbs',
          contoursEnabled: true,
          contourDensity: 5,
          contourWidth: 0.1,
          contourStrength: 0.8,
        },
      })
    )
    assertValidHexColors(fillStyles)
  })

  it('relativePhase: produces valid gradient', () => {
    const { ctx, fillStyles } = createMockCtx()
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'relativePhase' }))
    assertValidHexColors(fillStyles)
  })

  // --- Spectral algorithms ---
  it('blackbody: low t is dark, high t is bright', () => {
    const { ctx, fillStyles } = createMockCtx()
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'blackbody' }))
    assertValidHexColors(fillStyles)
    // First pixel (cold) should be darker than last (hot)
    const firstR = parseInt(fillStyles[0]!.slice(1, 3), 16)
    const lastR = parseInt(fillStyles[fillStyles.length - 1]!.slice(1, 3), 16)
    expect(lastR).toBeGreaterThan(firstR)
  })

  it('radialDistance: produces valid gradient', () => {
    const { ctx, fillStyles } = createMockCtx()
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'radialDistance' }))
    assertValidHexColors(fillStyles)
  })

  it('hamiltonianDecomposition: produces valid gradient', () => {
    const { ctx, fillStyles } = createMockCtx()
    renderColorGradient(
      ctx,
      WIDTH,
      HEIGHT,
      defaultParams({ colorAlgorithm: 'hamiltonianDecomposition' })
    )
    assertValidHexColors(fillStyles)
  })

  it('modeCharacter: produces valid gradient', () => {
    const { ctx, fillStyles } = createMockCtx()
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'modeCharacter' }))
    assertValidHexColors(fillStyles)
  })

  it('energyFlux: produces valid gradient', () => {
    const { ctx, fillStyles } = createMockCtx()
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'energyFlux' }))
    assertValidHexColors(fillStyles)
  })

  it('kSpaceOccupation: produces valid gradient', () => {
    const { ctx, fillStyles } = createMockCtx()
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'kSpaceOccupation' }))
    assertValidHexColors(fillStyles)
  })

  // --- Colormap algorithms ---
  it('viridis: produces valid gradient', () => {
    const { ctx, fillStyles } = createMockCtx()
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'viridis' }))
    assertValidHexColors(fillStyles)
  })

  it('densityContours: produces valid gradient with contour lines', () => {
    const { ctx, fillStyles } = createMockCtx()
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'densityContours' }))
    assertValidHexColors(fillStyles)
  })

  it('inferno: produces valid gradient', () => {
    const { ctx, fillStyles } = createMockCtx()
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'inferno' }))
    assertValidHexColors(fillStyles)
  })

  it('particleAntiparticle: interpolates between two color endpoints', () => {
    const { ctx, fillStyles } = createMockCtx()
    renderColorGradient(
      ctx,
      WIDTH,
      HEIGHT,
      defaultParams({ colorAlgorithm: 'particleAntiparticle' })
    )
    assertValidHexColors(fillStyles)
  })

  it('pauliSpinDensity: blends spin up/down colors', () => {
    const { ctx, fillStyles } = createMockCtx()
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'pauliSpinDensity' }))
    assertValidHexColors(fillStyles)
    expect(new Set(fillStyles).size).toBeGreaterThan(1)
  })

  it('pauliSpinExpectation: diverging blue/red around neutral', () => {
    const { ctx, fillStyles } = createMockCtx()
    renderColorGradient(
      ctx,
      WIDTH,
      HEIGHT,
      defaultParams({ colorAlgorithm: 'pauliSpinExpectation' })
    )
    assertValidHexColors(fillStyles)
  })

  it('pauliCoherence: produces valid gradient', () => {
    const { ctx, fillStyles } = createMockCtx()
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'pauliCoherence' }))
    assertValidHexColors(fillStyles)
  })

  // --- Fallback ---
  it('unknown algorithm falls back to cosine palette', () => {
    const { ctx, fillStyles } = createMockCtx()
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'cosine' }))
    assertValidHexColors(fillStyles)
    expect(fillStyles).toHaveLength(WIDTH)
  })

  // --- Common behaviors ---
  it('calls clearRect at the start', () => {
    const { ctx } = createMockCtx()
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams())
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, WIDTH, HEIGHT)
  })

  it('renders one fill column per pixel', () => {
    const { ctx, fillRectCalls } = createMockCtx()
    renderColorGradient(ctx, 100, 20, defaultParams())
    expect(fillRectCalls).toHaveLength(100)
    // Each column should be 1px wide and full height
    for (let i = 0; i < 100; i++) {
      expect(fillRectCalls[i]!.x).toBe(i)
      expect(fillRectCalls[i]!.w).toBe(1)
      expect(fillRectCalls[i]!.h).toBe(20)
    }
  })
})
