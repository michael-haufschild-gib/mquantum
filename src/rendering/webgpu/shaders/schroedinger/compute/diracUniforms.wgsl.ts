/**
 * Dirac equation uniform struct for GPU compute shaders.
 *
 * Contains lattice parameters, physics constants (mass, c, hbar),
 * potential configuration, initial condition settings, display options,
 * absorber settings, and basis vectors for N-D to 3D projection.
 *
 * Total size: 544 bytes (aligned to 16-byte boundaries).
 *
 * @module
 */

export const diracUniformsBlock = /* wgsl */ `
struct DiracUniforms {
  // Lattice parameters (48 + 48 + 48 = 144 bytes)
  gridSize: array<u32, 12>,       // offset 0
  strides: array<u32, 12>,        // offset 48
  spacing: array<f32, 12>,        // offset 96

  // Lattice scalars (16 bytes)
  totalSites: u32,                // offset 144
  latticeDim: u32,                // offset 148
  mass: f32,                      // offset 152
  speedOfLight: f32,              // offset 156

  // Physics scalars (16 bytes)
  hbar: f32,                      // offset 160
  dt: f32,                        // offset 164
  spinorSize: u32,                // offset 168
  potentialType: u32,             // offset 172 (0=none, 1=step, 2=barrier, 3=well, 4=harmonicTrap, 5=coulomb)

  // Potential parameters (16 bytes)
  potentialStrength: f32,         // offset 176
  potentialWidth: f32,            // offset 180
  potentialCenter: f32,           // offset 184
  harmonicOmega: f32,             // offset 188

  // Potential + init (16 bytes)
  coulombZ: f32,                  // offset 192
  initCondition: u32,             // offset 196 (0=gaussianPacket, 1=planeWave, 2=standingWave, 3=zitterbewegung)
  packetWidth: f32,               // offset 200
  positiveEnergyFraction: f32,    // offset 204

  // Packet init arrays (48 + 48 = 96 bytes)
  packetCenter: array<f32, 12>,   // offset 208
  packetMomentum: array<f32, 12>, // offset 256

  // Display + simulation state (16 bytes)
  fieldView: u32,                 // offset 304 (0=totalDensity, 1=particleDensity, 2=antiparticleDensity, 3=particleAntiparticleSplit, 4=spinDensity, 5=currentDensity, 6=phase)
  autoScale: u32,                 // offset 308
  simTime: f32,                   // offset 312
  absorberEnabled: u32,           // offset 316

  // Absorber parameters (8 bytes + 4 bytes padding)
  absorberWidth: f32,             // offset 320
  absorberStrength: f32,          // offset 324

  // Slice positions for extra dimensions (48 bytes)
  slicePositions: array<f32, 12>, // offset 328

  // Basis vectors for N-D -> 3D projection (48 bytes each = 144 bytes)
  basisX: array<f32, 12>,         // offset 376
  basisY: array<f32, 12>,         // offset 424
  basisZ: array<f32, 12>,         // offset 472

  // Bounding + density scale (16 bytes)
  boundingRadius: f32,            // offset 520
  densityScale: f32,              // offset 524
  stepsPerFrame: u32,             // offset 528
  showPotential: u32,             // offset 532

  // Spin polarization angles (Bloch sphere)
  spinTheta: f32,                 // offset 536
  spinPhi: f32,                   // offset 540
}
`
