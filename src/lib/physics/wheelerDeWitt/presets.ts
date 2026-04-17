/**
 * Curated Wheeler–DeWitt minisuperspace scenario presets.
 *
 * Each preset overrides only physics fields on `WheelerDeWittConfig`:
 * boundary condition, inflaton mass, and cosmological constant. Grid
 * parameters (`gridNa`, `gridNphi`, `aMin`, `aMax`, `phiExtent`) are left
 * untouched to preserve the solver's CFL-safe defaults, and render-only
 * overlay toggles (streamlines, phase rotation, worldline pulse) stay
 * under user control — the apply action merges from current state rather
 * than `DEFAULT_WHEELER_DEWITT_CONFIG`.
 *
 * @module lib/physics/wheelerDeWitt/presets
 */

import type { WheelerDeWittConfig } from '@/lib/geometry/extended/wheelerDeWitt'
import type { ScenarioPreset } from '@/lib/physics/presetTypes'

/** A curated Wheeler–DeWitt scenario with physics-field overrides. */
export type WdwScenarioPreset = ScenarioPreset<Partial<WheelerDeWittConfig>>

/**
 * Physics-field subset that a Wheeler–DeWitt preset is allowed to override.
 * Enforced at the apply-action site so grid and render-only fields stay
 * outside the preset contract.
 */
export const WDW_PRESET_PHYSICS_FIELDS = [
  'boundaryCondition',
  'inflatonMass',
  'cosmologicalConstant',
] as const

export const WDW_SCENARIO_PRESETS: WdwScenarioPreset[] = [
  {
    id: 'noBoundaryBaseline',
    name: 'Hartle–Hawking Baseline',
    description:
      'No-boundary proposal with Λ = 0 — real, exponentially damped wave function on flat minisuperspace',
    overrides: {
      boundaryCondition: 'noBoundary',
      inflatonMass: 0.3,
      cosmologicalConstant: 0.0,
    },
  },
  {
    id: 'vilenkinTunneling',
    name: 'Vilenkin Tunneling',
    description:
      'Tunneling proposal with small positive Λ — complex oscillating initial data favouring expansion',
    overrides: {
      boundaryCondition: 'tunneling',
      inflatonMass: 0.3,
      cosmologicalConstant: 0.3,
    },
  },
  {
    id: 'deWittOrigin',
    name: 'DeWitt χ(0,·) = 0',
    description:
      'DeWitt boundary condition at the origin — wave function vanishes at the classical singularity',
    overrides: {
      boundaryCondition: 'deWitt',
      inflatonMass: 0.3,
      cosmologicalConstant: 0.0,
    },
  },
  {
    id: 'inflationHighMass',
    name: 'Heavy Inflaton',
    description:
      'No-boundary run with m = 0.8 — stiffer quadratic potential, richer quantum-potential structure',
    overrides: {
      boundaryCondition: 'noBoundary',
      inflatonMass: 0.8,
      cosmologicalConstant: 0.0,
    },
  },
  {
    id: 'deSitterLargeLambda',
    name: 'de Sitter Λ = 0.8',
    description:
      'Large positive cosmological constant — classical turning point near the nucleation radius',
    overrides: {
      boundaryCondition: 'noBoundary',
      inflatonMass: 0.3,
      cosmologicalConstant: 0.8,
    },
  },
  {
    id: 'antiDeSitterContracting',
    name: 'Anti-de Sitter Λ = −0.5',
    description:
      'Negative Λ with tunneling BC — AdS-like contracting classical branch, oscillatory bulk density',
    overrides: {
      boundaryCondition: 'tunneling',
      inflatonMass: 0.3,
      cosmologicalConstant: -0.5,
    },
  },
]

/** Lookup a Wheeler–DeWitt preset by id. */
export function getWdwPreset(id: string): WdwScenarioPreset | undefined {
  return WDW_SCENARIO_PRESETS.find((p) => p.id === id)
}
