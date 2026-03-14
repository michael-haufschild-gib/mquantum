/**
 * Pauli equation uniform struct for GPU compute shaders.
 *
 * Contains lattice parameters, physics constants (mass, hbar), magnetic field
 * configuration (uniform/gradient/rotating/quadrupole), spin state angles,
 * potential settings, absorber parameters, display options, and basis vectors
 * for N-D to 3D projection.
 *
 * Flat layout — all arrays use stride-4 scalars to avoid WGSL alignment
 * surprises. Vec3f fields are stored as three separate f32 fields with an
 * explicit f32 pad.
 *
 * Total size: 124 × 4 = 496 bytes (fits in 512-byte aligned slot).
 *
 * Offset map (in units of u32/f32 = 4 bytes):
 *   [0]       latticeDim
 *   [1..12]   gridSize[12]
 *   [13..24]  strides[12]
 *   [25]      totalSites
 *   [26]      dt
 *   [27]      hbar
 *   [28]      mass
 *   [29]      simTime
 *   [30]      fieldType
 *   [31]      fieldStrength
 *   [32]      fieldDirTheta
 *   [33]      fieldDirPhi
 *   [34]      gradientStrength
 *   [35]      rotatingFrequency
 *   [36]      _pad0
 *   [37]      _pad1
 *   [38]      spinTheta
 *   [39]      spinPhi
 *   [40]      initCondition
 *   [41]      packetWidth
 *   [42..53]  packetCenter[12]
 *   [54..65]  packetMomentum[12]
 *   [66]      _pad2
 *   [67]      potentialType
 *   [68]      harmonicOmega
 *   [69]      wellDepth
 *   [70]      wellWidth
 *   [71]      showPotential
 *   [72]      absorberEnabled
 *   [73]      absorberWidth
 *   [74]      absorberStrength
 *   [75]      _pad3
 *   [76]      fieldView
 *   [77]      autoScale
 *   [78]      spinUpR
 *   [79]      spinUpG
 *   [80]      spinUpB
 *   [81]      spinDownR
 *   [82]      spinDownG
 *   [83]      spinDownB
 *   [84]      boundingRadius
 *   [85]      densityScale
 *   [86]      _pad4
 *   [87]      _pad5
 *   [88]      basisXx, basisXy, basisXz, _padBx
 *   [92]      basisYx, basisYy, basisYz, _padBy
 *   [96]      basisZx, basisZy, basisZz, _padBz
 *   [100..111] spacing[12]
 *   [112..123] slicePositions[12]
 *
 * @module
 */

export const pauliUniformsBlock = /* wgsl */ `
struct PauliUniforms {
  latticeDim: u32,                  // [0]
  gridSize: array<u32, 12>,         // [1..12]
  strides: array<u32, 12>,          // [13..24]
  totalSites: u32,                  // [25]

  // Physics
  dt: f32,                          // [26]
  hbar: f32,                        // [27]
  mass: f32,                        // [28]
  simTime: f32,                     // [29]

  // Magnetic field
  fieldType: u32,                   // [30]  0=uniform, 1=gradient, 2=rotating, 3=quadrupole
  fieldStrength: f32,               // [31]
  fieldDirTheta: f32,               // [32]
  fieldDirPhi: f32,                 // [33]
  gradientStrength: f32,            // [34]
  rotatingFrequency: f32,           // [35]
  _pad0: u32,                       // [36]
  _pad1: u32,                       // [37]

  // Spin state (Bloch sphere)
  spinTheta: f32,                   // [38]
  spinPhi: f32,                     // [39]

  // Initial condition
  initCondition: u32,               // [40]  0=gaussianSpinUp, 1=gaussianSpinDown, 2=gaussianSuperposition, 3=planeWaveSpinor
  packetWidth: f32,                 // [41]
  packetCenter: array<f32, 12>,     // [42..53]
  packetMomentum: array<f32, 12>,   // [54..65]
  _pad2: f32,                       // [66]

  // Potential
  potentialType: u32,               // [67]  0=none, 1=harmonicTrap, 2=barrier, 3=doubleWell
  harmonicOmega: f32,               // [68]
  wellDepth: f32,                   // [69]
  wellWidth: f32,                   // [70]
  showPotential: u32,               // [71]

  // Absorber
  absorberEnabled: u32,             // [72]
  absorberWidth: f32,               // [73]
  absorberStrength: f32,            // [74]
  _pad3: u32,                       // [75]

  // Display
  fieldView: u32,                   // [76]  0=spinDensity, 1=totalDensity, 2=spinExpectation, 3=coherence
  autoScale: u32,                   // [77]
  spinUpR: f32,                     // [78]
  spinUpG: f32,                     // [79]
  spinUpB: f32,                     // [80]
  spinDownR: f32,                   // [81]
  spinDownG: f32,                   // [82]
  spinDownB: f32,                   // [83]

  // Bounding
  boundingRadius: f32,              // [84]
  densityScale: f32,                // [85]
  _pad4: u32,                       // [86]
  _pad5: u32,                       // [87]

  // Basis vectors (each stored as 3 scalars + pad)
  basisXx: f32,                     // [88]
  basisXy: f32,                     // [89]
  basisXz: f32,                     // [90]
  _padBx: f32,                      // [91]
  basisYx: f32,                     // [92]
  basisYy: f32,                     // [93]
  basisYz: f32,                     // [94]
  _padBy: f32,                      // [95]
  basisZx: f32,                     // [96]
  basisZy: f32,                     // [97]
  basisZz: f32,                     // [98]
  _padBz: f32,                      // [99]

  // Lattice spacing and slice positions
  spacing: array<f32, 12>,          // [100..111]
  slicePositions: array<f32, 12>,   // [112..123]
}
`
