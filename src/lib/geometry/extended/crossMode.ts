/**
 * Cross-mode config primitives — configuration interfaces shared by
 * multiple quantum modes.
 *
 * This module exists to *record which features are physically portable
 * across modes* and to give those features a single config type that
 * every adopting mode embeds verbatim. When a feature is embedded via
 * a shared interface defined here, the field shape never drifts between
 * modes and the dispatch helper / shader / UI control can be written
 * once and reused.
 *
 * ## Portability Matrix (current + planned)
 *
 * | Feature                          | Category | Portable to                            |
 * | -------------------------------- | -------- | --------------------------------------- |
 * | Disorder overlay (V += W·η)      | A        | TDSE, BEC, Dirac, FSF (mass² noise)     |
 * | Imaginary-time projection        | A        | TDSE, BEC (trivial), Dirac (needs care) |
 * | PML absorber {on, width, R}      | A        | TDSE, BEC, Dirac, FSF, QW, Pauli (done) |
 * | Diagnostics {on, interval}       | A        | all compute modes (done)                |
 * | CSL stochastic localization      | A        | TDSE (done), BEC, Dirac, Pauli, FSF     |
 * | k-space display transforms       | A        | FSF (done), TDSE, BEC, Dirac (momentum) |
 * | Kaluza-Klein compactification    | A        | TDSE (done), BEC (done), Dirac, Pauli   |
 * | Curved-space Laplace-Beltrami    | B*       | TDSE (done), BEC                        |
 * | Observables ⟨x⟩,⟨p⟩,ΔxΔp         | B*       | TDSE (done), BEC (done). NOT Dirac (Zitterbewegung), NOT FSF (field theory) |
 * | Custom potential expression      | A        | TDSE (done), BEC, Dirac, Pauli          |
 * | Periodic drive (Floquet)         | A        | TDSE (done), BEC, Dirac, Pauli, FSF (via preheating)
 * | Analog Hawking waterfall         | C        | TDSE+BEC only (sonic-horizon specific)  |
 * | Wormhole ER=EPR coupling         | C        | TDSE only (single-particle mirror)      |
 * | QW coin operator                 | C        | QW only (discrete-time construct)       |
 * | WdW boundary condition           | C        | WdW only (minisuperspace construct)     |
 *
 * Legend:
 * - **A** — physically identical in every target; port is mechanical.
 * - **B*** — portable with per-mode physics guards (e.g. Dirac position
 *   operator requires Foldy-Wouthuysen canonical position, not bare x).
 * - **C** — mode-intrinsic; would require re-derivation, not generalization.
 *
 * ## Adoption rule
 *
 * When a feature enters this matrix as Category A and is implemented in
 * ≥2 modes, the corresponding config interface belongs in this file.
 * The first mode to adopt a Category-A feature **inlines** the fields
 * (no premature abstraction). The second adopter **extracts** them into
 * this module.
 *
 * @module lib/geometry/extended/crossMode
 */

/**
 * Statistical distribution of on-site disorder energies.
 *
 * - `uniform`: V(r) ∈ [−W/2, +W/2] uniform distribution
 * - `gaussian`: V(r) ~ N(0, W) Gaussian distribution
 *
 * Shared by any mode that applies a Anderson-style disorder overlay
 * (TDSE, BEC, and future adopters).
 */
export type DisorderDistribution = 'uniform' | 'gaussian'

/**
 * Anderson-style disorder overlay for a scalar potential / mass² buffer.
 *
 * Applied as `V(x) += amplitude · η(x)` where `η(x)` is deterministic
 * noise seeded by `seed`. The noise is generated once on the CPU and
 * uploaded to a GPU storage buffer; the WGSL dispatch kernel is the
 * mode-agnostic `disorderOverlayBlock` in
 * `src/rendering/webgpu/shaders/schroedinger/compute/tdseAddDisorder.wgsl.ts`.
 *
 * `strength` is the user-facing tight-binding disorder parameter `W/t`.
 * The per-mode adapter (e.g. `TDSEComputePassDisorder.maybeDispatchDisorder`)
 * converts this into the physical amplitude `W · t_eff` where
 * `t_eff = ℏ²/(2m·dx²)` before dispatch, so the overlay stays physically
 * identical across grid resizes that change `dx`.
 *
 * - `strength = 0` is a guaranteed no-op (dispatcher short-circuits).
 * - Seed + grid-size together determine the noise realization;
 *   reproducibility is preserved across WASM and JS fallback paths
 *   (`generateDisorderNoise` in `src/lib/physics/tdse/disorderNoise.ts`).
 *
 * @see generateDisorderNoise
 * @see TDSEComputePassDisorder.maybeDispatchDisorder
 */
export interface DisorderOverlayConfig {
  /**
   * Disorder strength W in tight-binding units (W/t). 0 disables the
   * overlay. The per-mode adapter multiplies by `t_eff` to convert to
   * the physical amplitude passed to the generic GPU dispatcher.
   */
  strength: number
  /** Deterministic PRNG seed for the noise realization. */
  seed: number
  /** Statistical distribution of on-site energies. */
  distribution: DisorderDistribution
}

/** Default disorder overlay config — disabled. */
export const DEFAULT_DISORDER_OVERLAY_CONFIG: DisorderOverlayConfig = {
  strength: 0,
  seed: 42,
  distribution: 'uniform',
}
