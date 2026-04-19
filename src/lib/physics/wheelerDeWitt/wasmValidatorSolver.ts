/**
 * Thin async loader for the independent Rust Wheeler–DeWitt validator
 * binary. Lazy-loads on first call so production paths that never invoke
 * the validator pay zero cost (and so test runs without the validator
 * binary built do not hard-fail at import time).
 *
 * This wrapper consumes the **separate** `pkg-validator/` build of the
 * `mdimension-core` Rust crate, produced by:
 *
 *     pnpm wasm:build:validator
 *
 * The validator binary is NOT the production WASM module — it is a
 * separate `wasm-pack --target nodejs` artifact that exposes
 * `solve_leapfrog_validator_wasm` (gated behind the `wdw-validator`
 * Cargo feature). The production `pkg/` build remains byte-identical.
 *
 * The wrapper uses a relative import path into `pkg-validator/` so that
 * Vitest's `mdimension-core` mock alias (which intercepts the bare
 * specifier) does NOT capture this load — we want the REAL binary, not
 * the mock.
 *
 * ## Boundary-condition encoding
 *
 * The Rust ABI takes a `u32` BC code instead of a string for FFI
 * simplicity. The encoding is:
 *
 *   - `0` → `'noBoundary'` (Hartle–Hawking)
 *   - `1` → `'tunneling'` (Vilenkin)
 *   - `2` → `'deWitt'`
 *
 * This wrapper accepts the canonical TS string union and translates.
 *
 * ## Scope
 *
 * The Rust validator implements ONLY the raw leapfrog PDE integrator —
 * no Stage-2 deep-Euclidean WKB tail, no Stage-3 Airy/Langer
 * connection. This is deliberate: cross-validation focuses on the core
 * integrator. Comparison tests must restrict themselves to the
 * pure-Lorentzian regime (`Λ ≤ 0` at `m = 0`) where the TS solver also
 * skips Stage-2/3 and the two outputs are directly comparable.
 *
 * @module lib/physics/wheelerDeWitt/wasmValidatorSolver
 */

import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { WdwBoundaryCondition } from '@/lib/geometry/extended/wheelerDeWitt'

/** Inputs accepted by the Rust validator. Mirrors the TS solver inputs
 * minus `customBoundary` (the Rust path uses the dispatched BC generator
 * exclusively — analytic-fixture tests stay TS-only). */
export interface WdwValidatorInput {
  boundaryCondition: WdwBoundaryCondition
  inflatonMass: number
  cosmologicalConstant: number
  aMin: number
  aMax: number
  gridNa: number
  gridNphi: number
  phiExtent: number
}

/** Dense output of the Rust validator. */
export interface WdwValidatorOutput {
  /**
   * `χ(a, φ₁, φ₂)` as interleaved `(re, im)` `Float32Array`. Strides in
   * units of complex entries: `stride_a = Nphi·Nphi`, `stride_phi1 =
   * Nphi`, `stride_phi2 = 1`. Total floats = `2·Na·Nphi·Nphi`.
   * Layout matches the TS `solveWheelerDeWitt` output exactly.
   */
  chi: Float32Array
  gridSize: [number, number, number]
}

const VALIDATOR_PKG_REL = '../../../wasm/mdimension_core/pkg-validator/mdimension_core.js'

/**
 * Resolve the absolute path to the validator's wasm-pack entry script.
 * Returns `null` if it cannot be resolved (e.g. running in a non-Node
 * environment or with a broken `import.meta.url`).
 *
 * @returns Absolute filesystem path or `null`.
 */
function validatorEntryPath(): string | null {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    return resolve(here, VALIDATOR_PKG_REL)
  } catch {
    return null
  }
}

/**
 * Whether the validator binary is present on disk. Tests should consult
 * this BEFORE attempting to load — invoking the loader without the
 * binary throws a clear error, but tests want to skip silently rather
 * than fail.
 *
 * @returns `true` when the validator's `mdimension_core.js` shim exists.
 */
export function isWdwValidatorAvailable(): boolean {
  const p = validatorEntryPath()
  if (p === null) return false
  return existsSync(p)
}

interface ValidatorModule {
  solve_leapfrog_validator_wasm: (
    bcCode: number,
    mass: number,
    lambda: number,
    aMin: number,
    aMax: number,
    gridNa: number,
    gridNphi: number,
    phiExtent: number
  ) => Float32Array
}

let cachedModule: ValidatorModule | null = null

/**
 * Translate the canonical TS BC string into the Rust validator's `u32`
 * code (see module docstring for encoding).
 *
 * @param bc - Canonical boundary-condition string.
 * @returns Integer code accepted by the Rust ABI.
 */
function bcToCode(bc: WdwBoundaryCondition): number {
  switch (bc) {
    case 'noBoundary':
      return 0
    case 'tunneling':
      return 1
    case 'deWitt':
      return 2
    default: {
      const exhaustive: never = bc
      throw new Error(`Unknown Wheeler-DeWitt boundary condition: ${String(exhaustive)}`)
    }
  }
}

/**
 * Lazy-load the validator binary. Caches the module across calls so
 * repeated invocations within one process pay the load cost once.
 * Throws a descriptive error when the binary is missing so callers know
 * to run `pnpm wasm:build:validator`.
 *
 * @returns Resolved validator module exposing the wasm-bindgen export.
 */
async function loadValidatorModule(): Promise<ValidatorModule> {
  if (cachedModule !== null) return cachedModule
  const entry = validatorEntryPath()
  if (entry === null || !existsSync(entry)) {
    throw new Error(
      `Wheeler-DeWitt validator binary not found at ${entry ?? '(unresolved)'}. ` +
        `Run \`pnpm wasm:build:validator\` to produce it.`
    )
  }
  // wasm-pack --target nodejs emits CommonJS; use createRequire so the
  // load works regardless of the consuming module's ESM/CJS flavour.
  const require = createRequire(import.meta.url)
  const mod = require(entry) as ValidatorModule
  if (typeof mod.solve_leapfrog_validator_wasm !== 'function') {
    throw new Error(
      'Wheeler-DeWitt validator binary loaded but `solve_leapfrog_validator_wasm` is missing. ' +
        'The binary is stale; rebuild with `pnpm wasm:build:validator`.'
    )
  }
  cachedModule = mod
  return mod
}

/**
 * Run the independent Rust Wheeler–DeWitt leapfrog solver and return
 * its output in the same layout as `solveWheelerDeWitt`. Used by
 * `solverWasmComparison.test.ts` for cross-implementation validation.
 *
 * @param input - Solver configuration.
 * @returns `χ` tensor + grid dimensions.
 * @throws When the validator binary has not been built.
 */
export async function solveWheelerDeWittWasmValidator(
  input: WdwValidatorInput
): Promise<WdwValidatorOutput> {
  const mod = await loadValidatorModule()
  const chi = mod.solve_leapfrog_validator_wasm(
    bcToCode(input.boundaryCondition),
    input.inflatonMass,
    input.cosmologicalConstant,
    input.aMin,
    input.aMax,
    input.gridNa,
    input.gridNphi,
    input.phiExtent
  )
  return {
    chi,
    gridSize: [input.gridNa, input.gridNphi, input.gridNphi],
  }
}
