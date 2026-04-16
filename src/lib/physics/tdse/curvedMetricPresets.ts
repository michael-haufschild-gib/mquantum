/**
 * Curved-space TDSE v2 scenario presets.
 *
 * Each preset selects a non-flat spatial metric (Schwarzschild, de Sitter,
 * AdS, 2-sphere, 3-torus, double Morris–Thorne throat, …) and configures
 * grid / dt / initial condition / field view to surface the metric's
 * characteristic dynamics under the curved Laplace–Beltrami integrator.
 *
 * Description text follows the Physics-Honesty Checklist from the
 * `curved-space-tdse-v2` plan (Part 8): every entry says explicitly what is
 * NOT being modeled, in addition to what is.
 *
 * Extracted from `presets.ts` to keep that file under the `max-lines` limit.
 *
 * @module lib/physics/tdse/curvedMetricPresets
 */

import type { TdseScenarioPreset } from './presets'

/** Curved-space TDSE v2 presets, appended to the main preset registry. */
export const CURVED_METRIC_TDSE_PRESETS: TdseScenarioPreset[] = [
  // NOTE: the three `[128, 64, 64]`-style presets below are written in
  // post-`resizeTdseArrays` form — the runtime 262k-site budget caps a 3D
  // TDSE lattice at 64³ (`defaultTdseGridPerDim(3) = 64`), so writing
  // `gridSize: [128, 64, 64]` would be silently collapsed to `[64, 64, 64]`
  // with `spacing: [0.2, 0.1, 0.1]` (extent preserved). We declare the
  // post-resize geometry directly so the preset literal matches what the
  // simulation actually runs, following the convention used by
  // `blackHoleRingdown` in `presets.ts`.
  {
    id: 'wormholeEntangledPair',
    name: 'Wormhole: Entangled-Looking Pair',
    description:
      'Two Gaussians launched outward from the joined throat of a double Morris–Thorne geometry. Each packet evolves on the same curved-space TDSE and reflects off the geometric bottleneck of the opposite throat. NOT a physical entangled-particle experiment; the "pair" label is structural — two classically-separable packets on a shared metric background, not a Bell-pair state.',
    overrides: {
      latticeDim: 3,
      gridSize: [64, 64, 64],
      // Extent 12.8 × 6.4 × 6.4 — axis 0 runs along the throat-to-throat line.
      spacing: [0.2, 0.1, 0.1],
      dt: 0.001,
      stepsPerFrame: 8,
      initialCondition: 'superposition',
      packetCenter: [-2.0, 0, 0],
      packetWidth: 0.5,
      packetAmplitude: 1.0,
      packetMomentum: [-3.0, 0, 0],
      potentialType: 'free',
      metric: {
        kind: 'doubleThroat',
        throatRadius: 0.4,
        doubleThroatSeparation: 4.0,
        doubleThroatRadius: 0.4,
      },
      absorberEnabled: true,
      absorberWidth: 0.15,
      diagnosticsEnabled: true,
      fieldView: 'density',
      autoScale: true,
    },
    renderingOverrides: { densityGain: 3.0, densityContrast: 2.5 },
  },
  {
    id: 'schwarzschildOrbit',
    name: 'Schwarzschild: Tangential Wavepacket',
    description:
      'Gaussian wavepacket on a Schwarzschild spatial slice in isotropic coordinates, launched tangentially to hint at orbital motion. Shows curvature-induced dispersion and lensing-like path bending around the conformal-factor singularity at r=M/2. NOT a classical geodesic orbit — the packet is a quantum wavefunction on a fixed 3-slice; there is no temporal metric component, no proper-time evolution along worldlines, and no backreaction on the geometry.',
    overrides: {
      latticeDim: 3,
      gridSize: [64, 64, 64],
      // Extent 12.8 × 6.4 × 6.4 — radial axis elongated for clearer lensing.
      spacing: [0.2, 0.1, 0.1],
      dt: 0.002,
      stepsPerFrame: 4,
      initialCondition: 'gaussianPacket',
      packetCenter: [-2.0, 0.5, 0],
      packetWidth: 0.4,
      packetAmplitude: 1.0,
      packetMomentum: [0, 1.5, 0],
      potentialType: 'free',
      metric: { kind: 'schwarzschild', schwarzschildMass: 0.8 },
      absorberEnabled: true,
      absorberWidth: 0.15,
      diagnosticsEnabled: true,
      fieldView: 'density',
      autoScale: true,
    },
    renderingOverrides: { densityGain: 3.0, densityContrast: 2.5 },
  },
  {
    id: 'gravitationalRedshift',
    name: 'Schwarzschild: Phase-Wavelength Variation',
    description:
      'Wavefunction phase on a Schwarzschild exterior spatial slice. The visible phase-wavelength is the carrier de Broglie wavelength, which varies with depth in the gravitational well via the conformal factor ψ⁴. NOT a proper-time-evolved clock — the metric here is purely spatial. The phase rolling difference across the field reflects the conformal factor of the spatial 3-slice, not a real gravitational time-dilation measurement; a true redshift demo requires a (3+1) metric.',
    overrides: {
      latticeDim: 3,
      gridSize: [64, 64, 64],
      // Extent 12.8 × 6.4 × 6.4 — radial axis elongated so the phase
      // gradient is visible across several de Broglie wavelengths.
      spacing: [0.2, 0.1, 0.1],
      dt: 0.002,
      stepsPerFrame: 4,
      initialCondition: 'gaussianPacket',
      packetCenter: [-2.0, 0, 0],
      packetWidth: 0.5,
      packetAmplitude: 1.0,
      packetMomentum: [-3.0, 0, 0],
      potentialType: 'free',
      metric: { kind: 'schwarzschild', schwarzschildMass: 1.0 },
      absorberEnabled: true,
      absorberWidth: 0.15,
      diagnosticsEnabled: true,
      fieldView: 'phase',
      autoScale: true,
    },
    renderingOverrides: { densityGain: 3.0, densityContrast: 2.5 },
  },
  {
    id: 'cosmologicalRedshift',
    name: 'de Sitter: Cosmological Stretching',
    description:
      'Wavepacket in a spatially flat de Sitter (expanding) universe with scale factor a(t)=exp(H·t). The lattice is comoving; physical wavelengths grow as a(t) so the packet "spreads" in coordinate space as the universe expands. NOT a full QFT-in-curved-spacetime calculation — this is a non-relativistic wavefunction on a time-dependent spatial metric, which captures the cosmological-redshift kinematics without particle creation or vacuum-state effects.',
    overrides: {
      latticeDim: 3,
      gridSize: [64, 64, 64],
      spacing: [0.1, 0.1, 0.1],
      dt: 0.002,
      stepsPerFrame: 4,
      initialCondition: 'gaussianPacket',
      packetCenter: [0, 0, 0],
      packetWidth: 0.4,
      packetAmplitude: 1.0,
      packetMomentum: [2.0, 0, 0],
      potentialType: 'free',
      metric: { kind: 'deSitter', hubbleRate: 0.3 },
      absorberEnabled: true,
      absorberWidth: 0.15,
      diagnosticsEnabled: true,
      fieldView: 'density',
      autoScale: true,
      // Wave 6: show the wavepacket's proper-volume density so the
      // cosmological a(t) stretching is visible directly in the render.
      densityView: 'proper',
    },
    renderingOverrides: { densityGain: 3.0, densityContrast: 2.5 },
  },
  {
    id: 'sphereCompactification',
    name: '2-Sphere: Wavepacket on Compact Geometry',
    description:
      'Wavepacket on a 2-sphere of radius R, visualized through the chart axis 1 = θ (polar) and axis 2 = φ (azimuthal). Dirichlet boundaries apply on every axis — the packet reflects off the φ walls rather than wrapping around, and bounces off the polar clamp ε=0.2 that keeps the metric non-singular. NOT a true compactification: the sphere is embedded as a coordinate chart in the 3-axis lattice and the azimuthal direction is treated as reflective rather than periodic. Just the Laplace–Beltrami operator on the (θ, φ) 2-sphere chart.',
    overrides: {
      latticeDim: 3,
      gridSize: [64, 64, 64],
      spacing: [0.1, 0.1, 0.1],
      dt: 0.001,
      stepsPerFrame: 8,
      initialCondition: 'gaussianPacket',
      packetCenter: [0, Math.PI / 2, 0],
      packetWidth: 0.3,
      packetAmplitude: 1.0,
      packetMomentum: [0, 0, 2.0],
      potentialType: 'free',
      metric: { kind: 'sphere2D', sphereRadius: 2.0 },
      absorberEnabled: true,
      absorberWidth: 0.15,
      diagnosticsEnabled: true,
      fieldView: 'density',
      autoScale: true,
      // Wave 6: enable Ricci overlay so the constant positive curvature
      // R = 2/R² is visible on sight (the packet sits in a red-tinted field).
      showCurvatureOverlay: true,
      curvatureOverlayOpacity: 0.4,
    },
    renderingOverrides: { densityGain: 3.0, densityContrast: 2.5 },
  },
  {
    id: 'torusEigenstates',
    name: 'Torus: Quantized Plane Wave',
    description:
      'Plane wave on a flat 3-torus with periods L = π. Momentum on a compact space is quantized — only integer multiples of 2π/L are normalizable, so the chosen k = 2 (i.e. n = 1) is exactly resonant with the period and produces a clean stationary mode. NOT a real compactified universe; the period π is a pedagogical choice that makes the resonance arithmetic visible at unit lattice spacing.',
    overrides: {
      latticeDim: 3,
      gridSize: [64, 64, 64],
      spacing: [0.1, 0.1, 0.1],
      dt: 0.002,
      stepsPerFrame: 4,
      initialCondition: 'planeWave',
      packetCenter: [0, 0, 0],
      packetWidth: 0.6,
      packetAmplitude: 1.0,
      packetMomentum: [2.0, 0, 0],
      potentialType: 'free',
      metric: {
        kind: 'torus',
        torusPeriod: [Math.PI, Math.PI, Math.PI],
      },
      absorberEnabled: true,
      absorberWidth: 0.15,
      diagnosticsEnabled: true,
      fieldView: 'density',
      autoScale: true,
    },
    renderingOverrides: { densityGain: 3.0, densityContrast: 2.5 },
  },
  {
    id: 'adsBoundaryBounce',
    name: 'AdS: Wavepacket Reflecting off Conformal Boundary',
    description:
      'Wavepacket launched toward the AdS conformal boundary on the Poincaré half-space chart (axis 0 = z, boundary at z→0). The conformal factor (L/z)² steepens without bound as z→0, producing reflective-like behavior off the effective boundary at finite proper time — a hallmark of AdS being a "box" despite its infinite volume. The implementation folds the z axis via |z| (the metric uses max(|z|, 0.05) as a soft boundary floor), so the chart covers both sides of z=0 symmetrically rather than being a true half-space. NOT a holographic-duality demo — this is purely the Schrödinger equation on a fixed AdS spatial slice in Poincaré coordinates; no boundary CFT, no bulk-to-boundary propagator.',
    overrides: {
      latticeDim: 3,
      gridSize: [64, 64, 64],
      spacing: [0.1, 0.1, 0.1],
      dt: 0.001,
      stepsPerFrame: 8,
      initialCondition: 'gaussianPacket',
      packetCenter: [1.5, 0, 0],
      packetWidth: 0.3,
      packetAmplitude: 1.0,
      packetMomentum: [-1.5, 0, 0],
      potentialType: 'free',
      metric: { kind: 'antiDeSitter', adsRadius: 2.0 },
      absorberEnabled: true,
      absorberWidth: 0.15,
      diagnosticsEnabled: true,
      fieldView: 'density',
      autoScale: true,
    },
    renderingOverrides: { densityGain: 3.0, densityContrast: 2.5 },
  },
]
