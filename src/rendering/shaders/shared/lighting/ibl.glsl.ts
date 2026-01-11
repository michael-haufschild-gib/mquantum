/**
 * IBL (Image-Based Lighting) Shader Module
 *
 * Provides environment map sampling for specular and diffuse IBL.
 * Uses PMREM textures (sampler2D with CubeUV encoding) for proper
 * roughness-based sampling, following Three.js conventions.
 *
 * PMREM textures are 2D textures that encode cubemap data in a special format
 * that allows efficient roughness-based mip sampling. This is the industry
 * standard approach used by Three.js MeshStandardMaterial.
 */

/**
 * IBL Uniforms Block
 * - uEnvMap: PMREM texture (sampler2D, NOT samplerCube)
 * - uEnvMapSize: Width of the PMREM texture for UV calculations
 * - uIBLIntensity: Multiplier for IBL contribution
 * - uIBLQuality: 0=off, 1=low, 2=high
 */
export const iblUniformsBlock = `
// IBL Uniforms
uniform sampler2D uEnvMap;
uniform float uEnvMapSize;
uniform float uIBLIntensity;
uniform int uIBLQuality; // 0 = off, 1 = low, 2 = high
`;

/**
 * PMREM CubeUV Sampling Functions
 * Adapted from Three.js cube_uv_reflection_fragment.glsl.js
 * These functions allow sampling a 2D PMREM texture as if it were a cubemap.
 *
 * SEAM FIX (2025-01): Updated to use dynamic texel calculations based on
 * uEnvMapSize uniform instead of hardcoded 256. Added epsilon to face selection
 * for edge case handling. Increased UV margin for better seamless sampling.
 */
export const pmremSamplingBlock = `
// ============================================
// PMREM CubeUV Sampling (from Three.js)
// Seamless edge handling version
// ============================================

#define cubeUV_minMipLevel 4.0
#define cubeUV_minTileSize 16.0

// Small epsilon for face selection edge cases
// Prevents discontinuities at exact cube edge boundaries
#define FACE_SELECTION_EPSILON 1e-4

// Compute max mip level from face size: log2(faceSize)
// For 256: log2(256) = 8.0
float getCubeUVMaxMip() {
    return log2(uEnvMapSize);
}

// Compute texel dimensions dynamically from uEnvMapSize
// PMREM layout: 3 faces wide, 4 face heights tall (includes mip chain)
vec2 getCubeUVTexelSize() {
    return vec2(
        1.0 / (3.0 * uEnvMapSize),
        1.0 / (4.0 * uEnvMapSize)
    );
}

// Face selection with epsilon for edge case handling
// Prevents seams at exact cube boundaries where floating-point precision
// could cause adjacent pixels to select different faces
float getFace(vec3 direction) {
    vec3 absDirection = abs(direction);
    float face = -1.0;

    // Add small epsilon to prefer consistent face selection at edges
    // This biases toward X > Z > Y ordering when values are nearly equal
    float ax = absDirection.x;
    float ay = absDirection.y;
    float az = absDirection.z;

    if (ax > az + FACE_SELECTION_EPSILON) {
        if (ax > ay + FACE_SELECTION_EPSILON)
            face = direction.x > 0.0 ? 0.0 : 3.0;
        else
            face = direction.y > 0.0 ? 1.0 : 4.0;
    } else if (az > ax - FACE_SELECTION_EPSILON) {
        if (az > ay + FACE_SELECTION_EPSILON)
            face = direction.z > 0.0 ? 2.0 : 5.0;
        else
            face = direction.y > 0.0 ? 1.0 : 4.0;
    } else {
        // Fallback for truly equal cases - prefer X axis
        if (ax >= ay)
            face = direction.x > 0.0 ? 0.0 : 3.0;
        else
            face = direction.y > 0.0 ? 1.0 : 4.0;
    }

    return face;
}

vec2 getUV(vec3 direction, float face) {
    vec2 uv;

    if (face == 0.0) {
        uv = vec2(direction.z, direction.y) / abs(direction.x);
    } else if (face == 1.0) {
        uv = vec2(-direction.x, -direction.z) / abs(direction.y);
    } else if (face == 2.0) {
        uv = vec2(-direction.x, direction.y) / abs(direction.z);
    } else if (face == 3.0) {
        uv = vec2(-direction.z, direction.y) / abs(direction.x);
    } else if (face == 4.0) {
        uv = vec2(-direction.x, direction.z) / abs(direction.y);
    } else {
        uv = vec2(direction.x, direction.y) / abs(direction.z);
    }

    return 0.5 * (uv + 1.0);
}

vec3 bilinearCubeUV(sampler2D envMap, vec3 direction, float mipInt) {
    float cubeUV_maxMip = getCubeUVMaxMip();
    vec2 texelSize = getCubeUVTexelSize();

    float face = getFace(direction);
    float filterInt = max(cubeUV_minMipLevel - mipInt, 0.0);
    mipInt = max(mipInt, cubeUV_minMipLevel);

    float faceSize = exp2(mipInt);

    // SEAM FIX: Increased UV margin from 1.0 to 1.5 pixels
    // This prevents sampling across face boundaries when texture filtering
    // is applied (especially with anisotropic filtering on Nvidia GPUs)
    // The 0.5 extra margin accounts for bilinear/trilinear filter kernel size
    float uvMargin = 1.5;
    vec2 uv = getUV(direction, face) * (faceSize - 2.0 * uvMargin) + uvMargin;

    if (face > 2.0) {
        uv.y += faceSize;
        face -= 3.0;
    }

    uv.x += face * faceSize;
    uv.x += filterInt * 3.0 * cubeUV_minTileSize;
    uv.y += 4.0 * (exp2(cubeUV_maxMip) - faceSize);

    uv.x *= texelSize.x;
    uv.y *= texelSize.y;

    // Clamp UV to valid range to prevent any edge bleeding
    uv = clamp(uv, vec2(0.001), vec2(0.999));

    return texture(envMap, uv).rgb;
}

// Roughness to mip level mapping (matches PMREMGenerator)
#define cubeUV_r0 1.0
#define cubeUV_m0 -2.0
#define cubeUV_r1 0.8
#define cubeUV_m1 -1.0
#define cubeUV_r4 0.4
#define cubeUV_m4 2.0
#define cubeUV_r5 0.305
#define cubeUV_m5 3.0
#define cubeUV_r6 0.21
#define cubeUV_m6 4.0

float roughnessToMip(float roughness) {
    float mip = 0.0;

    if (roughness >= cubeUV_r1) {
        mip = (cubeUV_r0 - roughness) * (cubeUV_m1 - cubeUV_m0) / (cubeUV_r0 - cubeUV_r1) + cubeUV_m0;
    } else if (roughness >= cubeUV_r4) {
        mip = (cubeUV_r1 - roughness) * (cubeUV_m4 - cubeUV_m1) / (cubeUV_r1 - cubeUV_r4) + cubeUV_m1;
    } else if (roughness >= cubeUV_r5) {
        mip = (cubeUV_r4 - roughness) * (cubeUV_m5 - cubeUV_m4) / (cubeUV_r4 - cubeUV_r5) + cubeUV_m4;
    } else if (roughness >= cubeUV_r6) {
        mip = (cubeUV_r5 - roughness) * (cubeUV_m6 - cubeUV_m5) / (cubeUV_r5 - cubeUV_r6) + cubeUV_m5;
    } else {
        mip = -2.0 * log2(1.16 * roughness);
    }

    return mip;
}

vec4 textureCubeUV(sampler2D envMap, vec3 sampleDir, float roughness) {
    float cubeUV_maxMip = getCubeUVMaxMip();
    float mip = clamp(roughnessToMip(roughness), cubeUV_m0, cubeUV_maxMip);
    float mipF = fract(mip);
    float mipInt = floor(mip);

    vec3 color0 = bilinearCubeUV(envMap, sampleDir, mipInt);

    if (mipF == 0.0) {
        return vec4(color0, 1.0);
    } else {
        vec3 color1 = bilinearCubeUV(envMap, sampleDir, mipInt + 1.0);
        return vec4(mix(color0, color1, mipF), 1.0);
    }
}
`;

/**
 * IBL Computation Block
 * Uses PMREM sampling for physically accurate IBL.
 */
export const iblBlock = `
// ============================================
// Image-Based Lighting (IBL) with PMREM
// ============================================

// Fresnel-Schlick with roughness compensation for IBL
// OPT-H5: pow(x,5) -> multiplication chain (3 muls vs transcendental)
vec3 fresnelSchlickRoughness(float cosTheta, vec3 F0, float roughness) {
    float x = clamp(1.0 - cosTheta, 0.0, 1.0);
    float x2 = x * x;
    float x5 = x2 * x2 * x;  // x^5 = x^2 * x^2 * x
    return F0 + (max(vec3(1.0 - roughness), F0) - F0) * x5;
}

// Compute IBL contribution using PMREM texture
// Returns vec3 color to add to final output
vec3 computeIBL(vec3 N, vec3 V, vec3 F0, float roughness, float metallic, vec3 albedo) {
    if (uIBLQuality == 0) return vec3(0.0);

    vec3 R = reflect(-V, N);
    float NdotV = max(dot(N, V), 0.0);

    // Fresnel with roughness compensation
    vec3 F = fresnelSchlickRoughness(NdotV, F0, roughness);

    // PERF: For high quality + rough surfaces, blend direction BEFORE sampling (1 sample instead of 2)
    // This prevents rough objects from gathering light from behind their tangent plane
    vec3 sampleDir = R;
    if (uIBLQuality == 2 && roughness > 0.3) {
        // Blend reflection toward normal for rough surfaces (30% blend weight baked in)
        sampleDir = normalize(mix(R, N, roughness * roughness * 0.3));
    }

    // Specular IBL - single PMREM sample at roughness level
    vec3 specularIBL = textureCubeUV(uEnvMap, sampleDir, roughness).rgb * F;
    
    // Diffuse IBL - sample at max roughness (fully diffuse)
    // Energy conservation: diffuse is reduced by specular reflectance
    // Lambertian BRDF = albedo/PI for proper energy normalization
    vec3 kD = (1.0 - F) * (1.0 - metallic);
    vec3 diffuseIBL = textureCubeUV(uEnvMap, N, 1.0).rgb * kD * albedo / PI;
    
    return (specularIBL + diffuseIBL) * uIBLIntensity;
}
`;
