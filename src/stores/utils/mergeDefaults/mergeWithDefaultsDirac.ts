import {
  DEFAULT_DIRAC_CONFIG,
  DIRAC_MAX_LATTICE_DIM,
  type DiracConfig,
  type DiracFieldView,
  type DiracInitialCondition,
  type DiracPotentialType,
  isDiracFieldView,
  isDiracInitialCondition,
  isDiracPotentialType,
  sanitizeDiracLatticeConfig,
} from '@/lib/geometry/extended/dirac'
import { maxStableDt } from '@/lib/physics/dirac/scales'

const MIN_DIRAC_DT = 0.0001
const DIRAC_DT_CFL_SAFETY = 0.9
const DEFAULT_DIRAC_SPACING = 0.15
const SPIN_DIRECTION_COMPONENTS = 2

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clampFinite(value: unknown, fallback: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, finiteNumber(value, fallback)))
}

function clampFiniteInteger(value: unknown, fallback: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(finiteNumber(value, fallback))))
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function enumValue<T extends string>(
  value: unknown,
  isValid: (candidate: unknown) => candidate is T,
  fallback: T
): T {
  return isValid(value) ? value : fallback
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function sourceArray(source: Record<string, unknown>, merged: DiracConfig, key: keyof DiracConfig) {
  const raw = source[key as string]
  if (Array.isArray(raw)) return raw
  const mergedValue = merged[key]
  return Array.isArray(mergedValue) ? (mergedValue as unknown[]) : []
}

function axisHalfExtent(gridSize: number[], spacing: number[], axis: number): number {
  return (gridSize[axis] ?? 32) * (spacing[axis] ?? DEFAULT_DIRAC_SPACING) * 0.5
}

function axis0HalfExtent(gridSize: number[], spacing: number[]): number {
  return axisHalfExtent(gridSize, spacing, 0)
}

function normalizeGridSize(
  source: Record<string, unknown>,
  merged: DiracConfig,
  latticeDim: number
): number[] {
  const values = sourceArray(source, merged, 'gridSize')
  const gridSize = Array.from({ length: latticeDim }, (_, i) => finiteNumber(values[i], Number.NaN))
  return sanitizeDiracLatticeConfig({ ...merged, latticeDim, gridSize }).gridSize.slice(
    0,
    latticeDim
  )
}

function normalizeSpacing(
  source: Record<string, unknown>,
  merged: DiracConfig,
  latticeDim: number
): number[] {
  const values = sourceArray(source, merged, 'spacing')
  return Array.from({ length: latticeDim }, (_, i) =>
    clampFinite(values[i], DEFAULT_DIRAC_CONFIG.spacing[i] ?? DEFAULT_DIRAC_SPACING, 0.01, 1.0)
  )
}

function normalizePacketCenter(
  source: Record<string, unknown>,
  merged: DiracConfig,
  gridSize: number[],
  spacing: number[]
): number[] {
  const values = sourceArray(source, merged, 'packetCenter')
  return Array.from({ length: gridSize.length }, (_, i) => {
    const limit = axisHalfExtent(gridSize, spacing, i) * 0.9
    return clampFinite(values[i], DEFAULT_DIRAC_CONFIG.packetCenter[i] ?? 0, -limit, limit)
  })
}

function normalizePacketMomentum(
  source: Record<string, unknown>,
  merged: DiracConfig,
  spacing: number[]
): number[] {
  const values = sourceArray(source, merged, 'packetMomentum')
  return Array.from({ length: spacing.length }, (_, i) => {
    const kMax = Math.PI / (spacing[i] ?? DEFAULT_DIRAC_SPACING)
    return clampFinite(values[i], DEFAULT_DIRAC_CONFIG.packetMomentum[i] ?? 0, -kMax, kMax)
  })
}

function normalizePacketWidth(value: unknown, minHalfExtent: number): number {
  const clamped = clampFinite(value, DEFAULT_DIRAC_CONFIG.packetWidth, 0.05, 5)
  return Math.min(minHalfExtent * 0.4, clamped)
}

function normalizeSpinDirection(source: Record<string, unknown>, merged: DiracConfig): number[] {
  const values = sourceArray(source, merged, 'spinDirection')
  return Array.from({ length: SPIN_DIRECTION_COMPONENTS }, (_, i) =>
    finiteNumber(values[i], DEFAULT_DIRAC_CONFIG.spinDirection[i] ?? 0)
  )
}

function normalizeRgb(values: unknown[], fallback: readonly [number, number, number]) {
  return [
    clampFinite(values[0], fallback[0], 0, 1),
    clampFinite(values[1], fallback[1], 0, 1),
    clampFinite(values[2], fallback[2], 0, 1),
  ] as [number, number, number]
}

function normalizeSlicePositions(
  source: Record<string, unknown>,
  merged: DiracConfig,
  latticeDim: number
): number[] {
  const values = sourceArray(source, merged, 'slicePositions')
  return Array.from({ length: Math.max(0, latticeDim - 3) }, (_, i) =>
    clampFinite(values[i], 0, -1, 1)
  )
}

function clampDiracDt(spacing: number[], speedOfLight: number, value: unknown): number {
  const desired = finiteNumber(value, DEFAULT_DIRAC_CONFIG.dt)
  const dtMax = maxStableDt(spacing, speedOfLight)
  return Math.max(MIN_DIRAC_DT, Math.min(dtMax * DIRAC_DT_CFL_SAFETY, desired))
}

function normalizeFieldView(latticeDim: number, fieldView: DiracFieldView): DiracFieldView {
  return latticeDim < 3 && fieldView === 'axialCharge' ? DEFAULT_DIRAC_CONFIG.fieldView : fieldView
}

/** Normalize restored Dirac config so scenes and .mqstate files obey setter-era invariants. */
export function normalizeDiracLoadedConfig(merged: DiracConfig, loaded: unknown): DiracConfig {
  const source = recordOrEmpty(loaded)
  const latticeDim = clampFiniteInteger(
    source.latticeDim ?? merged.latticeDim,
    DEFAULT_DIRAC_CONFIG.latticeDim,
    1,
    DIRAC_MAX_LATTICE_DIM
  )
  const gridSize = normalizeGridSize(source, merged, latticeDim)
  const spacing = normalizeSpacing(source, merged, latticeDim)
  const speedOfLight = clampFinite(merged.speedOfLight, DEFAULT_DIRAC_CONFIG.speedOfLight, 0.01, 10)
  const minHalfExtent = Math.min(...gridSize.map((g, i) => g * (spacing[i] ?? 0.15) * 0.5))
  const potentialCenterLimit = axis0HalfExtent(gridSize, spacing)
  const potentialType = enumValue<DiracPotentialType>(
    merged.potentialType,
    isDiracPotentialType,
    DEFAULT_DIRAC_CONFIG.potentialType
  )
  const initialCondition = enumValue<DiracInitialCondition>(
    merged.initialCondition,
    isDiracInitialCondition,
    DEFAULT_DIRAC_CONFIG.initialCondition
  )
  const fieldView = normalizeFieldView(
    latticeDim,
    enumValue<DiracFieldView>(merged.fieldView, isDiracFieldView, DEFAULT_DIRAC_CONFIG.fieldView)
  )

  return {
    ...merged,
    latticeDim,
    gridSize,
    spacing,
    mass: clampFinite(merged.mass, DEFAULT_DIRAC_CONFIG.mass, 0.01, 10),
    speedOfLight,
    hbar: clampFinite(merged.hbar, DEFAULT_DIRAC_CONFIG.hbar, 0.01, 10),
    dt: clampDiracDt(spacing, speedOfLight, merged.dt),
    stepsPerFrame: clampFiniteInteger(
      merged.stepsPerFrame,
      DEFAULT_DIRAC_CONFIG.stepsPerFrame,
      1,
      16
    ),
    potentialType,
    potentialStrength: clampFinite(
      merged.potentialStrength,
      DEFAULT_DIRAC_CONFIG.potentialStrength,
      -100,
      100
    ),
    potentialWidth: clampFinite(
      merged.potentialWidth,
      DEFAULT_DIRAC_CONFIG.potentialWidth,
      0.01,
      10
    ),
    potentialCenter: clampFinite(
      merged.potentialCenter,
      DEFAULT_DIRAC_CONFIG.potentialCenter,
      -potentialCenterLimit,
      potentialCenterLimit
    ),
    harmonicOmega: clampFinite(merged.harmonicOmega, DEFAULT_DIRAC_CONFIG.harmonicOmega, 0.01, 10),
    coulombZ: clampFiniteInteger(merged.coulombZ, DEFAULT_DIRAC_CONFIG.coulombZ, 1, 137),
    initialCondition,
    packetCenter: normalizePacketCenter(source, merged, gridSize, spacing),
    packetWidth: normalizePacketWidth(merged.packetWidth, minHalfExtent),
    packetMomentum: normalizePacketMomentum(source, merged, spacing),
    spinDirection: normalizeSpinDirection(source, merged),
    positiveEnergyFraction: clampFinite(
      merged.positiveEnergyFraction,
      DEFAULT_DIRAC_CONFIG.positiveEnergyFraction,
      0,
      1
    ),
    fieldView,
    particleColor: normalizeRgb(
      sourceArray(source, merged, 'particleColor'),
      DEFAULT_DIRAC_CONFIG.particleColor
    ),
    antiparticleColor: normalizeRgb(
      sourceArray(source, merged, 'antiparticleColor'),
      DEFAULT_DIRAC_CONFIG.antiparticleColor
    ),
    autoScale: booleanValue(merged.autoScale, DEFAULT_DIRAC_CONFIG.autoScale),
    showPotential: booleanValue(merged.showPotential, DEFAULT_DIRAC_CONFIG.showPotential),
    absorberEnabled: booleanValue(merged.absorberEnabled, DEFAULT_DIRAC_CONFIG.absorberEnabled),
    absorberWidth: clampFinite(merged.absorberWidth, DEFAULT_DIRAC_CONFIG.absorberWidth, 0.05, 0.5),
    pmlTargetReflection: clampFinite(
      merged.pmlTargetReflection,
      DEFAULT_DIRAC_CONFIG.pmlTargetReflection,
      1e-12,
      0.999
    ),
    diagnosticsEnabled: booleanValue(
      merged.diagnosticsEnabled,
      DEFAULT_DIRAC_CONFIG.diagnosticsEnabled
    ),
    diagnosticsInterval: clampFiniteInteger(
      merged.diagnosticsInterval,
      DEFAULT_DIRAC_CONFIG.diagnosticsInterval,
      1,
      60
    ),
    needsReset: booleanValue(merged.needsReset, DEFAULT_DIRAC_CONFIG.needsReset),
    slicePositions: normalizeSlicePositions(source, merged, latticeDim),
  }
}
