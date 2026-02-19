# Color Algorithms: Physical Encoding vs Visual Styling

**Date:** 2026-02-11
**Scope:** `schroedinger` color algorithms implemented in WebGPU WGSL
**Primary sources:**
`/Users/Spare/Documents/code/mquantum/src/rendering/shaders/palette/types.ts`
`/Users/Spare/Documents/code/mquantum/src/rendering/webgpu/shaders/schroedinger/volume/emission.wgsl.ts`
`/Users/Spare/Documents/code/mquantum/src/rendering/webgpu/shaders/schroedinger/quantum/density.wgsl.ts`
`/Users/Spare/Documents/code/mquantum/src/rendering/webgpu/shaders/schroedinger/quantum/psi.wgsl.ts`

## Common Quantities Used by the Algorithms

- Complex wavefunction: `psi = Re(psi) + i Im(psi)`
- Probability density: `rho = |psi|^2 = Re(psi)^2 + Im(psi)^2`
- Log-density: `s = log(rho + 1e-8)`
- Density color driver (used by many algorithms):
  `normalized = clamp((s + 8.0) / 8.0, 0.0, 1.0)`
- Spatial phase used for coloring: `phase = atan2(Im(psi), Re(psi))`

## Important Interpretation Caveats

- Many algorithms are driven by **log-density**, not linear density. Color differences are therefore perceptually expanded in low-density regions and compressed in high-density regions.
- With optional features enabled (uncertainty-boundary emphasis, interference fringing, probability-flow texture), the colored `rho` can be a **modulated** density, not pure raw `|psi|^2`.
- Phase-based algorithms use `phase = atan2(Im, Re)` from the shader's spatial phase path (stable by default; optionally animated by phase animation mode).

## Algorithm-by-Algorithm Assessment

Scales below are practical interpretation scores:
- **Information value**: how directly color encodes useful physical/mathematical structure.
- **Visual fluff**: how much color is mainly stylistic or arbitrary.

### 0) `monochromatic`

- What it does: keeps hue fixed (user base color), varies lightness with `normalized`.
- Encodes: compressed `log(|psi|^2)` only (via lightness).
- Information value: **35%**
- Visual fluff: **65%**
- Assessment: useful for seeing probability concentration gradients, but hue carries no physics and lightness mapping is artistic (`0.3 -> 0.7` range).

### 1) `analogous`

- What it does: shifts hue around base hue by about +/- 30 degrees using `normalized`.
- Encodes: compressed `log(|psi|^2)` only (via hue shift).
- Information value: **40%**
- Visual fluff: **60%**
- Assessment: gives density ordering, but the mapping is a stylistic hue arc around a user-selected color, so quantitative interpretation is limited.

### 2) `cosine`

- What it does: applies cosine palette `a + b*cos(2*pi*(c*t + d))` to `distributedT` from `normalized`.
- Encodes: compressed `log(|psi|^2)` through an arbitrary user-defined palette.
- Information value: **30%**
- Visual fluff: **70%**
- Assessment: can reveal isodensity structure if palette is chosen carefully, but mostly aesthetic because coefficients are unconstrained and non-physical.

### 3) `normal`

- What it does: uses `pos.y` (vertical position proxy) as palette coordinate, then cosine palette.
- Encodes: geometric vertical position (`y`), not `psi` phase or true surface normal.
- Information value: **20%**
- Visual fluff: **80%**
- Assessment: primarily orientation/shape shading. Useful for visual parsing of form, weak for physics insight.

### 4) `distance`

- What it does: currently uses the same path as `cosine` on `distributedT` from `normalized`.
- Encodes: compressed `log(|psi|^2)` (same practical encoding as algorithm 2 in current shader).
- Information value: **30%**
- Visual fluff: **70%**
- Assessment: despite label "distance field", current implementation behaves like density-driven cosine coloring.

### 5) `lch`

- What it does: maps `normalized` to hue angle in Oklab/LCH with user lightness/chroma.
- Encodes: compressed `log(|psi|^2)` through perceptually uniform color space.
- Information value: **45%**
- Visual fluff: **55%**
- Assessment: better perceptual consistency than HSL/cosine for reading gradients, but still a stylistic color wheel around density.

### 6) `multiSource`

- What it does: blends three drivers then applies cosine palette:
  `blendedT = w0*density + w1*radial + w2*vertical`
- Encodes: mixed scalar of
  `log(|psi|^2)` (density term), radius `|x|/R`, and vertical position `y`.
- Information value: **50%**
- Visual fluff: **50%**
- Assessment: can be informative when weights are explicitly chosen for a hypothesis (for example radial shell emphasis), but easy to over-style and lose clear semantics.

### 7) `radial`

- What it does: uses radial distance from center (`|pos|/boundingRadius`) through cosine palette.
- Encodes: geometric radius only.
- Information value: **60%**
- Visual fluff: **40%**
- Assessment: good for hydrogen-like radial structure and shell interpretation, but does not directly encode phase or local amplitude.

### 8) `phase`

- What it does: maps wavefunction phase to hue shift around base hue; fixed saturation/lightness.
- Encodes: `arg(psi)` only.
- Information value: **70%**
- Visual fluff: **30%**
- Assessment: physically meaningful for phase topology and nodal sign transitions, but excludes amplitude so magnitude context is missing.

### 9) `mixed` (default)

- What it does: hue from phase, saturation/lightness from `normalized` density.
- Encodes: both `arg(psi)` and compressed `log(|psi|^2)`.
- Information value: **80%**
- Visual fluff: **20%**
- Assessment: strong general-purpose physics map because it jointly communicates phase and amplitude envelope.

### 10) `blackbody`

- What it does: maps `normalized` to pseudo-temperature (`0..12000 K`) and uses analytic blackbody approximation.
- Encodes: compressed `log(|psi|^2)` as temperature proxy.
- Information value: **65%**
- Visual fluff: **35%**
- Assessment: density structure is readable and intuitive, but "temperature" is metaphorical here (not actual thermodynamic temperature of the state).

### 11) `phaseCyclicUniform`

- What it does: full `0..2pi` phase -> cyclic perceptual color loop with constant lightness/chroma.
- Encodes: `arg(psi)` only.
- Information value: **90%**
- Visual fluff: **10%**
- Assessment: one of the most scientifically informative modes for complex wavefunction analysis, with lower perceptual bias than HSV-like wheels.

### 12) `phaseDiverging`

- What it does: diverging map from `cos(phase)`, with brightness from `normalized`.
- Encodes:
  `sign(cos(phase))` as positive/negative wing,
  `|cos(phase)|` as sign confidence,
  compressed `log(|psi|^2)` as brightness.
- Physical interpretation of `cos(phase)`: for `|psi| > 0`,
  `cos(phase) = Re(psi) / |psi|`, so sign acts as a **Re(psi) sign proxy**.
- Information value: **92%**
- Visual fluff: **8%**
- Assessment: excellent for sign-structure studies (nodal topology, lobe polarity). Most physically diagnostic among current modes.

## Practical Ranking for Physics Insight

Highest insight (recommended for analysis):
- `phaseDiverging`
- `phaseCyclicUniform`
- `mixed`
- `phase`

Middle:
- `radial`
- `blackbody`
- `multiSource`
- `lch`

Mostly stylistic / presentation-first:
- `monochromatic`
- `analogous`
- `cosine`
- `distance`
- `normal`

## Bottom Line

If the goal is physical/mathematical insight (not just visual appeal), prioritize phase-aware algorithms (`phaseCyclicUniform`, `phaseDiverging`, `mixed`) because they encode the complex structure of `psi` directly, not only a styled remapping of density.

## Web-Researched Recommendations for an Educational Quantum Toolkit

The following additions are based on external visualization and scientific-color literature, adapted to this codebase.

### A) Perceptually Uniform Cyclic Phase Map (`phaseCyclicUniform`)

- Encode: `arg(psi)` only.
- Why: phase is periodic, so endpoints must match seamlessly; cyclic maps are recommended specifically for periodic data.
- Educational value: clearer phase wraps, branch cuts, and phase vortices in superpositions.
- Expected fluff level: **low**.
- Recommendation: use this as the direct replacement for HSV-like phase wheels.

### B) Domain Coloring for Wavefunctions (`domainColoringPsi`)

- Encode:
  hue = `arg(psi)`,
  value/lightness = `log(|psi|)` or `log(|psi|^2)`,
- As option toggleable with configuration options for styling:  modulus contour lines
- Why: domain coloring is explicitly designed to show complex phase and magnitude simultaneously.
- Educational value: very high for superposition analysis, interference structure, and nodal interpretation.
- Expected fluff level: **low-medium** (depends on contour styling).
- Recommendation: make this a first-class analysis mode, not only a stylistic variant.

### C) Zero-Centered Diverging Real/Imag Maps (`realDiverging`, `imagDiverging`)

- Encode:
  color wing = sign of `Re(psi)` or `Im(psi)`,
  intensity = magnitude.
- Options in the ui: provide separate real and imaginary views with zero pinned to a neutral color (color picker).
- Why: diverging maps are the standard for signed quantities with a critical midpoint at zero.
- Educational value: high for nodal surfaces (zero crossings), symmetry, and sign structure of eigenstates/superpositions.
- Expected fluff level: **low**.
- Recommendation: provide separate real and imaginary views with zero pinned to a neutral color.

### D) Wigner Negativity Map (`wignerNegativity`) for Phase-Space Modes

- Encode:
  positive quasi-probability vs negative quasi-probability with a diverging map centered at zero.
- Why: for Wigner functions, negativity is physically meaningful and should visually stand out.
- Educational value: very high when teaching non-classicality and quantum interference in phase space.
- Expected fluff level: **low**.
- Recommendation: if Wigner mode is active, use a dedicated negativity-emphasizing diverging map (not generic rainbow/sequential maps).

### E) CVD-Safe Sequential Density Mode (`densitySequentialCVD`)

- Encode: `|psi|^2` or `log(|psi|^2)` with perceptually uniform, color-vision-deficiency-aware sequential luminance.
- Why: improves quantitative interpretability and accessibility for all students.
- Educational value: high for reading radial distributions, envelope widths, and relative probability regions.
- Expected fluff level: **very low**.
- Recommendation: include at least one default-safe map (for example cividis-like behavior) and mark it as "quantitative default".

### F) Relative-Phase-to-Reference Superposition Map (`relativePhase`)

- Encode:
  hue = `arg(conj(psi_ref) * psi)` (relative phase),
  lightness = `|psi|^2`.
- Why: students often struggle with which phase is physically relevant in superpositions; relative phase is the interference driver.
- Educational value: very high for understanding constructive vs destructive interference between components.
- Expected fluff level: **low**.
- Note: this is an inference-based recommendation from phase/domain-coloring literature applied to superposition pedagogy.

## Proposed Priority Order (Educational Impact First)

1. `phaseCyclicUniform` (fast win, direct improvement to existing phase views)
2. `realDiverging` and `imagDiverging` (signed-quantity fundamentals)
3. `domainColoringPsi` (most complete complex-field teaching mode)
4. `densitySequentialCVD` (quantitative baseline and accessibility)
5. `relativePhase` (superposition-specific teaching mode)
6. `wignerNegativity` (for advanced phase-space curriculum)

## External Sources Used

- Peter Kovesi, *Good Colour Maps: How to Design Them* (arXiv:1509.03700): [arXiv](https://arxiv.org/abs/1509.03700)
- Kenneth Moreland, *Diverging Color Maps for Scientific Visualization* (2009): [paper](https://www.kennethmoreland.com/color-maps/)
- Fabio Crameri et al., *The misuse of colour in science communication* (Nature Communications, 2020): [article](https://www.nature.com/articles/s41467-020-19160-7)
- Nuñez, Anderton, Renslow, *Optimizing colormaps with consideration for CVD to enable accurate interpretation of scientific data* (PLOS ONE, 2018): [article](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0199239)
- Matplotlib colormap guidance (notes on HSV/rainbow pitfalls and map classes): [docs](https://matplotlib.org/stable/users/explain/colors/colormaps.html)
- cmocean perceptual colormaps (includes cyclic `phase` map): [docs](https://matplotlib.org/cmocean/index.html)
- Poelke & Polthier, *Domain coloring of complex functions* (IEEE Computer Graphics and Applications, 2012): [PubMed](https://pubmed.ncbi.nlm.nih.gov/22722318/)
- Frank Farris, *Domain coloring and the argument principle* (PRIMUS, 2017): [article](https://scholarcommons.scu.edu/math_compsci/29/)
- QuTiP Wigner colormap example (negative values explicitly emphasized): [docs](https://qutip.readthedocs.io/en/latest/guide/guide-visualization.html)
