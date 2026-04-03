/**
 * Color gradient rendering for the ColorPreview component.
 *
 * All color algorithm implementations are here so the React component
 * stays under the eslint complexity limit.
 *
 * @module components/sections/Faces/colorPreviewGradient
 */

import { hexToSrgbTuple } from '@/lib/colors/colorUtils'
import { applyDistributionTS, getCosinePaletteColorTS } from '@/rendering/shaders/palette'

// ---------------------------------------------------------------------------
// Color conversion helpers
// ---------------------------------------------------------------------------

function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToSrgbTuple(hex)
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  if (max === r) return [((g - b) / d + (g < b ? 6 : 0)) / 6, s, l]
  if (max === g) return [((b - r) / d + 2) / 6, s, l]
  return [((r - g) / d + 4) / 6, s, l]
}

const hexToRgb = hexToSrgbTuple

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1))
  const m = l - c / 2
  let r = 0,
    g = 0,
    b = 0
  if (h < 1 / 6) {
    r = c
    g = x
  } else if (h < 2 / 6) {
    r = x
    g = c
  } else if (h < 3 / 6) {
    g = c
    b = x
  } else if (h < 4 / 6) {
    g = x
    b = c
  } else if (h < 5 / 6) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }
  return [r + m, g + m, b + m]
}

function oklabToLinearSrgb(L: number, a: number, b_: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b_
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b_
  const s_ = L - 0.0894841775 * a - 1.291485548 * b_
  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

// ---------------------------------------------------------------------------
// Per-algorithm color computation
// ---------------------------------------------------------------------------

/** Parameters needed by all color algorithms. */
export interface GradientParams {
  colorAlgorithm: string
  cosineCoefficients: { a: number[]; b: number[]; c: number[]; d: number[] }
  distribution: { power: number; cycles: number; offset: number }
  lchLightness: number
  lchChroma: number
  faceColor: string
  domainColoring: {
    modulusMode: string
    contoursEnabled: boolean
    contourDensity: number
    contourWidth: number
    contourStrength: number
  }
  phaseDiverging: { neutralColor: string; positiveColor: string; negativeColor: string }
  divergingPsi: {
    component: string
    neutralColor: string
    positiveColor: string
    negativeColor: string
    intensityFloor: number
  }
  pauliSpinUpColor: readonly [number, number, number]
  pauliSpinDownColor: readonly [number, number, number]
}

/** Compute color for phase/oklab-based algorithms. */
function computePhaseColor(
  alg: string,
  t: number,
  p: GradientParams
): [number, number, number] | null {
  if (alg === 'lch') {
    const distributedT = applyDistributionTS(
      t,
      p.distribution.power,
      p.distribution.cycles,
      p.distribution.offset
    )
    const hue = distributedT * 6.28318
    return oklabToLinearSrgb(
      p.lchLightness,
      p.lchChroma * Math.cos(hue),
      p.lchChroma * Math.sin(hue)
    )
  }
  if (alg === 'phase') {
    const [baseHue] = hexToHsl(p.faceColor)
    const hue = (((baseHue + (t - 0.5) * 0.4) % 1) + 1) % 1
    return hslToRgb(hue, 0.75, 0.35)
  }
  if (alg === 'mixed') {
    const [baseHue] = hexToHsl(p.faceColor)
    const hue = (((baseHue + (t - 0.5) * 0.4) % 1) + 1) % 1
    return hslToRgb(hue, 0.7 + 0.25 * t, 0.15 + 0.35 * t)
  }
  if (alg === 'phaseCyclicUniform') {
    const angle = (((t % 1) + 1) % 1) * Math.PI * 2
    return oklabToLinearSrgb(0.72, 0.11 * Math.cos(angle), 0.11 * Math.sin(angle))
  }
  if (alg === 'phaseDensity') {
    return hslToRgb(t, 0.3 + 0.65 * t, t * 0.55)
  }
  return null
}

/** Compute color for diverging/domain-coloring algorithms. */
function computeDivergingColor(
  alg: string,
  t: number,
  p: GradientParams
): [number, number, number] | null {
  if (alg === 'phaseDiverging') {
    const signCarrier = Math.cos(t * Math.PI * 2)
    const signStrength = Math.abs(signCarrier)
    const neutral = hexToRgb(p.phaseDiverging.neutralColor)
    const wing =
      signCarrier >= 0
        ? hexToRgb(p.phaseDiverging.positiveColor)
        : hexToRgb(p.phaseDiverging.negativeColor)
    const mag = 0.2 + 0.8 * t
    return [
      (neutral[0] * (1 - signStrength) + wing[0] * signStrength) * mag,
      (neutral[1] * (1 - signStrength) + wing[1] * signStrength) * mag,
      (neutral[2] * (1 - signStrength) + wing[2] * signStrength) * mag,
    ]
  }
  if (alg === 'diverging') {
    const signCarrier =
      p.divergingPsi.component === 'imag' ? Math.sin(t * Math.PI * 2) : Math.cos(t * Math.PI * 2)
    const signStrength = Math.abs(signCarrier)
    const neutral = hexToRgb(p.divergingPsi.neutralColor)
    const wing =
      signCarrier >= 0
        ? hexToRgb(p.divergingPsi.positiveColor)
        : hexToRgb(p.divergingPsi.negativeColor)
    const floor = Math.max(0, Math.min(1, p.divergingPsi.intensityFloor))
    const intensity = floor + (1 - floor) * signStrength
    return [
      (neutral[0] * (1 - signStrength) + wing[0] * signStrength) * intensity,
      (neutral[1] * (1 - signStrength) + wing[1] * signStrength) * intensity,
      (neutral[2] * (1 - signStrength) + wing[2] * signStrength) * intensity,
    ]
  }
  if (alg === 'domainColoringPsi') {
    const modulusValue = p.domainColoring.modulusMode === 'logPsiAbs' ? 0.5 + 0.5 * t : t
    const lightness = Math.max(0, Math.min(1, 0.08 + 0.82 * modulusValue))
    const [r, g, b] = hslToRgb(t, 0.85, lightness)
    if (!p.domainColoring.contoursEnabled) return [r, g, b]
    const cd = Math.max(1, p.domainColoring.contourDensity)
    const cw = Math.max(0.005, Math.min(0.25, p.domainColoring.contourWidth))
    const cs = Math.max(0, Math.min(1, p.domainColoring.contourStrength))
    const logMod = p.domainColoring.modulusMode === 'logPsiAbs' ? -4 + 4 * t : -8 + 8 * t
    const cp = (((logMod * cd) % 1) + 1) % 1
    const ld = Math.min(cp, 1 - cp)
    const ew = Math.max(0.001, cw * 0.5)
    const lm = ld <= ew ? 1 : Math.max(0, 1 - (ld - ew) / ew)
    const darken = 1 - cs * lm * 0.85
    return [r * darken, g * darken, b * darken]
  }
  if (alg === 'relativePhase') return hslToRgb(t, 0.85, t)
  return null
}

/** Compute color for spectral/scientific colormaps. */
function computeSpectralColor(
  alg: string,
  t: number,
  _p: GradientParams
): [number, number, number] | null {
  if (alg === 'blackbody') {
    const temp = t * 12000
    if (temp < 500) return [0, 0, 0]
    const tk = temp / 100
    let r = tk <= 66 ? 1.0 : (329.698727446 * Math.pow(tk - 60, -0.1332047592)) / 255
    let g =
      tk <= 66
        ? (99.4708025861 * Math.log(tk) - 161.1195681661) / 255
        : (288.1221695283 * Math.pow(tk - 60, -0.0755148492)) / 255
    let b =
      tk >= 66 ? 1.0 : tk <= 19 ? 0 : (138.5177312231 * Math.log(tk - 10) - 305.0447927307) / 255
    r = Math.min(1, Math.max(0, r))
    g = Math.min(1, Math.max(0, g))
    b = Math.min(1, Math.max(0, b))
    return [r, g, b]
  }
  if (alg === 'radialDistance') return hslToRgb(0.8 * Math.max(0, Math.min(1, t)), 1.0, 0.5)
  if (alg === 'hamiltonianDecomposition') {
    const br = Math.max(0, Math.min(1, t * 1.5))
    return [t * t * br, Math.sin(t * Math.PI) * 0.8 * br, (1 - t) * (1 - t) * br]
  }
  if (alg === 'modeCharacter')
    return hslToRgb(t * 0.8, Math.min(1, t * 10), Math.min(1, Math.sqrt(t) * 2) * 0.5)
  if (alg === 'energyFlux') {
    const br = Math.max(0, Math.min(1, Math.log(t + 1e-6) / 4 + 1))
    return hslToRgb(t, 0.8, Math.max(0.2, 0.6 * br))
  }
  if (alg === 'kSpaceOccupation') {
    return hslToRgb(
      0.7 + (0.12 - 0.7) * t,
      0.6 + (0.95 - 0.6) * Math.min(1, Math.max(0, t / 0.5)),
      0.08 + (0.55 - 0.08) * t
    )
  }
  return null
}

/** 5-stop piecewise linear interpolation. */
function piecewise5(t: number, stops: [number, number, number][]): [number, number, number] {
  const idx = Math.min(3, Math.floor(t * 4))
  const u = (t - idx * 0.25) / 0.25
  const a = stops[idx]!
  const b = stops[idx + 1] ?? a
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]
}

/** Compute color for colormap and Pauli algorithms. */
function computeColormapColor(
  alg: string,
  t: number,
  p: GradientParams
): [number, number, number] | null {
  if (alg === 'viridis' || alg === 'densityContours') {
    const [r, g, b] = piecewise5(t, [
      [0.267, 0.004, 0.329],
      [0.282, 0.14, 0.457],
      [0.127, 0.566, 0.55],
      [0.741, 0.873, 0.15],
      [0.993, 0.906, 0.144],
    ])
    if (alg === 'densityContours') {
      const ct = (t * 10) % 1
      const ld = Math.min(ct, 1 - ct)
      const lm = ld < 0.06 ? 1 - ld / 0.06 : 0
      const d = 1 - 0.7 * lm
      return [r * d, g * d, b * d]
    }
    return [r, g, b]
  }
  if (alg === 'inferno') {
    return piecewise5(t, [
      [0.001, 0.0, 0.014],
      [0.258, 0.039, 0.406],
      [0.865, 0.138, 0.082],
      [0.987, 0.645, 0.04],
      [0.988, 0.998, 0.645],
    ])
  }
  if (alg === 'particleAntiparticle') {
    return [0.1 * (1 - t) + 0.95 * t, 0.55 * (1 - t) + 0.15 * t, 0.95 * (1 - t) + 0.45 * t]
  }
  if (alg === 'pauliSpinDensity') {
    const up = Math.max(0, 1 - 2 * t)
    const down = Math.max(0, 2 * t - 1)
    const overlap = 1 - Math.abs(2 * t - 1)
    return [
      p.pauliSpinUpColor[0] * (up + 0.5 * overlap) +
        p.pauliSpinDownColor[0] * (down + 0.5 * overlap),
      p.pauliSpinUpColor[1] * (up + 0.5 * overlap) +
        p.pauliSpinDownColor[1] * (down + 0.5 * overlap),
      p.pauliSpinUpColor[2] * (up + 0.5 * overlap) +
        p.pauliSpinDownColor[2] * (down + 0.5 * overlap),
    ]
  }
  if (alg === 'pauliSpinExpectation') {
    const sigmaZ = 2 * t - 1
    const wing: [number, number, number] = sigmaZ >= 0 ? [0.15, 0.35, 0.95] : [0.95, 0.2, 0.15]
    const neutral: [number, number, number] = [0.85, 0.85, 0.85]
    const strength = Math.abs(sigmaZ)
    const br = 0.3 + 0.7 * (0.5 + 0.5 * strength)
    return [
      (neutral[0] * (1 - strength) + wing[0] * strength) * br,
      (neutral[1] * (1 - strength) + wing[1] * strength) * br,
      (neutral[2] * (1 - strength) + wing[2] * strength) * br,
    ]
  }
  if (alg === 'pauliCoherence') return hslToRgb(0.48 + 0.04 * t, 0.4 + 0.55 * t, 0.08 + 0.42 * t)
  return null
}

/** Compute a single gradient color sample for a given algorithm and parameter t in [0,1]. */
function computeGradientColor(t: number, p: GradientParams): [number, number, number] {
  const alg = p.colorAlgorithm
  return (
    computePhaseColor(alg, t, p) ??
    computeDivergingColor(alg, t, p) ??
    computeSpectralColor(alg, t, p) ??
    computeColormapColor(alg, t, p) ??
    (() => {
      const color = getCosinePaletteColorTS(
        t,
        p.cosineCoefficients.a as [number, number, number],
        p.cosineCoefficients.b as [number, number, number],
        p.cosineCoefficients.c as [number, number, number],
        p.cosineCoefficients.d as [number, number, number],
        p.distribution.power,
        p.distribution.cycles,
        p.distribution.offset
      )
      return [color.r, color.g, color.b] as [number, number, number]
    })()
  )
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render the full color gradient onto a canvas 2D context.
 *
 * @param ctx - Canvas 2D rendering context
 * @param width - Canvas width in pixels
 * @param height - Canvas height in pixels
 * @param params - Color algorithm parameters from store state
 */
export function renderColorGradient(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  params: GradientParams
): void {
  if (width <= 0 || height <= 0) return
  if (typeof ctx.createImageData !== 'function') return

  const imageData = ctx.createImageData(width, height)
  const data = imageData.data

  for (let x = 0; x < width; x++) {
    const t = x / width
    const [r, g, b] = computeGradientColor(t, params)

    const r8 = Math.round(Math.max(0, Math.min(1, r)) * 255)
    const g8 = Math.round(Math.max(0, Math.min(1, g)) * 255)
    const b8 = Math.round(Math.max(0, Math.min(1, b)) * 255)

    // Write column: same color for all rows
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4
      data[i] = r8
      data[i + 1] = g8
      data[i + 2] = b8
      data[i + 3] = 255
    }
  }

  ctx.putImageData(imageData, 0, 0)
}
