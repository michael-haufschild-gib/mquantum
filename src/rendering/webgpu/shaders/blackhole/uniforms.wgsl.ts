/**
 * WGSL Black Hole Uniforms
 *
 * Port of GLSL blackhole/uniforms.glsl to WGSL.
 * Defines uniform structures for black hole rendering.
 *
 * @module rendering/webgpu/shaders/blackhole/uniforms.wgsl
 */

export const blackHoleUniformsBlock = /* wgsl */ `
// ============================================
// Black Hole Uniforms
// ============================================

struct BlackHoleUniforms {
  // Physics (Kerr black hole)
  horizonRadius: f32,          // Schwarzschild radius rs = 2M
  visualEventHorizon: f32,     // Kerr event horizon r+ (shrinks with spin)
  spin: f32,                   // Dimensionless spin chi = a/M (0 to 0.998)
  diskTemperature: f32,        // Inner disk temperature in Kelvin

  gravityStrength: f32,        // Lensing intensity k
  manifoldIntensity: f32,      // Accretion disk emission
  manifoldThickness: f32,      // Disk thickness
  photonShellWidth: f32,       // Photon shell ring width

  timeScale: f32,              // Animation time scale
  baseColor: vec3f,            // Base accretion color
  paletteMode: i32,            // 0=diskGradient, 1=normalBased, 2=shellOnly, 3=heatmap

  bloomBoost: f32,             // HDR bloom multiplier

  // Lensing
  dimensionEmphasis: f32,      // alpha: dimension blend factor
  distanceFalloff: f32,        // beta: distance falloff exponent
  epsilonMul: f32,             // Numerical stability epsilon

  bendScale: f32,              // Ray bend scale
  bendMaxPerStep: f32,         // Max bend angle per step
  lensingClamp: f32,           // Maximum lensing effect
  rayBendingMode: i32,         // 0=spiral, 1=orbital (Einstein-ring)

  dimPower: f32,               // Pre-calculated pow(DIMENSION, emphasis)
  originOffsetLengthSq: f32,   // Pre-calculated lengthSq of extra-dim offset

  // Pre-computed lensing falloff boundaries
  lensingFalloffStart: f32,    // rs * 3.5
  lensingFalloffEnd: f32,      // rs * 8.0
  horizonRadiusInv: f32,       // 1.0 / horizonRadius

  // Photon shell
  photonShellRadiusMul: f32,   // R_p multiplier
  photonShellRadiusDimBias: f32, // Dimension bias for R_p
  shellGlowStrength: f32,      // Shell emission intensity
  shellGlowColor: vec3f,       // Shell color
  _padding1: f32,

  shellStepMul: f32,           // Step size near shell
  shellContrastBoost: f32,     // Shell sharpness
  shellRpPrecomputed: f32,     // Pre-calculated photon shell radius
  shellDeltaPrecomputed: f32,  // Pre-calculated shell width delta

  // Manifold / Accretion
  manifoldType: i32,           // 0=auto, 1=disk, 2=sheet, 3=slab, 4=field
  densityFalloff: f32,         // Density falloff exponent
  diskInnerRadiusMul: f32,     // Inner disk radius multiplier
  diskOuterRadiusMul: f32,     // Outer disk radius multiplier

  diskInnerR: f32,             // Pre-computed inner radius
  diskOuterR: f32,             // Pre-computed outer radius
  effectiveThickness: f32,     // Pre-computed effective thickness
  radialSoftnessMul: f32,      // Radial edge softness

  thicknessPerDimMax: f32,     // Max thickness per extra dimension
  highDimWScale: f32,          // W coordinate scaling for high-D
  swirlAmount: f32,            // Spiral/swirl intensity
  noiseScale: f32,             // Turbulence noise scale

  noiseAmount: f32,            // Turbulence noise amount
  multiIntersectionGain: f32,  // Gain for multiple manifold hits

  // Rendering quality
  maxSteps: i32,               // Max raymarch steps
  stepBase: f32,               // Base step size

  stepMin: f32,                // Minimum step size
  stepMax: f32,                // Maximum step size
  stepAdaptG: f32,             // Adaptive step gravity factor
  stepAdaptR: f32,             // Adaptive step radius factor

  enableAbsorption: u32,       // Enable volumetric absorption
  absorption: f32,             // Absorption coefficient
  transmittanceCutoff: f32,    // Early exit threshold
  farRadius: f32,              // Far clipping radius

  ultraFastMode: u32,          // Skip noise for fast camera movement

  // Lighting
  lightingMode: i32,           // 0=emissiveOnly, 1=fakeLit
  roughness: f32,              // Surface roughness
  specular: f32,               // Specular intensity

  ambientTint: f32,            // Ambient contribution
  envMapReady: f32,            // 1.0 when envMap is valid

  // Doppler effect
  dopplerEnabled: u32,         // Enable Doppler shift
  dopplerStrength: f32,        // Doppler intensity

  // Motion blur
  motionBlurEnabled: u32,      // Enable motion blur
  motionBlurStrength: f32,     // Blur intensity
  motionBlurSamples: i32,      // Blur sample count
  motionBlurRadialFalloff: f32, // Radial falloff

  // SSS
  sssEnabled: u32,             // Enable subsurface scattering
  sssIntensity: f32,           // SSS intensity
  sssColor: vec3f,             // SSS tint color
  _padding2: f32,

  sssThickness: f32,           // SSS thickness factor
  sssJitter: f32,              // SSS jitter amount

  // Animation state
  pulseEnabled: u32,           // Enable pulse animation
  pulseSpeed: f32,             // Pulse speed

  pulseAmount: f32,            // Pulse amount

  // Keplerian disk rotation
  diskRotationAngle: f32,      // Accumulated rotation angle
  keplerianDifferential: f32,  // 0 = uniform, 1 = full Keplerian

  // Temporal accumulation
  bayerOffset: vec2f,          // Bayer pattern offset
  fullResolution: vec2f,       // Full resolution
}
`
