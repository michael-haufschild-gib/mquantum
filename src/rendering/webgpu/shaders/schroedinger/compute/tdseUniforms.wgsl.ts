/**
 * TDSE Uniform struct for GPU compute shaders.
 *
 * Contains lattice parameters, physics constants, potential configuration,
 * drive parameters, absorber settings, display options, basis vectors
 * for N-D to 3D projection, and BEC trap anisotropy ratios.
 *
 * Total size: 1024 bytes.
 * Note: imaginaryTime at offset 700 controls Wick rotation mode.
 * Vortex reconnection fields at offsets 708-727 for N-D vortex topology.
 * Black-hole Regge–Wheeler fields at offsets 748-756.
 * Analog Hawking (waterfall sonic horizon) block at offsets 760-788.
 * Wormhole shader trig precompute (cos/sin of 0.5·dt·g) at offsets 792-799.
 * ER=EPR double-trace wormhole coupling at offsets 800-815.
 * Analog Hawking quantum-extremal island overlay at offsets 816-831.
 * Curved-space TDSE v1 metric block at offsets 832-847 (metricKind + throatRadius).
 * Curved-space TDSE v2 metric block at offsets 848-911:
 *   - per-kind scalar params (mass, Hubble, AdS L, sphere R, doubleThroat)
 *   - torus periods (3 × f32)
 *   - RK4 per-stage simTime offsets (K1..K4)
 * Curved-space TDSE v2 Wave 6 visualization block at offsets 912-927:
 *   - showCurvatureOverlay (u32), densityViewMode (u32 enum 0=coordinate,1=proper),
 *     curvatureOverlayOpacity (f32), _padV2d (u32).
 * Host-precomputed reciprocal spacing for the curved-space kinetic kernel:
 *   - invSpacing  (array<f32, 12>) at offsets 928-975  = 1 / max(spacing[d], 1e-12)
 *   - invSpacing2 (array<f32, 12>) at offsets 976-1023 = invSpacing[d] * invSpacing[d]
 * These eliminate up to 11 divides + max + mul per cell per RK4 stage in the
 * curved-space Laplace–Beltrami kernel. Mirrors the kGridScale precompute pattern.
 *
 * @module
 */

export const tdseUniformsBlock = /* wgsl */ `
struct TDSEUniforms {
  // Lattice parameters (16 bytes)
  latticeDim: u32,           // offset 0
  totalSites: u32,           // offset 4
  dt: f32,                   // offset 8
  hbar: f32,                 // offset 12

  // Physics scalars (16 bytes)
  mass: f32,                 // offset 16
  stepsPerFrame: u32,        // offset 20
  initCondition: u32,        // offset 24 (0=gaussian, 1=planeWave, 2=superposition, 3=thomasFermi, 4=vortexImprint, 5=darkSoliton, 6=ndVortexPair, 7=blackHoleAnalog)
  potentialType: u32,        // offset 28 (0=free, 1=barrier, 2=step, 3=finiteWell, 4=harmonicTrap, 5=driven, 6=doubleSlit, 7=periodicLattice, 8=doubleWell, 9=becTrap, 10=radialDoubleWell, 11=custom, 12=andersonDisorder, 13=coupledAnharmonic, 14=blackHoleRingdown)

  // Per-dimension arrays (48 bytes each)
  gridSize: array<u32, 12>,  // offset 32
  strides: array<u32, 12>,   // offset 80
  spacing: array<f32, 12>,   // offset 128

  // Packet init parameters (48 + 16 bytes)
  packetCenter: array<f32, 12>,   // offset 176
  packetMomentum: array<f32, 12>, // offset 224
  packetWidth: f32,          // offset 272
  packetAmplitude: f32,      // offset 276
  boundingRadius: f32,       // offset 280
  fieldView: u32,            // offset 284 (0=density, 1=phase, 2=current, 3=potential, 4=superfluidVelocity, 5=healingLength, 6=machNumber, 7=hawkingFlux, 8=quantumPressure)

  // Potential parameters (32 bytes)
  barrierHeight: f32,        // offset 288
  barrierWidth: f32,         // offset 292
  barrierCenter: f32,        // offset 296
  wellDepth: f32,            // offset 300
  wellWidth: f32,            // offset 304
  harmonicOmega: f32,        // offset 308
  stepHeight: f32,           // offset 312
  absorberEnabled: u32,      // offset 316

  // Absorber and drive parameters (32 bytes)
  absorberWidth: f32,        // offset 320
  absorberStrength: f32,     // offset 324
  driveEnabled: u32,         // offset 328
  driveWaveform: u32,        // offset 332 (0=sine, 1=pulse, 2=chirp)
  driveFrequency: f32,       // offset 336
  driveAmplitude: f32,       // offset 340
  simTime: f32,              // offset 344 (current simulation time for driven potentials)
  maxDensity: f32,           // offset 348 (for auto-scale normalization)

  // Slice positions for extra dimensions (48 bytes)
  slicePositions: array<f32, 12>, // offset 352

  // Basis vectors for N-D -> 3D projection (48 bytes each = 144 bytes)
  basisX: array<f32, 12>,    // offset 400
  basisY: array<f32, 12>,    // offset 448
  basisZ: array<f32, 12>,    // offset 496

  // k-space grid info for kinetic step (48 bytes)
  kGridScale: array<f32, 12>, // offset 544 (2*pi/(N*a) per dimension)

  // Double slit parameters (16 bytes)
  slitSeparation: f32,       // offset 592
  slitWidth: f32,            // offset 596
  wallThickness: f32,        // offset 600
  wallHeight: f32,           // offset 604

  // Periodic lattice parameters (8 bytes)
  latticeDepth: f32,         // offset 608
  latticePeriod: f32,        // offset 612

  // Display overlay (4 bytes)
  showPotential: u32,        // offset 616 (0=off, 1=on)

  // Double well parameters: V(x) = λ(x² − a²)² − εx (12 bytes)
  doubleWellLambda: f32,     // offset 620
  doubleWellSeparation: f32, // offset 624
  doubleWellAsymmetry: f32,  // offset 628
  interactionStrength: f32,  // offset 632 (BEC: g|ψ|², 0 = linear TDSE)

  // BEC trap anisotropy ratios ω_d/ω_0 per dimension (48 bytes)
  trapAnisotropy: array<f32, 12>, // offset 636 (used by becTrap potential type 9)

  // Radial double well: V(r) = λ(r−r₁)²(r−r₂)² − ε·r (16 bytes)
  radialWellInner: f32,      // offset 684 — inner minimum radius r₁
  radialWellOuter: f32,      // offset 688 — outer minimum radius r₂
  radialWellDepth: f32,      // offset 692 — well depth scale λ
  radialWellTilt: f32,       // offset 696 — asymmetry tilt ε

  imaginaryTime: u32,        // offset 700 (0 = real-time, 1 = imaginary-time/Wick rotation)
  customPotentialScale: f32, // offset 704 (max|V| for custom potential display normalization)

  // N-D vortex reconnection parameters (24 bytes)
  vortexPlane1Axis0: u32,    // offset 708 — first vortex winding plane, axis A
  vortexPlane1Axis1: u32,    // offset 712 — first vortex winding plane, axis B
  vortexPlane2Axis0: u32,    // offset 716 — second vortex winding plane, axis A
  vortexPlane2Axis1: u32,    // offset 720 — second vortex winding plane, axis B
  vortexSeparation: f32,     // offset 724 — displacement between vortex cores
  vortexCount: u32,          // offset 728 — number of vortices to seed (1 or 2)
  anharmonicLambda: f32,     // offset 732 — coupling λ for coupled anharmonic potential
  compactDimsMask: u32,      // offset 736 — bitmask: bit d = 1 means dimension d is compact (periodic KK)

  // Stochastic decoherence branching (8 bytes)
  branchingEnabled: u32,     // offset 740 — 0=off, 1=on: encode branch fraction in alpha channel
  branchPlanePosition: f32,  // offset 744 — normalized partition position along axis 0 (-1..1)

  // Black-hole Regge–Wheeler ringdown barrier (potentialType 14) — 20 bytes incl. pad
  bhMass: f32,               // offset 748 — Schwarzschild mass M (geometrized units)
  bhMultipoleL: f32,         // offset 752 — multipole index ℓ (stored as f32 for uniform layout)
  bhSpin: f32,               // offset 756 — perturbation spin s ∈ {0, 1, 2} as f32

  // Analog Hawking (waterfall sonic horizon) — 32 bytes = 2 × 16-byte rows (760-791)
  hawkingVmax: f32,          // offset 760 — asymptotic supersonic flow v_max
  hawkingLh: f32,            // offset 764 — horizon length scale L_h
  hawkingDeltaN: f32,        // offset 768 — fractional density dip Δn at horizon
  hawkingInjectRate: f32,    // offset 772 — pair-injection strength δφ = rate·w·η
  hawkingPairInjection: u32, // offset 776 — 0/1 flag
  hawkingSeed: u32,          // offset 780 — deterministic integer noise seed
  hawkingStepIndex: u32,     // offset 784 — frame counter, drives noise evolution
  _padHawk0: u32,            // offset 788 — pad to 16-byte alignment
  // Host-precomputed trig cache for the ER=EPR wormhole shader. Placed in the
  // former Hawking pad slots so all downstream offsets stay byte-stable.
  wormholeCosTau: f32,       // offset 792 — cos(0.5 * dt * wormholeCouplingG)
  wormholeSinTau: f32,       // offset 796 — sin(0.5 * dt * wormholeCouplingG)

  // ER=EPR Double-trace Wormhole Coupling (16 bytes, 800-815)
  wormholeCouplingEnabled: u32, // offset 800 — 0/1 flag
  wormholeCouplingG: f32,       // offset 804 — coupling strength g ≥ 0
  wormholeMirrorAxis: u32,      // offset 808 — mirror axis index (0, 1, 2)
  _padWormhole: u32,            // offset 812 — pad to 16-byte align

  // Analog Hawking quantum-extremal island overlay (16 bytes, 816-831)
  islandOverlayEnabled: u32,    // offset 816 — 0/1 flag
  islandCenterX0: f32,          // offset 820 — horizon centroid along axis 0 (world units, sign encodes side)
  islandRadiusWs: f32,          // offset 824 — island radius d*(t) in world units (≥ 0)
  islandBoost: f32,             // offset 828 — brightness multiplier inside the island (1.0 = off)

  // Curved-space TDSE v1 metric (16 bytes, 832-847)
  // metricKind codes: 0=flat, 1=morrisThorne, 2=schwarzschild, 3=deSitter,
  // 4=antiDeSitter, 5=sphere2D, 6=torus, 7=doubleThroat.
  metricKind: u32,              // offset 832
  throatRadius: f32,            // offset 836 — Morris–Thorne b₀ (world units)
  _padMetric0: u32,             // offset 840 — pad to 16-byte alignment
  _padMetric1: u32,             // offset 844 — pad to 16-byte alignment

  // Curved-space TDSE v2 metric block (64 bytes, 848-911)
  // Per-kind scalar params. Unused fields hold zero.
  schwarzschildMass: f32,       // offset 848 — M (geometrized units)
  hubbleRate: f32,              // offset 852 — deSitter H (a(t)=exp(H·t))
  adsRadius: f32,               // offset 856 — AdS L (Poincaré half-space)
  sphereRadius: f32,            // offset 860 — 2-sphere R on axes (1,2)
  doubleThroatSep: f32,         // offset 864 — doubleThroat separation s
  doubleThroatRad: f32,         // offset 868 — doubleThroat shared b₀
  _padV2a: f32,                 // offset 872
  _padV2b: f32,                 // offset 876
  // Torus spatial periods per axis (flat metric, periodic BC; v2a routes
  // torus through FFT path which implements wrap natively).
  torusPeriod: array<f32, 3>,   // offsets 880, 884, 888
  _padV2c: f32,                 // offset 892
  // RK4 per-stage simTime offsets (K1=t, K2=K3=t+dt/2, K4=t+dt).
  // Time-dependent metrics (deSitter) read the relevant stage via
  // stageIndex (group-1 uniform bound to the kinetic pipeline).
  // NOTE: Written once per FRAME at start-of-frame simTime — for
  // stepsPerFrame > 1 the stage times are stale for later steps;
  // acceptable for v2a scope.
  stageTimeK1: f32,             // offset 896
  stageTimeK2: f32,             // offset 900
  stageTimeK3: f32,             // offset 904
  stageTimeK4: f32,             // offset 908

  // Curved-space TDSE v2 Wave 6 visualization (16 bytes, 912-927).
  // When showCurvatureOverlay == 0u AND densityViewMode == 0u the write-grid
  // shader path is bit-identical to pre-W6 output (zero-regression guarantee).
  showCurvatureOverlay: u32,    // offset 912 — 0=off, 1=on
  densityViewMode: u32,         // offset 916 — 0=coordinate, 1=proper (×√|g|)
  curvatureOverlayOpacity: f32, // offset 920 — clamped to [0, 1] by host
  _padV2d: u32,                 // offset 924 — pad to 16-byte row

  // Host-precomputed reciprocal spacing per axis (96 bytes, 928-1023).
  // invSpacing[d]  = 1 / max(spacing[d], 1e-12)
  // invSpacing2[d] = invSpacing[d] * invSpacing[d]
  // Consumed by tdseCurvedKinetic to skip a divide + max + mul per cell per
  // RK4 stage. Slots beyond latticeDim hold zero.
  invSpacing: array<f32, 12>,   // offset 928
  invSpacing2: array<f32, 12>,  // offset 976
}
`
