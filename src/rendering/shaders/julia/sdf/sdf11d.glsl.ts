export const sdf11dBlock = `
// ============================================
// 11D Julia SDF - Hyperspherical Power Map
// z = z^n + c where z starts at sample point, c is Julia constant
// Same power formula as Mandelbulb but with fixed c
// OPT-LOOP: Hoist power check outside loop
// OPT-PWR2: Angle-doubling for power=2 (eliminates transcendentals)
// ============================================

float sdfJulia11D(vec3 pos, float pwr, float bail, int maxIt, out float trap) {
    // 11D initialization - z starts at sample point
    float z0 = uOrigin[0] + pos.x*uBasisX[0] + pos.y*uBasisY[0] + pos.z*uBasisZ[0];
    float z1 = uOrigin[1] + pos.x*uBasisX[1] + pos.y*uBasisY[1] + pos.z*uBasisZ[1];
    float z2 = uOrigin[2] + pos.x*uBasisX[2] + pos.y*uBasisY[2] + pos.z*uBasisZ[2];
    float z3 = uOrigin[3] + pos.x*uBasisX[3] + pos.y*uBasisY[3] + pos.z*uBasisZ[3];
    float z4 = uOrigin[4] + pos.x*uBasisX[4] + pos.y*uBasisY[4] + pos.z*uBasisZ[4];
    float z5 = uOrigin[5] + pos.x*uBasisX[5] + pos.y*uBasisY[5] + pos.z*uBasisZ[5];
    float z6 = uOrigin[6] + pos.x*uBasisX[6] + pos.y*uBasisY[6] + pos.z*uBasisZ[6];
    float z7 = uOrigin[7] + pos.x*uBasisX[7] + pos.y*uBasisY[7] + pos.z*uBasisZ[7];
    float z8 = uOrigin[8] + pos.x*uBasisX[8] + pos.y*uBasisY[8] + pos.z*uBasisZ[8];
    float z9 = uOrigin[9] + pos.x*uBasisX[9] + pos.y*uBasisY[9] + pos.z*uBasisZ[9];
    float z10 = uOrigin[10] + pos.x*uBasisX[10] + pos.y*uBasisY[10] + pos.z*uBasisZ[10];

    // c is the fixed Julia constant
    float c0 = uJuliaConstant.x, c1 = uJuliaConstant.y;
    float c2 = uJuliaConstant.z, c3 = uJuliaConstant.w;
    float c4 = 0.0, c5 = 0.0, c6 = 0.0, c7 = 0.0;
    float c8 = 0.0, c9 = 0.0, c10 = 0.0;

    float dr = 1.0, r = 0.0;
    mediump float minP = 1000.0, minASq = 1000000.0, minS = 1000.0;
    int escIt = 0;

    // OPT-LOOP: Hoist power check outside loop
    bool usePower2 = (int(pwr) == 2);

    for (int i = 0; i < MAX_ITER_HQ; i++) {
        if (i >= maxIt) break;

        // Cache all squared terms and save rSq to avoid recomputing r*r
        float z0_sq = z0*z0, z1_sq = z1*z1, z2_sq = z2*z2, z3_sq = z3*z3, z4_sq = z4*z4;
        float z5_sq = z5*z5, z6_sq = z6*z6, z7_sq = z7*z7, z8_sq = z8*z8, z9_sq = z9*z9, z10_sq = z10*z10;
        float z01_sq = z0_sq + z1_sq;
        float rSq = z01_sq + z2_sq + z3_sq + z4_sq + z5_sq + z6_sq + z7_sq + z8_sq + z9_sq + z10_sq;
        r = sqrt(rSq);
        if (r > bail) { escIt = i; break; }

        minP = min(minP, abs(z1));
        minASq = min(minASq, z01_sq);
        minS = min(minS, abs(r - 0.8));

        float rp, rpMinus1;
        optimizedPow(r, pwr, rp, rpMinus1);
        dr = pwr * rpMinus1 * dr;  // Julia: no +1.0 (c is constant)

        float s0, c0_, s1, c1_, s2, c2_, s3, c3_, s4, c4_;
        float s5, c5_, s6, c6_, s7, c7_, s8, c8_, s9, c9_;

        if (usePower2) {
            // OPT-PWR2: Use angle-doubling identities to avoid transcendentals
            // cos(2*acos(x)) = 2x² - 1, sin(2*acos(x)) = 2x*sqrt(1-x²)
            float tailSq = rSq;
            float invTail = inversesqrt(max(tailSq, EPS*EPS));
            float arg0 = clamp(z0 * invTail, -1.0, 1.0);
            c0_ = 2.0*arg0*arg0 - 1.0;
            s0 = 2.0*arg0*sqrt(max(1.0 - arg0*arg0, 0.0));
            tailSq = max(tailSq - z0_sq, 0.0);

            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float arg1 = clamp(z1 * invTail, -1.0, 1.0);
            c1_ = 2.0*arg1*arg1 - 1.0;
            s1 = 2.0*arg1*sqrt(max(1.0 - arg1*arg1, 0.0));
            tailSq = max(tailSq - z1_sq, 0.0);

            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float arg2 = clamp(z2 * invTail, -1.0, 1.0);
            c2_ = 2.0*arg2*arg2 - 1.0;
            s2 = 2.0*arg2*sqrt(max(1.0 - arg2*arg2, 0.0));
            tailSq = max(tailSq - z2_sq, 0.0);

            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float arg3 = clamp(z3 * invTail, -1.0, 1.0);
            c3_ = 2.0*arg3*arg3 - 1.0;
            s3 = 2.0*arg3*sqrt(max(1.0 - arg3*arg3, 0.0));
            tailSq = max(tailSq - z3_sq, 0.0);

            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float arg4 = clamp(z4 * invTail, -1.0, 1.0);
            c4_ = 2.0*arg4*arg4 - 1.0;
            s4 = 2.0*arg4*sqrt(max(1.0 - arg4*arg4, 0.0));
            tailSq = max(tailSq - z4_sq, 0.0);

            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float arg5 = clamp(z5 * invTail, -1.0, 1.0);
            c5_ = 2.0*arg5*arg5 - 1.0;
            s5 = 2.0*arg5*sqrt(max(1.0 - arg5*arg5, 0.0));
            tailSq = max(tailSq - z5_sq, 0.0);

            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float arg6 = clamp(z6 * invTail, -1.0, 1.0);
            c6_ = 2.0*arg6*arg6 - 1.0;
            s6 = 2.0*arg6*sqrt(max(1.0 - arg6*arg6, 0.0));
            tailSq = max(tailSq - z6_sq, 0.0);

            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float arg7 = clamp(z7 * invTail, -1.0, 1.0);
            c7_ = 2.0*arg7*arg7 - 1.0;
            s7 = 2.0*arg7*sqrt(max(1.0 - arg7*arg7, 0.0));
            tailSq = max(tailSq - z7_sq, 0.0);

            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float arg8 = clamp(z8 * invTail, -1.0, 1.0);
            c8_ = 2.0*arg8*arg8 - 1.0;
            s8 = 2.0*arg8*sqrt(max(1.0 - arg8*arg8, 0.0));

            // For atan: cos(2*atan(y,x)) = (x²-y²)/(x²+y²), sin = 2xy/(x²+y²)
            float den910 = max(z9_sq + z10_sq, EPS*EPS);
            float invDen910 = 1.0 / den910;
            c9_ = (z9_sq - z10_sq) * invDen910;
            s9 = 2.0 * z9 * z10 * invDen910;
        } else {
            // General power path using full trigonometry
            float tailSq = rSq;
            float invTail = inversesqrt(max(tailSq, EPS*EPS));
            float t0 = acos(clamp(z0 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z0_sq, 0.0);
            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float t1 = acos(clamp(z1 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z1_sq, 0.0);
            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float t2 = acos(clamp(z2 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z2_sq, 0.0);
            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float t3 = acos(clamp(z3 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z3_sq, 0.0);
            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float t4 = acos(clamp(z4 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z4_sq, 0.0);
            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float t5 = acos(clamp(z5 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z5_sq, 0.0);
            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float t6 = acos(clamp(z6 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z6_sq, 0.0);
            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float t7 = acos(clamp(z7 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z7_sq, 0.0);
            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float t8 = acos(clamp(z8 * invTail, -1.0, 1.0));
            float t9 = atan(z10, z9);

            s0 = sin(t0 * pwr); c0_ = cos(t0 * pwr);
            s1 = sin(t1 * pwr); c1_ = cos(t1 * pwr);
            s2 = sin(t2 * pwr); c2_ = cos(t2 * pwr);
            s3 = sin(t3 * pwr); c3_ = cos(t3 * pwr);
            s4 = sin(t4 * pwr); c4_ = cos(t4 * pwr);
            s5 = sin(t5 * pwr); c5_ = cos(t5 * pwr);
            s6 = sin(t6 * pwr); c6_ = cos(t6 * pwr);
            s7 = sin(t7 * pwr); c7_ = cos(t7 * pwr);
            s8 = sin(t8 * pwr); c8_ = cos(t8 * pwr);
            s9 = sin(t9 * pwr); c9_ = cos(t9 * pwr);
        }

        z0 = rp * c0_ + c0;
        float sp = rp * s0;
        z1 = sp * c1_ + c1; sp *= s1;
        z2 = sp * c2_ + c2; sp *= s2;
        z3 = sp * c3_ + c3; sp *= s3;
        z4 = sp * c4_ + c4; sp *= s4;
        z5 = sp * c5_ + c5; sp *= s5;
        z6 = sp * c6_ + c6; sp *= s6;
        z7 = sp * c7_ + c7; sp *= s7;
        z8 = sp * c8_ + c8; sp *= s8;
        z9 = sp * c9_ + c9;
        z10 = sp * s9 + c10;

        escIt = i;
    }

    float minA = sqrt(minASq);
    trap = exp(-minP * 5.0) * 0.3 + exp(-minA * 3.0) * 0.2 +
           exp(-minS * 8.0) * 0.2 + float(escIt) / float(max(maxIt, 1)) * 0.3;

    return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}

float sdfJulia11D_simple(vec3 pos, float pwr, float bail, int maxIt) {
    float z0 = uOrigin[0] + pos.x*uBasisX[0] + pos.y*uBasisY[0] + pos.z*uBasisZ[0];
    float z1 = uOrigin[1] + pos.x*uBasisX[1] + pos.y*uBasisY[1] + pos.z*uBasisZ[1];
    float z2 = uOrigin[2] + pos.x*uBasisX[2] + pos.y*uBasisY[2] + pos.z*uBasisZ[2];
    float z3 = uOrigin[3] + pos.x*uBasisX[3] + pos.y*uBasisY[3] + pos.z*uBasisZ[3];
    float z4 = uOrigin[4] + pos.x*uBasisX[4] + pos.y*uBasisY[4] + pos.z*uBasisZ[4];
    float z5 = uOrigin[5] + pos.x*uBasisX[5] + pos.y*uBasisY[5] + pos.z*uBasisZ[5];
    float z6 = uOrigin[6] + pos.x*uBasisX[6] + pos.y*uBasisY[6] + pos.z*uBasisZ[6];
    float z7 = uOrigin[7] + pos.x*uBasisX[7] + pos.y*uBasisY[7] + pos.z*uBasisZ[7];
    float z8 = uOrigin[8] + pos.x*uBasisX[8] + pos.y*uBasisY[8] + pos.z*uBasisZ[8];
    float z9 = uOrigin[9] + pos.x*uBasisX[9] + pos.y*uBasisY[9] + pos.z*uBasisZ[9];
    float z10 = uOrigin[10] + pos.x*uBasisX[10] + pos.y*uBasisY[10] + pos.z*uBasisZ[10];

    float c0 = uJuliaConstant.x, c1 = uJuliaConstant.y;
    float c2 = uJuliaConstant.z, c3 = uJuliaConstant.w;
    float c4 = 0.0, c5 = 0.0, c6 = 0.0, c7 = 0.0;
    float c8 = 0.0, c9 = 0.0, c10 = 0.0;

    float dr = 1.0, r = 0.0;

    // OPT-LOOP: Hoist power check outside loop
    bool usePower2 = (int(pwr) == 2);

    for (int i = 0; i < MAX_ITER_HQ; i++) {
        if (i >= maxIt) break;

        // Cache all squared terms and save rSq to avoid recomputing r*r
        float z0_sq = z0*z0, z1_sq = z1*z1, z2_sq = z2*z2, z3_sq = z3*z3, z4_sq = z4*z4;
        float z5_sq = z5*z5, z6_sq = z6*z6, z7_sq = z7*z7, z8_sq = z8*z8, z9_sq = z9*z9, z10_sq = z10*z10;
        float rSq = z0_sq + z1_sq + z2_sq + z3_sq + z4_sq + z5_sq + z6_sq + z7_sq + z8_sq + z9_sq + z10_sq;
        r = sqrt(rSq);
        if (r > bail) break;

        float rp, rpMinus1;
        optimizedPow(r, pwr, rp, rpMinus1);
        dr = pwr * rpMinus1 * dr;

        float s0, c0_, s1, c1_, s2, c2_, s3, c3_, s4, c4_;
        float s5, c5_, s6, c6_, s7, c7_, s8, c8_, s9, c9_;

        if (usePower2) {
            // OPT-PWR2: Angle-doubling for power=2
            float tailSq = rSq;
            float invTail = inversesqrt(max(tailSq, EPS*EPS));
            float arg0 = clamp(z0 * invTail, -1.0, 1.0);
            c0_ = 2.0*arg0*arg0 - 1.0;
            s0 = 2.0*arg0*sqrt(max(1.0 - arg0*arg0, 0.0));
            tailSq = max(tailSq - z0_sq, 0.0);

            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float arg1 = clamp(z1 * invTail, -1.0, 1.0);
            c1_ = 2.0*arg1*arg1 - 1.0;
            s1 = 2.0*arg1*sqrt(max(1.0 - arg1*arg1, 0.0));
            tailSq = max(tailSq - z1_sq, 0.0);

            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float arg2 = clamp(z2 * invTail, -1.0, 1.0);
            c2_ = 2.0*arg2*arg2 - 1.0;
            s2 = 2.0*arg2*sqrt(max(1.0 - arg2*arg2, 0.0));
            tailSq = max(tailSq - z2_sq, 0.0);

            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float arg3 = clamp(z3 * invTail, -1.0, 1.0);
            c3_ = 2.0*arg3*arg3 - 1.0;
            s3 = 2.0*arg3*sqrt(max(1.0 - arg3*arg3, 0.0));
            tailSq = max(tailSq - z3_sq, 0.0);

            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float arg4 = clamp(z4 * invTail, -1.0, 1.0);
            c4_ = 2.0*arg4*arg4 - 1.0;
            s4 = 2.0*arg4*sqrt(max(1.0 - arg4*arg4, 0.0));
            tailSq = max(tailSq - z4_sq, 0.0);

            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float arg5 = clamp(z5 * invTail, -1.0, 1.0);
            c5_ = 2.0*arg5*arg5 - 1.0;
            s5 = 2.0*arg5*sqrt(max(1.0 - arg5*arg5, 0.0));
            tailSq = max(tailSq - z5_sq, 0.0);

            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float arg6 = clamp(z6 * invTail, -1.0, 1.0);
            c6_ = 2.0*arg6*arg6 - 1.0;
            s6 = 2.0*arg6*sqrt(max(1.0 - arg6*arg6, 0.0));
            tailSq = max(tailSq - z6_sq, 0.0);

            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float arg7 = clamp(z7 * invTail, -1.0, 1.0);
            c7_ = 2.0*arg7*arg7 - 1.0;
            s7 = 2.0*arg7*sqrt(max(1.0 - arg7*arg7, 0.0));
            tailSq = max(tailSq - z7_sq, 0.0);

            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float arg8 = clamp(z8 * invTail, -1.0, 1.0);
            c8_ = 2.0*arg8*arg8 - 1.0;
            s8 = 2.0*arg8*sqrt(max(1.0 - arg8*arg8, 0.0));

            float den910 = max(z9_sq + z10_sq, EPS*EPS);
            float invDen910 = 1.0 / den910;
            c9_ = (z9_sq - z10_sq) * invDen910;
            s9 = 2.0 * z9 * z10 * invDen910;
        } else {
            // General power path
            float tailSq = rSq;
            float invTail = inversesqrt(max(tailSq, EPS*EPS));
            float t0 = acos(clamp(z0 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z0_sq, 0.0);
            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float t1 = acos(clamp(z1 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z1_sq, 0.0);
            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float t2 = acos(clamp(z2 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z2_sq, 0.0);
            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float t3 = acos(clamp(z3 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z3_sq, 0.0);
            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float t4 = acos(clamp(z4 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z4_sq, 0.0);
            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float t5 = acos(clamp(z5 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z5_sq, 0.0);
            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float t6 = acos(clamp(z6 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z6_sq, 0.0);
            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float t7 = acos(clamp(z7 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z7_sq, 0.0);
            invTail = inversesqrt(max(tailSq, EPS*EPS));
            float t8 = acos(clamp(z8 * invTail, -1.0, 1.0));
            float t9 = atan(z10, z9);

            s0 = sin(t0 * pwr); c0_ = cos(t0 * pwr);
            s1 = sin(t1 * pwr); c1_ = cos(t1 * pwr);
            s2 = sin(t2 * pwr); c2_ = cos(t2 * pwr);
            s3 = sin(t3 * pwr); c3_ = cos(t3 * pwr);
            s4 = sin(t4 * pwr); c4_ = cos(t4 * pwr);
            s5 = sin(t5 * pwr); c5_ = cos(t5 * pwr);
            s6 = sin(t6 * pwr); c6_ = cos(t6 * pwr);
            s7 = sin(t7 * pwr); c7_ = cos(t7 * pwr);
            s8 = sin(t8 * pwr); c8_ = cos(t8 * pwr);
            s9 = sin(t9 * pwr); c9_ = cos(t9 * pwr);
        }

        z0 = rp * c0_ + c0;
        float sp = rp * s0;
        z1 = sp * c1_ + c1; sp *= s1;
        z2 = sp * c2_ + c2; sp *= s2;
        z3 = sp * c3_ + c3; sp *= s3;
        z4 = sp * c4_ + c4; sp *= s4;
        z5 = sp * c5_ + c5; sp *= s5;
        z6 = sp * c6_ + c6; sp *= s6;
        z7 = sp * c7_ + c7; sp *= s7;
        z8 = sp * c8_ + c8; sp *= s8;
        z9 = sp * c9_ + c9;
        z10 = sp * s9 + c10;
    }

    return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}
`
