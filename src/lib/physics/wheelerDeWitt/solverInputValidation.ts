import type { WdwBoundaryCondition } from '@/lib/geometry/extended/wheelerDeWitt'

import type { WdwBoundaryField } from './boundaryConditions'
import type { WheelerDeWittSolverInput } from './solverTypes'

const WDW_BOUNDARY_CONDITIONS: readonly WdwBoundaryCondition[] = [
  'noBoundary',
  'tunneling',
  'deWitt',
]

/** Maximum `a`-axis samples accepted by the WdW solver before allocation. */
export const WDW_SOLVER_MAX_GRID_NA = 1024
/** Maximum samples per inflaton axis accepted by the WdW solver before allocation. */
export const WDW_SOLVER_MAX_GRID_NPHI = 128
/** Minimum inflaton mass accepted by public WdW solver inputs. */
export const WDW_SOLVER_MIN_INFLATON_MASS = 0
/** Maximum inflaton mass accepted by public WdW solver inputs. */
export const WDW_SOLVER_MAX_INFLATON_MASS = 2
/** Minimum cosmological constant accepted by public WdW solver inputs. */
export const WDW_SOLVER_MIN_COSMOLOGICAL_CONSTANT = -1
/** Maximum cosmological constant accepted by public WdW solver inputs. */
export const WDW_SOLVER_MAX_COSMOLOGICAL_CONSTANT = 1
/** Minimum per-axis mass-asymmetry ratio accepted by public WdW solver inputs. */
export const WDW_SOLVER_MIN_INFLATON_MASS_ASYMMETRY = 0.1
/** Maximum per-axis mass-asymmetry ratio accepted by public WdW solver inputs. */
export const WDW_SOLVER_MAX_INFLATON_MASS_ASYMMETRY = 10
/** Minimum scale factor accepted by public WdW solver inputs. */
export const WDW_SOLVER_MIN_A_MIN = 0.05
/** Minimum separation between aMin and aMax accepted by public WdW solver inputs. */
export const WDW_SOLVER_MIN_A_SPAN = 1e-6
/** Maximum scale-factor endpoint accepted by public WdW solver inputs. */
export const WDW_SOLVER_MAX_A_MAX = 10
/** Maximum lower scale-factor endpoint accepted by public WdW solver inputs. */
export const WDW_SOLVER_MAX_A_MIN = WDW_SOLVER_MAX_A_MAX - WDW_SOLVER_MIN_A_SPAN
/** Minimum φ half-extent accepted by public WdW solver inputs. */
export const WDW_SOLVER_MIN_PHI_EXTENT = 0.5
/** Maximum φ half-extent accepted by public WdW solver inputs. */
export const WDW_SOLVER_MAX_PHI_EXTENT = 10

/**
 * Runtime guard for the canonical Wheeler-DeWitt boundary-condition enum.
 */
export function isWdwBoundaryCondition(value: unknown): value is WdwBoundaryCondition {
  return (
    typeof value === 'string' && WDW_BOUNDARY_CONDITIONS.includes(value as WdwBoundaryCondition)
  )
}

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite`)
}

function assertFiniteInRange(name: string, value: number, min: number, max: number): void {
  assertFinite(name, value)
  if (value < min) throw new Error(`${name} must be >= ${min}`)
  if (value > max) throw new Error(`${name} must be <= ${max}`)
}

function assertIntegerInRange(name: string, value: number, min: number, max: number): void {
  assertFinite(name, value)
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer >= ${min} and <= ${max}`)
  }
}

/**
 * Validate the public Wheeler-DeWitt solver boundary before allocation
 * or coordinate-spacing math. UI setters clamp common inputs, but SRMT
 * sweeps, tests, URL restores, and validator wrappers can call the solver
 * directly; this is the last shared guardrail.
 */
export function validateWheelerDeWittSolverInput(input: WheelerDeWittSolverInput): void {
  if (!isWdwBoundaryCondition(input.boundaryCondition)) {
    throw new Error('boundaryCondition must be one of: noBoundary, tunneling, deWitt')
  }

  assertFiniteInRange(
    'inflatonMass',
    input.inflatonMass,
    WDW_SOLVER_MIN_INFLATON_MASS,
    WDW_SOLVER_MAX_INFLATON_MASS
  )
  assertFiniteInRange(
    'cosmologicalConstant',
    input.cosmologicalConstant,
    WDW_SOLVER_MIN_COSMOLOGICAL_CONSTANT,
    WDW_SOLVER_MAX_COSMOLOGICAL_CONSTANT
  )
  const inflatonMassAsymmetry = input.inflatonMassAsymmetry ?? 1
  assertFiniteInRange(
    'inflatonMassAsymmetry',
    inflatonMassAsymmetry,
    WDW_SOLVER_MIN_INFLATON_MASS_ASYMMETRY,
    WDW_SOLVER_MAX_INFLATON_MASS_ASYMMETRY
  )

  assertFiniteInRange('aMin', input.aMin, WDW_SOLVER_MIN_A_MIN, WDW_SOLVER_MAX_A_MIN)
  assertFiniteInRange(
    'aMax',
    input.aMax,
    WDW_SOLVER_MIN_A_MIN + WDW_SOLVER_MIN_A_SPAN,
    WDW_SOLVER_MAX_A_MAX
  )
  if (!(input.aMax > input.aMin)) throw new Error('aMax must exceed aMin')
  if (input.aMax - input.aMin < WDW_SOLVER_MIN_A_SPAN) {
    throw new Error(`aMax must exceed aMin by at least ${WDW_SOLVER_MIN_A_SPAN}`)
  }
  assertIntegerInRange('gridNa', input.gridNa, 3, WDW_SOLVER_MAX_GRID_NA)
  assertIntegerInRange('gridNphi', input.gridNphi, 3, WDW_SOLVER_MAX_GRID_NPHI)
  assertFiniteInRange(
    'phiExtent',
    input.phiExtent,
    WDW_SOLVER_MIN_PHI_EXTENT,
    WDW_SOLVER_MAX_PHI_EXTENT
  )
}

function assertFiniteBuffer(name: string, values: Float32Array): void {
  for (let i = 0; i < values.length; i++) {
    if (!Number.isFinite(values[i]!)) throw new Error(`${name}[${i}] must be finite`)
  }
}

/**
 * Validate an injected initial WdW slab after grid dimensions are known.
 */
export function validateWdwCustomBoundary(
  customBoundary: WdwBoundaryField,
  expectedLength: number
): void {
  if (customBoundary.chi.length !== expectedLength) {
    throw new Error(
      `customBoundary.chi length ${customBoundary.chi.length} does not match ` +
        `expected 2·Nphi·Nphi = ${expectedLength}`
    )
  }
  if (customBoundary.chiDeriv.length !== expectedLength) {
    throw new Error(
      `customBoundary.chiDeriv length ${customBoundary.chiDeriv.length} does not match ` +
        `expected 2·Nphi·Nphi = ${expectedLength}`
    )
  }
  assertFiniteBuffer('customBoundary.chi', customBoundary.chi)
  assertFiniteBuffer('customBoundary.chiDeriv', customBoundary.chiDeriv)
}
