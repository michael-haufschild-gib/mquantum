export const mandelbulbUniformsBlock = `
// Enable SDF quality uniforms for raymarching (Mandelbulb uses user-configurable values)
#define USE_SDF_QUALITY_UNIFORMS

// Power Animation uniforms (Technique B - power oscillation)
uniform bool uPowerAnimationEnabled;
uniform float uAnimatedPower;         // Computed on CPU: center + amplitude * sin(time * speed)

// Alternate Power uniforms (Technique B variant - blend between two powers)
uniform bool uAlternatePowerEnabled;
uniform float uAlternatePowerValue;   // Second power value to blend with
uniform float uAlternatePowerBlend;   // 0.0-1.0 blend factor

// Dimension Mixing uniforms (Technique A - shear matrix inside iteration)
uniform bool uDimensionMixEnabled;
uniform float uMixIntensity;          // 0.0-0.3 strength of mixing
uniform float uMixTime;               // Animated time for mixing matrix

// Phase Shift uniforms (angular twisting)
uniform bool uPhaseEnabled;
uniform float uPhaseTheta;
uniform float uPhasePhi;

// Advanced Rendering
uniform float uRoughness;         // GGX roughness (0.0-1.0)
uniform bool uSssEnabled;         // Enable subsurface scattering
uniform float uSssIntensity;      // SSS intensity
uniform vec3 uSssColor;           // SSS tint color
uniform float uSssThickness;      // SSS thickness factor
uniform float uSssJitter;         // SSS jitter amount (0.0-1.0)

// Animation bias
uniform float uBias[11];

// SDF Render Quality (user-configurable)
uniform float uSdfMaxIterations;     // Max iterations for fractal calculation (10-200, default 30)
uniform float uSdfSurfaceDistance;   // Surface hit threshold for raymarching (0.0005-0.01, default 0.002)
`;
