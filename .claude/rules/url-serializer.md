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

## Rules

- Unknown params are silently ignored (forward compatible)
- Missing params keep app defaults (merge behavior)
- All extended params are optional — only `d` and `t` are required for object links
- New params follow the pattern: short key, validated/clamped in `deserializeState`, applied in `applyUrlStateParams`
- Camera state and visual appearance (colors, PBR, post-processing) are NOT url-serialized — use scene presets for those
