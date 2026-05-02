/**
 * Loop Quantum Cosmology (LQC) bounce — public entry point.
 *
 * This file is now a thin re-export shell. The 876-line original was
 * split per `docs/refactoring-backlog.md` Item 8 into:
 *
 *  - `./lqcBounceModel.ts`  — types, validators, analytic helpers, and
 *                             the RK4 integrator that builds the dense
 *                             `LqcBounceTable`.
 *  - `./lqcBounceTable.ts`  — per-frame `evaluateLqcBounceCoefs` and the
 *                             byte-budgeted LRU cache around
 *                             `getOrComputeLqcBounceTable`.
 *
 * Existing callers import everything from this module; the public
 * surface (and runtime semantics) are unchanged.
 *
 * @module lib/physics/cosmology/lqcBounce
 */

export {
  computeLqcBounceBackground,
  type LqcBounceCoefs,
  type LqcBounceParams,
  type LqcBounceTable,
  lqcHubbleMagnitude,
  resolveLqcTHalfWidth,
  stiffFluidGamma,
  validateLqcBounceParams,
} from './lqcBounceModel'
export {
  __resetLqcBounceCacheForTests,
  evaluateLqcBounceCoefs,
  getOrComputeLqcBounceTable,
} from './lqcBounceTable'
