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
 */
export const pmremSamplingBlock = `
// ============================================
// PMREM CubeUV Sampling (from Three.js)
// ============================================

#define cubeUV_minMipLevel 4.0
#define cubeUV_minTileSize 16.0

// CUBEUV_MAX_MIP and texel sizes are set based on PMREMGenerator output
// Default PMREMGenerator creates 256x256 per face with 8 mip levels
#define CUBEUV_MAX_MIP 8.0
#define CUBEUV_TEXEL_WIDTH (1.0 / (3.0 * 256.0))
#define CUBEUV_TEXEL_HEIGHT (1.0 / (4.0 * 256.0))

float getFace(vec3 direction) {
    vec3 absDirection = abs(direction);
    float face = -1.0;
    
    if (absDirection.x > absDirection.z) {
        if (absDirection.x > absDirection.y)
            face = direction.x > 0.0 ? 0.0 : 3.0;
        else
            face = direction.y > 0.0 ? 1.0 : 4.0;
    } else {
        if (absDirection.z > absDirection.y)
            face = direction.z > 0.0 ? 2.0 : 5.0;
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
    float face = getFace(direction);
    float filterInt = max(cubeUV_minMipLevel - mipInt, 0.0);
    mipInt = max(mipInt, cubeUV_minMipLevel);
    
    float faceSize = exp2(mipInt);
    vec2 uv = getUV(direction, face) * (faceSize - 2.0) + 1.0;
    
    if (face > 2.0) {
        uv.y += faceSize;
        face -= 3.0;
    }
    
    uv.x += face * faceSize;
    uv.x += filterInt * 3.0 * cubeUV_minTileSize;
    uv.y += 4.0 * (exp2(CUBEUV_MAX_MIP) - faceSize);
    
    uv.x *= CUBEUV_TEXEL_WIDTH;
    uv.y *= CUBEUV_TEXEL_HEIGHT;
    
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
    float mip = clamp(roughnessToMip(roughness), cubeUV_m0, CUBEUV_MAX_MIP);
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
vec3 fresnelSchlickRoughness(float cosTheta, vec3 F0, float roughness) {
    return F0 + (max(vec3(1.0 - roughness), F0) - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

// Compute IBL contribution using PMREM texture
// Returns vec3 color to add to final output
vec3 computeIBL(vec3 N, vec3 V, vec3 F0, float roughness, float metallic, vec3 albedo) {
    if (uIBLQuality == 0) return vec3(0.0);
    
    vec3 R = reflect(-V, N);
    float NdotV = max(dot(N, V), 0.0);
    
    // Fresnel with roughness compensation
    vec3 F = fresnelSchlickRoughness(NdotV, F0, roughness);
    
    // Specular IBL - sample PMREM at roughness level
    vec3 specularIBL = textureCubeUV(uEnvMap, R, roughness).rgb;
    
    // For high quality, mix reflection with normal for rough surfaces
    // This prevents rough objects from gathering light from behind their tangent plane
    if (uIBLQuality == 2 && roughness > 0.3) {
        vec3 blendedR = normalize(mix(R, N, roughness * roughness));
        specularIBL = mix(specularIBL, textureCubeUV(uEnvMap, blendedR, roughness).rgb, 0.3);
    }
    
    specularIBL *= F;
    
    // Diffuse IBL - sample at max roughness (fully diffuse)
    // Energy conservation: diffuse is reduced by specular reflectance
    // Lambertian BRDF = albedo/PI for proper energy normalization
    vec3 kD = (1.0 - F) * (1.0 - metallic);
    vec3 diffuseIBL = textureCubeUV(uEnvMap, N, 1.0).rgb * kD * albedo / PI;
    
    return (specularIBL + diffuseIBL) * uIBLIntensity;
}
`;
