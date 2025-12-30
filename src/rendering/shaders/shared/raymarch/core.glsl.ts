export const raymarchCoreBlock = `
// ============================================
// Raymarching & Rendering
// ============================================

/**
 * Core raymarching loop - shared by temporal and non-temporal variants.
 * Uses relaxed sphere tracing with overrelaxation for efficiency.
 *
 * @param ro Ray origin
 * @param rd Ray direction
 * @param startDist Starting distance along ray
 * @param maxT Maximum distance to march
 * @param maxDist Miss return value (beyond any possible hit)
 * @param trap Output: trap value at hit point (for coloring)
 * @return Distance to hit, or maxDist+1 if miss
 */
float RayMarchCore(vec3 ro, vec3 rd, float startDist, float maxT, float maxDist, out float trap) {
    float dO = startDist;

    // Calculate march steps and surface distance based on performance mode and quality multiplier
    // Fast mode: use LQ settings immediately
    // Normal mode: interpolate between LQ and HQ based on quality multiplier (0.25-1.0)
    int maxSteps;
    float surfDist;
    float omega;

    if (uFastMode) {
        maxSteps = MAX_MARCH_STEPS_LQ;
        surfDist = SURF_DIST_LQ;
        omega = 1.0;  // No overrelaxation in fast mode (already fast)
    } else {
        // Progressive refinement: interpolate based on quality multiplier
        float t = clamp((uQualityMultiplier - 0.25) / 0.75, 0.0, 1.0);
        maxSteps = int(mix(float(MAX_MARCH_STEPS_LQ), float(MAX_MARCH_STEPS_HQ), t));
        surfDist = mix(SURF_DIST_LQ, SURF_DIST_HQ, t);
        omega = mix(1.0, 1.2, t);  // Gradually enable overrelaxation as quality increases
    }

    // Relaxed sphere tracing with overrelaxation
    // omega > 1 allows larger steps, reducing total march count
    // Safety: if we overstep, fall back to conservative stepping
    float prevDist = 1e10;

    // Loop uses max possible steps, early exit via maxSteps check
    for (int i = 0; i < MAX_MARCH_STEPS_HQ; i++) {
        if (i >= maxSteps) break;

        vec3 p = ro + rd * dO;
        float currentTrap;
        float dS = GetDistWithTrap(p, currentTrap);

        if (dS < surfDist) { trap = currentTrap; return dO; }

        // Relaxed sphere tracing: take larger steps when safe
        float step = dS * omega;

        // Safety check: if step would be larger than previous distance,
        // we might have overstepped - use conservative step instead
        if (step > prevDist + dS) {
            step = dS;  // Conservative fallback
        }

        dO += step;
        prevDist = dS;

        if (dO > maxT) break;
    }
    return maxDist + 1.0;
}

/**
 * Full raymarching with optional temporal reprojection.
 * Uses previous frame depth as starting point to skip empty space.
 */
float RayMarch(vec3 ro, vec3 rd, vec3 worldRayDir, out float trap, out bool usedTemporal) {
    trap = 0.0;
    usedTemporal = false;
    float camDist = length(ro);
    float maxDist = camDist + BOUND_R * 2.0 + 1.0;

    vec2 tSphere = intersectSphere(ro, rd, BOUND_R);
    if (tSphere.y < 0.0) return maxDist + 1.0;

    float dO = max(0.0, tSphere.x);
    float maxT = min(tSphere.y, maxDist);

    // Temporal Reprojection: Use previous frame's depth as starting point
    // This can skip many empty-space march steps
    #ifdef USE_TEMPORAL
    float temporalDepth = getTemporalDepth(ro, rd, worldRayDir);
    if (temporalDepth > 0.0 && temporalDepth < maxT) {
        // Start from the temporal hint, with safety margin
        // uTemporalSafetyMargin controls how far back to step (default 0.95 = 5% back)
        dO = max(dO, temporalDepth * uTemporalSafetyMargin);
        usedTemporal = true;
    }
    #endif

    return RayMarchCore(ro, rd, dO, maxT, maxDist, trap);
}

/**
 * RayMarch without temporal reprojection - used as fallback when temporal skip misses.
 * This prevents feedback loops where temporal hints cause persistent misses.
 */
float RayMarchNoTemporal(vec3 ro, vec3 rd, out float trap) {
    trap = 0.0;
    float camDist = length(ro);
    float maxDist = camDist + BOUND_R * 2.0 + 1.0;

    vec2 tSphere = intersectSphere(ro, rd, BOUND_R);
    if (tSphere.y < 0.0) return maxDist + 1.0;

    float dO = max(0.0, tSphere.x);
    float maxT = min(tSphere.y, maxDist);

    return RayMarchCore(ro, rd, dO, maxT, maxDist, trap);
}
`
