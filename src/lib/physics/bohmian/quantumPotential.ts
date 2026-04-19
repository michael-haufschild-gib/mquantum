/**
 * Bohmian Quantum Potential Q(x)
 *
 * CPU mirror of the WGSL per-voxel quantum-potential computation used by the
 * Schroedinger volume renderer's colour algorithm 27 (quantumPotential).
 *
 * Definition (natural units ℏ = m = 1):
 *
 *   R(x) = sqrt(ρ(x))
 *   Q(x) = -½ · ∇²R(x) / R(x)
 *
 * For any stationary state of a Hamiltonian H = -½∇² + V(x), the quantum
 * Hamilton–Jacobi identity Q(x) + V(x) = E holds pointwise (where ρ is
 * non-vanishing). Q(x) encodes the "quantum kinetic pressure" — the hidden
 * variable pressure field in de Broglie / Bohm pilot-wave theory that makes
 * quantum dynamics deviate from classical.
 *
 * The CPU routine exists to unit-test the physics (identity checks on known
 * stationary states) and must mirror the WGSL `computeQuantumPotentialFromGrid`
 * stencil exactly: same 7-point Laplacian, same R-safety floor, same 1-texel
 * world step h = 2·boundingRadius / gridSize.
 *
 * @module lib/physics/bohmian/quantumPotential
 */

/**
 * Density floor used inside `sqrt(max(ρ, RHO_FLOOR))`. Mirrors the `1e-8`
 * literal in `densityGridSampling.wgsl.ts` → `computeQuantumPotentialFromGrid`;
 * `quantumPotential.test.ts` pins the mirror via `expectConstantsMatchWGSL`.
 * Exported so consumers can import the single source of truth.
 */
export const RHO_FLOOR = 1e-8

/** R-safe denominator floor — mirrors the WGSL `max(R_c, 1e-4)`. */
export const R_DENOM_FLOOR = 1e-4

/**
 * Raw-density cutoff below which a voxel's Q is forced to 0 (mirrors the WGSL
 * gate + PRD spec). We compare `rhoC < RHO_ZERO_CUTOFF` where
 * `RHO_ZERO_CUTOFF = R_ZERO_CUTOFF²` so the check is on the RAW density.
 *
 * Historical bug: comparing `sqrt(max(rhoC, RHO_FLOOR)) < 1e-6` is vacuous —
 * `sqrt(max(·, 1e-8)) ≥ 1e-4`, which is always larger than 1e-6, so the
 * near-vacuum zeroing never triggered. The fix is to compare the raw
 * (unfloored) density against the equivalent ρ-space cutoff.
 */
export const RHO_ZERO_CUTOFF = 1e-12

/**
 * Linear-index helper: voxel (i, j, k) → `i + size·(j + size·k)`.
 *
 * @param i X-axis voxel index.
 * @param j Y-axis voxel index.
 * @param k Z-axis voxel index.
 * @param size Per-axis grid resolution.
 * @returns Linear index into a size³ Float32Array.
 */
export function indexGrid(i: number, j: number, k: number, size: number): number {
  return i + size * (j + size * k)
}

/**
 * Isotropic 3D harmonic-oscillator potential V(x, y, z) = ½ · (x² + y² + z²)
 * in natural units (ℏ = m = ω = 1).
 *
 * @param x Position along the x axis.
 * @param y Position along the y axis.
 * @param z Position along the z axis.
 * @returns V(x, y, z).
 */
export function computeHarmonicPotentialV(x: number, y: number, z: number): number {
  return 0.5 * (x * x + y * y + z * z)
}

/**
 * Compute the Bohmian quantum potential Q(x) = -½ · ∇²R / R over a cell-centred
 * cubic density grid [−boundingRadius, +boundingRadius]³ using a 7-point
 * second-order central-difference Laplacian.
 *
 * Stencil (single-texel half-step, matches the WGSL):
 *   h = 2·boundingRadius / gridSize
 *   ∇²R ≈ (R(i+1) + R(i−1) + R(j+1) + R(j−1) + R(k+1) + R(k−1) − 6·R_c) / h²
 *
 * Boundary handling: if any of the 6 neighbours of voxel (i, j, k) has an
 * out-of-range index, that neighbour's ρ is clamped to 0, matching the WGSL
 * `select(vec4f(0.0), sample, inBounds)` path. The centre voxel's Q is NOT
 * forced to 0 at the boundary — the Laplacian is computed with floor-level R
 * values for OOB neighbours.
 *
 * Numerical guard: the raw density ρ_c is compared against RHO_ZERO_CUTOFF =
 * 1e-12 (= R_ZERO_CUTOFF² with R_ZERO_CUTOFF = 1e-6); below it the voxel returns
 * 0 so the colour-mode branch in `emission.wgsl.ts` paints it as neutral grey
 * via its density gate. Otherwise R_c = sqrt(max(ρ_c, 1e-8)) and the division
 * uses max(R_c, 1e-4) in the denominator.
 *
 * @param densityGrid Float32Array of size gridSize³ containing ρ values in
 *   row-major `i + size·(j + size·k)` layout.
 * @param gridSize Per-axis grid resolution.
 * @param boundingRadius World-space half-length of the cube the grid covers.
 * @returns Float32Array of size gridSize³ containing Q at each voxel.
 * @throws If `densityGrid.length !== gridSize³` or `boundingRadius <= 0`.
 */
export function computeQuantumPotentialCpu(
  densityGrid: Float32Array,
  gridSize: number,
  boundingRadius: number
): Float32Array {
  if (!Number.isInteger(gridSize) || gridSize <= 2) {
    throw new Error(`computeQuantumPotentialCpu: gridSize must be an integer ≥ 3, got ${gridSize}`)
  }
  if (!Number.isFinite(boundingRadius) || boundingRadius <= 0) {
    throw new Error(
      `computeQuantumPotentialCpu: boundingRadius must be a finite positive number, got ${boundingRadius}`
    )
  }
  const expected = gridSize * gridSize * gridSize
  if (densityGrid.length !== expected) {
    throw new Error(
      `computeQuantumPotentialCpu: densityGrid length ${densityGrid.length} != gridSize³ ${expected}`
    )
  }

  const h = (2 * boundingRadius) / gridSize
  const hSq = h * h
  const out = new Float32Array(expected)

  for (let k = 0; k < gridSize; k++) {
    for (let j = 0; j < gridSize; j++) {
      for (let i = 0; i < gridSize; i++) {
        const idx = indexGrid(i, j, k, gridSize)

        const rhoC = densityGrid[idx]!
        // Raw-density gate: compare unfloored rhoC against RHO_ZERO_CUTOFF
        // (= R_ZERO_CUTOFF²). Applying RHO_FLOOR first would make this check
        // vacuous — see RHO_ZERO_CUTOFF docstring.
        if (rhoC < RHO_ZERO_CUTOFF) {
          out[idx] = 0
          continue
        }
        const Rc = Math.sqrt(Math.max(rhoC, RHO_FLOOR))

        // Boundary: OOB neighbours clamp to rho=0, matching WGSL select(vec4f(0.0), ..., inBounds).
        const rhoXp = i + 1 < gridSize ? densityGrid[indexGrid(i + 1, j, k, gridSize)]! : 0
        const rhoXn = i - 1 >= 0 ? densityGrid[indexGrid(i - 1, j, k, gridSize)]! : 0
        const rhoYp = j + 1 < gridSize ? densityGrid[indexGrid(i, j + 1, k, gridSize)]! : 0
        const rhoYn = j - 1 >= 0 ? densityGrid[indexGrid(i, j - 1, k, gridSize)]! : 0
        const rhoZp = k + 1 < gridSize ? densityGrid[indexGrid(i, j, k + 1, gridSize)]! : 0
        const rhoZn = k - 1 >= 0 ? densityGrid[indexGrid(i, j, k - 1, gridSize)]! : 0

        const Rxp = Math.sqrt(Math.max(rhoXp, RHO_FLOOR))
        const Rxn = Math.sqrt(Math.max(rhoXn, RHO_FLOOR))
        const Ryp = Math.sqrt(Math.max(rhoYp, RHO_FLOOR))
        const Ryn = Math.sqrt(Math.max(rhoYn, RHO_FLOOR))
        const Rzp = Math.sqrt(Math.max(rhoZp, RHO_FLOOR))
        const Rzn = Math.sqrt(Math.max(rhoZn, RHO_FLOOR))

        const laplR = (Rxp + Rxn + Ryp + Ryn + Rzp + Rzn - 6 * Rc) / hSq
        out[idx] = (-0.5 * laplR) / Math.max(Rc, R_DENOM_FLOOR)
      }
    }
  }

  return out
}
