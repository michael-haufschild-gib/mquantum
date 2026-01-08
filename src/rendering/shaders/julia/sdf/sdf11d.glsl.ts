export const sdf11dBlock = `
// ============================================
// 11D Julia SDF - Array-based with inversesqrt optimization
// z = z^n + c where c is fixed Julia constant
// OPT-C1: inversesqrt in tail loop
// OPT-C3: Use optimizedPow for r^pwr and r^(pwr-1)
// OPT-C5: Defer orbit trap sqrt (minASq)
// OPT-PREC: mediump for orbit traps
// ============================================

float sdfJulia11D(vec3 pos, float pwr, float bail, int maxIt, out float trap) {
    float z[11];
    z[0] = uOrigin[0] + pos.x*uBasisX[0] + pos.y*uBasisY[0] + pos.z*uBasisZ[0];
    z[1] = uOrigin[1] + pos.x*uBasisX[1] + pos.y*uBasisY[1] + pos.z*uBasisZ[1];
    z[2] = uOrigin[2] + pos.x*uBasisX[2] + pos.y*uBasisY[2] + pos.z*uBasisZ[2];
    z[3] = uOrigin[3] + pos.x*uBasisX[3] + pos.y*uBasisY[3] + pos.z*uBasisZ[3];
    z[4] = uOrigin[4] + pos.x*uBasisX[4] + pos.y*uBasisY[4] + pos.z*uBasisZ[4];
    z[5] = uOrigin[5] + pos.x*uBasisX[5] + pos.y*uBasisY[5] + pos.z*uBasisZ[5];
    z[6] = uOrigin[6] + pos.x*uBasisX[6] + pos.y*uBasisY[6] + pos.z*uBasisZ[6];
    z[7] = uOrigin[7] + pos.x*uBasisX[7] + pos.y*uBasisY[7] + pos.z*uBasisZ[7];
    z[8] = uOrigin[8] + pos.x*uBasisX[8] + pos.y*uBasisY[8] + pos.z*uBasisZ[8];
    z[9] = uOrigin[9] + pos.x*uBasisX[9] + pos.y*uBasisY[9] + pos.z*uBasisZ[9];
    z[10] = uOrigin[10] + pos.x*uBasisX[10] + pos.y*uBasisY[10] + pos.z*uBasisZ[10];

    float c[11];
    c[0] = uJuliaConstant.x; c[1] = uJuliaConstant.y;
    c[2] = uJuliaConstant.z; c[3] = uJuliaConstant.w;
    c[4] = 0.0; c[5] = 0.0; c[6] = 0.0; c[7] = 0.0; c[8] = 0.0; c[9] = 0.0; c[10] = 0.0;

    float dr = 1.0, r = 0.0;
    mediump float minP = 1000.0, minASq = 1000000.0, minS = 1000.0;
    int escIt = 0;

    for (int i = 0; i < MAX_ITER_HQ; i++) {
        if (i >= maxIt) break;

        float z01_sq = z[0]*z[0] + z[1]*z[1];
        r = sqrt(z01_sq + z[2]*z[2] + z[3]*z[3] + z[4]*z[4] + z[5]*z[5] + z[6]*z[6] + z[7]*z[7] + z[8]*z[8] + z[9]*z[9] + z[10]*z[10]);
        if (r > bail) { escIt = i; break; }

        minP = min(minP, abs(z[1]));
        minASq = min(minASq, z01_sq);
        minS = min(minS, abs(r - 0.8));

        float rp, rpMinus1;
        optimizedPow(r, pwr, rp, rpMinus1);
        dr = pwr * rpMinus1 * dr;

        // 11D: 10 angles
        float t[10];
        float tailSq = r * r;
        for (int k = 0; k < 9; k++) {
            float invTail = inversesqrt(max(tailSq, EPS*EPS));
            t[k] = acos(clamp(z[k] * invTail, -1.0, 1.0));
            tailSq = max(tailSq - z[k]*z[k], 0.0);
        }
        t[9] = atan(z[10], z[9]);

        float s0 = sin(t[0] * pwr), c0 = cos(t[0] * pwr);
        float s1 = sin(t[1] * pwr), c1 = cos(t[1] * pwr);
        z[0] = rp * c0 + c[0];
        float sp = rp * s0;
        z[1] = sp * c1 + c[1];
        sp *= s1;
        for (int k = 2; k < 9; k++) {
            z[k] = sp * cos(t[k] * pwr) + c[k];
            sp *= sin(t[k] * pwr);
        }
        z[9] = sp * cos(t[9] * pwr) + c[9];
        z[10] = sp * sin(t[9] * pwr) + c[10];

        escIt = i;
    }

    float minA = sqrt(minASq);
    trap = exp(-minP * 5.0) * 0.3 + exp(-minA * 3.0) * 0.2 +
           exp(-minS * 8.0) * 0.2 + float(escIt) / float(max(maxIt, 1)) * 0.3;

    return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}

float sdfJulia11D_simple(vec3 pos, float pwr, float bail, int maxIt) {
    float z[11];
    z[0] = uOrigin[0] + pos.x*uBasisX[0] + pos.y*uBasisY[0] + pos.z*uBasisZ[0];
    z[1] = uOrigin[1] + pos.x*uBasisX[1] + pos.y*uBasisY[1] + pos.z*uBasisZ[1];
    z[2] = uOrigin[2] + pos.x*uBasisX[2] + pos.y*uBasisY[2] + pos.z*uBasisZ[2];
    z[3] = uOrigin[3] + pos.x*uBasisX[3] + pos.y*uBasisY[3] + pos.z*uBasisZ[3];
    z[4] = uOrigin[4] + pos.x*uBasisX[4] + pos.y*uBasisY[4] + pos.z*uBasisZ[4];
    z[5] = uOrigin[5] + pos.x*uBasisX[5] + pos.y*uBasisY[5] + pos.z*uBasisZ[5];
    z[6] = uOrigin[6] + pos.x*uBasisX[6] + pos.y*uBasisY[6] + pos.z*uBasisZ[6];
    z[7] = uOrigin[7] + pos.x*uBasisX[7] + pos.y*uBasisY[7] + pos.z*uBasisZ[7];
    z[8] = uOrigin[8] + pos.x*uBasisX[8] + pos.y*uBasisY[8] + pos.z*uBasisZ[8];
    z[9] = uOrigin[9] + pos.x*uBasisX[9] + pos.y*uBasisY[9] + pos.z*uBasisZ[9];
    z[10] = uOrigin[10] + pos.x*uBasisX[10] + pos.y*uBasisY[10] + pos.z*uBasisZ[10];

    float c[11];
    c[0] = uJuliaConstant.x; c[1] = uJuliaConstant.y;
    c[2] = uJuliaConstant.z; c[3] = uJuliaConstant.w;
    c[4] = 0.0; c[5] = 0.0; c[6] = 0.0; c[7] = 0.0; c[8] = 0.0; c[9] = 0.0; c[10] = 0.0;

    float dr = 1.0, r = 0.0;

    for (int i = 0; i < MAX_ITER_HQ; i++) {
        if (i >= maxIt) break;

        r = sqrt(z[0]*z[0] + z[1]*z[1] + z[2]*z[2] + z[3]*z[3] + z[4]*z[4] + z[5]*z[5] + z[6]*z[6] + z[7]*z[7] + z[8]*z[8] + z[9]*z[9] + z[10]*z[10]);
        if (r > bail) break;

        float rp, rpMinus1;
        optimizedPow(r, pwr, rp, rpMinus1);
        dr = pwr * rpMinus1 * dr;

        float t[10];
        float tailSq = r * r;
        for (int k = 0; k < 9; k++) {
            float invTail = inversesqrt(max(tailSq, EPS*EPS));
            t[k] = acos(clamp(z[k] * invTail, -1.0, 1.0));
            tailSq = max(tailSq - z[k]*z[k], 0.0);
        }
        t[9] = atan(z[10], z[9]);

        float s0 = sin(t[0] * pwr), c0 = cos(t[0] * pwr);
        float s1 = sin(t[1] * pwr), c1 = cos(t[1] * pwr);
        z[0] = rp * c0 + c[0];
        float sp = rp * s0;
        z[1] = sp * c1 + c[1];
        sp *= s1;
        for (int k = 2; k < 9; k++) {
            z[k] = sp * cos(t[k] * pwr) + c[k];
            sp *= sin(t[k] * pwr);
        }
        z[9] = sp * cos(t[9] * pwr) + c[9];
        z[10] = sp * sin(t[9] * pwr) + c[10];
    }

    return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}
`;
