/**
 * TDSE Uniform struct for GPU compute shaders.
 *
 * Contains lattice parameters, physics constants, potential configuration,
 * drive parameters, absorber settings, display options, basis vectors
 * for N-D to 3D projection, and BEC trap anisotropy ratios.
 *
 * Total size: 832 bytes.
 * Note: imaginaryTime at offset 700 controls Wick rotation mode.
 * Vortex reconnection fields at offsets 708-727 for N-D vortex topology.
 * Black-hole Regge–Wheeler fields at offsets 748-756.
 * Analog Hawking (waterfall sonic horizon) block at offsets 760-792.
 * ER=EPR double-trace wormhole coupling at offsets 800-815.
 * Analog Hawking quantum-extremal island overlay at offsets 816-831.
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
  fieldView: u32,            // offset 284 (0=density, 1=phase, 2=current, 3=potential, 4=superfluidVelocity, 5=healingLength, 6=machNumber)

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
  _padHawk1: u32,            // offset 792 — pad to 16-byte alignment
  _padHawk2: u32,            // offset 796 — pad to 16-byte alignment

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
}
`
