export const sdf5dBlock = `
// ============================================
// 5D Hyperbulb - FULLY UNROLLED with rotated basis
// ============================================

float sdf5D(vec3 pos, float pwr, float bail, int maxIt, out float trap) {
    // Mandelbulb mode: z starts at c (sample point)
    float cx = uOrigin[0] + pos.x*uBasisX[0] + pos.y*uBasisY[0] + pos.z*uBasisZ[0];
    float cy = uOrigin[1] + pos.x*uBasisX[1] + pos.y*uBasisY[1] + pos.z*uBasisZ[1];
    float cz = uOrigin[2] + pos.x*uBasisX[2] + pos.y*uBasisY[2] + pos.z*uBasisZ[2];
    float c3 = uOrigin[3] + pos.x*uBasisX[3] + pos.y*uBasisY[3] + pos.z*uBasisZ[3];
    float c4 = uOrigin[4] + pos.x*uBasisX[4] + pos.y*uBasisY[4] + pos.z*uBasisZ[4];
    float zx = cx, zy = cy, zz = cz, z3 = c3, z4 = c4;
    float dr = 1.0, r = 0.0;
    float minP = 1000.0, minA = 1000.0, minS = 1000.0;
    int escIt = 0;

    // Pre-compute phase offsets
    float phaseT = uPhaseEnabled ? uPhaseTheta : 0.0;
    float phaseP = uPhaseEnabled ? uPhasePhi : 0.0;

    for (int i = 0; i < MAX_ITER_HQ; i++) {
        if (i >= maxIt) break;
        r = sqrt(zx*zx + zy*zy + zz*zz + z3*z3 + z4*z4);
        if (r > bail) { escIt = i; break; }
        minP = min(minP, abs(zy));
        minA = min(minA, sqrt(zx*zx + zy*zy));
        minS = min(minS, abs(r - 0.8));
        dr = pow(max(r, EPS), pwr - 1.0) * pwr * dr + 1.0;

        // 5D: 4 angles, z-axis primary (like Mandelbulb)
        float t0 = acos(clamp(zz / max(r, EPS), -1.0, 1.0));
        float r1 = sqrt(zx*zx + zy*zy + z3*z3 + z4*z4);
        float t1 = r1 > EPS ? acos(clamp(zx / max(r1, EPS), -1.0, 1.0)) : 0.0;
        float r2 = sqrt(zy*zy + z3*z3 + z4*z4);
        float t2 = r2 > EPS ? acos(clamp(zy / max(r2, EPS), -1.0, 1.0)) : 0.0;
        float t3 = atan(z4, z3);

        float rp = pow(max(r, EPS), pwr);
        float s0 = sin((t0+phaseT)*pwr), c0 = cos((t0+phaseT)*pwr);
        float s1 = sin((t1+phaseP)*pwr), c1 = cos((t1+phaseP)*pwr);
        float s2 = sin(t2*pwr), c2 = cos(t2*pwr);
        float s3 = sin(t3*pwr), c3_ = cos(t3*pwr);

        float sp = rp * s0 * s1 * s2;
        zz = rp * c0 + cz;
        zx = rp * s0 * c1 + cx;
        zy = rp * s0 * s1 * c2 + cy;
        z3 = sp * c3_ + c3;
        z4 = sp * s3 + c4;
        escIt = i;
    }

    trap = exp(-minP * 5.0) * 0.3 + exp(-minA * 3.0) * 0.2 + exp(-minS * 8.0) * 0.2 + float(escIt) / float(max(maxIt, 1)) * 0.3;
    return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}

float sdf5D_simple(vec3 pos, float pwr, float bail, int maxIt) {
    // Mandelbulb mode: z starts at c (sample point)
    float cx = uOrigin[0] + pos.x*uBasisX[0] + pos.y*uBasisY[0] + pos.z*uBasisZ[0];
    float cy = uOrigin[1] + pos.x*uBasisX[1] + pos.y*uBasisY[1] + pos.z*uBasisZ[1];
    float cz = uOrigin[2] + pos.x*uBasisX[2] + pos.y*uBasisY[2] + pos.z*uBasisZ[2];
    float c3 = uOrigin[3] + pos.x*uBasisX[3] + pos.y*uBasisY[3] + pos.z*uBasisZ[3];
    float c4 = uOrigin[4] + pos.x*uBasisX[4] + pos.y*uBasisY[4] + pos.z*uBasisZ[4];
    float zx = cx, zy = cy, zz = cz, z3 = c3, z4 = c4;
    float dr = 1.0, r = 0.0;
    float phaseT = uPhaseEnabled ? uPhaseTheta : 0.0;
    float phaseP = uPhaseEnabled ? uPhasePhi : 0.0;

    for (int i = 0; i < MAX_ITER_HQ; i++) {
        if (i >= maxIt) break;
        r = sqrt(zx*zx + zy*zy + zz*zz + z3*z3 + z4*z4);
        if (r > bail) break;
        dr = pow(max(r, EPS), pwr - 1.0) * pwr * dr + 1.0;

        float t0 = acos(clamp(zz / max(r, EPS), -1.0, 1.0));
        float r1 = sqrt(zx*zx + zy*zy + z3*z3 + z4*z4);
        float t1 = r1 > EPS ? acos(clamp(zx / max(r1, EPS), -1.0, 1.0)) : 0.0;
        float r2 = sqrt(zy*zy + z3*z3 + z4*z4);
        float t2 = r2 > EPS ? acos(clamp(zy / max(r2, EPS), -1.0, 1.0)) : 0.0;
        float t3 = atan(z4, z3);

        float rp = pow(max(r, EPS), pwr);
        float s0 = sin((t0+phaseT)*pwr), c0 = cos((t0+phaseT)*pwr);
        float s1 = sin((t1+phaseP)*pwr), c1 = cos((t1+phaseP)*pwr);
        float s2 = sin(t2*pwr), c2 = cos(t2*pwr);
        float s3 = sin(t3*pwr), c3_ = cos(t3*pwr);
        float sp = rp * s0 * s1 * s2;
        zz = rp * c0 + cz; zx = rp * s0 * c1 + cx; zy = rp * s0 * s1 * c2 + cy;
        z3 = sp * c3_ + c3; z4 = sp * s3 + c4;
    }
    return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}
`
