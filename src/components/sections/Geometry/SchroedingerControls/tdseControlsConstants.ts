/**
 * Constants and helpers for TDSEControls.
 *
 * Extracted to keep TDSEControls.tsx under the max-lines limit.
 *
 * @module components/sections/Geometry/SchroedingerControls/tdseControlsConstants
 */

import { TDSE_SCENARIO_PRESETS } from '@/lib/physics/tdse/presets'

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
  { value: 'andersonDisorder', label: 'Anderson Disorder' },
  { value: 'coupledAnharmonic', label: 'Coupled Anharmonic' },
  { value: 'blackHoleRingdown', label: 'Black Hole Ringdown (Regge-Wheeler)' },
  { value: 'custom', label: 'Custom Expression' },
]

/** Anderson disorder distribution options. */
export const DISORDER_DISTRIBUTION_OPTIONS = [
  { value: 'uniform', label: 'Uniform [-W/2, W/2]' },
  { value: 'gaussian', label: 'Gaussian (0, W)' },
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
  { value: 'quantumPressure', label: 'Quantum Pressure Q' },
]

/**
 * Filter scenario presets to those compatible with the current dimension.
 * A preset is compatible if its latticeDim matches the user's dimension,
 * or if it defines latticeDim ≤ the user's dimension (can scale up).
 *
 * @param dim - Current user-selected dimension
 * @returns Filtered preset options for the dropdown
 */
export function getScenarioPresetOptions(dim: number): { value: string; label: string }[] {
  return TDSE_SCENARIO_PRESETS.filter((p) => {
    const presetDim = p.overrides.latticeDim
    // No latticeDim in overrides → compatible with any dimension
    if (presetDim === undefined) return true
    // Preset designed for this dimension or lower (TDSE can scale arrays up)
    return presetDim <= dim
  }).map((p) => ({ value: p.id, label: p.name }))
}
