/**
 * Curated scenario presets for the coupled N-dimensional hydrogen atom.
 *
 * Each preset targets specific angular momentum chain configurations that
 * produce visually interesting patterns using the true D-dimensional
 * Coulomb solution with hyperspherical harmonics.
 *
 * Preset overrides set: principalQuantumNumber, azimuthalQuantumNumber,
 * magneticQuantumNumber, angularChain, useRealOrbitals, bohrRadiusScale.
 *
 * @module lib/physics/hydrogenCoupled/presets
 */

import type { SchroedingerConfig } from '@/lib/geometry/extended/types'

/** Subset of SchroedingerConfig that a coupled-hydrogen preset can override. */
export type HydrogenCoupledPresetOverride = Partial<
  Pick<
    SchroedingerConfig,
    | 'principalQuantumNumber'
    | 'azimuthalQuantumNumber'
    | 'magneticQuantumNumber'
    | 'angularChain'
    | 'useRealOrbitals'
    | 'bohrRadiusScale'
  >
>

/** A named coupled-hydrogen scenario preset. */
export interface HydrogenCoupledScenarioPreset {
  id: string
  name: string
  description: string
  /** Minimum geometry dimension required (mode requires ≥3). */
  minDim: number
  overrides: HydrogenCoupledPresetOverride
}

export const HYDROGEN_COUPLED_PRESETS: HydrogenCoupledScenarioPreset[] = [
  // ── 3D presets (standard hydrogen, chain empty) ─────────────────────
  {
    id: '1s_ground',
    name: '1s Ground State',
    description: 'Spherically symmetric ground state — the simplest hydrogen orbital',
    minDim: 3,
    overrides: {
      principalQuantumNumber: 1,
      azimuthalQuantumNumber: 0,
      magneticQuantumNumber: 0,
      angularChain: [],
      useRealOrbitals: true,
      bohrRadiusScale: 1.0,
    },
  },
  {
    id: '2pz',
    name: '2pz Dumbbell',
    description: 'Classic dumbbell orbital along the z-axis',
    minDim: 3,
    overrides: {
      principalQuantumNumber: 2,
      azimuthalQuantumNumber: 1,
      magneticQuantumNumber: 0,
      angularChain: [],
      useRealOrbitals: true,
      bohrRadiusScale: 1.5,
    },
  },
  {
    id: '3dz2',
    name: '3dz² Donut',
    description: 'Donut-shaped orbital with lobes along the z-axis',
    minDim: 3,
    overrides: {
      principalQuantumNumber: 3,
      azimuthalQuantumNumber: 2,
      magneticQuantumNumber: 0,
      angularChain: [],
      useRealOrbitals: true,
      bohrRadiusScale: 2.0,
    },
  },
  {
    id: '3dxy',
    name: '3dx²-y² Clover',
    description: 'Clover-shaped orbital with lobes along x and y axes',
    minDim: 3,
    overrides: {
      principalQuantumNumber: 3,
      azimuthalQuantumNumber: 2,
      magneticQuantumNumber: 2,
      angularChain: [],
      useRealOrbitals: true,
      bohrRadiusScale: 2.0,
    },
  },
  {
    id: '4fz3',
    name: '4fz³ Triple Lobe',
    description: 'Triple-lobed f orbital along the z-axis',
    minDim: 3,
    overrides: {
      principalQuantumNumber: 4,
      azimuthalQuantumNumber: 3,
      magneticQuantumNumber: 0,
      angularChain: [],
      useRealOrbitals: true,
      bohrRadiusScale: 2.5,
    },
  },

  // ── 4D+ presets (hyperspherical chain active) ──────────────────────
  {
    id: '3d_4d_chain',
    name: '3d in 4D (l₂=2)',
    description: '3d orbital with maximal angular momentum chain in 4th dimension',
    minDim: 4,
    overrides: {
      principalQuantumNumber: 3,
      azimuthalQuantumNumber: 2,
      magneticQuantumNumber: 0,
      angularChain: [2],
      useRealOrbitals: true,
      bohrRadiusScale: 2.0,
    },
  },
  {
    id: '4f_4d_chain',
    name: '4f in 4D (l₂=1)',
    description: '4f orbital with partially excited angular chain',
    minDim: 4,
    overrides: {
      principalQuantumNumber: 4,
      azimuthalQuantumNumber: 3,
      magneticQuantumNumber: 0,
      angularChain: [1],
      useRealOrbitals: true,
      bohrRadiusScale: 2.5,
    },
  },
  {
    id: '4f_5d_full',
    name: '4f in 5D (l₂=3, l₃=1)',
    description: '4f orbital with full angular chain spanning two extra dimensions',
    minDim: 5,
    overrides: {
      principalQuantumNumber: 4,
      azimuthalQuantumNumber: 3,
      magneticQuantumNumber: 0,
      angularChain: [3, 1],
      useRealOrbitals: true,
      bohrRadiusScale: 2.5,
    },
  },
  {
    id: '5g_5d_chain',
    name: '5g in 5D (l₂=2, l₃=0)',
    description: 'High angular momentum g-orbital with chain in 5 dimensions',
    minDim: 5,
    overrides: {
      principalQuantumNumber: 5,
      azimuthalQuantumNumber: 4,
      magneticQuantumNumber: 0,
      angularChain: [2, 0],
      useRealOrbitals: true,
      bohrRadiusScale: 2.5,
    },
  },
]
