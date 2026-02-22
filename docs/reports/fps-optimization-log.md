Root Cause Analysis

  The performance drop from 60+ FPS to <10 FPS when enabling open quantum mode for hydrogen orbitals stems from the density grid compute pass recomputing every single frame:

  ┌───────────────────────────────────┬──────────────────────────┬────────────────────────────────────────┐
  │              Factor               │       Normal mode        │           Open Quantum mode            │
  ├───────────────────────────────────┼──────────────────────────┼────────────────────────────────────────┤
  │ Grid recompute frequency          │ Only on parameter change │ Every frame (ρ evolves)                │
  ├───────────────────────────────────┼──────────────────────────┼────────────────────────────────────────┤
  │ Per-voxel cost                    │ 1 evalPsi call (O(1))    │ K evaluateSingleBasis + K² contraction │
  ├───────────────────────────────────┼──────────────────────────┼────────────────────────────────────────┤
  │ Grid size                         │ 64³ = 262K voxels        │ Same 64³                               │
  ├───────────────────────────────────┼──────────────────────────┼────────────────────────────────────────┤
  │ Typical K (hydrogen, maxN=2, 3D)  │ N/A                      │ ~4 basis states                        │
  ├───────────────────────────────────┼──────────────────────────┼────────────────────────────────────────┤
  │ Typical K (hydrogen, maxN=2, 5D+) │ N/A                      │ ~8-14 basis states                     │
  └───────────────────────────────────┴──────────────────────────┴────────────────────────────────────────┘

  For K=10 at 64³: each frame dispatches 262,144 threads, each evaluating 10 hydrogen radial+angular functions (Laguerre polynomials + spherical harmonics) plus 100 complex
  cross-term multiplications. This is ~2-3 orders of magnitude more GPU work per frame than normal mode.

  Optimization Suggestions

  1. Adaptive grid resolution based on basis count K

  What: Reduce grid from 64³ when K > 6. Use 48³ for K=7-10, 32³ for K>10.

  ┌─────────┬──────┬────────┬───────────────┐
  │ K range │ Grid │ Voxels │   Reduction   │
  ├─────────┼──────┼────────┼───────────────┤
  │ 1-6     │ 64³  │ 262K   │ 1× (baseline) │
  ├─────────┼──────┼────────┼───────────────┤
  │ 7-10    │ 48³  │ 110K   │ 2.4×          │
  ├─────────┼──────┼────────┼───────────────┤
  │ 11-14   │ 32³  │ 32K    │ 8×            │
  └─────────┴──────┴────────┴───────────────┘

  - FPS impact: +15-40 FPS depending on K (proportional to voxel count reduction)
  - Visual quality: Slight softening of lobe edges for 48³; noticeable at 32³ but trilinear filtering helps. Acceptable for an evolving state.
  - Physical accuracy: Identical physics. Only spatial sampling resolution decreases.
  - Implementation effort: Low — change gridSize in DensityGridComputePass constructor based on config.

  2. Increase frame stride for density matrix updates

  What: Force computeOpenQuantumFrameStride to return at least 2 (update every other frame) at full quality, and 3-4 during interaction.

  ┌───────────────────┬────────────────┬─────────────────┐
  │     Situation     │ Current stride │ Proposed stride │
  ├───────────────────┼────────────────┼─────────────────┤
  │ Full quality, K≤8 │ 1              │ 2               │
  ├───────────────────┼────────────────┼─────────────────┤
  │ Full quality, K>8 │ 1              │ 3               │
  ├───────────────────┼────────────────┼─────────────────┤
  │ Interacting, K≤8  │ 2              │ 3               │
  ├───────────────────┼────────────────┼─────────────────┤
  │ Interacting, K>8  │ 3              │ 4               │
  └───────────────────┴────────────────┴─────────────────┘

  - FPS impact: +100-200% (halving or thirding GPU work)
  - Visual quality: Density evolution appears slightly choppy — evolution steps are already on the order of dt * substeps = 0.04s, so skipping 1-2 visual frames (16-33ms)
  adds minimal perceptual lag vs the physics timestep.
  - Physical accuracy: Identical — the evolution step size doesn't change, only how often we re-render it.
  - Implementation effort: Trivial — adjust constants in computeOpenQuantumFrameStride.

  3. Exploit Hermitian symmetry of ρ in the compute shader

  What: The density matrix is Hermitian (ρ_{kl} = ρ_{lk}*), so Re(ρ_{kl} · ψ_k · ψ_l*) = Re(ρ_{lk}* · ψ_k · ψ_l*). The double loop can be halved:

  // Instead of K² iterations:
  for k in 0..K:
    diagDensity += rho_kk.x * dot(ψ_k, ψ_k)  // diagonal
    for l in (k+1)..K:
      // Off-diagonal: 2 * Re(ρ_{kl} · ψ_k · ψ_l*)
      totalDensity += 2.0 * (rho_kl.x * prod.x - rho_kl.y * prod.y)

  - FPS impact: ~40-45% reduction in the contraction loop (K(K+1)/2 vs K²). For K=14: 105 vs 196 iterations.
  - Visual quality: None — mathematically identical.
  - Physical accuracy: Exact.
  - Implementation effort: Low — modify densityMatrixComputeBlock WGSL.

  4. Basis-count-aware render basis limit cap

  What: The existing getOpenQuantumRenderBasisLimit is conservative. For K>8, many high-energy basis states have negligible population (ρ_{kk} < 0.01). Dynamically cap
  renderBasisK at runtime based on population thresholds.

  On CPU before GPU upload, scan ρ_{kk} and find the smallest K' such that Σ_{k=0}^{K'-1} ρ_{kk} > 0.99. Send only K' states to the GPU.

  - FPS impact: Depends on state — for thermal states, this could reduce K from 14 to 4-6. For K=14→K=6: basis evaluations drop 14→6 (2.3×), cross-terms drop 196→36 (5.4×).
  - Visual quality: Missing contributions are below 1% of total density — invisible.
  - Physical accuracy: Drops states contributing <1% population. The trace purity diagnostic remains accurate (computed on full K).
  - Implementation effort: Medium — CPU-side filtering + modify packForGPU to only pack active states.

  5. Precompute hydrogen radial lookup texture

  What: For a given (n, l, a₀), the radial function R_{nl}(r) depends only on r. Pre-compute it into a 1D texture (256 samples) for each active (n,l) pair and sample via
  textureSample in the compute shader instead of evaluating Laguerre polynomials.

  For K=14 with maxN≤3, there are at most ~6 unique (n,l) pairs: (1,0), (2,0), (2,1), (3,0), (3,1), (3,2).

  - FPS impact: ~30-50% reduction in per-basis evaluation cost. Laguerre polynomial evaluation is the most expensive part of each basis function.
  - Visual quality: Texture interpolation introduces slight smoothing at polynomial nodes. Using 256 samples with a physically-appropriate r-range, error < 0.1%.
  - Physical accuracy: Very high — the lookup table captures the exact radial function to floating point precision across the relevant r-range.
  - Implementation effort: High — requires new 1D textures, compute shader modifications, bind group changes.

  6. Time-sliced grid computation

  What: Split the 64³ grid into 4 z-slabs of 64×64×16. Compute one slab per frame. Full grid update takes 4 frames (67ms at 60 FPS).

  - FPS impact: ~4× lower per-frame GPU cost → likely recovers 60 FPS.
  - Visual quality: During the 4-frame update cycle, the grid has a mix of old and new density. For smooth evolution this is barely perceptible. For rapid parameter changes
  it's a visible wave.
  - Physical accuracy: Identical when complete. During the update cycle, the grid is a spatial hybrid of two timesteps — not physically meaningful but visually acceptable.
  - Implementation effort: Medium — modify compute dispatch to use z-offset, track which slab is current.

  7. Double-buffered async grid (GPU timeline decoupling)

  What: Maintain two density grid textures. Render from texture A while computing into texture B. Swap on completion. This completely decouples compute latency from frame
  rendering.

  - FPS impact: Removes grid compute from critical path entirely. Fragment shader always reads from a completed grid. Could recover full 60 FPS.
  - Visual quality: 1-frame latency in density update (16ms). Invisible in practice.
  - Physical accuracy: Identical — just 1 frame behind.
  - Implementation effort: Medium-High — requires second texture, ping-pong swap logic, careful synchronization.

  Recommended Implementation Order

  For maximum impact with minimum effort, I'd recommend combining:

  1. Suggestion 2 (increase frame stride) — trivial change, immediate 2-3× improvement
  2. Suggestion 3 (Hermitian symmetry) — low effort, ~1.5× improvement
  3. Suggestion 1 (adaptive grid resolution) — low effort, up to 8× for large K
  4. Suggestion 4 (population-based basis trimming) — medium effort, potentially massive for high K

  Together, these 4 changes could reduce per-frame GPU cost by 10-30× without any visible quality degradation, likely restoring 60 FPS.
