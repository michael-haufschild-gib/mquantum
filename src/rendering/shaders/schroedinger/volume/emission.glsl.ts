/**
 * Emission color computation for volumetric rendering
 *
 * Computes the emission color at each point based on:
 * - User's color palette (uColor as base)
 * - Density (brightness/saturation)
 * - Wavefunction phase (subtle hue modulation)
 *
 * Uses unified uColorAlgorithm system:
 * - Algorithms 0-7: Delegated to shared getColorByAlgorithm()
 * - Algorithm 8 (Phase): Quantum phase coloring using actual wavefunction phase
 * - Algorithm 9 (Mixed): Quantum phase + density blending
 * - Algorithm 10 (Blackbody): Density mapped to temperature gradient
 *
 * The quantum-specific algorithms (8-10) use the actual wavefunction phase,
 * which is physically meaningful for visualizing quantum phenomena.
 */
export const emissionBlock = `
// ============================================
// Volume Emission Color
// ============================================

// Unified color algorithm constants (must match COLOR_ALGORITHM_TO_INT in types.ts)
#define COLOR_ALG_PHASE 8
#define COLOR_ALG_MIXED 9
#define COLOR_ALG_BLACKBODY 10

// Phase influence on hue (0.0 = no phase color, 1.0 = full rainbow)
#define PHASE_HUE_INFLUENCE 0.4

// Analytic approximation of blackbody color (rgb)
// Guards against Temp <= 0 which causes undefined behavior in pow()
vec3 blackbody(float Temp) {
    // Safety: pow(x, -1.5) is undefined for x <= 0
    if (Temp <= 0.0) return vec3(0.0);
    vec3 col = vec3(255.);
    float invTemp = pow(Temp, -1.5);
    col.x = 56100000. * invTemp + 148.;
    col.y = 100040000. * invTemp + 66.;
    col.z = 194180000. * invTemp + 30.;
    col = col / 255.;
    return clamp(col, 0., 1.);
}

// Henyey-Greenstein Phase Function
float henyeyGreenstein(float dotLH, float g) {
    float g2 = g * g;
    float denom = 1.0 + g2 - 2.0 * g * dotLH;
    return (1.0 - g2) / (4.0 * PI * pow(max(denom, 0.001), 1.5));
}

// Note: GGX/PBR functions (distributionGGX, geometrySmith, fresnelSchlick, computePBRSpecular)
// are imported from shared/lighting/ggx.glsl.ts via the compose system

// Compute base surface color (no lighting applied)
vec3 computeBaseColor(float rho, float phase, vec3 pos) {
    // Normalize log-density to [0, 1] range for color mapping
    float s = sFromRho(rho);
    float normalized = clamp((s + 8.0) / 8.0, 0.0, 1.0);

    // Get base color from user's palette
    vec3 baseHSL = rgb2hsl(uColor);
    
#ifdef USE_ENERGY_COLOR
    // Energy Level Coloring
    if (uEnergyColorEnabled) {
        // Map density/phase to energy-like spectrum
        // Ideally we need actual energy eigenvalue E_n.
        // We only have superposition density.
        // Approximation: Phase velocity relates to energy.
        // Or simply map radial distance? Higher n states extend further.
        // Let's use a spectral mapping based on spatial phase gradient or just distance proxy.
        // Better: Use phase itself to show "quantum rainbow".

        // Simple mapping:
        // Low energy = Red/Orange (Center)
        // High energy = Blue/Violet (Edge)
        float r = length(pos);
        float energyProxy = clamp(r * 0.5, 0.0, 1.0);

        // Spectral gradient (heatmap)
        // 0.0 = Red, 0.3 = Green, 0.6 = Blue, 1.0 = Violet
        float hue = 0.7 * (1.0 - energyProxy); // Red(0) at center? No, Blue at center usually high energy?
        // Actually, for HO: E ~ n. High n extends further.
        // So high r is high energy.
        // Visible spectrum: Red (low freq/energy) -> Violet (high freq/energy).
        // So Center (Low Energy) -> Red. Edge (High Energy) -> Violet.

        hue = 0.8 * energyProxy; // 0=Red, 0.8=Violet
        baseHSL = vec3(hue, 1.0, 0.5);
    }
#endif

    // Quantum-specific color algorithms use actual wavefunction phase
    // All other algorithms delegate to the shared getColorByAlgorithm()
    vec3 col = vec3(0.0);

    if (uColorAlgorithm == COLOR_ALG_PHASE) {
        // Algorithm 8: Quantum Phase coloring
        float phaseNorm = (phase + PI) / TAU;
        float hueShift = (phaseNorm - 0.5) * PHASE_HUE_INFLUENCE;
        float hue = fract(baseHSL.x + hueShift);
        col = hsl2rgb(vec3(hue, 0.75, 0.35));
    }
    else if (uColorAlgorithm == COLOR_ALG_MIXED) {
        // Algorithm 9: Mixed (Quantum Phase + Density)
        float phaseNorm = (phase + PI) / TAU;
        float hueShift = (phaseNorm - 0.5) * PHASE_HUE_INFLUENCE;
        float hue = fract(baseHSL.x + hueShift);
        float lightness = 0.15 + 0.35 * normalized;
        float saturation = 0.7 + 0.25 * normalized;
        col = hsl2rgb(vec3(hue, saturation, lightness));
    }
    else if (uColorAlgorithm == COLOR_ALG_BLACKBODY) {
        // Algorithm 10: Blackbody (Heat)
        float temp = normalized * 12000.0;
        if (temp < 500.0) return vec3(0.0); // Cold is black
        col = blackbody(temp);
    }
    else {
        // Algorithms 0-7: Delegate to shared color system
        col = getColorByAlgorithm(normalized, vec3(0.0, 1.0, 0.0), baseHSL, pos);
    }
    
    return col;
}

// Compute emission with ambient lighting only (for fast mode)
// Energy-conserved: metals don't scatter diffuse light
// max() guards against uMetallic > 1.0 which would cause negative diffuse
vec3 computeEmission(float rho, float phase, vec3 pos) {
    vec3 baseColor = computeBaseColor(rho, phase, pos);
    vec3 col = baseColor * max(1.0 - uMetallic, 0.0) * uAmbientColor * uAmbientIntensity * uAmbientEnabled;

#ifdef USE_NODAL
    if (uNodalEnabled) {
        float s = sFromRho(rho);
        if (s < -5.0 && s > -12.0) {
             float intensity = 1.0 - smoothstep(-12.0, -5.0, s);
             // Additive self-luminous glow for nodes (ignores ambient level)
             col += uNodalColor * uNodalStrength * intensity * 2.0;
        }
    }
#endif

    return col;
}

// Compute emission with full scene lighting (for HQ mode)
// Same pattern as Mandelbulb main.glsl.ts lines 53-103
vec3 computeEmissionLit(float rho, float phase, vec3 p, vec3 gradient, vec3 viewDir) {
    // OPTIMIZED: Check early return BEFORE computing surfaceColor
    // Avoids redundant computeBaseColor when computeEmission will recompute it
    if (uNumLights == 0) {
        return computeEmission(rho, phase, p);
    }

    vec3 surfaceColor = computeBaseColor(rho, phase, p);

    // Start with ambient (energy-conserved: metals don't scatter diffuse light)
    // max() guards against uMetallic > 1.0 which would cause negative diffuse
    vec3 col = surfaceColor * max(1.0 - uMetallic, 0.0) * uAmbientColor * uAmbientIntensity * uAmbientEnabled;

    // Normalize gradient as pseudo-normal
    float gradLen = length(gradient);
    if (gradLen < 0.0001) return col;

    vec3 n = gradient / gradLen;

    // Clamp roughness to prevent numerical issues (roughness=0 causes NDF=0)
    float roughness = max(uRoughness, 0.04);

    // Loop through lights - exact same pattern as Mandelbulb lines 57-103
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
            vec3 lightToFrag = normalize(p - uLightPositions[i]);
            attenuation *= getSpotAttenuation(i, lightToFrag);
        }

        if (attenuation < 0.001) continue;

        // Powder effect (multiple scattering approximation)
        // Brightens thin/edge regions: (1 - exp(-rho * scale))
        // We use the raw density 'rho' but scaled by gain to match visual density
        float powder = 1.0;
        if (uPowderScale > 0.0) {
             powder = 1.0 - exp(-rho * uDensityGain * uPowderScale * 4.0);
             // Remap to make it additive boost for thin areas
             powder = 0.5 + 1.5 * powder;
        }
        
        // Anisotropic Scattering (Henyey-Greenstein)
        float phaseFactor = 1.0;
        if (abs(uScatteringAnisotropy) > 0.01) {
            float dotLH = dot(l, viewDir); // L . V = cos(theta)
            
            float cosTheta = dot(-l, viewDir);
            phaseFactor = henyeyGreenstein(cosTheta, uScatteringAnisotropy);
            
            // Normalize so isotropic (g=0) roughly preserves brightness
            phaseFactor *= 12.56; 
        }

        // GGX Specular (PBR) with energy conservation
        float NdotL = max(dot(n, l), 0.0);
        // F0: mix dielectric base (0.04) with albedo for metals
        vec3 F0 = mix(vec3(0.04), surfaceColor, uMetallic);
        vec3 H = normalize(l + viewDir);
        vec3 F = fresnelSchlick(max(dot(H, viewDir), 0.0), F0);

        // Energy conservation: kS is specular reflectance, kD is diffuse
        vec3 kS = F;
        vec3 kD = (vec3(1.0) - kS) * (1.0 - uMetallic);

        // Diffuse (energy-conserved, Lambertian BRDF = albedo/PI, with volumetric powder and phase)
        col += kD * surfaceColor / PI * uLightColors[i] * NdotL * attenuation * powder * phaseFactor;

        // Specular (GGX) - uses Cook-Torrance BRDF
        vec3 specular = computePBRSpecular(n, viewDir, l, roughness, F0);
        
        // Volumetric Self-Shadowing (Raymarching towards light)
        float shadowFactor = 1.0;
        if (uShadowsEnabled && uShadowStrength > 0.0) {
            float shadowDens = 0.0;
            float shadowStep = 0.1;
            float tShadow = 0.05;

            // Halve shadow steps in fast mode for better interactivity
            int effectiveShadowSteps = uFastMode ? max(uShadowSteps / 2, 1) : uShadowSteps;
            for (int s = 0; s < 8; s++) { // Max 8 steps, controlled by uniform
                if (s >= effectiveShadowSteps) break;
                
                vec3 shadowPos = p + l * tShadow;
                float rhoS = sampleDensity(shadowPos, uTime * uTimeScale);
                
                shadowDens += rhoS * shadowStep;
                shadowStep *= 1.5;
                tShadow += shadowStep;
            }
            
            shadowFactor = exp(-shadowDens * uDensityGain * uShadowStrength);
        }
        
        // Add specular contribution (with artist-controlled color tint)
        col += specular * uSpecularColor * uLightColors[i] * NdotL * uSpecularIntensity * attenuation * shadowFactor;
        
        // Subsurface Scattering (SSS)
#ifdef USE_SSS
        if (uSssEnabled && uSssIntensity > 0.0) {
            float sssNoise = fract(sin(dot(gl_FragCoord.xy * 0.1, vec2(127.1, 311.7))) * 43758.5453) * 2.0 - 1.0;
            float jitteredDistortion = 0.5 * (1.0 + sssNoise * uSssJitter);
            vec3 halfVec = normalize(l + n * jitteredDistortion);
            float trans = pow(clamp(dot(viewDir, -halfVec), 0.0, 1.0), uSssThickness * 4.0);

            float transmission = trans;
            if (uShadowsEnabled) {
                 transmission *= shadowFactor;
            } else {
                 transmission *= exp(-rho * uSssThickness);
            }

            col += uSssColor * uLightColors[i] * transmission * uSssIntensity * attenuation;
        }
        // Note: diffuse is already energy-conserved and added above (line ~223)
        // No else branch needed - SSS is an additive effect, not replacement
#endif
    }
    
    // Volumetric Ambient Occlusion
    float aoFactor = 1.0;
    if (uAoEnabled && uAoStrength > 0.0) {
        float ao = 0.0;
        float radius = uAoRadius;
        // Halve AO steps in fast mode for better interactivity (min 2 for basic coverage)
        int steps = uFastMode ? max(uAoSteps / 2, 2) : uAoSteps;
        
        vec3 t1 = normalize(cross(n, vec3(0.0, 1.0, 0.0) + vec3(0.001)));
        vec3 t2 = cross(n, t1);
        
        for (int k = 0; k < 8; k++) {
            if (k >= steps) break;
            
            vec3 dir = n;
            if (k == 1) dir = normalize(n + t1);
            if (k == 2) dir = normalize(n - t1);
            if (k == 3) dir = normalize(n + t2);
            if (k == 4) dir = normalize(n - t2);
            if (k == 5) dir = normalize(n + t1 + t2);
            if (k == 6) dir = normalize(n - t1 - t2);
            if (k == 7) dir = normalize(n + t1 - t2);
            
            vec3 samplePos = p + dir * radius;
            float sampleRho = sampleDensity(samplePos, uTime * uTimeScale);
            
            ao += sampleRho;
        }
        
        ao = ao / float(steps);
        aoFactor = exp(-ao * uDensityGain * uAoStrength * 2.0);
        
        vec3 aoModulator = mix(uAoColor, vec3(1.0), aoFactor);
        col *= aoModulator;
    }

    // Volumetric Fresnel / Rim Lighting
#ifdef USE_FRESNEL
    if (uFresnelEnabled && uFresnelIntensity > 0.0) {
        float NdotV = max(dot(n, viewDir), 0.0);
        float rim = pow(1.0 - NdotV, uRimExponent) * uFresnelIntensity;
        if (uAoEnabled) rim *= aoFactor;
        col += uRimColor * rim;
    }
#endif

    // OPTIMIZED: Cache sFromRho for reuse in HDR Emission and Nodal sections
    // Saves 1 log() call when both features are active
    float cachedS = sFromRho(rho);

    // HDR Emission Glow
    if (uEmissionIntensity > 0.0) {
        float normalizedRho = clamp((cachedS + 8.0) / 8.0, 0.0, 1.0);
        
        if (normalizedRho > uEmissionThreshold) {
            float emissionFactor = (normalizedRho - uEmissionThreshold) / (1.0 - uEmissionThreshold);
            // PERF: Use multiplication instead of pow(x, 2.0)
            emissionFactor = emissionFactor * emissionFactor;
            
            vec3 emissionColor = surfaceColor;
            
            if (abs(uEmissionColorShift) > 0.01) {
                vec3 hsl = rgb2hsl(emissionColor);
                if (uEmissionColorShift > 0.0) {
                     hsl.x = mix(hsl.x, 0.08, uEmissionColorShift * 0.5);
                     hsl.y = mix(hsl.y, 1.0, uEmissionColorShift * 0.3);
                } else {
                     hsl.x = mix(hsl.x, 0.6, -uEmissionColorShift * 0.5);
                     hsl.z = mix(hsl.z, 0.9, -uEmissionColorShift * 0.3);
                }
                emissionColor = hsl2rgb(hsl);
            }
            
            float pulse = 1.0;
            if (uEmissionPulsing) {
                 float phaseNorm = (phase + PI) / TAU;
                 pulse = 1.0 + 0.5 * sin(phaseNorm * 6.28 + uTime * uTimeScale * 2.0);
            }
            
            col += emissionColor * uEmissionIntensity * emissionFactor * pulse;
        }
    }
    
#ifdef USE_NODAL
    if (uNodalEnabled) {
        // OPTIMIZED: Reuse cachedS instead of recomputing sFromRho
        if (cachedS < -5.0 && cachedS > -12.0) {
             float intensity = 1.0 - smoothstep(-12.0, -5.0, cachedS);
             // Additive self-luminous glow for nodes (ignores shadows/lighting)
             col += uNodalColor * uNodalStrength * intensity * 2.0;
        }
    }
#endif

    return col;
}
`
