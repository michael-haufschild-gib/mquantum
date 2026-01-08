export const sdfHighDBlock = `
// ============================================
// High-D (fallback): Array-based approach with rotated basis
// OPT-C3: Use optimizedPow for r^pwr and r^(pwr-1)
// OPT-C5: Defer orbit trap sqrt (minASq)
// OPT-C1: Use inversesqrt in tail loop
// OPT-PREC: mediump for orbit traps
// ============================================
float sdfHighD(vec3 pos, int D, float pwr, float bail, int maxIt, out float trap) {
    float c[11], z[11];
    // Mandelbulb mode: both z and c start at sample point
    for (int j = 0; j < 11; j++) {
        c[j] = uOrigin[j] + pos.x*uBasisX[j] + pos.y*uBasisY[j] + pos.z*uBasisZ[j];
        z[j] = c[j];
    }
    // Phase shifts for angular twisting
    float phaseT = uPhaseEnabled ? uPhaseTheta : 0.0;
    float phaseP = uPhaseEnabled ? uPhasePhi : 0.0;

    float dr = 1.0, r = 0.0;
    // OPT-PREC: mediump sufficient for coloring data
    // OPT-C5: minASq instead of minA - defer sqrt to after loop
    mediump float minP = 1000.0, minASq = 1000000.0, minS = 1000.0;
    int escIt = 0;

    for (int i = 0; i < MAX_ITER_HQ; i++) {
        if (i >= maxIt) break;

        // OPT: Cache all squared terms once for both r calculation and tail subtraction
        float zSq[11];
        for (int k = 0; k < 11; k++) zSq[k] = z[k]*z[k];
        float z01_sq = zSq[0] + zSq[1];
        r = z01_sq + zSq[2] + zSq[3] + zSq[4];
        r += zSq[5] + zSq[6] + zSq[7] + zSq[8] + zSq[9] + zSq[10];
        r = sqrt(r);

        if (r > bail) { escIt = i; break; }
        minP = min(minP, abs(z[1]));
        minASq = min(minASq, z01_sq);  // OPT-C5: Track squared, defer sqrt
        minS = min(minS, abs(r - 0.8));

        // OPT-C3: Use optimizedPow instead of two separate pow() calls
        float rp, rpMinus1;
        optimizedPow(r, pwr, rp, rpMinus1);
        dr = rpMinus1 * pwr * dr + 1.0;

        // Compute angles - OPT-C1: Use inversesqrt and cached squared values
        float t[10];
        float tailSq = r*r;
        for (int k = 0; k < D-2; k++) {
            float invTail = inversesqrt(max(tailSq, EPS*EPS));
            t[k] = acos(clamp(z[k] * invTail, -1.0, 1.0));
            tailSq = max(tailSq - zSq[k], 0.0);
        }
        t[D-2] = atan(z[D-1], z[D-2]);

        // Power map and reconstruct with phase shifts on first two angles
        // rp already computed by optimizedPow
        float s0 = sin((t[0]+phaseT)*pwr), c0 = cos((t[0]+phaseT)*pwr);
        float s1 = sin((t[1]+phaseP)*pwr), c1 = cos((t[1]+phaseP)*pwr);
        z[0] = rp*c0 + c[0];
        float sp = rp*s0;
        z[1] = sp*c1 + c[1];
        sp *= s1;
        for (int k = 2; k < D-2; k++) {
            sp *= sin(t[k-1]*pwr);
            z[k] = sp*cos(t[k]*pwr) + c[k];
        }
        sp *= sin(t[D-3]*pwr);
        z[D-2] = sp*cos(t[D-2]*pwr) + c[D-2];
        z[D-1] = sp*sin(t[D-2]*pwr) + c[D-1];
        // Zero out unused dimensions
        for (int k = D; k < 11; k++) z[k] = 0.0;
        escIt = i;
    }
    // OPT-C5: Single sqrt after loop
    float minA = sqrt(minASq);
    trap = exp(-minP*5.0)*0.3 + exp(-minA*3.0)*0.2 + exp(-minS*8.0)*0.2 + float(escIt)/float(max(maxIt,1))*0.3;
    return max(0.5*log(max(r,EPS))*r/max(dr,EPS),EPS);
}

float sdfHighD_simple(vec3 pos, int D, float pwr, float bail, int maxIt) {
    float c[11], z[11];
    // Mandelbulb mode: both z and c start at sample point
    for (int j = 0; j < 11; j++) {
        c[j] = uOrigin[j] + pos.x*uBasisX[j] + pos.y*uBasisY[j] + pos.z*uBasisZ[j];
        z[j] = c[j];
    }
    // Phase shifts for angular twisting
    float phaseT = uPhaseEnabled ? uPhaseTheta : 0.0;
    float phaseP = uPhaseEnabled ? uPhasePhi : 0.0;

    float dr = 1.0, r = 0.0;

    for (int i = 0; i < MAX_ITER_HQ; i++) {
        if (i >= maxIt) break;
        // OPT: Cache all squared terms once for both r calculation and tail subtraction
        float zSq[11];
        for (int k = 0; k < 11; k++) zSq[k] = z[k]*z[k];
        r = zSq[0] + zSq[1] + zSq[2] + zSq[3] + zSq[4];
        r += zSq[5] + zSq[6] + zSq[7] + zSq[8] + zSq[9] + zSq[10];
        r = sqrt(r);
        if (r > bail) break;

        // OPT-C3: Use optimizedPow instead of two separate pow() calls
        float rp, rpMinus1;
        optimizedPow(r, pwr, rp, rpMinus1);
        dr = rpMinus1 * pwr * dr + 1.0;

        // OPT-C1: Use inversesqrt and cached squared values
        float t[10];
        float tailSq = r*r;
        for (int k = 0; k < D-2; k++) {
            float invTail = inversesqrt(max(tailSq, EPS*EPS));
            t[k] = acos(clamp(z[k] * invTail, -1.0, 1.0));
            tailSq = max(tailSq - zSq[k], 0.0);
        }
        t[D-2] = atan(z[D-1], z[D-2]);

        // rp already computed by optimizedPow
        // Apply phase shifts to first two angles (theta, phi)
        float s0 = sin((t[0]+phaseT)*pwr), c0 = cos((t[0]+phaseT)*pwr);
        float s1 = sin((t[1]+phaseP)*pwr), c1 = cos((t[1]+phaseP)*pwr);
        z[0] = rp*c0 + c[0];
        float sp = rp*s0;
        z[1] = sp*c1 + c[1];
        sp *= s1;
        for (int k = 2; k < D-2; k++) {
            sp *= sin(t[k-1]*pwr);
            z[k] = sp*cos(t[k]*pwr) + c[k];
        }
        sp *= sin(t[D-3]*pwr);
        z[D-2] = sp*cos(t[D-2]*pwr) + c[D-2];
        z[D-1] = sp*sin(t[D-2]*pwr) + c[D-1];
        for (int k = D; k < 11; k++) z[k] = 0.0;
    }
    return max(0.5*log(max(r,EPS))*r/max(dr,EPS),EPS);
}
`;
