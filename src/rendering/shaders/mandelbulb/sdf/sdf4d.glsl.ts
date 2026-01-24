export const sdf4dBlock = `
// ============================================
// 4D Hyperbulb - FULLY UNROLLED with rotated basis
// OPT-C5: Defer orbit trap sqrt (minAxisSq)
// OPT-M1: Cache zxzy_sq for minAxis and rxyw calculations
// OPT-PREC: mediump for orbit traps
// ============================================

float sdf4D(vec3 pos, float pwr, float bail, int maxIt, out float trap) {
    float cx = uOrigin[0] + pos.x*uBasisX[0] + pos.y*uBasisY[0] + pos.z*uBasisZ[0];
    float cy = uOrigin[1] + pos.x*uBasisX[1] + pos.y*uBasisY[1] + pos.z*uBasisZ[1];
    float cz = uOrigin[2] + pos.x*uBasisX[2] + pos.y*uBasisY[2] + pos.z*uBasisZ[2];
    float cw = uOrigin[3] + pos.x*uBasisX[3] + pos.y*uBasisY[3] + pos.z*uBasisZ[3];
    float zx = cx, zy = cy, zz = cz, zw = cw;

    float dr = 1.0;
    float r = 0.0;

    // Orbit traps - OPT-C5: minAxisSq instead of minAxis
    // OPT-PREC: mediump sufficient for coloring data
    mediump float minPlane = 1000.0, minAxisSq = 1000000.0, minSphere = 1000.0;
    int escIt = 0;

    // Pre-compute phase offsets outside loop (OPT: saves 2 comparisons per iteration)
    float phaseT = uPhaseEnabled ? uPhaseTheta : 0.0;
    float phaseP = uPhaseEnabled ? uPhasePhi : 0.0;

    for (int i = 0; i < MAX_ITER_HQ; i++) {
        if (i >= maxIt) break;

        // OPT-M1: Cache zxzy_sq for minAxisSq and rxyw calculations
        float zxzy_sq = zx*zx + zy*zy;
        r = sqrt(zxzy_sq + zz*zz + zw*zw);
        if (r > bail) { escIt = i; break; }

        // Orbit traps (using z-axis primary convention)
        minPlane = min(minPlane, abs(zy));
        minAxisSq = min(minAxisSq, zxzy_sq);  // OPT-C5: Track squared
        minSphere = min(minSphere, abs(r - 0.8));

        // Optimized power calculation
        float rp, rpMinus1;
        optimizedPow(r, pwr, rp, rpMinus1);
        dr = rpMinus1 * pwr * dr + 1.0;

        // To hyperspherical: z-axis primary (like Mandelbulb)
        float theta = acos(clamp(zz / max(r, EPS), -1.0, 1.0));

        // OPT-M1: Reuse zxzy_sq in rxyw calculation
        float rxyw = sqrt(max(0.0, zxzy_sq + zw*zw));

        float phi = rxyw > EPS ? acos(clamp(zx / max(rxyw, EPS), -1.0, 1.0)) : 0.0;
        float psi = atan(zw, zy);

        // Power map: angles * n (with pre-computed phase shift)
        float thetaN = (theta + phaseT) * pwr;
        float phiN = (phi + phaseP) * pwr;
        float psiN = psi * pwr;

        // From hyperspherical: z-axis primary reconstruction
        float cTheta = cos(thetaN), sTheta = sin(thetaN);
        float cPhi = cos(phiN), sPhi = sin(phiN);
        float cPsi = cos(psiN), sPsi = sin(psiN);

        float rSinTheta = rp * sTheta;
        float rSinThetaSinPhi = rSinTheta * sPhi;
        zz = rp * cTheta + cz;
        zx = rSinTheta * cPhi + cx;
        zy = rSinThetaSinPhi * cPsi + cy;
        zw = rSinThetaSinPhi * sPsi + cw;
        escIt = i;
    }

    // OPT-C5: Single sqrt after loop
    float minAxis = sqrt(minAxisSq);
    trap = exp(-minPlane * 5.0) * 0.3 + exp(-minAxis * 3.0) * 0.2 +
           exp(-minSphere * 8.0) * 0.2 + float(escIt) / float(max(maxIt, 1)) * 0.3;
    return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}

float sdf4D_simple(vec3 pos, float pwr, float bail, int maxIt) {
    float cx = uOrigin[0] + pos.x*uBasisX[0] + pos.y*uBasisY[0] + pos.z*uBasisZ[0];
    float cy = uOrigin[1] + pos.x*uBasisX[1] + pos.y*uBasisY[1] + pos.z*uBasisZ[1];
    float cz = uOrigin[2] + pos.x*uBasisX[2] + pos.y*uBasisY[2] + pos.z*uBasisZ[2];
    float cw = uOrigin[3] + pos.x*uBasisX[3] + pos.y*uBasisY[3] + pos.z*uBasisZ[3];
    float zx = cx, zy = cy, zz = cz, zw = cw;
    float dr = 1.0, r = 0.0;

    // Pre-compute phase offsets outside loop
    float phaseT = uPhaseEnabled ? uPhaseTheta : 0.0;
    float phaseP = uPhaseEnabled ? uPhasePhi : 0.0;

    for (int i = 0; i < MAX_ITER_HQ; i++) {
        if (i >= maxIt) break;

        // OPT-M1: Cache zxzy_sq for rxyw calculation
        float zxzy_sq = zx*zx + zy*zy;
        r = sqrt(zxzy_sq + zz*zz + zw*zw);
        if (r > bail) break;

        // Optimized power calculation
        float rp, rpMinus1;
        optimizedPow(r, pwr, rp, rpMinus1);
        dr = rpMinus1 * pwr * dr + 1.0;

        // z-axis primary (like Mandelbulb)
        float theta = acos(clamp(zz / max(r, EPS), -1.0, 1.0));
        // OPT-M1: Reuse zxzy_sq in rxyw calculation
        float rxyw = sqrt(max(0.0, zxzy_sq + zw*zw));
        float phi = rxyw > EPS ? acos(clamp(zx / max(rxyw, EPS), -1.0, 1.0)) : 0.0;
        float psi = atan(zw, zy);

        float thetaN = (theta + phaseT) * pwr;
        float phiN = (phi + phaseP) * pwr;
        float psiN = psi * pwr;  // OPT: Cache angle multiplication
        float cTheta = cos(thetaN), sTheta = sin(thetaN);
        float cPhi = cos(phiN), sPhi = sin(phiN);
        float cPsi = cos(psiN), sPsi = sin(psiN);

        float rSinThetaSinPhi = rp * sTheta * sPhi;
        zz = rp * cTheta + cz;
        zx = rp * sTheta * cPhi + cx;
        zy = rSinThetaSinPhi * cPsi + cy;
        zw = rSinThetaSinPhi * sPsi + cw;
    }
    return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}
`
