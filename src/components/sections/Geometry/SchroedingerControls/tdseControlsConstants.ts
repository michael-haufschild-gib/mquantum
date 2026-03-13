/**
 * Constants and helpers for TDSEControls.
 *
 * Extracted to keep TDSEControls.tsx under the max-lines limit.
 *
 * @module components/sections/Geometry/SchroedingerControls/tdseControlsConstants
 */

import { TDSE_SCENARIO_PRESETS } from '@/lib/physics/tdse/presets'
import type { TdseConfig } from '@/lib/geometry/extended/types'

/** Axis labels for N-dimensional controls. */
export const AXIS_LABELS = ['x', 'y', 'z', 'w', 'v', 'u', 't', 's', 'r', 'q', 'p', 'o']

/** TDSE max total sites — must match store constant. */
export const TDSE_MAX_TOTAL_SITES = 262144

/** Power-of-2 grid sizes required by Stockham FFT. */
export const ALL_GRID_SIZE_OPTIONS = [
  { value: '2', label: '2' },
  { value: '4', label: '4' },
  { value: '8', label: '8' },
  { value: '16', label: '16' },
  { value: '32', label: '32' },
  { value: '64', label: '64' },
  { value: '128', label: '128' },
]

/** Initial wavefunction shape options. */
export const INITIAL_CONDITION_OPTIONS = [
  { value: 'gaussianPacket', label: 'Gaussian Packet' },
  { value: 'planeWave', label: 'Plane Wave' },
  { value: 'superposition', label: 'Superposition' },
]

/** All potential type options with optional minimum-dimension constraints. */
export const ALL_POTENTIAL_TYPE_OPTIONS: { value: string; label: string; minDims?: number }[] = [
  { value: 'free', label: 'Free (V=0)' },
  { value: 'barrier', label: 'Barrier' },
  { value: 'step', label: 'Step' },
  { value: 'finiteWell', label: 'Finite Well' },
  { value: 'harmonicTrap', label: 'Harmonic Trap' },
  { value: 'driven', label: 'Driven' },
  { value: 'doubleSlit', label: 'Double Slit', minDims: 2 },
  { value: 'periodicLattice', label: 'Periodic Lattice' },
  { value: 'doubleWell', label: 'Double Well' },
  { value: 'radialDoubleWell', label: 'Radial Double Well' },
]

/** Drive waveform options. */
export const DRIVE_WAVEFORM_OPTIONS = [
  { value: 'sine', label: 'Sine' },
  { value: 'pulse', label: 'Gaussian Pulse' },
  { value: 'chirp', label: 'Chirp' },
]

/** Field visualization mode options. */
export const FIELD_VIEW_OPTIONS = [
  { value: 'density', label: 'Density |\u03C8|\u00B2' },
  { value: 'phase', label: 'Phase arg(\u03C8)' },
  { value: 'current', label: 'Current |j|' },
  { value: 'potential', label: 'Potential V(x)' },
]

/** Scenario preset dropdown options. */
export const SCENARIO_PRESET_OPTIONS = [
  { value: '', label: 'Custom' },
  ...TDSE_SCENARIO_PRESETS.map((p) => ({ value: p.id, label: p.name })),
]

/**
 * Compare current config against all presets to find a match.
 *
 * @param config - Current TDSE configuration
 * @returns The matching preset id, or empty string if no match
 */
export function detectActivePreset(config: TdseConfig): string {
  for (const preset of TDSE_SCENARIO_PRESETS) {
    let matches = true
    for (const [key, expected] of Object.entries(preset.overrides)) {
      const actual = config[key as keyof TdseConfig]
      if (Array.isArray(expected)) {
        if (!Array.isArray(actual) || expected.length !== actual.length ||
            expected.some((v, i) => v !== (actual as number[])[i])) {
          matches = false
          break
        }
      } else if (actual !== expected) {
        matches = false
        break
      }
    }
    if (matches) return preset.id
  }
  return ''
}
