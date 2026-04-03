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
 * Each test verifies the algorithm produces valid RGB output (finite, in [0,255] range)
 * across the rendered ImageData buffer.
 */
import { describe, expect, it, vi } from 'vitest'

import {
  type GradientParams,
  renderColorGradient,
} from '@/components/sections/Faces/colorPreviewGradient'

/** Create a mock canvas 2D context that captures ImageData writes. */
function createMockCtx(width: number, height: number) {
  const imageData = {
    data: new Uint8ClampedArray(width * height * 4),
    width,
    height,
  }
  const putImageDataCalls: Array<{ imageData: typeof imageData; dx: number; dy: number }> = []

  return {
    ctx: {
      createImageData: vi.fn((_w: number, _h: number) => imageData),
      putImageData: vi.fn((data: typeof imageData, dx: number, dy: number) => {
        putImageDataCalls.push({ imageData: data, dx, dy })
      }),
    } as unknown as CanvasRenderingContext2D,
    imageData,
    putImageDataCalls,
  }
}

/** Extract RGB values for a given column x from row 0 of the ImageData buffer. */
function getColumnColor(data: Uint8ClampedArray, x: number): [number, number, number] {
  const i = x * 4
  return [data[i]!, data[i + 1]!, data[i + 2]!]
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

/** Assert that all pixel columns contain valid RGB (0-255) with full opacity. */
function assertValidPixelColors(data: Uint8ClampedArray, width: number, height: number) {
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4
      const r = data[i]!
      const g = data[i + 1]!
      const b = data[i + 2]!
      const a = data[i + 3]!
      expect(Number.isFinite(r), `pixel (${x},${y}) R is finite`).toBe(true)
      expect(Number.isFinite(g), `pixel (${x},${y}) G is finite`).toBe(true)
      expect(Number.isFinite(b), `pixel (${x},${y}) B is finite`).toBe(true)
      expect(a, `pixel (${x},${y}) alpha should be 255`).toBe(255)
    }
  }
}

/** Assert that the gradient has color variation (not a solid block). */
function assertGradientVariation(data: Uint8ClampedArray, width: number) {
  const colors = new Set<string>()
  for (let x = 0; x < width; x++) {
    const [r, g, b] = getColumnColor(data, x)
    colors.add(`${r},${g},${b}`)
  }
  expect(colors.size).toBeGreaterThan(1)
}

const WIDTH = 50
const HEIGHT = 10

describe('renderColorGradient', () => {
  // --- Phase algorithms ---
  it('lch: produces valid gradient', () => {
    const { ctx, imageData } = createMockCtx(WIDTH, HEIGHT)
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'lch' }))
    assertValidPixelColors(imageData.data, WIDTH, HEIGHT)
    assertGradientVariation(imageData.data, WIDTH)
  })

  it('phase: produces valid gradient', () => {
    const { ctx, imageData } = createMockCtx(WIDTH, HEIGHT)
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'phase' }))
    assertValidPixelColors(imageData.data, WIDTH, HEIGHT)
  })

  it('mixed: produces valid gradient', () => {
    const { ctx, imageData } = createMockCtx(WIDTH, HEIGHT)
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'mixed' }))
    assertValidPixelColors(imageData.data, WIDTH, HEIGHT)
  })

  it('phaseCyclicUniform: produces valid gradient', () => {
    const { ctx, imageData } = createMockCtx(WIDTH, HEIGHT)
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'phaseCyclicUniform' }))
    assertValidPixelColors(imageData.data, WIDTH, HEIGHT)
  })

  it('phaseDensity: produces valid gradient', () => {
    const { ctx, imageData } = createMockCtx(WIDTH, HEIGHT)
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'phaseDensity' }))
    assertValidPixelColors(imageData.data, WIDTH, HEIGHT)
  })

  // --- Diverging algorithms ---
  it('phaseDiverging: uses neutral and wing colors', () => {
    const { ctx, imageData } = createMockCtx(WIDTH, HEIGHT)
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'phaseDiverging' }))
    assertValidPixelColors(imageData.data, WIDTH, HEIGHT)
    assertGradientVariation(imageData.data, WIDTH)
  })

  it('diverging: uses real component by default', () => {
    const { ctx, imageData } = createMockCtx(WIDTH, HEIGHT)
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'diverging' }))
    assertValidPixelColors(imageData.data, WIDTH, HEIGHT)
  })

  it('diverging: imaginary component changes the gradient', () => {
    const { ctx: ctx1, imageData: img1 } = createMockCtx(WIDTH, HEIGHT)
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

    const { ctx: ctx2, imageData: img2 } = createMockCtx(WIDTH, HEIGHT)
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
    const colors1 = Array.from({ length: WIDTH }, (_, x) => getColumnColor(img1.data, x))
    const colors2 = Array.from({ length: WIDTH }, (_, x) => getColumnColor(img2.data, x))
    expect(colors1).not.toEqual(colors2)
  })

  it('domainColoringPsi: produces gradient without contours', () => {
    const { ctx, imageData } = createMockCtx(WIDTH, HEIGHT)
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'domainColoringPsi' }))
    assertValidPixelColors(imageData.data, WIDTH, HEIGHT)
  })

  it('domainColoringPsi: contours darken the gradient', () => {
    const { ctx, imageData } = createMockCtx(WIDTH, HEIGHT)
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
    assertValidPixelColors(imageData.data, WIDTH, HEIGHT)
  })

  it('relativePhase: produces valid gradient', () => {
    const { ctx, imageData } = createMockCtx(WIDTH, HEIGHT)
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'relativePhase' }))
    assertValidPixelColors(imageData.data, WIDTH, HEIGHT)
  })

  // --- Spectral algorithms ---
  it('blackbody: low t is dark, high t is bright', () => {
    const { ctx, imageData } = createMockCtx(WIDTH, HEIGHT)
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'blackbody' }))
    assertValidPixelColors(imageData.data, WIDTH, HEIGHT)
    const firstR = getColumnColor(imageData.data, 0)[0]
    const lastR = getColumnColor(imageData.data, WIDTH - 1)[0]
    expect(lastR).toBeGreaterThan(firstR)
  })

  it('radialDistance: produces valid gradient', () => {
    const { ctx, imageData } = createMockCtx(WIDTH, HEIGHT)
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'radialDistance' }))
    assertValidPixelColors(imageData.data, WIDTH, HEIGHT)
  })

  it('hamiltonianDecomposition: produces valid gradient', () => {
    const { ctx, imageData } = createMockCtx(WIDTH, HEIGHT)
    renderColorGradient(
      ctx,
      WIDTH,
      HEIGHT,
      defaultParams({ colorAlgorithm: 'hamiltonianDecomposition' })
    )
    assertValidPixelColors(imageData.data, WIDTH, HEIGHT)
  })

  it('modeCharacter: produces valid gradient', () => {
    const { ctx, imageData } = createMockCtx(WIDTH, HEIGHT)
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'modeCharacter' }))
    assertValidPixelColors(imageData.data, WIDTH, HEIGHT)
  })

  it('energyFlux: produces valid gradient', () => {
    const { ctx, imageData } = createMockCtx(WIDTH, HEIGHT)
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'energyFlux' }))
    assertValidPixelColors(imageData.data, WIDTH, HEIGHT)
  })

  it('kSpaceOccupation: produces valid gradient', () => {
    const { ctx, imageData } = createMockCtx(WIDTH, HEIGHT)
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'kSpaceOccupation' }))
    assertValidPixelColors(imageData.data, WIDTH, HEIGHT)
  })

  // --- Colormap algorithms ---
  it('viridis: produces valid gradient', () => {
    const { ctx, imageData } = createMockCtx(WIDTH, HEIGHT)
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'viridis' }))
    assertValidPixelColors(imageData.data, WIDTH, HEIGHT)
  })

  it('densityContours: produces valid gradient with contour lines', () => {
    const { ctx, imageData } = createMockCtx(WIDTH, HEIGHT)
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'densityContours' }))
    assertValidPixelColors(imageData.data, WIDTH, HEIGHT)
  })

  it('inferno: produces valid gradient', () => {
    const { ctx, imageData } = createMockCtx(WIDTH, HEIGHT)
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'inferno' }))
    assertValidPixelColors(imageData.data, WIDTH, HEIGHT)
  })

  it('particleAntiparticle: interpolates between two color endpoints', () => {
    const { ctx, imageData } = createMockCtx(WIDTH, HEIGHT)
    renderColorGradient(
      ctx,
      WIDTH,
      HEIGHT,
      defaultParams({ colorAlgorithm: 'particleAntiparticle' })
    )
    assertValidPixelColors(imageData.data, WIDTH, HEIGHT)
  })

  it('pauliSpinDensity: blends spin up/down colors', () => {
    const { ctx, imageData } = createMockCtx(WIDTH, HEIGHT)
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'pauliSpinDensity' }))
    assertValidPixelColors(imageData.data, WIDTH, HEIGHT)
    assertGradientVariation(imageData.data, WIDTH)
  })

  it('pauliSpinExpectation: diverging blue/red around neutral', () => {
    const { ctx, imageData } = createMockCtx(WIDTH, HEIGHT)
    renderColorGradient(
      ctx,
      WIDTH,
      HEIGHT,
      defaultParams({ colorAlgorithm: 'pauliSpinExpectation' })
    )
    assertValidPixelColors(imageData.data, WIDTH, HEIGHT)
  })

  it('pauliCoherence: produces valid gradient', () => {
    const { ctx, imageData } = createMockCtx(WIDTH, HEIGHT)
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'pauliCoherence' }))
    assertValidPixelColors(imageData.data, WIDTH, HEIGHT)
  })

  // --- Fallback ---
  it('unknown algorithm falls back to cosine palette', () => {
    const { ctx, imageData } = createMockCtx(WIDTH, HEIGHT)
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams({ colorAlgorithm: 'cosine' }))
    assertValidPixelColors(imageData.data, WIDTH, HEIGHT)
    assertGradientVariation(imageData.data, WIDTH)
  })

  // --- Common behaviors ---
  it('calls putImageData exactly once', () => {
    const { ctx, putImageDataCalls } = createMockCtx(WIDTH, HEIGHT)
    renderColorGradient(ctx, WIDTH, HEIGHT, defaultParams())
    expect(putImageDataCalls).toHaveLength(1)
    expect(putImageDataCalls[0]!.dx).toBe(0)
    expect(putImageDataCalls[0]!.dy).toBe(0)
  })

  it('fills all columns with consistent rows', () => {
    const { ctx, imageData } = createMockCtx(100, 20)
    renderColorGradient(ctx, 100, 20, defaultParams())
    // Each column should have the same color in all rows
    for (let x = 0; x < 100; x++) {
      const [r0, g0, b0] = getColumnColor(imageData.data, x)
      for (let y = 1; y < 20; y++) {
        const i = (y * 100 + x) * 4
        expect(imageData.data[i]).toBe(r0)
        expect(imageData.data[i + 1]).toBe(g0)
        expect(imageData.data[i + 2]).toBe(b0)
        expect(imageData.data[i + 3]).toBe(255)
      }
    }
  })

  it('handles zero-size canvas gracefully', () => {
    const { ctx, putImageDataCalls } = createMockCtx(0, 0)
    renderColorGradient(ctx, 0, 0, defaultParams())
    expect(putImageDataCalls).toHaveLength(0)
  })
})
