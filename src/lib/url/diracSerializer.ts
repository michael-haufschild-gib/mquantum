/**
 * URL serializer for Dirac-equation mode state.
 *
 * Dirac has enough physics and display controls that preserving only
 * `qm=diracEquation` restores a different simulation. This module owns the
 * compact `dir_*` block used by the top-level URL serializer.
 */

import {
  DIRAC_FIELD_VIEWS,
  DIRAC_INITIAL_CONDITIONS,
  DIRAC_MAX_GRID_SIZE,
  DIRAC_MAX_LATTICE_DIM,
  DIRAC_POTENTIAL_TYPES,
  type DiracFieldView,
  type DiracInitialCondition,
  type DiracPotentialType,
} from '@/lib/geometry/extended/dirac'

import {
  parseBoolParam,
  parseEnumParam,
  parseFloatParam,
  parseIntParam,
  setBoolParam,
  setFloatParam,
  setIntParam,
  setStringParam,
} from './paramHelpers'

/** URL-shareable Dirac-equation mode fields. */
export interface DiracUrlState {
  diracInitialCondition?: DiracInitialCondition
  diracFieldView?: DiracFieldView
  diracPotentialType?: DiracPotentialType
  diracPotentialStrength?: number
  diracPotentialWidth?: number
  diracPotentialCenter?: number
  diracHarmonicOmega?: number
  diracCoulombZ?: number
  diracMass?: number
  diracSpeedOfLight?: number
  diracHbar?: number
  diracDt?: number
  diracStepsPerFrame?: number
  diracGridSize?: number[]
  diracSpacing?: number[]
  diracPacketCenter?: number[]
  diracPacketMomentum?: number[]
  diracPacketWidth?: number
  diracPositiveEnergyFraction?: number
  diracAutoScale?: boolean
  diracShowPotential?: boolean
  diracDiagnosticsEnabled?: boolean
  diracDiagnosticsInterval?: number
  diracSlicePositions?: number[]
}

const MAX_DIRAC_VECTOR_LEN = DIRAC_MAX_LATTICE_DIM
const INTEGER_RE = /^-?\d+$/
const FLOAT_RE = /^-?(?:\d+\.?\d*|\.\d+)$/

function parseNumberToken(part: string, integer: boolean): number | undefined {
  if (part === '') return undefined
  if (integer ? !INTEGER_RE.test(part) : !FLOAT_RE.test(part)) return undefined

  const value = Number(part)
  if (!Number.isFinite(value)) return undefined
  if (integer && !Number.isSafeInteger(value)) return undefined
  return value
}

function clampParsedNumber(value: number, min: number, max: number, integer: boolean): number {
  const parsed = integer ? Math.round(value) : value
  return Math.max(min, Math.min(max, parsed))
}

function parseNumberListParam(
  params: URLSearchParams,
  key: string,
  min: number,
  max: number,
  maxLen: number,
  integer = false
): number[] | undefined {
  const raw = params.get(key)
  if (!raw) return undefined
  const parts = raw.split(',')
  if (parts.length === 0 || parts.length > maxLen) return undefined

  const values: number[] = []
  for (const part of parts) {
    const value = parseNumberToken(part, integer)
    if (value === undefined) return undefined
    values.push(clampParsedNumber(value, min, max, integer))
  }
  return values
}

function setNumberListParam(
  params: URLSearchParams,
  key: string,
  value: number[] | undefined,
  precision = 4,
  integer = false
): void {
  if (!value || value.length === 0) return
  if (value.some((v) => !Number.isFinite(v) || (integer && !Number.isInteger(v)))) return
  params.set(key, value.map((v) => (integer ? String(v) : v.toFixed(precision))).join(','))
}

/** Serialize Dirac-equation state into compact URL parameters. */
export function serializeDirac(
  params: URLSearchParams,
  quantumMode: string | undefined,
  state: DiracUrlState
): void {
  if (quantumMode !== 'diracEquation') return

  setStringParam(params, 'dir_ic', state.diracInitialCondition)
  setStringParam(params, 'dir_fv', state.diracFieldView)
  setStringParam(params, 'dir_pot', state.diracPotentialType)
  setFloatParam(params, 'dir_v', state.diracPotentialStrength, false, 4)
  setFloatParam(params, 'dir_w', state.diracPotentialWidth, false, 4)
  setFloatParam(params, 'dir_pc', state.diracPotentialCenter, false, 4)
  setFloatParam(params, 'dir_om', state.diracHarmonicOmega, false, 4)
  setIntParam(params, 'dir_z', state.diracCoulombZ)
  setFloatParam(params, 'dir_m', state.diracMass, false, 4)
  setFloatParam(params, 'dir_c', state.diracSpeedOfLight, false, 4)
  setFloatParam(params, 'dir_h', state.diracHbar, false, 4)
  setFloatParam(params, 'dir_dt', state.diracDt, false, 5)
  setIntParam(params, 'dir_spf', state.diracStepsPerFrame)
  setNumberListParam(params, 'dir_g', state.diracGridSize, 0, true)
  setNumberListParam(params, 'dir_dx', state.diracSpacing, 4)
  setNumberListParam(params, 'dir_x0', state.diracPacketCenter, 4)
  setNumberListParam(params, 'dir_k0', state.diracPacketMomentum, 4)
  setFloatParam(params, 'dir_sig', state.diracPacketWidth, false, 4)
  setFloatParam(params, 'dir_pe', state.diracPositiveEnergyFraction, false, 4)
  setBoolParam(params, 'dir_as', state.diracAutoScale)
  setBoolParam(params, 'dir_viz', state.diracShowPotential)
  setBoolParam(params, 'dir_diag', state.diracDiagnosticsEnabled)
  setIntParam(params, 'dir_dint', state.diracDiagnosticsInterval)
  setNumberListParam(params, 'dir_sl', state.diracSlicePositions, 4)
}

/** Deserialize compact Dirac-equation URL parameters into shareable state. */
export function deserializeDirac(params: URLSearchParams, state: DiracUrlState): void {
  state.diracInitialCondition = parseEnumParam<DiracInitialCondition>(
    params,
    'dir_ic',
    DIRAC_INITIAL_CONDITIONS
  )
  state.diracFieldView = parseEnumParam<DiracFieldView>(params, 'dir_fv', DIRAC_FIELD_VIEWS)
  state.diracPotentialType = parseEnumParam<DiracPotentialType>(
    params,
    'dir_pot',
    DIRAC_POTENTIAL_TYPES
  )
  state.diracPotentialStrength = parseFloatParam(params, 'dir_v', -100, 100)
  state.diracPotentialWidth = parseFloatParam(params, 'dir_w', 0.01, 10)
  state.diracPotentialCenter = parseFloatParam(params, 'dir_pc', -100, 100)
  state.diracHarmonicOmega = parseFloatParam(params, 'dir_om', 0.01, 10)
  state.diracCoulombZ = parseIntParam(params, 'dir_z', 1, 137)
  state.diracMass = parseFloatParam(params, 'dir_m', 0.01, 10)
  state.diracSpeedOfLight = parseFloatParam(params, 'dir_c', 0.01, 10)
  state.diracHbar = parseFloatParam(params, 'dir_h', 0.01, 10)
  state.diracDt = parseFloatParam(params, 'dir_dt', 0.0001, 0.05)
  state.diracStepsPerFrame = parseIntParam(params, 'dir_spf', 1, 16)
  state.diracGridSize = parseNumberListParam(
    params,
    'dir_g',
    2,
    DIRAC_MAX_GRID_SIZE,
    MAX_DIRAC_VECTOR_LEN,
    true
  )
  state.diracSpacing = parseNumberListParam(params, 'dir_dx', 0.01, 1, MAX_DIRAC_VECTOR_LEN)
  state.diracPacketCenter = parseNumberListParam(params, 'dir_x0', -100, 100, MAX_DIRAC_VECTOR_LEN)
  state.diracPacketMomentum = parseNumberListParam(
    params,
    'dir_k0',
    -1000,
    1000,
    MAX_DIRAC_VECTOR_LEN
  )
  state.diracPacketWidth = parseFloatParam(params, 'dir_sig', 0.05, 5)
  state.diracPositiveEnergyFraction = parseFloatParam(params, 'dir_pe', 0, 1)
  state.diracAutoScale = parseBoolParam(params, 'dir_as')
  state.diracShowPotential = parseBoolParam(params, 'dir_viz')
  state.diracDiagnosticsEnabled = parseBoolParam(params, 'dir_diag')
  state.diracDiagnosticsInterval = parseIntParam(params, 'dir_dint', 1, 60)
  state.diracSlicePositions = parseNumberListParam(
    params,
    'dir_sl',
    -100,
    100,
    MAX_DIRAC_VECTOR_LEN
  )
}
