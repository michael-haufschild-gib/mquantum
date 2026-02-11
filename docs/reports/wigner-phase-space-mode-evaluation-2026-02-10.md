# Wigner Function Phase-Space Mode — Feasibility Evaluation

_Date: 2026-02-10_

## Proposal Summary

Add a "Wigner Function (Phase-Space)" visualization mode alongside the existing position and momentum representations. The Wigner quasi-probability distribution W(x,p) represents the quantum state in phase space (position x vs momentum p). Unlike classical probability distributions, W can be negative — these negative regions are the signature of quantum behavior.

### Proposed Features
- 2D heatmap with diverging colormap (blue = negative, red = positive)
- Phase-space axis ranges
- Superposition cross-term visibility toggle
- Classical trajectory overlay (ellipse in phase space)

### Closed-Form Expression (1D HO Fock States)
```
W_n(x,p) = (-1)^n / (pi * hbar) * L_n(2H / hbar*omega) * exp(-H / hbar*omega)
```
where `H = p^2/2m + m*omega^2*x^2/2` and `L_n` is the n-th Laguerre polynomial.

---

## Evaluation

### Physics & Educational Value: Excellent

The Wigner quasi-probability distribution is one of the best tools for teaching the quantum-classical boundary:

- **Coherent states** appear as positive Gaussian blobs (classical-like)
- **Fock states** show concentric rings with **negative valleys** (genuinely non-classical)
- **Superposition states** display interference fringes in phase space
- The closed-form expression for 1D HO via Laguerre polynomials is correct and clean

---

### Core Architectural Problem: Dimensionality Mismatch

**The current renderer is purely 3D volumetric raymarching. Wigner functions are inherently 2D heatmaps.** This is the central tension:

| Quantum System | Phase Space Dimension | Visualization |
|---|---|---|
| 1D HO | W(x,p) → **2D** | 2D heatmap |
| 3D hydrogen | W(x,y,z,px,py,pz) → **6D** | Must slice to 2D (r, p_r) |
| N-D (4D-11D) | W(x_1...x_n, p_1...p_n) → **2N-D** | Must slice to 2D |

Every case requires a **2D rendering path**, which doesn't exist today. The minimum dimension is hard-coded to 3 in the object type registry, and there is no flat quad / heatmap rendering pass.

---

### What Exists That Could Help

1. **`SchroedingerRepresentation = 'position' | 'momentum'`** — adding `'wigner'` is a trivial type extension.
2. **Cross-section feature** (`crossSection.wgsl.ts`) — already renders 2D colored planes through the 3D volume. Closest existing 2D infrastructure.
3. **Diverging colormap** (color algorithm 12, `phaseDiverging`) — already has the red-white-blue scheme perfect for Wigner sign encoding. Defined in `emission.wgsl.ts`.
4. **Modular shader composition** — adding a `wignerBlock` WGSL module fits the existing `assembleShaderBlocks()` pattern.
5. **HO momentum via CPU uniform transform** — the same mathematical property (HO eigenfunctions are Fourier eigenfunctions) is what makes their Wigner functions analytically known.

---

### What Doesn't Exist and Would Need Building

| Component | Effort | Notes |
|---|---|---|
| **2D rendering pass** (flat quad heatmap) | **Large** | New WebGPU pass — the renderer has no concept of flat 2D rendering |
| **WGSL Wigner evaluation (1D HO)** | Moderate | Laguerre polynomial evaluation, closed-form expression |
| **Phase-space axis mapping** | Moderate | UI for selecting which (x_i, p_i) pair to display; axis labels |
| **Hydrogen Wigner function** | **Very Hard** | No clean closed-form; requires numerical Fourier transforms or Wigner-d matrices |
| **N-D Wigner slicing** | Hard | Must define a meaningful 2D slice of a 2N-D phase space |
| **3D volume + 2D overlay compositing** | Moderate | If both the 3D volume and the 2D Wigner should be visible together |

---

### The 3D-Embedding Workaround

It would be possible to embed W(x,p) as a 3D volume (x-axis = position, y-axis = momentum, z-axis = thin slab or time), but this is architecturally wasteful — raymarching a fundamentally 2D function through 3D space, wasting GPU cycles on the degenerate axis. It would also lose the crisp heatmap look that makes Wigner functions visually compelling.

---

### Assessment Summary

| Aspect | Rating |
|---|---|
| Educational value | 10/10 |
| Physics soundness | 9/10 (1D HO is clean; hydrogen is murky) |
| Architectural fit | **3/10** — fundamentally 2D in a 3D-only renderer |
| 1D HO scope (minimal viable) | **Medium** effort (~1-2 weeks) |
| Full N-D scope | **Very Large** effort (~4-8 weeks) |

---

## Recommendation: Phased Implementation

**Yes, it makes sense — but scope it tightly.**

### Phase 1 — 1D HO Wigner (Viable, Highest Value)

Build a dedicated 2D WebGPU rendering pass (fullscreen quad, fragment shader computes W(x,p) analytically). Use the existing diverging colormap (algorithm 12). This gives the highest educational value for the least work.

**Required work:**
- Add `'wigner'` to `SchroedingerRepresentation` type
- Create a new `WebGPU2DPass` or `WebGPUWignerPass` (flat quad rendering)
- Implement WGSL Wigner function evaluation using the Laguerre polynomial closed form
- Add UI controls (phase-space axis ranges, cross-term toggle)
- Handle the 3D minimum dimension constraint (either lower it to 1 for Wigner mode, or map the 2D phase space onto two of the three visible axes)

### Phase 2 — 3D Hydrogen Radial Slice (Deferred)

Extend to 3D hydrogen via (r, p_r) radial slices. This requires deciding on a physically meaningful slice of the 6D phase space. No clean closed-form expression exists for hydrogen Wigner functions.

### Phase 3 — N-D Generalization (Research-Level, Deferred)

Generalize to higher dimensions. Both the physics (what does phase space mean for 11D?) and the UI (which 2D slice of a 22D space?) are open questions at this scope.

---

## Additional Benefit

The key blocker — no 2D rendering path — is also an opportunity. Building a 2D pass infrastructure would unlock other educationally valuable 2D visualizations:
- Energy level diagrams
- Radial probability distributions P(r) for hydrogen
- Momentum-space probability distributions |phi(k)|^2
- Expectation value time evolution plots

These could share the same 2D rendering infrastructure.
