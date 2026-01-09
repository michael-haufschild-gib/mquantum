export const sdf8dBlock = `
// ============================================
// 8D Julia SDF - Full Octonion
// Octonion power using hyperspherical representation
// o^n = |o|^n * (cos(n*theta) + sin(n*theta) * v_hat)
// OPT-LOOP: Hoist power check outside loop
// OPT-PWR2: Angle-doubling for power=2 (eliminates transcendentals)
// ============================================

float sdfJulia8D(vec3 pos, float pwr, float bail, int maxIt, out float trap) {
    float z0 = uOrigin[0] + pos.x*uBasisX[0] + pos.y*uBasisY[0] + pos.z*uBasisZ[0];
    float z1 = uOrigin[1] + pos.x*uBasisX[1] + pos.y*uBasisY[1] + pos.z*uBasisZ[1];
    float z2 = uOrigin[2] + pos.x*uBasisX[2] + pos.y*uBasisY[2] + pos.z*uBasisZ[2];
    float z3 = uOrigin[3] + pos.x*uBasisX[3] + pos.y*uBasisY[3] + pos.z*uBasisZ[3];
    float z4 = uOrigin[4] + pos.x*uBasisX[4] + pos.y*uBasisY[4] + pos.z*uBasisZ[4];
    float z5 = uOrigin[5] + pos.x*uBasisX[5] + pos.y*uBasisY[5] + pos.z*uBasisZ[5];
    float z6 = uOrigin[6] + pos.x*uBasisX[6] + pos.y*uBasisY[6] + pos.z*uBasisZ[6];
    float z7 = uOrigin[7] + pos.x*uBasisX[7] + pos.y*uBasisY[7] + pos.z*uBasisZ[7];

    float c0 = uJuliaConstant.x, c1 = uJuliaConstant.y;
    float c2 = uJuliaConstant.z, c3 = uJuliaConstant.w;
    float c4 = 0.0, c5 = 0.0, c6 = 0.0, c7 = 0.0;

    float dr = 1.0, r = 0.0;
    mediump float minP = 1000.0, minASq = 1000000.0, minS = 1000.0;
    int escIt = 0;

    // OPT-LOOP: Hoist power check outside loop
    bool usePower2 = (int(pwr) == 2);

    for (int i = 0; i < MAX_ITER_HQ; i++) {
        if (i >= maxIt) break;

        float z0_sq = z0*z0;
        float z01_sq = z0_sq + z1*z1;
        float vSq = z1*z1 + z2*z2 + z3*z3 + z4*z4 + z5*z5 + z6*z6 + z7*z7;
        float rSq = z0_sq + vSq;
        r = sqrt(rSq);
        if (r > bail) { escIt = i; break; }

        minP = min(minP, abs(z1));
        minASq = min(minASq, z01_sq);
        minS = min(minS, abs(r - 0.8));

        float rp, rpMinus1;
        optimizedPow(r, pwr, rp, rpMinus1);
        dr = pwr * rpMinus1 * dr;

        // Octonion power: o^n = |o|^n * (cos(n*theta) + sin(n*theta) * v_hat)
        // where v = (z1, z2, z3, z4, z5, z6, z7) is the imaginary part
        float vLen = sqrt(vSq);

        float new0, new1, new2, new3, new4, new5, new6, new7;
        if (vLen < EPS) {
            // Pure scalar octonion
            new0 = rp * (z0 >= 0.0 ? 1.0 : -1.0) + c0;
            new1 = c1; new2 = c2; new3 = c3;
            new4 = c4; new5 = c5; new6 = c6; new7 = c7;
        } else if (usePower2) {
            // OPT-PWR2: Angle-doubling for power=2
            // cos(2*theta) = 2*cos²(theta) - 1 where cos(theta) = z0/r
            // sin(2*theta) = 2*sin(theta)*cos(theta) where sin(theta) = vLen/r
            float invRSq = 1.0 / max(rSq, EPS*EPS);
            float cosNT = (2.0*z0_sq - rSq) * invRSq;  // 2*cos²(theta) - 1
            float sinNT = 2.0 * z0 * vLen * invRSq;    // 2*cos(theta)*sin(theta)
            float rn = rSq;  // r^2
            float scale = rn * sinNT / vLen;

            new0 = rn * cosNT + c0;
            new1 = scale * z1 + c1;
            new2 = scale * z2 + c2;
            new3 = scale * z3 + c3;
            new4 = scale * z4 + c4;
            new5 = scale * z5 + c5;
            new6 = scale * z6 + c6;
            new7 = scale * z7 + c7;
        } else {
            // General power path
            float theta = acos(clamp(z0 / max(r, EPS), -1.0, 1.0));
            float invVLen = 1.0 / vLen;
            float nTheta = pwr * theta;
            float cosNT = cos(nTheta);
            float sinNT = sin(nTheta);
            float scale = rp * sinNT * invVLen;

            new0 = rp * cosNT + c0;
            new1 = scale * z1 + c1;
            new2 = scale * z2 + c2;
            new3 = scale * z3 + c3;
            new4 = scale * z4 + c4;
            new5 = scale * z5 + c5;
            new6 = scale * z6 + c6;
            new7 = scale * z7 + c7;
        }

        z0 = new0; z1 = new1; z2 = new2; z3 = new3;
        z4 = new4; z5 = new5; z6 = new6; z7 = new7;
        escIt = i;
    }

    float minA = sqrt(minASq);
    trap = exp(-minP * 5.0) * 0.3 + exp(-minA * 3.0) * 0.2 +
           exp(-minS * 8.0) * 0.2 + float(escIt) / float(max(maxIt, 1)) * 0.3;

    return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}

float sdfJulia8D_simple(vec3 pos, float pwr, float bail, int maxIt) {
    float z0 = uOrigin[0] + pos.x*uBasisX[0] + pos.y*uBasisY[0] + pos.z*uBasisZ[0];
    float z1 = uOrigin[1] + pos.x*uBasisX[1] + pos.y*uBasisY[1] + pos.z*uBasisZ[1];
    float z2 = uOrigin[2] + pos.x*uBasisX[2] + pos.y*uBasisY[2] + pos.z*uBasisZ[2];
    float z3 = uOrigin[3] + pos.x*uBasisX[3] + pos.y*uBasisY[3] + pos.z*uBasisZ[3];
    float z4 = uOrigin[4] + pos.x*uBasisX[4] + pos.y*uBasisY[4] + pos.z*uBasisZ[4];
    float z5 = uOrigin[5] + pos.x*uBasisX[5] + pos.y*uBasisY[5] + pos.z*uBasisZ[5];
    float z6 = uOrigin[6] + pos.x*uBasisX[6] + pos.y*uBasisY[6] + pos.z*uBasisZ[6];
    float z7 = uOrigin[7] + pos.x*uBasisX[7] + pos.y*uBasisY[7] + pos.z*uBasisZ[7];

    float c0 = uJuliaConstant.x, c1 = uJuliaConstant.y;
    float c2 = uJuliaConstant.z, c3 = uJuliaConstant.w;
    float c4 = 0.0, c5 = 0.0, c6 = 0.0, c7 = 0.0;

    float dr = 1.0, r = 0.0;

    // OPT-LOOP: Hoist power check outside loop
    bool usePower2 = (int(pwr) == 2);

    for (int i = 0; i < MAX_ITER_HQ; i++) {
        if (i >= maxIt) break;

        float z0_sq = z0*z0;
        float vSq = z1*z1 + z2*z2 + z3*z3 + z4*z4 + z5*z5 + z6*z6 + z7*z7;
        float rSq = z0_sq + vSq;
        r = sqrt(rSq);
        if (r > bail) break;

        float rp, rpMinus1;
        optimizedPow(r, pwr, rp, rpMinus1);
        dr = pwr * rpMinus1 * dr;

        float vLen = sqrt(vSq);

        float new0, new1, new2, new3, new4, new5, new6, new7;
        if (vLen < EPS) {
            new0 = rp * (z0 >= 0.0 ? 1.0 : -1.0) + c0;
            new1 = c1; new2 = c2; new3 = c3;
            new4 = c4; new5 = c5; new6 = c6; new7 = c7;
        } else if (usePower2) {
            // OPT-PWR2: Angle-doubling for power=2
            float invRSq = 1.0 / max(rSq, EPS*EPS);
            float cosNT = (2.0*z0_sq - rSq) * invRSq;
            float sinNT = 2.0 * z0 * vLen * invRSq;
            float rn = rSq;
            float scale = rn * sinNT / vLen;

            new0 = rn * cosNT + c0;
            new1 = scale * z1 + c1;
            new2 = scale * z2 + c2;
            new3 = scale * z3 + c3;
            new4 = scale * z4 + c4;
            new5 = scale * z5 + c5;
            new6 = scale * z6 + c6;
            new7 = scale * z7 + c7;
        } else {
            // General power path
            float theta = acos(clamp(z0 / max(r, EPS), -1.0, 1.0));
            float invVLen = 1.0 / vLen;
            float nTheta = pwr * theta;
            float cosNT = cos(nTheta);
            float sinNT = sin(nTheta);
            float scale = rp * sinNT * invVLen;

            new0 = rp * cosNT + c0;
            new1 = scale * z1 + c1;
            new2 = scale * z2 + c2;
            new3 = scale * z3 + c3;
            new4 = scale * z4 + c4;
            new5 = scale * z5 + c5;
            new6 = scale * z6 + c6;
            new7 = scale * z7 + c7;
        }

        z0 = new0; z1 = new1; z2 = new2; z3 = new3;
        z4 = new4; z5 = new5; z6 = new6; z7 = new7;
    }

    return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}
`;
