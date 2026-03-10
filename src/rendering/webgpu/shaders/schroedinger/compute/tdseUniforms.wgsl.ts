/**
 * TDSE Uniform struct for GPU compute shaders.
 *
 * Contains lattice parameters, physics constants, potential configuration,
 * drive parameters, absorber settings, display options, and basis vectors
 * for N-D to 3D projection.
 *
 * Total size: 640 bytes (aligned to 16-byte boundaries).
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
  initCondition: u32,        // offset 24 (0=gaussian, 1=planeWave, 2=superposition)
  potentialType: u32,        // offset 28 (0=free, 1=barrier, 2=step, 3=well, 4=harmonic, 5=driven, 6=doubleSlit, 7=periodicLattice)

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
  fieldView: u32,            // offset 284 (0=density, 1=phase, 2=current, 3=potential)

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

  // Double well parameters: V(x) = λ(x² − a²)² − εx (12 bytes + 8 bytes padding)
  doubleWellLambda: f32,     // offset 620
  doubleWellSeparation: f32, // offset 624
  doubleWellAsymmetry: f32,  // offset 628
  _pad: array<f32, 2>,       // offset 632 (pad to 640 bytes)
}
`
