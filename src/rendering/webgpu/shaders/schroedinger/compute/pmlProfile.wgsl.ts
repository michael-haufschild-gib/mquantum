/**
 * PML Absorption Profile — Shared WGSL Helper
 *
 * Computes the Perfectly Matched Layer damping coefficient σ(x) at a
 * lattice site using cubic polynomial grading (p = 3):
 *
 *   σ(x) = Σ_d  σ_max · (penetration_d / L_pml_d)³
 *
 * The damping is ADDITIVE across dimensions (not max), which correctly
 * handles corner sites where multiple PML faces overlap.
 *
 * This block defines a standalone function — no bind group or entry point.
 * Prepend it (after the ND-index block) to any shader that needs PML damping.
 *
 * Required uniforms (read from caller's params struct):
 *   - gridSize: array<u32, 12>
 *   - latticeDim: u32
 *   - absorberWidth: f32  (PML width as fraction of grid per side)
 *   - absorberStrength: f32  (σ_max, auto-computed from R_target on CPU)
 *
 * @module
 */

export const pmlProfileBlock = /* wgsl */ `
/**
 * Compute the total PML absorption coefficient at a lattice site.
 *
 * Uses cubic polynomial grading: σ_d = σ_max · ((W - distFromEdge) / W)³
 * Sums contributions from all dimensions (additive PML).
 *
 * @param coords          - N-D lattice coordinates of the site
 * @param gridSize        - Number of grid points per dimension
 * @param latticeDim      - Number of active spatial dimensions
 * @param pmlWidth        - PML region width as fraction of grid per side (0-0.5)
 * @param sigmaMax        - Peak absorption coefficient (pre-computed on CPU)
 * @param compactDimsMask - Bitmask: bit d = 1 skips PML on dimension d (Kaluza-Klein periodic)
 * @returns Total σ at this site (0 in physical domain, >0 in PML)
 */
fn computePMLSigma(
  coords: array<u32, 12>,
  gridSize: array<u32, 12>,
  latticeDim: u32,
  pmlWidth: f32,
  sigmaMax: f32,
  compactDimsMask: u32
) -> f32 {
  var sigma: f32 = 0.0;
  for (var d: u32 = 0u; d < latticeDim; d++) {
    // Skip compact (periodic) dimensions — PML would break KK periodicity
    if ((compactDimsMask & (1u << d)) != 0u) {
      continue;
    }
    let N = f32(gridSize[d]);
    let W = pmlWidth * N;  // PML width in grid points
    let pos = f32(coords[d]);

    // Distance from nearest boundary (in grid points)
    let distFromEdge = min(pos, N - 1.0 - pos);

    if (distFromEdge < W) {
      let ratio = (W - distFromEdge) / W;
      // Cubic polynomial grading (p = 3, optimal per Nissen & Kreiss 2011).
      // IMPORTANT: σ_max on CPU is computed with the same p=3. If this
      // exponent changes, update computePMLSigmaMax() in profile.ts to match.
      sigma += sigmaMax * ratio * ratio * ratio;
    }
  }
  return sigma;
}
`
