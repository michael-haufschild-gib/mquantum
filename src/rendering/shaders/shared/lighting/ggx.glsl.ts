export const ggxBlock = `
// ============================================
// GGX Physically Based Specular
// ============================================

// GGX Distribution (Trowbridge-Reitz)
float distributionGGX(vec3 N, vec3 H, float roughness) {
    float a = roughness * roughness;
    float a2 = a * a;
    float NdotH = max(dot(N, H), 0.0);
    float NdotH2 = NdotH * NdotH;
    
    float num = a2;
    float denom = (NdotH2 * (a2 - 1.0) + 1.0);
    denom = PI * denom * denom;
    
    return num / max(denom, 0.0001);
}

// Geometry Smith (Schlick-GGX)
float geometrySchlickGGX(float NdotV, float roughness) {
    float r = (roughness + 1.0);
    float k = (r*r) / 8.0;
    
    float num = NdotV;
    float denom = NdotV * (1.0 - k) + k;
    
    return num / max(denom, 0.0001);
}

float geometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
    float NdotV = max(dot(N, V), 0.0);
    float NdotL = max(dot(N, L), 0.0);
    float ggx2 = geometrySchlickGGX(NdotV, roughness);
    float ggx1 = geometrySchlickGGX(NdotL, roughness);
    
    return ggx1 * ggx2;
}

// Fresnel Schlick
// OPT-H5: pow(x,5) -> multiplication chain (3 muls vs transcendental)
vec3 fresnelSchlick(float cosTheta, vec3 F0) {
    float x = clamp(1.0 - cosTheta, 0.0, 1.0);
    float x2 = x * x;
    float x5 = x2 * x2 * x;  // x^5 = x^2 * x^2 * x
    return F0 + (1.0 - F0) * x5;
}

// Compute PBR Specular contribution
vec3 computePBRSpecular(vec3 N, vec3 V, vec3 L, float roughness, vec3 F0) {
    // Guard against V and L being opposite (zero-length half vector)
    vec3 halfSum = V + L;
    float halfLen = length(halfSum);
    vec3 H = halfLen > 0.0001 ? halfSum / halfLen : N;
    
    // Cook-Torrance BRDF
    float NDF = distributionGGX(N, H, roughness);   
    float G   = geometrySmith(N, V, L, roughness);      
    vec3 F    = fresnelSchlick(max(dot(H, V), 0.0), F0);
       
    vec3 numerator    = NDF * G * F; 
    float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
    vec3 specular = numerator / denominator;
    
    return specular;
}
`;
