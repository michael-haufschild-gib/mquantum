import { MAX_DIMENSION, MIN_DIMENSION } from '@/constants/dimension'
import {
  DEFAULT_PAULI_CONFIG,
  type PauliConfig,
  type PauliFieldType,
  type PauliFieldView,
  type PauliInitialCondition,
  type PauliPotentialType,
} from '@/lib/geometry/extended/pauli'
import { sanitizePowerOfTwoGridSizes } from '@/lib/math/ndArray'

const PAULI_MAX_TOTAL_SITES = 65535 * 64
const DEFAULT_PAULI_SPACING = 0.15

const FIELD_TYPES: readonly PauliFieldType[] = ['uniform', 'gradient', 'rotating', 'quadrupole']
const FIELD_VIEWS: readonly PauliFieldView[] = [
  'spinDensity',
  'totalDensity',
  'spinExpectation',
  'coherence',
  'spinHelicity',
  'berryCurvature',
]
const INITIAL_CONDITIONS: readonly PauliInitialCondition[] = [
  'gaussianSpinUp',
  'gaussianSpinDown',
  'gaussianSuperposition',
  'planeWaveSpinor',
]
const POTENTIAL_TYPES: readonly PauliPotentialType[] = [
  'none',
  'harmonicTrap',
  'barrier',
  'doubleWell',
]

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clampFinite(value: unknown, fallback: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, finiteNumber(value, fallback)))
}

function clampFiniteInteger(value: unknown, fallback: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(finiteNumber(value, fallback))))
}

function enumValue<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === 'string' && values.includes(value as T) ? (value as T) : fallback
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function sourceArray(source: Record<string, unknown>, merged: PauliConfig, key: keyof PauliConfig) {
  const raw = source[key as string]
  return Array.isArray(raw) ? raw : (merged[key] as unknown[])
}

function normalizePair(
  values: unknown[],
  fallback: readonly [number, number],
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY
): [number, number] {
  return [
    clampFinite(values[0], fallback[0], min, max),
    clampFinite(values[1], fallback[1], min, max),
  ]
}

function normalizeRgb(values: unknown[], fallback: readonly [number, number, number]) {
  return [
    clampFinite(values[0], fallback[0], 0, 1),
    clampFinite(values[1], fallback[1], 0, 1),
    clampFinite(values[2], fallback[2], 0, 1),
  ] as [number, number, number]
}

function normalizeFixedVector(values: unknown[], fallback: readonly number[]): number[] {
  return Array.from({ length: MAX_DIMENSION }, (_, i) => finiteNumber(values[i], fallback[i] ?? 0))
}

function normalizeGridSize(
  source: Record<string, unknown>,
  merged: PauliConfig,
  latticeDim: number
) {
  const values = sourceArray(source, merged, 'gridSize')
  const gridSize = Array.from({ length: latticeDim }, (_, i) => {
    const value = values[i]
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
  }) as number[]
  return sanitizePowerOfTwoGridSizes(
    { gridSize, latticeDim },
    {
      maxTotalSites: PAULI_MAX_TOTAL_SITES,
      maxDimensions: MAX_DIMENSION,
    }
  ).gridSize.slice(0, latticeDim)
}

function normalizeSpacing(
  source: Record<string, unknown>,
  merged: PauliConfig,
  latticeDim: number
) {
  const values = sourceArray(source, merged, 'spacing')
  return Array.from({ length: latticeDim }, (_, i) =>
    clampFinite(values[i], DEFAULT_PAULI_CONFIG.spacing[i] ?? DEFAULT_PAULI_SPACING, 0.01, 1.0)
  )
}

function normalizeSlicePositions(
  source: Record<string, unknown>,
  merged: PauliConfig,
  latticeDim: number
) {
  const values = sourceArray(source, merged, 'slicePositions')
  return Array.from({ length: Math.max(0, latticeDim - 3) }, (_, i) =>
    clampFinite(values[i], 0, -1, 1)
  )
}

/** Normalize restored Pauli config so saved scenes obey the same ranges as store setters. */
export function normalizePauliLoadedConfig(merged: PauliConfig, loaded: unknown): PauliConfig {
  const source = recordOrEmpty(loaded)
  const latticeDim = clampFiniteInteger(
    source.latticeDim ?? merged.latticeDim,
    DEFAULT_PAULI_CONFIG.latticeDim,
    MIN_DIMENSION,
    MAX_DIMENSION
  )
  const fieldDirection = normalizePair(
    sourceArray(source, merged, 'fieldDirection'),
    DEFAULT_PAULI_CONFIG.fieldDirection
  )
  const initialSpinDirection = normalizePair(
    sourceArray(source, merged, 'initialSpinDirection'),
    DEFAULT_PAULI_CONFIG.initialSpinDirection
  )

  return {
    ...merged,
    latticeDim,
    gridSize: normalizeGridSize(source, merged, latticeDim),
    spacing: normalizeSpacing(source, merged, latticeDim),
    dt: clampFinite(merged.dt, DEFAULT_PAULI_CONFIG.dt, 0.0001, 0.1),
    stepsPerFrame: clampFiniteInteger(
      merged.stepsPerFrame,
      DEFAULT_PAULI_CONFIG.stepsPerFrame,
      1,
      16
    ),
    hbar: clampFinite(merged.hbar, DEFAULT_PAULI_CONFIG.hbar, 0.01, 10),
    mass: clampFinite(merged.mass, DEFAULT_PAULI_CONFIG.mass, 0.01, 10),
    fieldType: enumValue(merged.fieldType, FIELD_TYPES, DEFAULT_PAULI_CONFIG.fieldType),
    fieldStrength: clampFinite(merged.fieldStrength, DEFAULT_PAULI_CONFIG.fieldStrength, 0, 50),
    fieldDirection,
    gradientStrength: clampFinite(
      merged.gradientStrength,
      DEFAULT_PAULI_CONFIG.gradientStrength,
      0,
      20
    ),
    rotatingFrequency: clampFinite(
      merged.rotatingFrequency,
      DEFAULT_PAULI_CONFIG.rotatingFrequency,
      0.01,
      50
    ),
    initialSpinDirection,
    initialCondition: enumValue(
      merged.initialCondition,
      INITIAL_CONDITIONS,
      DEFAULT_PAULI_CONFIG.initialCondition
    ),
    packetCenter: normalizeFixedVector(
      sourceArray(source, merged, 'packetCenter'),
      DEFAULT_PAULI_CONFIG.packetCenter
    ),
    packetWidth: clampFinite(merged.packetWidth, DEFAULT_PAULI_CONFIG.packetWidth, 0.05, 5),
    packetMomentum: normalizeFixedVector(
      sourceArray(source, merged, 'packetMomentum'),
      DEFAULT_PAULI_CONFIG.packetMomentum
    ),
    potentialType: enumValue(
      merged.potentialType,
      POTENTIAL_TYPES,
      DEFAULT_PAULI_CONFIG.potentialType
    ),
    harmonicOmega: clampFinite(merged.harmonicOmega, DEFAULT_PAULI_CONFIG.harmonicOmega, 0.01, 10),
    wellDepth: clampFinite(merged.wellDepth, DEFAULT_PAULI_CONFIG.wellDepth, 0, 100),
    wellWidth: clampFinite(merged.wellWidth, DEFAULT_PAULI_CONFIG.wellWidth, 0.01, 10),
    fieldView: enumValue(merged.fieldView, FIELD_VIEWS, DEFAULT_PAULI_CONFIG.fieldView),
    spinUpColor: normalizeRgb(
      sourceArray(source, merged, 'spinUpColor'),
      DEFAULT_PAULI_CONFIG.spinUpColor
    ),
    spinDownColor: normalizeRgb(
      sourceArray(source, merged, 'spinDownColor'),
      DEFAULT_PAULI_CONFIG.spinDownColor
    ),
    absorberWidth: clampFinite(merged.absorberWidth, DEFAULT_PAULI_CONFIG.absorberWidth, 0.05, 0.5),
    pmlTargetReflection: clampFinite(
      merged.pmlTargetReflection,
      DEFAULT_PAULI_CONFIG.pmlTargetReflection,
      1e-12,
      0.999
    ),
    diagnosticsInterval: clampFiniteInteger(
      merged.diagnosticsInterval,
      DEFAULT_PAULI_CONFIG.diagnosticsInterval,
      1,
      100
    ),
    sliceSpeed: clampFinite(merged.sliceSpeed, DEFAULT_PAULI_CONFIG.sliceSpeed, 0.01, 0.1),
    sliceAmplitude: clampFinite(
      merged.sliceAmplitude,
      DEFAULT_PAULI_CONFIG.sliceAmplitude,
      0.1,
      1.0
    ),
    slicePositions: normalizeSlicePositions(source, merged, latticeDim),
  }
}
