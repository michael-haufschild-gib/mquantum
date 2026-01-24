/**
 * Schrödinger-specific uniforms for quantum wavefunction visualization
 *
 * These uniforms define the quantum state configuration:
 * - Superposition terms (coefficients, energies)
 * - Per-dimension frequencies
 * - Quantum numbers for each term
 * - Volume rendering parameters
 */

// CANONICAL CONSTANTS: These define array sizes for all quantum modules.
// The GLSL #defines below must match these TypeScript values.
export const MAX_DIM = 11
export const MAX_TERMS = 8

export const schroedingerUniformsBlock = `
// ============================================
// Schrödinger Quantum Configuration Uniforms
// ============================================

// CANONICAL DEFINITIONS: MAX_DIM and MAX_TERMS are defined here and used by all
// quantum modules (psi.glsl, hoNDVariants.glsl, hoSuperpositionVariants.glsl,
// hydrogenNDVariants.glsl, density.glsl). Do not redefine in other modules.
#define MAX_DIM 11
#define MAX_TERMS 8

// Quantum mode selection
uniform int uQuantumMode;                    // 0 = harmonic oscillator, 1 = hydrogen orbital

// Harmonic oscillator state configuration
uniform int uTermCount;                      // Number of superposition terms (1-8)
uniform float uOmega[MAX_DIM];               // Per-dimension frequencies
uniform int uQuantum[MAX_TERMS * MAX_DIM];   // Quantum numbers n[k][j] (flattened)
uniform vec2 uCoeff[MAX_TERMS];              // Complex coefficients c_k = (re, im)
uniform float uEnergy[MAX_TERMS];            // Precomputed energies E_k

// Hydrogen orbital configuration
uniform int uPrincipalN;                     // Principal quantum number n (1-7)
uniform int uAzimuthalL;                     // Azimuthal quantum number l (0 to n-1)
uniform int uMagneticM;                      // Magnetic quantum number m (-l to +l)
uniform float uBohrRadius;                   // Bohr radius scale factor (0.5-3.0)
uniform bool uUseRealOrbitals;               // Use real orbitals (px/py/pz) vs complex

// PERF: Precomputed hydrogen density boost factors (avoid pow() per sample)
// uHydrogenBoost = 50.0 * n * n * pow(3.0, l) for hydrogen 3D
// uHydrogenNDBoost = uHydrogenBoost * (1.0 + (dim - 3) * 0.3) for hydrogen ND
uniform float uHydrogenBoost;                // Precomputed: 50 * n² * 3^l
uniform float uHydrogenNDBoost;              // Precomputed: uHydrogenBoost * dimFactor
// PERF: Precomputed early exit threshold (avoid repeated computation)
uniform float uHydrogenRadialThreshold;      // Precomputed: 25 * n * a0 * (1 + 0.1*l)

// Hydrogen ND configuration (extra dimensions 4-11)
#define MAX_EXTRA_DIM 8
uniform int uExtraDimN[MAX_EXTRA_DIM];       // Quantum numbers for dims 4-11 (0-6 each)
uniform float uExtraDimOmega[MAX_EXTRA_DIM]; // Frequencies for dims 4-11 (0.1-2.0 each)

// Phase animation (Hydrogen ND only)
uniform bool uPhaseAnimationEnabled;         // Enable time-dependent phase rotation

// Volume rendering parameters
uniform float uTimeScale;      // Time evolution speed (0.1-2.0)
uniform float uFieldScale;     // Coordinate scale into HO basis (0.5-2.0)
uniform float uDensityGain;    // Absorption coefficient (0.1-5.0)
uniform float uPowderScale;    // Multiple scattering "powder" effect (0.0-2.0)
uniform float uEmissionIntensity; // HDR emission intensity (0.0-5.0)
uniform float uEmissionThreshold; // Density threshold for emission (0.0-1.0)
uniform float uEmissionColorShift;// Emission color temperature shift (-1.0 to 1.0)
uniform bool uEmissionPulsing;    // Enable phase-based emission pulsing
uniform float uRimExponent;       // Fresnel rim falloff (1.0-10.0)
uniform float uScatteringAnisotropy; // Henyey-Greenstein phase function g factor (-0.9 to 0.9)
uniform float uRoughness;         // GGX roughness (0.0-1.0)
uniform bool uSssEnabled;         // Enable subsurface scattering
uniform float uSssIntensity;      // SSS intensity (0.0-2.0)
uniform vec3 uSssColor;           // SSS tint color
uniform float uSssThickness;      // SSS thickness factor (0.1-5.0)
uniform float uSssJitter;         // SSS jitter amount (0.0-1.0)
uniform float uErosionStrength;   // Edge erosion strength (0.0-1.0)
uniform float uErosionScale;      // Edge erosion scale (0.25-4.0)
uniform float uErosionTurbulence; // Edge erosion turbulence (0.0-1.0)
uniform int uErosionNoiseType;    // Edge erosion noise type (0=Worley, 1=Perlin, 2=Hybrid)
uniform bool uCurlEnabled;        // Enable curl noise flow
uniform float uCurlStrength;      // Flow strength (0.0-1.0)
uniform float uCurlScale;         // Flow scale (0.25-4.0)
uniform float uCurlSpeed;         // Flow speed (0.1-5.0)
uniform int uCurlBias;            // Flow bias (0=None, 1=Up, 2=Out, 3=In)
uniform bool uDispersionEnabled;  // Enable chromatic dispersion
uniform float uDispersionStrength;// Dispersion strength (0.0-1.0)
uniform int uDispersionDirection; // Dispersion direction (0=Radial, 1=View)
uniform int uDispersionQuality;   // Dispersion quality (0=Fast, 1=High)
uniform bool uShadowsEnabled;     // Enable volumetric self-shadowing
uniform float uShadowStrength;    // Shadow strength (0.0-2.0)
uniform int uShadowSteps;         // Shadow march steps (1-8)
// uAoEnabled is defined in shared uniforms
uniform float uAoStrength;        // AO strength (0.0-2.0)
uniform int uAoSteps;             // AO cones/steps (3-8)
uniform float uAoRadius;          // AO radius (0.1-2.0)
uniform vec3 uAoColor;            // AO tint color
uniform bool uNodalEnabled;       // Enable nodal surface highlighting
uniform vec3 uNodalColor;         // Nodal surface color
uniform float uNodalStrength;     // Nodal highlight strength
uniform bool uEnergyColorEnabled; // Enable energy level coloring
uniform bool uShimmerEnabled;     // Enable uncertainty shimmer
uniform float uShimmerStrength;   // Shimmer strength

// Animation time (from global uTime, but scaled by uTimeScale)
uniform float uTime;

// Optional: Isosurface mode
uniform bool uIsoEnabled;      // Enable isosurface mode
uniform float uIsoThreshold;   // Log-density threshold for isosurface

// Sample count for loop control (LOD)
uniform int uSampleCount;
`
