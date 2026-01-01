export const uniformsBlock = `
// --- Uniforms ---
uniform samplerCube uTex;
uniform float uMode; // 0=Classic, 1=Aurora, 2=Nebula, 3=Void
uniform float uTime;

// Basic
uniform float uIntensity;
uniform float uHue;
uniform float uSaturation;

// Procedural
uniform float uScale;
uniform float uComplexity;
uniform float uTimeScale;
uniform float uEvolution;

// Colors
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uPalA;
uniform vec3 uPalB;
uniform vec3 uPalC;
uniform vec3 uPalD;
uniform float uUsePalette;

// Delight
uniform float uDistortion;
uniform float uVignette;
uniform float uTurbulence;
uniform float uDualTone;
uniform float uSunIntensity;
uniform vec3 uSunPosition;

// Aurora-specific
uniform float uAuroraCurtainHeight;
uniform float uAuroraWaveFrequency;

// Horizon-specific
uniform float uHorizonGradientContrast;
uniform float uHorizonSpotlightFocus;

// Ocean-specific
uniform float uOceanCausticIntensity;
uniform float uOceanDepthGradient;
uniform float uOceanBubbleDensity;
uniform float uOceanSurfaceShimmer;
`;
