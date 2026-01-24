export const juliaUniformsBlock = `
// Enable SDF quality uniforms for raymarching (Julia uses user-configurable values)
#define USE_SDF_QUALITY_UNIFORMS

// Julia constant (fixed c value, not derived from sample position)
uniform vec4 uJuliaConstant;

// Power Animation uniforms
uniform bool uPowerAnimationEnabled;
uniform float uAnimatedPower;

// Dimension Mixing uniforms
uniform bool uDimensionMixEnabled;
uniform float uMixIntensity;
uniform float uMixTime;

// Advanced Rendering
uniform float uRoughness;         // GGX roughness (0.0-1.0)
uniform bool uSssEnabled;         // Enable subsurface scattering
uniform float uSssIntensity;      // SSS intensity
uniform vec3 uSssColor;           // SSS tint color
uniform float uSssThickness;      // SSS thickness factor
uniform float uSssJitter;         // SSS jitter amount (0.0-1.0)

// LOD
uniform bool uLodEnabled;         // Enable distance-adaptive LOD
uniform float uLodDetail;         // Detail multiplier (epsilon scalar)

// SDF Render Quality (user-configurable)
uniform float uSdfMaxIterations;     // Max iterations for fractal calculation (10-200, default 30)
uniform float uSdfSurfaceDistance;   // Surface hit threshold for raymarching (0.0005-0.01, default 0.002)
`
