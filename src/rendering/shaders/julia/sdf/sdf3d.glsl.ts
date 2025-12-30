export const sdf3dBlock = `
// ============================================
// Quaternion Julia SDF - 3D (using w=0 slice of 4D)
// z = z^n + c where c is Julia constant
// OPT-C5: Defer orbit trap sqrt (minAxisSq)
// OPT-PREC: mediump for orbit traps
// ============================================

float sdfJulia3D(vec3 pos, float pwr, float bail, int maxIt, out float trap) {
    // Map 3D position to quaternion (w=0 or from parameter)
    float px = uOrigin[0] + pos.x*uBasisX[0] + pos.y*uBasisY[0] + pos.z*uBasisZ[0];
    float py = uOrigin[1] + pos.x*uBasisX[1] + pos.y*uBasisY[1] + pos.z*uBasisZ[1];
    float pz = uOrigin[2] + pos.x*uBasisX[2] + pos.y*uBasisY[2] + pos.z*uBasisZ[2];
    float pw = uDimension >= 4 ? uOrigin[3] + pos.x*uBasisX[3] + pos.y*uBasisY[3] + pos.z*uBasisZ[3] : 0.0;

    // z starts at sample position (unlike Mandelbulb where c = sample position)
    vec4 z = vec4(px, py, pz, pw);

    // c is the fixed Julia constant
    vec4 c = uJuliaConstant;

    float dr = 1.0;
    float r = 0.0;

    // Orbit traps - OPT-C5: minAxisSq instead of minAxis
    // OPT-PREC: mediump sufficient for coloring data
    mediump float minPlane = 1000.0, minAxisSq = 1000000.0, minSphere = 1000.0;
    int escIt = 0;

    for (int i = 0; i < MAX_ITER_HQ; i++) {
        if (i >= maxIt) break;

        r = length(z);
        if (r > bail) { escIt = i; break; }

        // Orbit traps - OPT-C5: Track squared for minAxis
        float zxy_sq = z.x*z.x + z.y*z.y;
        minPlane = min(minPlane, abs(z.y));
        minAxisSq = min(minAxisSq, zxy_sq);  // OPT-C5: Track squared
        minSphere = min(minSphere, abs(r - 0.8));

        // Derivative update for Julia: dr = n * r^(n-1) * dr
        // (No +1 term since c is constant, unlike Mandelbulb where c=z0)
        dr = pwr * pow(max(r, EPS), pwr - 1.0) * dr;

        // Julia iteration: z = z^n + c
        // Use integer comparison for robustness (pwr is typically a whole number)
        if (int(pwr) == 2) {
            z = quatSqr(z) + c;
        } else {
            z = quatPow(z, pwr) + c;
        }

        escIt = i;
    }

    // OPT-C5: Single sqrt after loop
    float minAxis = sqrt(minAxisSq);
    trap = exp(-minPlane * 5.0) * 0.3 + exp(-minAxis * 3.0) * 0.2 +
           exp(-minSphere * 8.0) * 0.2 + float(escIt) / float(max(maxIt, 1)) * 0.3;

    return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}

float sdfJulia3D_simple(vec3 pos, float pwr, float bail, int maxIt) {
    float px = uOrigin[0] + pos.x*uBasisX[0] + pos.y*uBasisY[0] + pos.z*uBasisZ[0];
    float py = uOrigin[1] + pos.x*uBasisX[1] + pos.y*uBasisY[1] + pos.z*uBasisZ[1];
    float pz = uOrigin[2] + pos.x*uBasisX[2] + pos.y*uBasisY[2] + pos.z*uBasisZ[2];
    float pw = uDimension >= 4 ? uOrigin[3] + pos.x*uBasisX[3] + pos.y*uBasisY[3] + pos.z*uBasisZ[3] : 0.0;

    vec4 z = vec4(px, py, pz, pw);
    vec4 c = uJuliaConstant;

    float dr = 1.0, r = 0.0;

    for (int i = 0; i < MAX_ITER_HQ; i++) {
        if (i >= maxIt) break;
        r = length(z);
        if (r > bail) break;

        // Derivative update for Julia: dr = n * r^(n-1) * dr
        dr = pwr * pow(max(r, EPS), pwr - 1.0) * dr;

        // Use integer comparison for robustness (pwr is typically a whole number)
        if (int(pwr) == 2) {
            z = quatSqr(z) + c;
        } else {
            z = quatPow(z, pwr) + c;
        }
    }

    return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}
`;
