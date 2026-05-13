import type { WdwBoundaryCondition } from '@/lib/geometry/extended/wheelerDeWitt'

import type { WdwBoundaryField } from './boundaryConditions'
import type { WheelerDeWittSolverInput } from './solverTypes'

const WDW_BOUNDARY_CONDITIONS: readonly WdwBoundaryCondition[] = [
  'noBoundary',
  'tunneling',
  'deWitt',
]

/**
 * Runtime guard for the canonical Wheeler-DeWitt boundary-condition enum.
 */
export function isWdwBoundaryCondition(value: unknown): value is WdwBoundaryCondition {
  return typeof value === 'string' && WDW_BOUNDARY_CONDITIONS.includes(value as WdwBoundaryCondition)
}

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite`)
}

function assertPositiveFinite(name: string, value: number): void {
  assertFinite(name, value)
  if (!(value > 0)) throw new Error(`${name} must be > 0`)
}

function assertIntegerAtLeast(name: string, value: number, min: number): void {
  assertFinite(name, value)
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${name} must be an integer >= ${min}`)
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

  assertFinite('inflatonMass', input.inflatonMass)
  if (input.inflatonMass < 0) throw new Error('inflatonMass must be >= 0')
  assertFinite('cosmologicalConstant', input.cosmologicalConstant)
  const inflatonMassAsymmetry = input.inflatonMassAsymmetry ?? 1
  assertPositiveFinite('inflatonMassAsymmetry', inflatonMassAsymmetry)

  assertPositiveFinite('aMin', input.aMin)
  assertFinite('aMax', input.aMax)
  if (!(input.aMax > input.aMin)) throw new Error('aMax must exceed aMin')
  assertIntegerAtLeast('gridNa', input.gridNa, 3)
  assertIntegerAtLeast('gridNphi', input.gridNphi, 3)
  assertPositiveFinite('phiExtent', input.phiExtent)
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
