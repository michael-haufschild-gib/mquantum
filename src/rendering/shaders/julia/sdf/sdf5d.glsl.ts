export const sdf5dBlock = `
// ============================================
// 5D Julia SDF - Hyperspherical Power Map
// z = z^n + c where z starts at sample point, c is Julia constant
// Same power formula as Mandelbulb but with fixed c
// ============================================

float sdfJulia5D(vec3 pos, float pwr, float bail, int maxIt, out float trap) {
    // Map 3D position to 5D - z starts at sample point
    float zx = uOrigin[0] + pos.x*uBasisX[0] + pos.y*uBasisY[0] + pos.z*uBasisZ[0];
    float zy = uOrigin[1] + pos.x*uBasisX[1] + pos.y*uBasisY[1] + pos.z*uBasisZ[1];
    float zz = uOrigin[2] + pos.x*uBasisX[2] + pos.y*uBasisY[2] + pos.z*uBasisZ[2];
    float z3 = uOrigin[3] + pos.x*uBasisX[3] + pos.y*uBasisY[3] + pos.z*uBasisZ[3];
    float z4 = uOrigin[4] + pos.x*uBasisX[4] + pos.y*uBasisY[4] + pos.z*uBasisZ[4];

    // c is the fixed Julia constant
    float cx = uJuliaConstant.x, cy = uJuliaConstant.y;
    float cz = uJuliaConstant.z, c3 = uJuliaConstant.w;
    float c4 = 0.0;

    float dr = 1.0, r = 0.0;
    mediump float minP = 1000.0, minASq = 1000000.0, minS = 1000.0;
    int escIt = 0;

    for (int i = 0; i < MAX_ITER_HQ; i++) {
        if (i >= maxIt) break;

        // OPT-M1: Cache all squared values individually
        float zx_sq = zx*zx, zy_sq = zy*zy, zz_sq = zz*zz;
        float z3_sq = z3*z3, z4_sq = z4*z4;
        float zxzy_sq = zx_sq + zy_sq;
        float z34_sq = z3_sq + z4_sq;
        float rSq = zxzy_sq + zz_sq + z34_sq;
        r = sqrt(rSq);
        if (r > bail) { escIt = i; break; }

        minP = min(minP, abs(zy));
        minASq = min(minASq, zxzy_sq);
        minS = min(minS, abs(r - 0.8));

        float rp, rpMinus1;
        optimizedPow(r, pwr, rp, rpMinus1);
        dr = pwr * rpMinus1 * dr;  // Julia: no +1.0 (c is constant)

        // 5D hyperspherical: 4 angles using inversesqrt (avoids extra sqrt calls)
        float tailSq = rSq;
        float invTail = inversesqrt(max(tailSq, EPS*EPS));
        float t0 = acos(clamp(zz * invTail, -1.0, 1.0)); tailSq = max(tailSq - zz_sq, 0.0);
        invTail = inversesqrt(max(tailSq, EPS*EPS));
        float t1 = acos(clamp(zx * invTail, -1.0, 1.0)); tailSq = max(tailSq - zx_sq, 0.0);
        invTail = inversesqrt(max(tailSq, EPS*EPS));
        float t2 = acos(clamp(zy * invTail, -1.0, 1.0));
        float t3 = atan(z4, z3);

        float s0 = sin(t0 * pwr), c0 = cos(t0 * pwr);
        float s1 = sin(t1 * pwr), c1 = cos(t1 * pwr);
        float s2 = sin(t2 * pwr), c2 = cos(t2 * pwr);
        float s3 = sin(t3 * pwr), c3_ = cos(t3 * pwr);

        // Product chaining
        float p0 = rp, p1 = p0*s0, p2 = p1*s1, p3 = p2*s2;
        zz = p0*c0 + cz;
        zx = p1*c1 + cx;
        zy = p2*c2 + cy;
        z3 = p3*c3_ + c3;
        z4 = p3*s3 + c4;

        escIt = i;
    }

    float minA = sqrt(minASq);
    trap = exp(-minP * 5.0) * 0.3 + exp(-minA * 3.0) * 0.2 +
           exp(-minS * 8.0) * 0.2 + float(escIt) / float(max(maxIt, 1)) * 0.3;

    return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}

float sdfJulia5D_simple(vec3 pos, float pwr, float bail, int maxIt) {
    float zx = uOrigin[0] + pos.x*uBasisX[0] + pos.y*uBasisY[0] + pos.z*uBasisZ[0];
    float zy = uOrigin[1] + pos.x*uBasisX[1] + pos.y*uBasisY[1] + pos.z*uBasisZ[1];
    float zz = uOrigin[2] + pos.x*uBasisX[2] + pos.y*uBasisY[2] + pos.z*uBasisZ[2];
    float z3 = uOrigin[3] + pos.x*uBasisX[3] + pos.y*uBasisY[3] + pos.z*uBasisZ[3];
    float z4 = uOrigin[4] + pos.x*uBasisX[4] + pos.y*uBasisY[4] + pos.z*uBasisZ[4];

    float cx = uJuliaConstant.x, cy = uJuliaConstant.y;
    float cz = uJuliaConstant.z, c3 = uJuliaConstant.w;
    float c4 = 0.0;

    float dr = 1.0, r = 0.0;

    for (int i = 0; i < MAX_ITER_HQ; i++) {
        if (i >= maxIt) break;

        // OPT-M1: Cache all squared values individually
        float zx_sq = zx*zx, zy_sq = zy*zy, zz_sq = zz*zz;
        float z3_sq = z3*z3, z4_sq = z4*z4;
        float rSq = zx_sq + zy_sq + zz_sq + z3_sq + z4_sq;
        r = sqrt(rSq);
        if (r > bail) break;

        float rp, rpMinus1;
        optimizedPow(r, pwr, rp, rpMinus1);
        dr = pwr * rpMinus1 * dr;

        // 5D hyperspherical using inversesqrt (avoids extra sqrt calls)
        float tailSq = rSq;
        float invTail = inversesqrt(max(tailSq, EPS*EPS));
        float t0 = acos(clamp(zz * invTail, -1.0, 1.0)); tailSq = max(tailSq - zz_sq, 0.0);
        invTail = inversesqrt(max(tailSq, EPS*EPS));
        float t1 = acos(clamp(zx * invTail, -1.0, 1.0)); tailSq = max(tailSq - zx_sq, 0.0);
        invTail = inversesqrt(max(tailSq, EPS*EPS));
        float t2 = acos(clamp(zy * invTail, -1.0, 1.0));
        float t3 = atan(z4, z3);

        float s0 = sin(t0 * pwr), c0 = cos(t0 * pwr);
        float s1 = sin(t1 * pwr), c1 = cos(t1 * pwr);
        float s2 = sin(t2 * pwr), c2 = cos(t2 * pwr);
        float s3 = sin(t3 * pwr), c3_ = cos(t3 * pwr);

        float p0 = rp, p1 = p0*s0, p2 = p1*s1, p3 = p2*s2;
        zz = p0*c0 + cz;
        zx = p1*c1 + cx;
        zy = p2*c2 + cy;
        z3 = p3*c3_ + c3;
        z4 = p3*s3 + c4;
    }

    return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}
`;
