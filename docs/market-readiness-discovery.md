# Market Readiness Discovery

**Date:** 2026-03-21

## 1. What is this product?

MDimension is a browser-based real-time quantum wavefunction visualizer that renders Schroedinger equation solutions across 1-11 spatial dimensions using WebGPU volumetric raymarching.

## 2. Who is it for?

Primary: Physics students (undergraduate/graduate), physics educators, and researchers who need interactive 3D quantum mechanics visualizations.
Secondary: Science communicators, curious enthusiasts with interest in quantum physics.

## 3. Market Category

Interactive quantum physics visualization / educational simulation tool.

## 4. Tech Stack

| Layer | Technology |
|-|-|
| Frontend framework | React 19 + TypeScript 5 (strict mode) |
| State management | Zustand 5 |
| Styling | Tailwind CSS 4 + Motion 12 (animations) |
| Rendering | Custom WebGPU renderer (raw GPUDevice/GPUCommandEncoder) |
| Shaders | WGSL (composed via template literals) |
| Performance math | Rust/WASM (animation loop: rotation, projection, matrix ops) |
| Build | Vite 7 |
| Testing | Vitest 4 (3,418 unit tests) + Playwright 1.57 (36 E2E specs) |
| Deployment | Vercel |
| Audio | Web Audio API (synthesized UI sounds) |

## 5. User-Facing Features

### Core Quantum Modes (6 total)
1. **Harmonic Oscillator (1D-11D)** — Superposition of up to 8 terms, per-dimension frequencies, Hermite polynomial basis
2. **Hydrogen N-Dimensional (3D-11D)** — Laguerre polynomials + spherical harmonics, quantum numbers n/l/m, real orbital variants
3. **Free Scalar Field** — Quantum field theory visualization with k-space analysis
4. **TDSE Dynamics** — Time-dependent Schroedinger equation with configurable potentials
5. **BEC Dynamics** — Bose-Einstein Condensate simulation with chemical potential analysis
6. **Dirac Equation** — Relativistic quantum mechanics with Clifford algebra

### Rendering & Post-Processing
7. Volumetric raymarching (real-time SDF-based rendering)
8. Bloom post-processing
9. SSAO (Screen Space Ambient Occlusion)
10. SSR (Screen Space Reflections)
11. SMAA anti-aliasing
12. FXAA anti-aliasing
13. Tone mapping (cinematic)
14. Temporal reprojection/reconstruction
15. Progressive refinement
16. Paper texture overlay effect
17. Bokeh depth of field
18. Frame blending

### Environment
19. 7 procedural skybox modes (aurora, nebula, crystalline, horizon, ocean, twilight, classic)
20. 3 classic texture-based skyboxes (space blue, space lightblue, space red)
21. Skybox animation modes (cinematic, heatwave)
22. Ground plane with grid
23. Background color customization

### Visualization Controls
24. Cosine gradient color editor
25. Domain coloring controls
26. Distribution controls
27. Color algorithm selector with presets
28. LCH preset selector
29. Signed phase diverging visualization
30. Real/imaginary diverging visualization
31. K-space visualization controls
32. Pauli spin color pickers

### Interaction & Navigation
33. Orbital camera with mouse/touch control
34. Dimension selector (1D-11D)
35. Quantum mode selector
36. Quantum number controls (n, l, m)
37. Keyboard shortcuts (extensive, with overlay)
38. Command palette (Cmd+K style)
39. Context menu on canvas
40. Cinematic mode (fullscreen, hide UI)
41. Superposition editor (up to 8 terms)

### Export
42. Screenshot capture with preview
43. Crop editor for screenshots
44. Video export (MP4, WebM)
45. Export presets (Twitter video, etc.)
46. Text overlay on exports
47. Advanced export settings

### Presets & State
48. Scene presets (save/load/import/export JSON)
49. Style presets (save/load/import/export JSON)
50. Built-in example scenes
51. URL state serialization (shareable links)
52. localStorage persistence

### UI Framework
53. Glass morphism design system
54. Collapsible sidebar panels (left explorer, right inspector)
55. Resizable panels
56. Mobile-responsive layout with bottom app bar
57. Dark/light/system theme
58. Accent color customization
59. Premium audio feedback (synthesized UI sounds)
60. Toast notifications
61. Progress indicators (global progress bar, refinement indicator)
62. Performance monitor (FPS, GPU stats, shader info)
63. Dynamic favicon

### Physics Controls
64. Lighting system (multiple lights, light editor)
65. PBR material settings
66. Absorption controls
67. Cross-section visualization
68. Energy diagrams (HO and Hydrogen)
69. Quantum effects controls
70. Open quantum diagnostics (Lindblad master equation)
71. BEC analysis section
72. FSF analysis section
73. TDSE analysis section
74. Dirac analysis section
75. Pauli spinor controls (magnetic field, spin, potential, grid)
76. Density distribution analysis
77. Quantum carpet (spacetime diagram)
78. Second quantization section
79. Wigner function visualization

### Performance
80. Eigenfunction cache (GPU compute)
81. Temporal reprojection
82. Progressive refinement
83. Render resolution scaling
84. GPU tier detection and auto-quality adjustment

### Accessibility
85. Skip navigation link
86. ARIA labels on controls
87. Keyboard-navigable UI
88. Reduced motion support (MotionConfig respects prefers-reduced-motion)

## 6. App URL

- **Production:** https://mdimension.vercel.app/
- **Dev server:** localhost:3000

## 7. Notable Observations

- No onboarding, tutorial, or guided walkthrough
- No user authentication or accounts
- No backend/API — entirely client-side
- No monetization infrastructure (no payments, subscriptions, or license checks)
- No analytics or telemetry
- 85.93 MB of skybox texture PNGs shipped in dist (not lazy-loaded efficiently)
- 2.12 MB total JS bundle (good code splitting, ~490KB gzipped)
- WebGPU-only: excludes all browsers without WebGPU support (no WebGL fallback)
- 236 test files, 3,418 tests — all passing
- Strict TypeScript with near-zero `any` usage (9 occurrences, all in test mocks)
