import type { QuantumTypeKey, QuantumTypeValidation } from './types'

const VALIDATION_STATUS_SOURCE = 'docs/physics/validation-status.md'

export const QUANTUM_TYPE_VALIDATION = {
  harmonicOscillator: {
    levels: ['A', 'P'],
    confidence: 'strong',
    summary: 'Hermite basis, recurrence, orthogonality, and normalization are tested.',
    testRefs: [
      'src/tests/lib/math/hermitePolynomials.property.test.ts',
      'src/tests/lib/physics/analyticalBenchmarks.test.ts',
    ],
    source: VALIDATION_STATUS_SOURCE,
  },
  hydrogenND: {
    levels: ['R', 'A', 'P'],
    confidence: 'strong',
    summary: 'Hydrogen energies and radial functions are checked against reference data.',
    testRefs: [
      'src/tests/lib/physics/hydrogenNistReferenceData.test.ts',
      'src/tests/lib/math/hydrogenRadialND.property.test.ts',
    ],
    source: VALIDATION_STATUS_SOURCE,
  },
  hydrogenNDCoupled: {
    levels: ['A', 'P'],
    confidence: 'partial',
    summary: 'Coupled N-D hydrogen identities and normalization are covered.',
    limitation: 'High-n D-dimensional Coulomb energies beyond D=3 remain partially covered.',
    testRefs: [
      'src/tests/lib/physics/hydrogenNDCoupled.test.ts',
      'src/tests/lib/physics/hydrogenMomentumNorm.test.ts',
    ],
    source: VALIDATION_STATUS_SOURCE,
  },
  freeScalarField: {
    levels: ['A', 'P'],
    confidence: 'strong',
    summary: 'Vacuum dispersion, k-space occupation, and packing invariants are tested.',
    testRefs: [
      'src/tests/lib/physics/freeScalar/vacuumDispersion.test.ts',
      'src/tests/lib/physics/freeScalar/kSpaceOccupation.test.ts',
    ],
    source: VALIDATION_STATUS_SOURCE,
  },
  tdseDynamics: {
    levels: ['A', 'P', 'F'],
    confidence: 'partial',
    summary: 'Norm, energy drift, potentials, and diagnostic fixtures are covered.',
    limitation: 'Some long-run curved-metric and scattering claims still lack external oracles.',
    testRefs: [
      'src/tests/lib/physics/tdse/diagnostics.test.ts',
      'src/tests/lib/physics/tdse/curvedIntegrator.test.ts',
    ],
    source: VALIDATION_STATUS_SOURCE,
  },
  becDynamics: {
    levels: ['A', 'P'],
    confidence: 'strong',
    summary: 'Chemical potential, incompressible spectrum, page curve, and horizon checks run.',
    testRefs: [
      'src/tests/lib/physics/bec/chemicalPotential.test.ts',
      'src/tests/lib/physics/bec/incompressibleSpectrum.test.ts',
    ],
    source: VALIDATION_STATUS_SOURCE,
  },
  diracEquation: {
    levels: ['A', 'F'],
    confidence: 'partial',
    summary: 'Clifford algebra and spinor scaling are covered with fixture-backed rendering.',
    limitation: 'Klein-step transmission remains a known missing oracle.',
    testRefs: [
      'src/tests/lib/physics/dirac/diracAlgebra.test.ts',
      'src/tests/lib/physics/dirac/scales.test.ts',
    ],
    source: VALIDATION_STATUS_SOURCE,
  },
  quantumWalk: {
    levels: ['A', 'P'],
    confidence: 'strong',
    summary: 'Coin unitarity and spreading behavior are tested.',
    limitation: 'Long-run variance fit is still listed as a validation gap.',
    testRefs: [
      'src/tests/lib/physics/quantumWalk.test.ts',
      'src/tests/rendering/quantumWalkIntegration.test.ts',
    ],
    source: VALIDATION_STATUS_SOURCE,
  },
  wheelerDeWitt: {
    levels: ['C', 'P', 'A'],
    confidence: 'strong',
    summary: 'Convergence, analytic fixtures, and boundary-condition invariants are tested.',
    testRefs: [
      'src/tests/lib/physics/wheelerDeWitt/exactSolutionAgreement.test.ts',
      'src/tests/lib/physics/wheelerDeWitt/solverAnalytic.test.ts',
    ],
    source: VALIDATION_STATUS_SOURCE,
  },
  antiDeSitter: {
    levels: ['A', 'P', 'F'],
    confidence: 'partial',
    summary: 'BF-window, BTZ, HKLL, and density-grid fixtures are covered.',
    limitation: 'Boundary-correlator reconstruction at the AdS edge remains a validation gap.',
    testRefs: [
      'src/tests/lib/physics/antiDeSitter/math.test.ts',
      'src/tests/lib/physics/antiDeSitter/hkll.test.ts',
    ],
    source: VALIDATION_STATUS_SOURCE,
  },
  pauliSpinor: {
    levels: ['F'],
    confidence: 'fixture',
    summary: 'Regression fixtures and parity checks cover current behavior.',
    limitation: 'No external analytic or reference-data oracle is registered for this mode.',
    testRefs: [
      'src/tests/lib/physics/pauli/pauliPhysics.test.ts',
      'src/tests/rendering/webgpu/passes/pauliUniformsLayout.test.ts',
    ],
    source: VALIDATION_STATUS_SOURCE,
  },
  bellTest: {
    levels: ['A', 'P'],
    confidence: 'strong',
    summary: 'CHSH, projectors, LHV baseline, loopholes, and sampler behavior are tested.',
    testRefs: [
      'src/tests/lib/physics/bell/chsh.test.ts',
      'src/tests/lib/physics/bell/projectors.test.ts',
    ],
    source: VALIDATION_STATUS_SOURCE,
  },
} satisfies Record<QuantumTypeKey, QuantumTypeValidation>
