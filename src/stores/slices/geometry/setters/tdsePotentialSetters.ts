/**
 * TDSE potential and drive parameter setters.
 *
 * Data-driven setters for potential configuration parameters.
 * Each setter validates, clamps, and writes a single field to the TDSE config.
 *
 * @module stores/slices/geometry/setters/tdsePotentialSetters
 */

import type { TdseConfig } from '@/lib/geometry/extended/types'

import type { SetterContext } from './sliceSetterUtils'

/** Definition for a single clamped TDSE parameter setter. */
interface TdseParamDef {
  field: keyof TdseConfig
  min: number
  max: number
}

/** All clamped numeric TDSE potential/drive setters. */
const TDSE_PARAMS: Record<string, TdseParamDef> = {
  setTdseBarrierHeight: { field: 'barrierHeight', min: 0, max: 100 },
  setTdseBarrierWidth: { field: 'barrierWidth', min: 0.01, max: 5 },
  setTdseBarrierCenter: { field: 'barrierCenter', min: -5, max: 5 },
  setTdseWellDepth: { field: 'wellDepth', min: 0, max: 100 },
  setTdseWellWidth: { field: 'wellWidth', min: 0.01, max: 5 },
  setTdseHarmonicOmega: { field: 'harmonicOmega', min: 0.01, max: 50 },
  setTdseStepHeight: { field: 'stepHeight', min: -100, max: 100 },
  setTdseSlitSeparation: { field: 'slitSeparation', min: 0.01, max: 5 },
  setTdseSlitWidth: { field: 'slitWidth', min: 0.001, max: 2 },
  setTdseWallThickness: { field: 'wallThickness', min: 0.005, max: 2 },
  setTdseWallHeight: { field: 'wallHeight', min: 0, max: 200 },
  setTdseLatticeDepth: { field: 'latticeDepth', min: 0, max: 100 },
  setTdseLatticePeriod: { field: 'latticePeriod', min: 0.01, max: 5 },
  setTdseDoubleWellLambda: { field: 'doubleWellLambda', min: 0, max: 200 },
  setTdseDoubleWellSeparation: { field: 'doubleWellSeparation', min: 0.1, max: 5 },
  setTdseDoubleWellAsymmetry: { field: 'doubleWellAsymmetry', min: -50, max: 50 },
  setTdseRadialWellInner: { field: 'radialWellInner', min: 0, max: 5 },
  setTdseRadialWellOuter: { field: 'radialWellOuter', min: 0.1, max: 10 },
  setTdseRadialWellDepth: { field: 'radialWellDepth', min: 0, max: 200 },
  setTdseRadialWellTilt: { field: 'radialWellTilt', min: -2, max: 2 },
  setTdseAnharmonicLambda: { field: 'anharmonicLambda', min: 0, max: 100 },
  setTdseDisorderStrength: { field: 'disorderStrength', min: 0, max: 100 },
  setTdseDisorderSeed: { field: 'disorderSeed', min: 0, max: 999999 },
  setTdseDriveFrequency: { field: 'driveFrequency', min: 0, max: 50 },
  setTdseDriveAmplitude: { field: 'driveAmplitude', min: 0, max: 100 },
  setTdseDisorderStrength: { field: 'disorderStrength', min: 0, max: 100 },
}

/**
 * Create data-driven potential/drive parameter setters.
 *
 * @param ctx - Setter context
 * @returns Object with all potential/drive setters
 */
export function createTdsePotentialSetters(
  ctx: SetterContext
): Record<string, (value: number) => void> {
  const { setWithVersion, isFinite, warnNonFinite } = ctx
  const result: Record<string, (value: number) => void> = {}

  for (const [name, def] of Object.entries(TDSE_PARAMS)) {
    result[name] = (value: number) => {
      if (!isFinite(value)) {
        warnNonFinite(`tdse.${def.field}`, value)
        return
      }
      const clamped = Math.max(def.min, Math.min(def.max, value))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, [def.field]: clamped },
        },
      }))
    }
  }

  // Boolean/enum setters
  result.setTdseDriveEnabled = (enabled: unknown) => {
    setWithVersion((state) => ({
      schroedinger: {
        ...state.schroedinger,
        tdse: { ...state.schroedinger.tdse, driveEnabled: Boolean(enabled) },
      },
    }))
  }

  result.setTdseDriveWaveform = (waveform: unknown) => {
    const w = waveform as string
    if (w !== 'sine' && w !== 'pulse' && w !== 'chirp') return
    type DriveWaveform = 'sine' | 'pulse' | 'chirp'
    setWithVersion(
      (state) =>
        ({
          schroedinger: {
            ...state.schroedinger,
            tdse: { ...state.schroedinger.tdse, driveWaveform: w as DriveWaveform },
          },
        }) as Partial<typeof state>
    )
  }

  return result
}
