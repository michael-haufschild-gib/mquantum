/**
 * Shared main fragment shader block for fractal raymarching
 *
 * Used by both Mandelbulb and Julia shaders. Contains:
 * - Ray setup from camera through fragment
 * - Raymarching with temporal reprojection support
 * - Normal calculation (fast/high quality modes)
 * - Multi-light PBR lighting loop
 * - SSS, fresnel, fog effects
 * - Depth and MRT output
 */
export const fractalMainBlock = `
void main() {
    vec3 ro, rd;
    vec3 worldRayDir;

    // Perspective projection: ray from camera through fragment
    ro = (uInverseModelMatrix * vec4(uCameraPosition, 1.0)).xyz;
    worldRayDir = normalize(vPosition - uCameraPosition);
    rd = normalize((uInverseModelMatrix * vec4(worldRayDir, 0.0)).xyz);

    float camDist = length(ro);
    float maxDist = camDist + BOUND_R * 2.0 + 1.0;

    vec2 tSphere = intersectSphere(ro, rd, BOUND_R);
    float sphereEntry = max(0.0, tSphere.x);

    float trap;
    bool usedTemporal;
    float d = RayMarch(ro, rd, worldRayDir, trap, usedTemporal);

    // Fallback disabled for performance testing
    // if (d > maxDist && usedTemporal) {
    //     usedTemporal = false;
    //     d = RayMarchNoTemporal(ro, rd, trap);
    // }

    // Debug Mode 1: Iteration Heatmap
    // Shows green→yellow→red gradient based on iteration count
    // Green = few iterations (efficient), Red = many iterations (expensive)
    // Works for both hits and misses to visualize full cost distribution
    if (uDebugMode == 1) {
        float t = float(g_raymarchIterations) / float(max(g_raymarchMaxIterations, 1));
        // Heatmap: green (low) → yellow (mid) → red (high)
        vec3 heatmap = vec3(
            smoothstep(0.0, 0.5, t),           // R: ramps up in first half
            1.0 - smoothstep(0.5, 1.0, t),     // G: stays high, drops in second half
            0.0                                 // B: always 0
        );
        // For misses, show slightly darker to distinguish from hits
        if (d > maxDist) {
            heatmap *= 0.7;
        }
        gColor = vec4(heatmap, 1.0);
        gNormal = vec4(0.5, 0.5, 1.0, 0.0);
        gPosition = vec4(ro + rd * min(d, sphereEntry + 0.1), d);
        gl_FragDepth = 0.5;
        return;
    }

    if (d > maxDist) discard;

    vec3 p = ro + rd * d;

    // PROFILE MODE 1: Raymarch only - measure pure SDF iteration cost
    if (uProfileMode == 1) {
        gColor = vec4(vec3(trap), 1.0);
        gNormal = vec4(0.5, 0.5, 1.0, 0.0);
        gPosition = vec4(p, d);
        gl_FragDepth = 0.5;
        return;
    }

    // PERF (OPT-FR-1): Use tetrahedron normals - 4 SDF evals with quality
    // comparable to 6-eval central differences. Saves 33% on normal calculation.
    vec3 n = GetNormalTetra(p);

    // PROFILE MODE 2: Raymarch + normals - measure SDF + normal cost
    if (uProfileMode == 2) {
        gColor = vec4(n * 0.5 + 0.5, 1.0);
        gNormal = vec4(n * 0.5 + 0.5, 0.0);
        gPosition = vec4(p, d);
        gl_FragDepth = 0.5;
        return;
    }

    float ao = 1.0;
    #ifdef USE_AO
    if (uAoEnabled) {
        ao = uFastMode ? calcAOFast(p, n) : calcAO(p, n);
    }
    #endif

    // PROFILE MODE 3: Raymarch + normals + AO - measure before lighting
    if (uProfileMode == 3) {
        gColor = vec4(vec3(ao), 1.0);
        gNormal = vec4(n * 0.5 + 0.5, 0.0);
        gPosition = vec4(p, d);
        gl_FragDepth = 0.5;
        return;
    }

    vec3 baseHSL = rgb2hsl(uColor);
    float t = 1.0 - trap;
    vec3 surfaceColor = getColorByAlgorithm(t, n, baseHSL, p);
    surfaceColor *= (0.3 + 0.7 * ao);

    // Ambient light (energy-conserved: metals don't scatter diffuse light)
    // max() guards against uMetallic > 1.0 which would cause negative diffuse
    vec3 col = surfaceColor * max(1.0 - uMetallic, 0.0) * uAmbientColor * uAmbientIntensity * uAmbientEnabled;
    vec3 viewDir = -rd;
    float totalNdotL = 0.0;

    // Clamp roughness to prevent numerical issues (roughness=0 causes NDF=0)
    float roughness = max(uRoughness, 0.04);

    // PERF: Shadow origin is constant for all lights - compute once before loop
    #ifdef USE_SHADOWS
    vec3 shadowOrigin = p + n * 0.02;
    #endif

    for (int i = 0; i < MAX_LIGHTS; i++) {
        if (i >= uNumLights) break;
        if (!uLightsEnabled[i]) continue;

        vec3 l = getLightDirection(i, p);
        float attenuation = uLightIntensities[i];

        int lightType = uLightTypes[i];
        if (lightType == LIGHT_TYPE_POINT || lightType == LIGHT_TYPE_SPOT) {
            float distance = length(uLightPositions[i] - p);
            attenuation *= getDistanceAttenuation(i, distance);
        }

        if (lightType == LIGHT_TYPE_SPOT) {
            vec3 ltfDiff = p - uLightPositions[i];
            float ltfLen = length(ltfDiff);
            // Guard against light at fragment position
            vec3 lightToFrag = ltfLen > 0.0001 ? ltfDiff / ltfLen : vec3(0.0, -1.0, 0.0);
            attenuation *= getSpotAttenuation(i, lightToFrag);
        }

        if (attenuation < 0.001) continue;

        float shadow = 1.0;
        #ifdef USE_SHADOWS
        if (uShadowEnabled) {
            // shadowOrigin computed before loop (PERF optimization)
            vec3 shadowDir = l;
            float shadowMaxDist = lightType == LIGHT_TYPE_DIRECTIONAL ? 10.0 : length(uLightPositions[i] - p);
            // When fastMode is active (during animation/interaction), use low quality shadows
            int effectiveQuality = uFastMode ? 0 : uShadowQuality;
            shadow = calcSoftShadowQuality(shadowOrigin, shadowDir, 0.02, shadowMaxDist, uShadowSoftness, effectiveQuality);
        }
        #endif

        float NdotL = max(dot(n, l), 0.0);
        totalNdotL = max(totalNdotL, NdotL * attenuation * shadow);

        // GGX Specular with energy conservation
        vec3 halfDir = normalize(l + viewDir);
        // F0: mix dielectric base (0.04) with albedo for metals
        vec3 F0 = mix(vec3(0.04), surfaceColor, uMetallic);
        vec3 F = fresnelSchlick(max(dot(halfDir, viewDir), 0.0), F0);

        // Energy conservation: kS is specular reflectance, kD is diffuse
        vec3 kS = F;
        vec3 kD = (vec3(1.0) - kS) * (1.0 - uMetallic);

        // Diffuse (energy-conserved, Lambertian BRDF = albedo/PI)
        col += kD * surfaceColor / PI * uLightColors[i] * NdotL * attenuation * shadow;

        // Specular (with artist-controlled color tint)
        vec3 specular = computePBRSpecular(n, viewDir, l, roughness, F0);
        col += specular * uSpecularColor * uLightColors[i] * NdotL * uSpecularIntensity * attenuation * shadow;

        // Subsurface Scattering (SSS)
#ifdef USE_SSS
        if (uSssEnabled) {
            vec3 sss = computeSSS(l, viewDir, n, 0.5, uSssThickness * 4.0, 0.0, uSssJitter, gl_FragCoord.xy);
            col += sss * uSssColor * uLightColors[i] * uSssIntensity * attenuation;
        }
#endif
    }

#ifdef USE_FRESNEL
    // PERF: Use multiplications instead of pow(x, 3.0)
    if (uFresnelEnabled && uFresnelIntensity > 0.0) {
        float NdotV = max(dot(n, viewDir), 0.0);
        float t = 1.0 - NdotV;
        float rim = t * t * t * uFresnelIntensity * 2.0;
        rim *= (0.3 + 0.7 * totalNdotL);
        col += uRimColor * rim;
    }
#endif

    // IBL (environment reflections)
    vec3 F0_ibl = mix(vec3(0.04), surfaceColor, uMetallic);
    col += computeIBL(n, viewDir, F0_ibl, roughness, uMetallic, surfaceColor);


    vec4 worldHitPos = uModelMatrix * vec4(p, 1.0);
    vec4 clipPos = uProjectionMatrix * uViewMatrix * worldHitPos;
    // Guard against clipPos.w = 0 while preserving sign
    float clipW = abs(clipPos.w) < 0.0001
      ? (clipPos.w >= 0.0 ? 0.0001 : -0.0001)
      : clipPos.w;
    gl_FragDepth = clamp((clipPos.z / clipW) * 0.5 + 0.5, 0.0, 1.0);

    float alpha = 1.0;  // Raymarching fractals are always solid
    // Guard against zero-length view normal
    vec3 viewNormalRaw = (uViewMatrix * vec4(n, 0.0)).xyz;
    float vnLen = length(viewNormalRaw);
    vec3 viewNormal = vnLen > 0.0001 ? viewNormalRaw / vnLen : vec3(0.0, 0.0, 1.0);

    gColor = vec4(col, alpha);
    gNormal = vec4(viewNormal * 0.5 + 0.5, uMetallic);
    // CRITICAL: Always write to gPosition to prevent GL_INVALID_OPERATION
    // when rendering to MRT targets with 3 attachments.
    // Store MODEL-SPACE position (p) so temporal reprojection works during object rotation.
    // World-space position changes when model matrix rotates, breaking reprojection.
    gPosition = vec4(p, d);
}
`
