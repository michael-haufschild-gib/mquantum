/**
 * Main fragment shader for Schrödinger volumetric rendering
 *
 * Performs volumetric raymarching through the quantum density field,
 * using Beer-Lambert absorption and front-to-back compositing.
 *
 * Supports two temporal modes:
 * - USE_TEMPORAL: Depth-skip optimization (conservative, may have artifacts)
 * - USE_TEMPORAL_ACCUMULATION: Horizon-style 1/4 res with reconstruction (recommended)
 */
export const mainBlock = `
// ============================================
// Main Fragment Shader - Volumetric Mode
// ============================================

// Temporal accumulation uniforms (when USE_TEMPORAL_ACCUMULATION is defined)
#ifdef USE_TEMPORAL_ACCUMULATION
uniform vec2 uBayerOffset;           // Sub-pixel offset (0,0), (1,1), (1,0), or (0,1)
uniform vec2 uFullResolution;        // Full screen resolution (for jitter calculation)
#endif

void main() {
    vec3 ro, rd;
    vec3 worldRayDir;

    // Calculate screen coordinates
    // For temporal accumulation, apply Bayer jitter to sample sub-pixels
    vec2 screenCoord = gl_FragCoord.xy;

    #ifdef USE_TEMPORAL_ACCUMULATION
    // Detect if we're rendering at quarter-res or full-res.
    // When temporal accumulation is enabled, the shader may be rendered in two contexts:
    // 1. Quarter-res volumetric pass (cloudRenderTarget) - needs coordinate transformation
    // 2. Full-res object depth pass (objectDepthTarget) - use direct coordinates
    // We detect this by comparing actual resolution (uResolution) to full resolution.
    bool isQuarterRes = uResolution.x < uFullResolution.x * 0.75;

    if (isQuarterRes) {
        // Quarter-res mode: Each pixel represents a 2x2 block in full res.
        // The Bayer offset determines which sub-pixel within the block we sample.
        // Convert quarter-res coord to full-res coord with jitter
        screenCoord = floor(gl_FragCoord.xy) * 2.0 + uBayerOffset + 0.5;
    }
    // else: Full-res mode - use gl_FragCoord.xy directly (already set above)
    #endif

    // Setup ray origin and direction (perspective projection)
    ro = (uInverseModelMatrix * vec4(uCameraPosition, 1.0)).xyz;

    #ifdef USE_TEMPORAL_ACCUMULATION
    // For temporal accumulation, compute ray direction from screen coord
    // instead of using interpolated vertex position
    vec2 screenUV = screenCoord / uFullResolution;
    vec2 ndc = screenUV * 2.0 - 1.0;
    vec4 farPointClip = vec4(ndc, 1.0, 1.0);
    vec4 farPointWorld = uInverseViewProjectionMatrix * farPointClip;
    // Guard against w=0 while preserving sign
    float farW = abs(farPointWorld.w) < 0.0001
      ? (farPointWorld.w >= 0.0 ? 0.0001 : -0.0001)
      : farPointWorld.w;
    farPointWorld /= farW;
    worldRayDir = normalize(farPointWorld.xyz - uCameraPosition);
    #else
    worldRayDir = normalize(vPosition - uCameraPosition);
    #endif

    rd = normalize((uInverseModelMatrix * vec4(worldRayDir, 0.0)).xyz);

    // Intersect with bounding sphere
    vec2 tSphere = intersectSphere(ro, rd, BOUND_R);

    // No intersection with bounding volume
    if (tSphere.y < 0.0) {
        discard;
    }

    float tNearOriginal = max(0.0, tSphere.x);  // Keep original for depth writing
    float tNear = tNearOriginal;
    float tFar = tSphere.y;
    bool usedTemporal = false;

    // Temporal reprojection for volumetric rendering
    // CONSERVATIVE approach - volumetric has soft boundaries, so we must be careful:
    // 1. Large margin (50%) because visible density extends before recorded entry
    // 2. Never skip more than 40% of total ray length
    // 3. Only use if skip provides meaningful benefit (> 10% of ray)
    #ifdef USE_TEMPORAL
    float temporalDepth = getTemporalDepth(ro, rd, worldRayDir);
    float rayLength = tFar - tNearOriginal;

    if (temporalDepth > 0.0 && temporalDepth < tFar && rayLength > 0.0) {
        // Apply 50% margin - step back halfway from temporal hint to sphere entry
        // This accounts for soft volumetric boundaries where density extends
        // significantly before our recorded "entry point"
        float temporalStart = mix(tNearOriginal, temporalDepth, 0.5);

        // Calculate how much we'd skip as fraction of total ray
        float skipDistance = temporalStart - tNearOriginal;
        float skipFraction = skipDistance / rayLength;

        // Safety limits:
        // - Never skip more than 40% of ray (too aggressive for soft volumes)
        // - Only skip if benefit is meaningful (> 10% of ray)
        float maxSkipFraction = 0.4;
        float minSkipFraction = 0.1;

        if (skipFraction > minSkipFraction && skipFraction <= maxSkipFraction) {
            tNear = temporalStart;
            usedTemporal = true;
        } else if (skipFraction > maxSkipFraction) {
            // Temporal suggests skipping too much - clamp to safe maximum
            tNear = tNearOriginal + rayLength * maxSkipFraction;
            usedTemporal = true;
        }
        // If skipFraction <= minSkipFraction, don't bother - not worth the risk
    }
    #endif

    // Volumetric raymarching
    VolumeResult volumeResult;
    
    // Fast mode selection: uFastMode is always respected
    // Both paths now support dispersion:
    // - Fast path: gradient-based color modulation (lightweight approximation)
    // - HQ path: per-channel density sampling (accurate but expensive)
    if (uFastMode) {
        volumeResult = volumeRaymarch(ro, rd, tNear, tFar);
    } else {
        volumeResult = volumeRaymarchHQ(ro, rd, tNear, tFar);
    }

    // Discard fully transparent pixels
    if (volumeResult.alpha < 0.01) {
        discard;
    }

    // Apply opacity mode adjustments
    float alpha = volumeResult.alpha;

    if (uOpacityMode == OPACITY_SOLID) {
        alpha = 1.0;
    } else if (uOpacityMode == OPACITY_SIMPLE_ALPHA) {
        alpha = min(volumeResult.alpha * uSimpleAlpha * 2.0, 1.0);
    } else if (uOpacityMode == OPACITY_VOLUMETRIC) {
        alpha = volumeResult.alpha * uVolumetricDensity;
    }

    // Depth for gl_FragDepth:
    // When temporal was used, keep using the temporal depth (prevents drift)
    // When not used, record the actual entry point we found
    float depthT;
    #ifdef USE_TEMPORAL
    if (usedTemporal) {
        // Use the temporal depth we received (before our margin adjustment)
        // This prevents feedback loop where we progressively drift inward
        depthT = temporalDepth;
    } else {
        depthT = volumeResult.entryT;
    }
    #else
    depthT = volumeResult.entryT;
    #endif

    vec3 entryPoint = ro + rd * depthT;
    vec4 worldEntryPos = uModelMatrix * vec4(entryPoint, 1.0);
    vec4 clipPos = uProjectionMatrix * uViewMatrix * worldEntryPos;
    // Guard against clipPos.w = 0 while preserving sign
    float clipW = abs(clipPos.w) < 0.0001
      ? (clipPos.w >= 0.0 ? 0.0001 : -0.0001)
      : clipPos.w;
    gl_FragDepth = clamp((clipPos.z / clipW) * 0.5 + 0.5, 0.0, 1.0);

    // Output
    gColor = vec4(volumeResult.color, alpha);

    // Always output normals for G-buffer (SSR, SSAO)
    // For volumetric objects, compute density gradient at weighted center as surface normal
    // This gives actual surface structure rather than just view-dependent gradient
    float animTime = uTime * uTimeScale;
    vec3 modelNormal = computeGradientTetrahedral(volumeResult.weightedCenter, animTime, 0.02);

    // If gradient is too weak (flat region), fall back to ray direction
    float gradientLength = length(modelNormal);
    if (gradientLength < 0.001) {
        modelNormal = -rd;  // Fallback: surface faces camera
    } else {
        modelNormal = normalize(modelNormal);
    }

    // Transform normal from model space to world space, then to view space
    vec3 worldNormal = normalize((uModelMatrix * vec4(modelNormal, 0.0)).xyz);
    vec4 viewNormalVec = uViewMatrix * vec4(worldNormal, 0.0);
    vec3 viewNormal = normalize(viewNormalVec.xyz);

    // Encode to [0,1] range: [-1,1] -> [0,1]
    vec3 encodedNormal = viewNormal * 0.5 + 0.5;
    // IMPORTANT: Use alpha = 1.0 to prevent premultiplied alpha issues
    gNormal = vec4(encodedNormal, 1.0);

    // Output world position for temporal reprojection
    // ALWAYS write gPosition to prevent GL_INVALID_OPERATION when switching layers.
    // When temporal is OFF, this output is ignored by mainObjectMRT (count: 2).
    // When temporal is ON, this provides actual position data for reprojection.
    #ifdef USE_TEMPORAL_ACCUMULATION
    // CRITICAL: Use WEIGHTED CENTER instead of entry point!
    // The weighted center is the density-weighted average position along the ray.
    // It's much more stable than the entry point because:
    // - Entry point varies dramatically with viewing angle (first visible density)
    // - Weighted center represents the "center of mass" of the volumetric contribution
    // - Weighted center doesn't jump when viewing angle changes slightly
    // This is key to preventing smearing artifacts during camera rotation.
    vec4 worldCenterPos = uModelMatrix * vec4(volumeResult.weightedCenter, 1.0);
    gPosition = vec4(worldCenterPos.xyz, alpha);
    #else
    // Dummy output when temporal is disabled (ignored by render target)
    gPosition = vec4(0.0);
    #endif
}
`;

/**
 * Alternative main block for isosurface mode (optional)
 * Uses raymarching to find the density threshold surface
 */
export const mainBlockIsosurface = `
void main() {
    vec3 ro, rd;
    vec3 worldRayDir;

    // Perspective projection: ray from camera through fragment
    ro = (uInverseModelMatrix * vec4(uCameraPosition, 1.0)).xyz;
    worldRayDir = normalize(vPosition - uCameraPosition);
    rd = normalize((uInverseModelMatrix * vec4(worldRayDir, 0.0)).xyz);

    vec2 tSphere = intersectSphere(ro, rd, BOUND_R);
    if (tSphere.y < 0.0) discard;

    float tNear = max(0.0, tSphere.x);
    float tFar = tSphere.y;

    // Isosurface raymarching
    float animTime = uTime * uTimeScale;
    float threshold = uIsoThreshold;

    int maxSteps = uFastMode ? 64 : 128;
    float stepLen = (tFar - tNear) / float(maxSteps);
    float t = tNear;
    float hitT = -1.0;

    for (int i = 0; i < 128; i++) {
        if (i >= maxSteps) break;
        if (t > tFar) break;

        vec3 pos = ro + rd * t;
        float rho = sampleDensity(pos, animTime);
        float s = sFromRho(rho);

        if (s > threshold) {
            // Binary search refinement
            float tLo = t - stepLen;
            float tHi = t;
            for (int j = 0; j < 5; j++) {
                float tMid = (tLo + tHi) * 0.5;
                vec3 midPos = ro + rd * tMid;
                float midS = sFromRho(sampleDensity(midPos, animTime));
                if (midS > threshold) {
                    tHi = tMid;
                } else {
                    tLo = tMid;
                }
            }
            hitT = (tLo + tHi) * 0.5;
            break;
        }

        t += stepLen;
    }

    if (hitT < 0.0) discard;

    // Compute surface point and normal
    vec3 p = ro + rd * hitT;
    vec3 n = normalize(computeGradientTetrahedral(p, animTime, 0.01));

    // Sample for color
    vec3 densityInfo = sampleDensityWithPhase(p, animTime);
    float rho = densityInfo.x;
    float phase = densityInfo.z;

    // Surface coloring - use user's color with subtle phase modulation
    vec3 baseHSL = rgb2hsl(uColor);
    float normS = clamp((sFromRho(rho) + 8.0) / 8.0, 0.0, 1.0);
    vec3 surfaceColor;

    // Phase influence on hue
    float phaseNorm = (phase + PI) / TAU;
    float hueShift = (phaseNorm - 0.5) * 0.4; // ±20% hue shift

    if (uColorAlgorithm == COLOR_ALG_PHASE) {
        // Quantum phase coloring - uses actual wavefunction phase
        float hue = fract(baseHSL.x + hueShift);
        surfaceColor = hsl2rgb(vec3(hue, 0.75, 0.35));
    } else if (uColorAlgorithm == COLOR_ALG_MIXED) {
        // Mixed: quantum phase + density
        float hue = fract(baseHSL.x + hueShift);
        float lightness = 0.15 + 0.35 * normS;
        float saturation = 0.7 + 0.25 * normS;
        surfaceColor = hsl2rgb(vec3(hue, saturation, lightness));
    } else if (uColorAlgorithm == COLOR_ALG_BLACKBODY) {
        // Blackbody: density mapped to temperature
        float temp = normS * 12000.0;
        if (temp < 500.0) {
            surfaceColor = vec3(0.0);
        } else {
            surfaceColor = blackbody(temp);
        }
    } else {
        // All other algorithms: delegate to shared system
        surfaceColor = getColorByAlgorithm(normS, n, baseHSL, p);
    }

    // Lighting (ambient is energy-conserved: metals don't scatter diffuse light)
    // max() guards against uMetallic > 1.0 which would cause negative diffuse
    vec3 col = surfaceColor * max(1.0 - uMetallic, 0.0) * uAmbientColor * uAmbientIntensity * uAmbientEnabled;
    vec3 viewDir = -rd;
    float totalNdotL = 0.0;

    // Clamp roughness to prevent numerical issues (roughness=0 causes NDF=0)
    float roughness = max(uRoughness, 0.04);

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

        float NdotL = max(dot(n, l), 0.0);
        totalNdotL = max(totalNdotL, NdotL * attenuation);

        // GGX Specular (PBR) with energy conservation
        // F0: mix dielectric base (0.04) with albedo for metals
        vec3 F0 = mix(vec3(0.04), surfaceColor, uMetallic);
        vec3 H = normalize(l + viewDir);
        vec3 F = fresnelSchlick(max(dot(H, viewDir), 0.0), F0);

        // Energy conservation: kS is specular reflectance, kD is diffuse
        vec3 kS = F;
        vec3 kD = (vec3(1.0) - kS) * (1.0 - uMetallic);

        // Diffuse (energy-conserved, Lambertian BRDF = albedo/PI)
        col += kD * surfaceColor / PI * uLightColors[i] * NdotL * attenuation;

        // Specular (with artist-controlled color tint)
        vec3 specular = computePBRSpecular(n, viewDir, l, roughness, F0);
        col += specular * uSpecularColor * uLightColors[i] * NdotL * uSpecularIntensity * attenuation;
    }

    // Fresnel rim
    // PERF: Use multiplications instead of pow(x, 3.0)
    if (uFresnelEnabled && uFresnelIntensity > 0.0) {
        float NdotV = max(dot(n, viewDir), 0.0);
        float t = 1.0 - NdotV;
        float rim = t * t * t * uFresnelIntensity * 2.0;
        rim *= (0.3 + 0.7 * totalNdotL);
        col += uRimColor * rim;
    }

    // IBL (environment reflections)
    vec3 F0_ibl = mix(vec3(0.04), surfaceColor, uMetallic);
    col += computeIBL(n, viewDir, F0_ibl, roughness, uMetallic, surfaceColor);

    // Depth
    vec4 worldHitPos = uModelMatrix * vec4(p, 1.0);
    vec4 clipPos = uProjectionMatrix * uViewMatrix * worldHitPos;
    // Guard against clipPos.w = 0 while preserving sign
    float clipW2 = abs(clipPos.w) < 0.0001
      ? (clipPos.w >= 0.0 ? 0.0001 : -0.0001)
      : clipPos.w;
    gl_FragDepth = clamp((clipPos.z / clipW2) * 0.5 + 0.5, 0.0, 1.0);

    float alpha = calculateOpacityAlpha(hitT, tSphere.x, tFar + 1.0);
    // Guard against zero-length view normal
    vec3 viewNormalRaw = (uViewMatrix * vec4(n, 0.0)).xyz;
    float vnLen2 = length(viewNormalRaw);
    vec3 viewNormal = vnLen2 > 0.0001 ? viewNormalRaw / vnLen2 : vec3(0.0, 0.0, 1.0);
    gColor = vec4(col, alpha);
    gNormal = vec4(viewNormal * 0.5 + 0.5, uMetallic);
    // Dummy output for isosurface mode (always required for MRT compatibility)
    gPosition = vec4(worldHitPos.xyz, alpha);
}
`;
