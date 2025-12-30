export const uniformsBlock = `
uniform vec2 uResolution;
uniform vec3 uCameraPosition;
uniform float uPower;
uniform float uIterations;
uniform float uEscapeRadius;
uniform vec3 uColor;
uniform mat4 uModelMatrix;
uniform mat4 uInverseModelMatrix;
uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;

uniform int uDimension;

// D-dimensional rotated coordinate system
// c = uOrigin + pos.x * uBasisX + pos.y * uBasisY + pos.z * uBasisZ
uniform float uBasisX[11];
uniform float uBasisY[11];
uniform float uBasisZ[11];
uniform float uOrigin[11];

// Multi-Light System Uniforms
uniform int uNumLights;
uniform bool uLightsEnabled[MAX_LIGHTS];
uniform int uLightTypes[MAX_LIGHTS];
uniform vec3 uLightPositions[MAX_LIGHTS];
uniform vec3 uLightDirections[MAX_LIGHTS];
uniform vec3 uLightColors[MAX_LIGHTS];
uniform float uLightIntensities[MAX_LIGHTS];
uniform float uSpotAngles[MAX_LIGHTS];
uniform float uSpotPenumbras[MAX_LIGHTS];
uniform float uSpotCosInner[MAX_LIGHTS];
uniform float uSpotCosOuter[MAX_LIGHTS];
uniform float uLightRanges[MAX_LIGHTS];
uniform float uLightDecays[MAX_LIGHTS];

// Global lighting uniforms
uniform float uAmbientEnabled;  // 1.0 = enabled, 0.0 = disabled
uniform float uAmbientIntensity;
uniform vec3 uAmbientColor;
uniform float uSpecularIntensity;
uniform float uSpecularPower;
uniform vec3 uSpecularColor;
// Note: uDiffuseIntensity removed - energy conservation derives diffuse from (1-kS)*(1-metallic)
uniform float uMetallic;

// Fresnel rim lighting uniforms
uniform bool uFresnelEnabled;
uniform float uFresnelIntensity;
uniform vec3 uRimColor;

// Advanced Color System uniforms
uniform int uColorAlgorithm;
uniform vec3 uCosineA;
uniform vec3 uCosineB;
uniform vec3 uCosineC;
uniform vec3 uCosineD;
uniform float uDistPower;
uniform float uDistCycles;
uniform float uDistOffset;
uniform float uLchLightness;
uniform float uLchChroma;
uniform vec3 uMultiSourceWeights;

// Performance mode
uniform bool uFastMode;
uniform float uQualityMultiplier;

// View Projection matrices for ray reconstruction
uniform mat4 uViewProjectionMatrix;
uniform mat4 uInverseViewProjectionMatrix;

// Temporal Reprojection uniforms
uniform sampler2D uPrevDepthTexture;      // Legacy: depth-only buffer (kept for compatibility)
uniform sampler2D uPrevPositionTexture;   // Position buffer: xyz=world pos, w=model-space ray distance
uniform mat4 uPrevViewProjectionMatrix;
uniform mat4 uPrevInverseViewProjectionMatrix;
uniform bool uTemporalEnabled;
uniform vec2 uDepthBufferResolution;
uniform float uTemporalSafetyMargin;  // How far back to step from temporal hint (0.95 = 5% back, 0.50 = 50% back)

// Sample quality (used by volumetric effects like blackhole disk)
uniform int uSampleQuality;

// Shadow System uniforms
uniform bool uShadowEnabled;
uniform int uShadowQuality;
uniform float uShadowSoftness;

// Ambient Occlusion uniforms
uniform bool uAoEnabled;
`
