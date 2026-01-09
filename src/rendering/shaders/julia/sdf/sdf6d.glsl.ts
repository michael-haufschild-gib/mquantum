export const sdf6dBlock = `
// ============================================
// 6D Julia SDF - Hyperspherical Power Map
// z = z^n + c where z starts at sample point, c is Julia constant
// Same power formula as Mandelbulb but with fixed c
// OPT-LOOP: Hoist power check outside loop
// OPT-PWR2: Angle-doubling for power=2 (eliminates transcendentals)
// ============================================

float sdfJulia6D(vec3 pos, float pwr, float bail, int maxIt, out float trap) {
    // Map 3D position to 6D - z starts at sample point
    float zx = uOrigin[0] + pos.x*uBasisX[0] + pos.y*uBasisY[0] + pos.z*uBasisZ[0];
    float zy = uOrigin[1] + pos.x*uBasisX[1] + pos.y*uBasisY[1] + pos.z*uBasisZ[1];
    float zz = uOrigin[2] + pos.x*uBasisX[2] + pos.y*uBasisY[2] + pos.z*uBasisZ[2];
    float z3 = uOrigin[3] + pos.x*uBasisX[3] + pos.y*uBasisY[3] + pos.z*uBasisZ[3];
    float z4 = uOrigin[4] + pos.x*uBasisX[4] + pos.y*uBasisY[4] + pos.z*uBasisZ[4];
    float z5 = uOrigin[5] + pos.x*uBasisX[5] + pos.y*uBasisY[5] + pos.z*uBasisZ[5];

    // c is the fixed Julia constant
    float cx = uJuliaConstant.x, cy = uJuliaConstant.y;
    float cz = uJuliaConstant.z, c3 = uJuliaConstant.w;
    float c4 = 0.0, c5 = 0.0;

    float dr = 1.0, r = 0.0;
    mediump float minP = 1000.0, minASq = 1000000.0, minS = 1000.0;
    int escIt = 0;

    // OPT-LOOP: Hoist power check outside loop
    bool usePower2 = (int(pwr) == 2);

    for (int i = 0; i < MAX_ITER_HQ; i++) {
        if (i >= maxIt) break;

        // OPT-M1: Cache all squared values individually
        float zx_sq = zx*zx, zy_sq = zy*zy, zz_sq = zz*zz;
        float z3_sq = z3*z3, z4_sq = z4*z4, z5_sq = z5*z5;
        float zxzy_sq = zx_sq + zy_sq;
        float rSq = zxzy_sq + zz_sq + z3_sq + z4_sq + z5_sq;
        r = sqrt(rSq);
        if (r > bail) { escIt = i; break; }

        minP = min(minP, abs(zy));
        minASq = min(minASq, zxzy_sq);
        minS = min(minS, abs(r - 0.8));

        float rp, rpMinus1;
        optimizedPow(r, pwr, rp, rpMinus1);
        dr = pwr * rpMinus1 * dr;  // Julia: no +1.0 (c is constant)

        float s0, c0, s1, c1, s2, c2, s3, c3_, s4, c4_;

        if (usePower2) {
            // OPT-PWR2: Use angle-doubling identities to avoid transcendentals
            float tailSq = rSq;
            float invTail = inversesqrt(max(tailSq, EPS*EPS));
            float arg0 = clamp(zz * invTail, -1.0, 1.0);
            c0 = 2.0*arg0*arg0 - 1.0;
            s0 = 2.0*arg0*sqrt(max(1.0 - arg0*arg0, 0.0));
            tailSq = max(tailSq - zz_sq, 0.0);

            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float arg1 = clamp(zx * invTail, -1.0, 1.0);
            c1 = 2.0*arg1*arg1 - 1.0;
            s1 = 2.0*arg1*sqrt(max(1.0 - arg1*arg1, 0.0));
            tailSq = max(tailSq - zx_sq, 0.0);

            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float arg2 = clamp(zy * invTail, -1.0, 1.0);
            c2 = 2.0*arg2*arg2 - 1.0;
            s2 = 2.0*arg2*sqrt(max(1.0 - arg2*arg2, 0.0));
            tailSq = max(tailSq - zy_sq, 0.0);

            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float arg3 = clamp(z3 * invTail, -1.0, 1.0);
            c3_ = 2.0*arg3*arg3 - 1.0;
            s3 = 2.0*arg3*sqrt(max(1.0 - arg3*arg3, 0.0));

            // For atan: cos(2*atan(y,x)) = (x²-y²)/(x²+y²), sin = 2xy/(x²+y²)
            float den45 = max(z4_sq + z5_sq, EPS*EPS);
            float invDen45 = 1.0 / den45;
            c4_ = (z4_sq - z5_sq) * invDen45;
            s4 = 2.0 * z4 * z5 * invDen45;
        } else {
            // General power path using full trigonometry
            float tailSq = rSq;
            float invTail = inversesqrt(max(tailSq, EPS*EPS));
            float t0 = acos(clamp(zz * invTail, -1.0, 1.0)); tailSq = max(tailSq - zz_sq, 0.0);
            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float t1 = acos(clamp(zx * invTail, -1.0, 1.0)); tailSq = max(tailSq - zx_sq, 0.0);
            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float t2 = acos(clamp(zy * invTail, -1.0, 1.0)); tailSq = max(tailSq - zy_sq, 0.0);
            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float t3 = acos(clamp(z3 * invTail, -1.0, 1.0));
            float t4 = atan(z5, z4);

            s0 = sin(t0 * pwr); c0 = cos(t0 * pwr);
            s1 = sin(t1 * pwr); c1 = cos(t1 * pwr);
            s2 = sin(t2 * pwr); c2 = cos(t2 * pwr);
            s3 = sin(t3 * pwr); c3_ = cos(t3 * pwr);
            s4 = sin(t4 * pwr); c4_ = cos(t4 * pwr);
        }

        // Product chaining
        float p0 = rp, p1 = p0*s0, p2 = p1*s1, p3 = p2*s2, p4 = p3*s3;
        zz = p0*c0 + cz;
        zx = p1*c1 + cx;
        zy = p2*c2 + cy;
        z3 = p3*c3_ + c3;
        z4 = p4*c4_ + c4;
        z5 = p4*s4 + c5;

        escIt = i;
    }

    float minA = sqrt(minASq);
    trap = exp(-minP * 5.0) * 0.3 + exp(-minA * 3.0) * 0.2 +
           exp(-minS * 8.0) * 0.2 + float(escIt) / float(max(maxIt, 1)) * 0.3;

    return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}

float sdfJulia6D_simple(vec3 pos, float pwr, float bail, int maxIt) {
    float zx = uOrigin[0] + pos.x*uBasisX[0] + pos.y*uBasisY[0] + pos.z*uBasisZ[0];
    float zy = uOrigin[1] + pos.x*uBasisX[1] + pos.y*uBasisY[1] + pos.z*uBasisZ[1];
    float zz = uOrigin[2] + pos.x*uBasisX[2] + pos.y*uBasisY[2] + pos.z*uBasisZ[2];
    float z3 = uOrigin[3] + pos.x*uBasisX[3] + pos.y*uBasisY[3] + pos.z*uBasisZ[3];
    float z4 = uOrigin[4] + pos.x*uBasisX[4] + pos.y*uBasisY[4] + pos.z*uBasisZ[4];
    float z5 = uOrigin[5] + pos.x*uBasisX[5] + pos.y*uBasisY[5] + pos.z*uBasisZ[5];

    float cx = uJuliaConstant.x, cy = uJuliaConstant.y;
    float cz = uJuliaConstant.z, c3 = uJuliaConstant.w;
    float c4 = 0.0, c5 = 0.0;

    float dr = 1.0, r = 0.0;

    // OPT-LOOP: Hoist power check outside loop
    bool usePower2 = (int(pwr) == 2);

    for (int i = 0; i < MAX_ITER_HQ; i++) {
        if (i >= maxIt) break;

        // OPT-M1: Cache all squared values individually
        float zx_sq = zx*zx, zy_sq = zy*zy, zz_sq = zz*zz;
        float z3_sq = z3*z3, z4_sq = z4*z4, z5_sq = z5*z5;
        float rSq = zx_sq + zy_sq + zz_sq + z3_sq + z4_sq + z5_sq;
        r = sqrt(rSq);
        if (r > bail) break;

        float rp, rpMinus1;
        optimizedPow(r, pwr, rp, rpMinus1);
        dr = pwr * rpMinus1 * dr;

        float s0, c0, s1, c1, s2, c2, s3, c3_, s4, c4_;

        if (usePower2) {
            // OPT-PWR2: Angle-doubling for power=2
            float tailSq = rSq;
            float invTail = inversesqrt(max(tailSq, EPS*EPS));
            float arg0 = clamp(zz * invTail, -1.0, 1.0);
            c0 = 2.0*arg0*arg0 - 1.0;
            s0 = 2.0*arg0*sqrt(max(1.0 - arg0*arg0, 0.0));
            tailSq = max(tailSq - zz_sq, 0.0);

            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float arg1 = clamp(zx * invTail, -1.0, 1.0);
            c1 = 2.0*arg1*arg1 - 1.0;
            s1 = 2.0*arg1*sqrt(max(1.0 - arg1*arg1, 0.0));
            tailSq = max(tailSq - zx_sq, 0.0);

            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float arg2 = clamp(zy * invTail, -1.0, 1.0);
            c2 = 2.0*arg2*arg2 - 1.0;
            s2 = 2.0*arg2*sqrt(max(1.0 - arg2*arg2, 0.0));
            tailSq = max(tailSq - zy_sq, 0.0);

            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float arg3 = clamp(z3 * invTail, -1.0, 1.0);
            c3_ = 2.0*arg3*arg3 - 1.0;
            s3 = 2.0*arg3*sqrt(max(1.0 - arg3*arg3, 0.0));

            float den45 = max(z4_sq + z5_sq, EPS*EPS);
            float invDen45 = 1.0 / den45;
            c4_ = (z4_sq - z5_sq) * invDen45;
            s4 = 2.0 * z4 * z5 * invDen45;
        } else {
            // General power path
            float tailSq = rSq;
            float invTail = inversesqrt(max(tailSq, EPS*EPS));
            float t0 = acos(clamp(zz * invTail, -1.0, 1.0)); tailSq = max(tailSq - zz_sq, 0.0);
            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float t1 = acos(clamp(zx * invTail, -1.0, 1.0)); tailSq = max(tailSq - zx_sq, 0.0);
            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float t2 = acos(clamp(zy * invTail, -1.0, 1.0)); tailSq = max(tailSq - zy_sq, 0.0);
            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float t3 = acos(clamp(z3 * invTail, -1.0, 1.0));
            float t4 = atan(z5, z4);

            s0 = sin(t0 * pwr); c0 = cos(t0 * pwr);
            s1 = sin(t1 * pwr); c1 = cos(t1 * pwr);
            s2 = sin(t2 * pwr); c2 = cos(t2 * pwr);
            s3 = sin(t3 * pwr); c3_ = cos(t3 * pwr);
            s4 = sin(t4 * pwr); c4_ = cos(t4 * pwr);
        }

        float p0 = rp, p1 = p0*s0, p2 = p1*s1, p3 = p2*s2, p4 = p3*s3;
        zz = p0*c0 + cz;
        zx = p1*c1 + cx;
        zy = p2*c2 + cy;
        z3 = p3*c3_ + c3;
        z4 = p4*c4_ + c4;
        z5 = p4*s4 + c5;
    }

    return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}
`;
