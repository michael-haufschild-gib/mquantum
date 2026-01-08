export const sdf7dBlock = `
// ============================================
// 7D Julia SDF - Hyperspherical Power Map
// z = z^n + c where z starts at sample point, c is Julia constant
// Same power formula as Mandelbulb but with fixed c
// ============================================

float sdfJulia7D(vec3 pos, float pwr, float bail, int maxIt, out float trap) {
    // Map 3D position to 7D - z starts at sample point
    float zx = uOrigin[0] + pos.x*uBasisX[0] + pos.y*uBasisY[0] + pos.z*uBasisZ[0];
    float zy = uOrigin[1] + pos.x*uBasisX[1] + pos.y*uBasisY[1] + pos.z*uBasisZ[1];
    float zz = uOrigin[2] + pos.x*uBasisX[2] + pos.y*uBasisY[2] + pos.z*uBasisZ[2];
    float z3 = uOrigin[3] + pos.x*uBasisX[3] + pos.y*uBasisY[3] + pos.z*uBasisZ[3];
    float z4 = uOrigin[4] + pos.x*uBasisX[4] + pos.y*uBasisY[4] + pos.z*uBasisZ[4];
    float z5 = uOrigin[5] + pos.x*uBasisX[5] + pos.y*uBasisY[5] + pos.z*uBasisZ[5];
    float z6 = uOrigin[6] + pos.x*uBasisX[6] + pos.y*uBasisY[6] + pos.z*uBasisZ[6];

    // c is the fixed Julia constant
    float cx = uJuliaConstant.x, cy = uJuliaConstant.y;
    float cz = uJuliaConstant.z, c3 = uJuliaConstant.w;
    float c4 = 0.0, c5 = 0.0, c6 = 0.0;

    float dr = 1.0, r = 0.0;
    mediump float minP = 1000.0, minASq = 1000000.0, minS = 1000.0;
    int escIt = 0;

    for (int i = 0; i < MAX_ITER_HQ; i++) {
        if (i >= maxIt) break;

        // Cache squared values
        float zxzy_sq = zx*zx + zy*zy;
        float z56_sq = z5*z5 + z6*z6;
        float z456_sq = z4*z4 + z56_sq;
        float z3456_sq = z3*z3 + z456_sq;
        r = sqrt(zxzy_sq + zz*zz + z3456_sq);
        if (r > bail) { escIt = i; break; }

        minP = min(minP, abs(zy));
        minASq = min(minASq, zxzy_sq);
        minS = min(minS, abs(r - 0.8));

        float rp, rpMinus1;
        optimizedPow(r, pwr, rp, rpMinus1);
        dr = pwr * rpMinus1 * dr;  // Julia: no +1.0 (c is constant)

        // 7D hyperspherical: 6 angles, z-axis primary
        float t0 = acos(clamp(zz / max(r, EPS), -1.0, 1.0));
        float r1 = sqrt(zxzy_sq + z3456_sq);
        float t1 = r1 > EPS ? acos(clamp(zx / max(r1, EPS), -1.0, 1.0)) : 0.0;
        float r2 = sqrt(zy*zy + z3456_sq);
        float t2 = r2 > EPS ? acos(clamp(zy / max(r2, EPS), -1.0, 1.0)) : 0.0;
        float r3 = sqrt(z3456_sq);
        float t3 = r3 > EPS ? acos(clamp(z3 / max(r3, EPS), -1.0, 1.0)) : 0.0;
        float r4 = sqrt(z456_sq);
        float t4 = r4 > EPS ? acos(clamp(z4 / max(r4, EPS), -1.0, 1.0)) : 0.0;
        float t5 = atan(z6, z5);

        float s0 = sin(t0 * pwr), c0 = cos(t0 * pwr);
        float s1 = sin(t1 * pwr), c1 = cos(t1 * pwr);
        float s2 = sin(t2 * pwr), c2 = cos(t2 * pwr);
        float s3 = sin(t3 * pwr), c3_ = cos(t3 * pwr);
        float s4 = sin(t4 * pwr), c4_ = cos(t4 * pwr);
        float s5 = sin(t5 * pwr), c5_ = cos(t5 * pwr);

        // Product chaining
        float p0 = rp, p1 = p0*s0, p2 = p1*s1, p3 = p2*s2, p4 = p3*s3, p5 = p4*s4;
        zz = p0*c0 + cz;
        zx = p1*c1 + cx;
        zy = p2*c2 + cy;
        z3 = p3*c3_ + c3;
        z4 = p4*c4_ + c4;
        z5 = p5*c5_ + c5;
        z6 = p5*s5 + c6;

        escIt = i;
    }

    float minA = sqrt(minASq);
    trap = exp(-minP * 5.0) * 0.3 + exp(-minA * 3.0) * 0.2 +
           exp(-minS * 8.0) * 0.2 + float(escIt) / float(max(maxIt, 1)) * 0.3;

    return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}

float sdfJulia7D_simple(vec3 pos, float pwr, float bail, int maxIt) {
    float zx = uOrigin[0] + pos.x*uBasisX[0] + pos.y*uBasisY[0] + pos.z*uBasisZ[0];
    float zy = uOrigin[1] + pos.x*uBasisX[1] + pos.y*uBasisY[1] + pos.z*uBasisZ[1];
    float zz = uOrigin[2] + pos.x*uBasisX[2] + pos.y*uBasisY[2] + pos.z*uBasisZ[2];
    float z3 = uOrigin[3] + pos.x*uBasisX[3] + pos.y*uBasisY[3] + pos.z*uBasisZ[3];
    float z4 = uOrigin[4] + pos.x*uBasisX[4] + pos.y*uBasisY[4] + pos.z*uBasisZ[4];
    float z5 = uOrigin[5] + pos.x*uBasisX[5] + pos.y*uBasisY[5] + pos.z*uBasisZ[5];
    float z6 = uOrigin[6] + pos.x*uBasisX[6] + pos.y*uBasisY[6] + pos.z*uBasisZ[6];

    float cx = uJuliaConstant.x, cy = uJuliaConstant.y;
    float cz = uJuliaConstant.z, c3 = uJuliaConstant.w;
    float c4 = 0.0, c5 = 0.0, c6 = 0.0;

    float dr = 1.0, r = 0.0;

    for (int i = 0; i < MAX_ITER_HQ; i++) {
        if (i >= maxIt) break;

        float zxzy_sq = zx*zx + zy*zy;
        float z56_sq = z5*z5 + z6*z6;
        float z456_sq = z4*z4 + z56_sq;
        float z3456_sq = z3*z3 + z456_sq;
        r = sqrt(zxzy_sq + zz*zz + z3456_sq);
        if (r > bail) break;

        float rp, rpMinus1;
        optimizedPow(r, pwr, rp, rpMinus1);
        dr = pwr * rpMinus1 * dr;

        float t0 = acos(clamp(zz / max(r, EPS), -1.0, 1.0));
        float r1 = sqrt(zxzy_sq + z3456_sq);
        float t1 = r1 > EPS ? acos(clamp(zx / max(r1, EPS), -1.0, 1.0)) : 0.0;
        float r2 = sqrt(zy*zy + z3456_sq);
        float t2 = r2 > EPS ? acos(clamp(zy / max(r2, EPS), -1.0, 1.0)) : 0.0;
        float r3 = sqrt(z3456_sq);
        float t3 = r3 > EPS ? acos(clamp(z3 / max(r3, EPS), -1.0, 1.0)) : 0.0;
        float r4 = sqrt(z456_sq);
        float t4 = r4 > EPS ? acos(clamp(z4 / max(r4, EPS), -1.0, 1.0)) : 0.0;
        float t5 = atan(z6, z5);

        float s0 = sin(t0 * pwr), c0 = cos(t0 * pwr);
        float s1 = sin(t1 * pwr), c1 = cos(t1 * pwr);
        float s2 = sin(t2 * pwr), c2 = cos(t2 * pwr);
        float s3 = sin(t3 * pwr), c3_ = cos(t3 * pwr);
        float s4 = sin(t4 * pwr), c4_ = cos(t4 * pwr);
        float s5 = sin(t5 * pwr), c5_ = cos(t5 * pwr);

        float p0 = rp, p1 = p0*s0, p2 = p1*s1, p3 = p2*s2, p4 = p3*s3, p5 = p4*s4;
        zz = p0*c0 + cz;
        zx = p1*c1 + cx;
        zy = p2*c2 + cy;
        z3 = p3*c3_ + c3;
        z4 = p4*c4_ + c4;
        z5 = p5*c5_ + c5;
        z6 = p5*s5 + c6;
    }

    return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}
`;
