import { rgbUnitToHsl } from '@/lib/colors/colorUtils'
import { DEFAULT_PAULI_CONFIG } from '@/lib/geometry/extended/types'
import { computeRadialProbabilityNorm } from '@/lib/math/hydrogenRadialProbability'
import type { AppearanceStoreState } from '@/stores/scene/appearanceStore'

import { parseHexColorToLinearRgb, type Rgb } from '../utils/color'
import { MOMENTUM_DISPLAY_MODE_MAP, REPRESENTATION_MODE_MAP } from './schrodingerRendererTypes'
import { SCHROEDINGER_LAYOUT } from './schroedingerLayout'
import type { SchroedingerPackParams } from './uniformPackingTypes'

const I = SCHROEDINGER_LAYOUT.index
const RADIAL_PROBABILITY_COLOR_FALLBACK = parseHexColorToLinearRgb('#44aaff')

interface HydrogenResult {
  validN: number
  validL: number
  bohrRadius: number
}

/** Parse a hex color string to a linear-space RGB triplet. */
export const parseColor = (hex: unknown, fallback?: Rgb): Rgb =>
  parseHexColorToLinearRgb(typeof hex === 'string' ? hex : '', fallback)

function finiteClamped(value: unknown, fallback: number, min: number, max: number): number {
  const finite = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.max(min, Math.min(max, finite))
}

/**
 * Pack a hex color into a 4-float RGBA slot in a uniform Float32Array.
 * Alpha is hardcoded to 0 — uniform color slots use alpha as padding.
 */
export function packColorRgba(
  floatView: Float32Array,
  idx: number,
  hex: unknown,
  fallback?: Rgb
): void {
  const rgb = parseColor(hex, fallback)
  floatView[idx] = rgb[0]
  floatView[idx + 1] = rgb[1]
  floatView[idx + 2] = rgb[2]
  floatView[idx + 3] = 0.0
}

/** Pack representation, radial probability, domain coloring, and diverging. */
export function packRepresentationAndColorOverlays(
  floatView: Float32Array,
  intView: Int32Array,
  p: SchroedingerPackParams,
  hydrogen: HydrogenResult
): void {
  const { isUniformComputeMode, isDensityMatrixMode, quantumModeStr, schroedinger, appearance } = p
  const forcePosition =
    isUniformComputeMode ||
    (isDensityMatrixMode &&
      (quantumModeStr === 'hydrogenND' || quantumModeStr === 'hydrogenNDCoupled'))
  intView[I.representationMode] = forcePosition
    ? 0
    : (REPRESENTATION_MODE_MAP[schroedinger?.representation ?? 'position'] ?? 0)
  intView[I.momentumDisplayMode] =
    MOMENTUM_DISPLAY_MODE_MAP[schroedinger?.momentumDisplayUnits ?? 'k'] ?? 0
  floatView[I.momentumScale] = p.effectiveMomentumScale
  floatView[I.momentumHbar] = schroedinger?.momentumHbar ?? 1.0

  const isMomentumRep = !isUniformComputeMode && schroedinger?.representation === 'momentum'
  const radialProbEnabled = schroedinger?.radialProbabilityEnabled === true && !isMomentumRep
  intView[I.radialProbabilityEnabled] = radialProbEnabled ? 1 : 0
  floatView[I.radialProbabilityOpacity] = finiteClamped(
    schroedinger?.radialProbabilityOpacity,
    0.6,
    0,
    1
  )
  floatView[I.radialProbabilityNorm] =
    radialProbEnabled && quantumModeStr !== 'harmonicOscillator'
      ? computeRadialProbabilityNorm(
          hydrogen.validN,
          hydrogen.validL,
          hydrogen.bohrRadius,
          p.dimension
        )
      : 1.0
  packColorRgba(
    floatView,
    I.radialProbabilityColor,
    schroedinger?.radialProbabilityColor ?? '#44aaff',
    RADIAL_PROBABILITY_COLOR_FALLBACK
  )

  const domainColoring = appearance?.domainColoring
  floatView[I.domainColoringParams0] = domainColoring?.modulusMode === 'logPsiAbs' ? 1.0 : 0.0
  floatView[I.domainColoringParams0 + 1] = domainColoring?.contoursEnabled ? 1.0 : 0.0
  floatView[I.domainColoringParams0 + 2] = domainColoring?.contourDensity ?? 8.0
  floatView[I.domainColoringParams0 + 3] = domainColoring?.contourWidth ?? 0.08
  floatView[I.domainColoringParams1] = domainColoring?.contourStrength ?? 0.45
  floatView[I.domainColoringParams1 + 1] = 0.0
  floatView[I.domainColoringParams1 + 2] = 0.0
  floatView[I.domainColoringParams1 + 3] = 0.0

  packDivergingColors(floatView, appearance)
}

/** Pack Wigner phase-space and Pauli spinor color fields. */
export function packWignerAndPauliFields(
  floatView: Float32Array,
  intView: Int32Array,
  p: SchroedingerPackParams,
  hydrogen: HydrogenResult
): void {
  const { schroedinger, pauliSpinor, dimension } = p
  const rawWignerDimIdx = schroedinger?.wignerDimensionIndex
  const wignerDimIdx =
    typeof rawWignerDimIdx === 'number' && Number.isFinite(rawWignerDimIdx)
      ? Math.floor(rawWignerDimIdx)
      : 0
  const maxWignerDimIdx =
    Number.isFinite(dimension) && dimension > 0 ? Math.max(0, Math.floor(dimension) - 1) : 0
  const clampedWignerDimIdx = Math.max(0, Math.min(wignerDimIdx, maxWignerDimIdx))
  intView[I.wignerDimensionIndex] = clampedWignerDimIdx
  intView[I.wignerCrossTermsEnabled] = schroedinger?.wignerCrossTermsEnabled ? 1 : 0

  if (schroedinger?.wignerAutoRange ?? true) {
    packWignerAutoRange(floatView, intView, p, clampedWignerDimIdx, hydrogen)
  } else {
    floatView[I.wignerXRange] = finiteClamped(schroedinger?.wignerXRange, 6.0, 1.0, 30.0)
    floatView[I.wignerPRange] = finiteClamped(schroedinger?.wignerPRange, 6.0, 1.0, 30.0)
  }
  const rawQuadPoints = schroedinger?.wignerQuadPoints
  const quadPoints =
    typeof rawQuadPoints === 'number' && Number.isFinite(rawQuadPoints)
      ? Math.round(rawQuadPoints)
      : 32
  intView[I.wignerQuadPoints] = Math.max(8, Math.min(96, quadPoints))

  const spinUp = pauliSpinor?.spinUpColor ?? DEFAULT_PAULI_CONFIG.spinUpColor
  const spinDown = pauliSpinor?.spinDownColor ?? DEFAULT_PAULI_CONFIG.spinDownColor
  floatView[I.pauliSpinUpColor] = spinUp[0]!
  floatView[I.pauliSpinUpColor + 1] = spinUp[1]!
  floatView[I.pauliSpinUpColor + 2] = spinUp[2]!
  floatView[I.pauliSpinDownColor] = spinDown[0]!
  floatView[I.pauliSpinDownColor + 1] = spinDown[1]!
  floatView[I.pauliSpinDownColor + 2] = spinDown[2]!

  const upHsl = rgbUnitToHsl(spinUp[0]!, spinUp[1]!, spinUp[2]!)
  const downHsl = rgbUnitToHsl(spinDown[0]!, spinDown[1]!, spinDown[2]!)
  floatView[I.pauliSpinUpColorHSL] = upHsl[0]
  floatView[I.pauliSpinUpColorHSL + 1] = upHsl[1]
  floatView[I.pauliSpinUpColorHSL + 2] = upHsl[2]
  floatView[I.pauliSpinDownColorHSL] = downHsl[0]
  floatView[I.pauliSpinDownColorHSL + 1] = downHsl[1]
  floatView[I.pauliSpinDownColorHSL + 2] = downHsl[2]
}

function packDivergingColors(
  floatView: Float32Array,
  appearance: AppearanceStoreState | undefined
): void {
  const usePhaseDivergingPalette = appearance?.colorAlgorithm === 'phaseDiverging'
  const phaseDiverging = appearance?.phaseDiverging
  const divergingPsi = appearance?.divergingPsi
  const divergingNeutral = parseColor(
    usePhaseDivergingPalette
      ? (phaseDiverging?.neutralColor ?? '#ebebeb')
      : (divergingPsi?.neutralColor ?? '#d9d9d9')
  )
  const divergingPositive = parseColor(
    usePhaseDivergingPalette
      ? (phaseDiverging?.positiveColor ?? '#eb3d38')
      : (divergingPsi?.positiveColor ?? '#e83b3b')
  )
  const divergingNegative = parseColor(
    usePhaseDivergingPalette
      ? (phaseDiverging?.negativeColor ?? '#3866f2')
      : (divergingPsi?.negativeColor ?? '#3166f5')
  )
  floatView[I.divergingNeutralParams] = divergingNeutral[0]
  floatView[I.divergingNeutralParams + 1] = divergingNeutral[1]
  floatView[I.divergingNeutralParams + 2] = divergingNeutral[2]
  floatView[I.divergingNeutralParams + 3] = usePhaseDivergingPalette
    ? 0.2
    : Math.max(0, Math.min(1, divergingPsi?.intensityFloor ?? 0.2))
  floatView[I.divergingPositiveParams] = divergingPositive[0]
  floatView[I.divergingPositiveParams + 1] = divergingPositive[1]
  floatView[I.divergingPositiveParams + 2] = divergingPositive[2]
  floatView[I.divergingPositiveParams + 3] = usePhaseDivergingPalette
    ? 0.0
    : divergingPsi?.component === 'imag'
      ? 1.0
      : 0.0
  floatView[I.divergingNegativeParams] = divergingNegative[0]
  floatView[I.divergingNegativeParams + 1] = divergingNegative[1]
  floatView[I.divergingNegativeParams + 2] = divergingNegative[2]
  floatView[I.divergingNegativeParams + 3] = 0.0
}

function packWignerAutoRange(
  floatView: Float32Array,
  intView: Int32Array,
  p: SchroedingerPackParams,
  wignerDimIdx: number,
  hydrogen: HydrogenResult
): void {
  const isHydrogenMode =
    p.rendererQuantumMode === 'hydrogenND' || p.rendererQuantumMode === 'hydrogenNDCoupled'

  if (isHydrogenMode && wignerDimIdx < 3) {
    const n = hydrogen.validN
    const a0 = hydrogen.bohrRadius
    const rCenter = n * n * a0
    const rMax = rCenter * 2.5
    floatView[I.wignerXRange] = Math.max(rCenter, rMax - rCenter)
    floatView[I.wignerPRange] = 3.0 / (n * a0)
    return
  }

  const { selectedOmega, maxN } = getWignerRangeBasis(floatView, intView, p, wignerDimIdx)
  const nScale = Math.max(2 * maxN + 1, 1)
  floatView[I.wignerXRange] = Math.sqrt(nScale / Math.max(selectedOmega, 0.01)) * 3.5
  floatView[I.wignerPRange] = Math.sqrt(nScale * Math.max(selectedOmega, 0.01)) * 3.5
}

function getWignerRangeBasis(
  floatView: Float32Array,
  intView: Int32Array,
  p: SchroedingerPackParams,
  wignerDimIdx: number
): { selectedOmega: number; maxN: number } {
  const isHydrogenMode =
    p.rendererQuantumMode === 'hydrogenND' || p.rendererQuantumMode === 'hydrogenNDCoupled'
  if (isHydrogenMode && wignerDimIdx >= 3) {
    const extraIdx = wignerDimIdx - 3
    return {
      selectedOmega: floatView[I.extraDimOmega + extraIdx] ?? 1.0,
      maxN: intView[I.extraDimN + extraIdx] ?? 0,
    }
  }

  const dimIdx = Math.min(wignerDimIdx, 10)
  let maxN = 0
  for (let k = 0; k < (p.rendererTermCount ?? 1); k++) {
    const qn = intView[I.quantum + k * 11 + dimIdx] ?? 0
    if (qn > maxN) maxN = qn
  }
  return { selectedOmega: floatView[I.omega + dimIdx] ?? 1.0, maxN }
}
