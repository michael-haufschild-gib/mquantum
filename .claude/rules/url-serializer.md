# URL Serializer

The URL state serializer (`src/lib/url/state-serializer.ts`) provides shareable scene links and test navigation.

## Supported Params

| Param | Type | Purpose |
|-|-|-|
| `scene` | string | Scene preset name (mutually exclusive with other params) |
| `t` | string | Object type (`schroedinger`, `pauliSpinor`) |
| `d` | int 2-11 | Dimension |
| `qm` | string | Quantum mode |
| `repr` | enum | Representation: `position`, `momentum`, `wigner` |
| `iso` | 0/1 | Isosurface mode |
| `iso_t` | float | Isosurface threshold (-6 to 0) |
| `cs` | 0/1 | Cross-section slice |
| `tc` | int 1-8 | HO superposition term count |
| `seed` | int | HO random seed |
| `dg` | float | Density gain |
| `scale` | float | Object scale (0.1-2.0) |
| `hyd_n`, `hyd_l`, `hyd_m` | int | Hydrogen quantum numbers |
| `pot` | enum | TDSE potential type |
| `abs` | 0/1 | TDSE absorber |
| `diag` | 0/1 | TDSE diagnostics |
| `obs` | 0/1 | TDSE observables |
| `it` | 0/1 | Imaginary-time propagation |
| `oq` | 0/1 | Open quantum |
| `oq_dp`, `oq_rx`, `oq_th` | float | Open quantum rates |
| `sloc` | 0/1 | TDSE stochastic localization (CSL) |
| `sloc_g` | float 0-10 | CSL monitoring rate γ |
| `sloc_s` | float 0.5-5 | CSL localization width σ |
| `sloc_n` | int 1-32 | Collapse sites per step |
| `brc` | 0/1 | TDSE branch visualization — moves diagnostic partition to the branch plane |
| `brc_p` | float -1 to 1 | Normalized branch plane position along axis 0 |
| `wdw_bc` | enum | Wheeler–DeWitt boundary condition (`noBoundary`, `tunneling`, `deWitt`) |
| `wdw_m` | float 0-2 | Wheeler–DeWitt inflaton mass m |
| `wdw_lambda` | float -1..1 | Wheeler–DeWitt cosmological constant Λ |
| `wdw_sl` | 0/1 | Wheeler–DeWitt WKB streamline overlay toggle |
| `wdw_sld` | int 2-16 | Wheeler–DeWitt streamline seed density per axis |
| `wdw_pr` | 0/1 | Wheeler–DeWitt phase rotation visual (render-only) |
| `wdw_prs` | float 0-5 | Wheeler–DeWitt phase rotation angular-velocity multiplier |
| `wdw_wl` | 0/1 | Wheeler–DeWitt semiclassical worldline pulse (render-only) |
| `wdw_wls` | float 0.1-3 | Wheeler–DeWitt worldline pulse cycles per unit time |
| `wdw_wlw` | float 0.02-0.3 | Wheeler–DeWitt worldline Gaussian pulse width |
| `srmt` | 0/1 | Wheeler–DeWitt SRMT diagnostic master toggle (display-only) |
| `srmt_c` | enum | SRMT clock axis (`a`, `phi1`, `phi2`) |
| `srmt_x` | float 0.1-0.9 | SRMT normalized cut position along the selected clock axis |
| `srmt_r` | int 8-256 | SRMT Schmidt rank cap |
| `srmt_h` | float 0-1 | SRMT heatmap overlay brightness |
| `ads_d` | int 3-7 | Anti-de Sitter boundary dimension |
| `ads_n` | int 0-4 | Anti-de Sitter radial quantum number |
| `ads_l` | int 0-3 | Anti-de Sitter angular momentum |
| `ads_m` | int | Anti-de Sitter magnetic quantum number (clamped to [−ℓ, +ℓ] downstream) |
| `ads_mL` | float -3..3 | Anti-de Sitter mass × AdS radius (signed; negative encodes imaginary mass) |
| `ads_qb` | 0/1 | Anti-de Sitter quantization branch (0 = standard Δ₊, 1 = alternate Δ₋ with KW fallback) |
| `ads_bo` | 0/1 | Anti-de Sitter asymptotic boundary primary overlay toggle |
| `ads_btz` | 0/1 | BTZ (Stage 2A) thermal-state code path (only honoured when `ads_d=3`) |
| `ads_btz_r` | float 0.05..2.0 | BTZ outer horizon radius r₊ in AdS-length units |
| `ads_btz_omega` | float 0.1..10 | BTZ scalar-mode angular frequency ω (1/L units) |
| `ads_btz_mA` | int -5..5 | BTZ azimuthal quantum number m on the S¹ |
| `ads_hkll` | 0/1 | HKLL (Stage 2B) bulk-from-boundary reconstruction code path. Mutually exclusive with `ads_btz` — setting either clears the other. |
| `ads_hkll_src` | int 0..2 | HKLL boundary source (0 = eigenstate, 1 = localized, 2 = planeWave) |
| `ads_hkll_sigma` | float 0.05..1.5 | Gaussian spot angular width σ (radians) for the `localized` source |
| `ads_hkll_mb` | int 0..8 | Azimuthal quantum number m_b for the `planeWave` source |
| `sw` | enum `cut\|mass\|lambda\|bc\|phiRef\|rankCap\|phiExtent\|gridNa\|gridNphi` | SRMT parameter-sweep kind. Presence triggers the sweep section to auto-start after the Wheeler–DeWitt solver produces its first output. `phiRef`/`rankCap`/`phiExtent`/`gridNa`/`gridNphi` are Tier-3 sensitivity sweeps: a claim that survives variation across these knobs is genuine physics, not a numerical artifact. `gridNa`/`gridNphi` specifically certify the leapfrog's 2nd-order Cauchy convergence — a publication grid whose `q(N)` does not approach `q(N_max)` monotonically as `N` grows is unfit to publish. See `docs/physics/srmt-metric.md`. |
| `sw_n` | int 3-64 | Sweep points. Clamped per-kind (cut: [4, 64]; mass / lambda / phiRef: [3, 21]; rankCap: [3, 32]; phiExtent: [3, 13]; gridNa / gridNphi: [3, 9]). Ignored when `sw=bc`. |
| `sw_min` | float -1024..1024 | Lower sweep bound (cut: [0, 1]; mass: [0, 2]; lambda: [-1, 1]; phiRef: [0, phiExtent]; rankCap: [8, 256]; phiExtent: [0.5, 5]; gridNa: [64, 1024]; gridNphi: [9, 33]). Driver clamps per-kind. Ignored for `sw=bc`. |
| `sw_max` | float -1024..1024 | Upper sweep bound (same per-kind ranges as `sw_min`). Ignored for `sw=bc`. |
| `sw_phi` | float -10..10 | φ reference used when computing the turning-point landmark. |
| `sw_c` | float 0.1..0.9 | Anchor `srmtCutNormalized` for mass/bc sweeps (the cut held fixed while physics varies). Ignored for `sw=cut`. |

## Rules

- Unknown params are silently ignored (forward compatible)
- Missing params keep app defaults (merge behavior)
- All extended params are optional — only `d` and `t` are required for object links
- `wdw_*` params are only applied when `qm=wheelerDeWitt`
- `srmt*` params (`srmt`, `srmt_c`, `srmt_x`, `srmt_r`, `srmt_h`) are Wheeler–DeWitt SRMT-scoped — only emitted when `qm=wheelerDeWitt`, and accepted on parse regardless but only wired into `schroedinger.wheelerDeWitt.*` by `applyWdwParams`. They are display-only: toggling them does not re-run the Wheeler–DeWitt solver.
- `ads_*` params are only emitted when `qm=antiDeSitter` (but are accepted on parse regardless)
- `ads_hkll` and `ads_btz` are mutually exclusive at the store level — setting one clears the other. The URL parser accepts both; the store applies them in order, so the last-applied setter wins.
- `sw*` params are only emitted when `qm=wheelerDeWitt`. On parse they populate a `pendingSweep` slot on the SRMT sweep store; the sweep section claims it via `consumePendingSweep` exactly once after the Wheeler–DeWitt solver has mounted and produced a solver output.
- New params follow the pattern: short key, validated/clamped in `deserializeState`, applied in `applyUrlStateParams`
- Camera state and visual appearance (colors, PBR, post-processing) are NOT url-serialized — use scene presets for those
