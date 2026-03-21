# Market Readiness - Competitor Analysis

**Date:** 2026-03-21
**Category:** Interactive quantum physics visualization / educational simulation

## Competitors Analyzed

### 1. Falstad Hydrogen Atom Orbital Viewer
- **URL:** https://www.falstad.com/qmatom/
- **Type:** Free web applet (Java-based, now JavaScript)
- **Features:**
  - 3D hydrogen orbital visualization (real + complex orbitals)
  - Quantum numbers n=1 to n=7
  - Planar slice viewing
  - Energy level diagrams
  - Angular momentum graphs
  - Radial distribution plots
  - Hybrid orbital bases
  - Mouse rotation, zoom slider
  - Superposition of states
- **Strengths:** Long-established (20+ years), free, runs everywhere, educational community trust, simple/accessible
- **Weaknesses:** Dated visual quality, no volumetric rendering, limited to 3D hydrogen only, no modern UI, no export features, no N-dimensional support
- **Pricing:** Free

### 2. Atom in a Box (Dauger Research)
- **URL:** https://daugerresearch.com/orbitals/
- **Type:** Native app (macOS since 1998, iOS, Apple Vision)
- **Features:**
  - Real-time volumetric raytracing of hydrogen atom
  - 140 eigenstates up to n=7
  - Multitouch rotation
  - Accelerometer support
  - Time-evolving superpositions
  - Apple Vision Pro support
- **Strengths:** Award-winning, pioneer in the space (since 1998), native performance, Apple ecosystem integration, volumetric rendering
- **Weaknesses:** Hydrogen-only, no harmonic oscillator modes, no N-dimensional, platform-locked (Apple only), small feature set by modern standards, no web version
- **Pricing:** Paid iOS app (~$2-5 estimated from App Store)
- **Source:** [App Store](https://apps.apple.com/us/app/atom-in-a-box/id284788633)

### 3. Quantum Flytrap Virtual Lab
- **URL:** https://lab.quantumflytrap.com/
- **Type:** Free web-based
- **Features:**
  - Drag-and-drop optical table simulation
  - Up to 3 entangled photons
  - Beam splitters, polarizers, Faraday rotators, detectors
  - Ket notation visualization
  - Quantum operator heatmaps
  - Sandbox mode + guided game mode
  - Experiment sharing (400+ user-created experiments)
- **Strengths:** Highly interactive, pedagogically designed (used at Stanford/Oxford), entanglement visualization, experiment sharing/community
- **Weaknesses:** Different domain (optical table, not wavefunction visualization), 2D layout (not 3D volumetric), no orbital/wavefunction rendering, no harmonic oscillator
- **Pricing:** Free (web-based)
- **Source:** [Quantum Flytrap](https://quantumflytrap.com/virtual-lab/)

### 4. QuTiP (Quantum Toolbox in Python)
- **URL:** https://qutip.org/
- **Type:** Free, open-source Python library
- **Features:**
  - Lindblad/Monte Carlo solvers
  - Bloch-Redfield evolution
  - Floquet formalism
  - Stochastic solvers
  - Steady state analysis
  - Non-Markovian techniques
  - Bloch sphere visualization
  - Wigner function colormaps
  - 1000+ tests
- **Strengths:** Comprehensive physics coverage, research-grade accuracy, large academic community, extensive solvers, well-documented
- **Weaknesses:** Not interactive/real-time, requires Python programming knowledge, visualization is static (Matplotlib), no 3D volumetric rendering, not accessible to non-programmers
- **Pricing:** Free (open-source, BSD license)
- **Source:** [QuTiP](https://qutip.org/features)

### 5. QMwebJS
- **URL:** https://www.mdpi.com/2227-7390/8/3/430
- **Type:** Free web library + cloud microservice
- **Features:**
  - 3D wavefunction temporal evolution
  - Particle sampling visualization
  - Cloud sharing of models
  - No installation required
  - Browser-based
- **Strengths:** Web-based, shareable, accessible for education
- **Weaknesses:** Limited to 3D, particle-sampling method (not volumetric), dated technology, limited interactivity, minimal UI
- **Pricing:** Free (open-source)
- **Source:** [MDPI](https://www.mdpi.com/2227-7390/8/3/430)

---

## Feature Classification (Kano-Informed)

### Must-Be Features (present in ALL competitors)
| Feature | MDimension | Status |
|-|-|-|
| 3D hydrogen orbital visualization | Present (3D-11D) | PASS |
| Quantum number selection (n, l, m) | Present | PASS |
| Interactive rotation/zoom | Present (orbital camera) | PASS |
| Real-time rendering | Present (WebGPU raymarching) | PASS |
| Free/low-cost access | No pricing infrastructure (currently free) | PASS* |
| Works without installation | Web-based | PASS |
| Onboarding/tutorial/documentation | **ABSENT** | **FAIL** |

*Free by default (no paywall exists), but no monetization path either.

### Performance Features (present in 2+ competitors with varying quality)
| Feature | MDimension | Competitors | Status |
|-|-|-|-|
| Superposition of states | Yes (up to 8 terms) | Falstad (yes), Atom in a Box (yes) | STRONG |
| Energy diagrams | Yes (HO + Hydrogen) | Falstad (yes) | PRESENT |
| Slice/cross-section views | Yes | Falstad (yes) | PRESENT |
| Wavefunction time evolution | Yes (TDSE, BEC) | Atom in a Box (yes), QMwebJS (yes) | STRONG |
| Sharing/collaboration | URL serialization only | Quantum Flytrap (community), QMwebJS (cloud) | WEAK |
| Export capabilities | Screenshot + video | None with robust export | STRONG |
| Visual quality/polish | Glass morphism, WebGPU volumetric | Varies (mostly basic) | STRONG |

### Delighter Features (present in 0-1 competitors)
| Feature | MDimension | Notes |
|-|-|-|
| N-dimensional visualization (4D-11D) | YES | Unique — no competitor offers this |
| 6 quantum modes (HO, H-ND, FSF, TDSE, BEC, Dirac) | YES | Far beyond any single competitor |
| Volumetric WebGPU raymarching | YES | Only Atom in a Box does volumetric (native only) |
| Post-processing pipeline (bloom, SSAO, SSR, bokeh) | YES | No competitor has this |
| Procedural skybox environments (7 modes) | YES | No competitor has this |
| Cosine gradient color editor | YES | No competitor has this |
| Command palette (Cmd+K) | YES | No competitor has this |
| Video export with text overlay | YES | No competitor has this |
| Scene/style preset system | YES | No competitor has this |
| Audio UI feedback | YES | No competitor has this |
| Quantum carpet (spacetime diagram) | YES | Unique |
| Open quantum diagnostics (Lindblad) | YES | Only QuTiP (programmatic) |
| Pauli spinor visualization | YES | Unique in web context |
| Wigner function visualization | YES | Only QuTiP (static) |

---

## Market Context

The quantum physics visualization market is fragmented:
- **Academic tools** (Falstad, QMwebJS): Free, basic, wide reach
- **Native apps** (Atom in a Box): Paid but cheap ($2-5), platform-locked
- **Programming libraries** (QuTiP): Free, powerful, high barrier to entry
- **Interactive labs** (Quantum Flytrap): Free, different focus (optics/entanglement)

No competitor combines:
1. Browser-based real-time volumetric rendering
2. N-dimensional support
3. Multiple quantum physics domains
4. Professional-grade visual quality
5. Export capabilities

The market has limited willingness to pay — most tools are free/open-source. The exception is Atom in a Box at ~$2-5 on iOS. There is no established SaaS pricing for this category.

**Revenue model challenges:**
- Academic users expect free tools
- No clear B2B enterprise use case
- Freemium model would need a premium tier with differentiating features
- Potential revenue paths: educational institution licensing, embedded widget licensing, donation/sponsorship model
