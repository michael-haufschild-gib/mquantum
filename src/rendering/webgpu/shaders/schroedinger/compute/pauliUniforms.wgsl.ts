/**
 * Zeeman-Pauli spinor uniform struct for GPU compute shaders.
 *
 * Contains lattice parameters, physics constants (mass, hbar), magnetic field
 * configuration (uniform/gradient/rotating/quadrupole), spin state angles,
 * potential settings, absorber parameters, display options, and basis vectors
 * for N-D to 3D projection.
 *
 * Flat layout — all arrays use stride-4 scalars to avoid WGSL alignment
 * surprises. Basis vectors use array<f32, 12> for full N-D rotation support.
 *
 * Total size: 160 × 4 = 640 bytes.
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
 *   [36]      fieldVecBx     (host-precomputed B0·sin(θ)·cos(φ) for fieldType=0; 0 otherwise)
 *   [37]      fieldVecBy     (host-precomputed B0·sin(θ)·sin(φ) for fieldType=0; 0 otherwise)
 *   [38]      spinTheta
 *   [39]      spinPhi
 *   [40]      initCondition
 *   [41]      packetWidth
 *   [42..53]  packetCenter[12]
 *   [54..65]  packetMomentum[12]
 *   [66]      fieldVecBz     (host-precomputed B0·cos(θ) for fieldType=0; 0 otherwise)
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
 *   [88..99]  basisX[12]
 *   [100..111] basisY[12]
 *   [112..123] basisZ[12]
 *   [124..135] spacing[12]
 *   [136..147] slicePositions[12]
 *   [148..159] kGridScale[12]   2π / (N_d · spacing_d) per dim; unused slots = 0
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
  // Host-precomputed B vector for fieldType=0 (uniform). Saves 4 sin/cos
  // per thread per Strang substep. Zero for fieldType != 0 (unused on those
  // paths). Bz lives at [66] to fit the existing 640-byte layout.
  fieldVecBx: f32,                  // [36]
  fieldVecBy: f32,                  // [37]

  // Spin state (Bloch sphere)
  spinTheta: f32,                   // [38]
  spinPhi: f32,                     // [39]

  // Initial condition
  initCondition: u32,               // [40]  0=gaussianSpinUp, 1=gaussianSpinDown, 2=gaussianSuperposition, 3=planeWaveSpinor
  packetWidth: f32,                 // [41]
  packetCenter: array<f32, 12>,     // [42..53]
  packetMomentum: array<f32, 12>,   // [54..65]
  fieldVecBz: f32,                  // [66]  see fieldVecBx/By note above

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
  fieldView: u32,                   // [76]  0=spinDensity, 1=totalDensity, 2=spinExpectation, 3=coherence, 4=spinHelicity, 5=berryCurvature
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

  // Basis vectors for N-D -> 3D projection (48 bytes each)
  basisX: array<f32, 12>,           // [88..99]
  basisY: array<f32, 12>,           // [100..111]
  basisZ: array<f32, 12>,           // [112..123]

  // Lattice spacing and slice positions
  spacing: array<f32, 12>,          // [124..135]
  slicePositions: array<f32, 12>,   // [136..147]

  // k-space grid info for kinetic step (48 bytes): 2π / (N · a) per dimension.
  // Host precomputes so the kinetic kernel avoids a per-thread per-dim divide.
  // Mirrors TDSE/Dirac kGridScale.
  kGridScale: array<f32, 12>,       // [148..159]
}
`
