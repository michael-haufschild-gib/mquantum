export const sdf4dBlock = `
// ============================================
// Quaternion Julia SDF - 4D (full quaternion with w from basis)
// z = z^n + c where c is Julia constant
// OPT-C3: Use optimizedPow for derivative
// OPT-C5: Defer orbit trap sqrt (minAxisSq)
// OPT-M1: Cache squared components for r and orbit traps
// OPT-LOOP: Hoist power check outside loop
// OPT-PREC: mediump for orbit traps
// ============================================

float sdfJulia4D(vec3 pos, float pwr, float bail, int maxIt, out float trap) {
    // Map 3D position to 4D quaternion via basis transformation
    float px = uOrigin[0] + pos.x*uBasisX[0] + pos.y*uBasisY[0] + pos.z*uBasisZ[0];
    float py = uOrigin[1] + pos.x*uBasisX[1] + pos.y*uBasisY[1] + pos.z*uBasisZ[1];
    float pz = uOrigin[2] + pos.x*uBasisX[2] + pos.y*uBasisY[2] + pos.z*uBasisZ[2];
    float pw = uOrigin[3] + pos.x*uBasisX[3] + pos.y*uBasisY[3] + pos.z*uBasisZ[3];

    // z starts at sample position
    float zx = px, zy = py, zz = pz, zw = pw;

    // c is the fixed Julia constant
    float cx = uJuliaConstant.x;
    float cy = uJuliaConstant.y;
    float cz = uJuliaConstant.z;
    float cw = uJuliaConstant.w;

    float dr = 1.0;
    float r = 0.0;

    // Orbit traps - OPT-C5: minAxisSq instead of minAxis
    // OPT-PREC: mediump sufficient for coloring data
    mediump float minPlane = 1000.0, minAxisSq = 1000000.0, minSphere = 1000.0;
    int escIt = 0;

    // OPT-LOOP: Hoist power check outside loop
    int intPwr = int(pwr);
    bool usePower2 = (intPwr == 2);
    bool usePower3 = (intPwr == 3);
    bool usePower4 = (intPwr == 4);

    for (int i = 0; i < MAX_ITER_HQ; i++) {
        if (i >= maxIt) break;

        // OPT-M1: Cache squared components for both r calculation and orbit traps
        float zx_sq = zx * zx;
        float zy_sq = zy * zy;
        float zz_sq = zz * zz;
        float zw_sq = zw * zw;
        float zxy_sq = zx_sq + zy_sq;

        r = sqrt(zxy_sq + zz_sq + zw_sq);
        if (r > bail) { escIt = i; break; }

        // Orbit traps - OPT-C5: Track squared for minAxis
        minPlane = min(minPlane, abs(zy));
        minAxisSq = min(minAxisSq, zxy_sq);
        minSphere = min(minSphere, abs(r - 0.8));

        // OPT-C3: Use optimizedPow for derivative calculation
        float rPow, rPowMinus1;
        optimizedPow(r, pwr, rPow, rPowMinus1);

        // Derivative update for Julia: dr = n * r^(n-1) * dr
        dr = pwr * rPowMinus1 * dr;

        // Julia iteration: z = z^n + c
        // OPT-LOOP: Use pre-computed power flags with inlined quaternion math
        if (usePower2) {
            // Inline quatSqr for power 2 (most common)
            float newX = zx_sq - zy_sq - zz_sq - zw_sq;
            float newY = 2.0 * zx * zy;
            float newZ = 2.0 * zx * zz;
            float newW = 2.0 * zx * zw;
            zx = newX + cx;
            zy = newY + cy;
            zz = newZ + cz;
            zw = newW + cw;
        } else if (usePower3) {
            // z^3 = z^2 * z (inline for performance)
            float sqX = zx_sq - zy_sq - zz_sq - zw_sq;
            float sqY = 2.0 * zx * zy;
            float sqZ = 2.0 * zx * zz;
            float sqW = 2.0 * zx * zw;
            // quatMul(sq, z)
            float newX = sqX * zx - sqY * zy - sqZ * zz - sqW * zw;
            float newY = sqX * zy + sqY * zx + sqZ * zw - sqW * zz;
            float newZ = sqX * zz - sqY * zw + sqZ * zx + sqW * zy;
            float newW = sqX * zw + sqY * zz - sqZ * zy + sqW * zx;
            zx = newX + cx;
            zy = newY + cy;
            zz = newZ + cz;
            zw = newW + cw;
        } else if (usePower4) {
            // z^4 = (z^2)^2 (inline for performance)
            float sqX = zx_sq - zy_sq - zz_sq - zw_sq;
            float sqY = 2.0 * zx * zy;
            float sqZ = 2.0 * zx * zz;
            float sqW = 2.0 * zx * zw;
            // quatSqr(sq)
            float sq2X = sqX * sqX;
            float sq2Y = sqY * sqY;
            float sq2Z = sqZ * sqZ;
            float sq2W = sqW * sqW;
            zx = sq2X - sq2Y - sq2Z - sq2W + cx;
            zy = 2.0 * sqX * sqY + cy;
            zz = 2.0 * sqX * sqZ + cz;
            zw = 2.0 * sqX * sqW + cw;
        } else {
            // General power using quatPow
            vec4 zVec = quatPow(vec4(zx, zy, zz, zw), pwr);
            zx = zVec.x + cx;
            zy = zVec.y + cy;
            zz = zVec.z + cz;
            zw = zVec.w + cw;
        }

        escIt = i;
    }

    // OPT-C5: Single sqrt after loop
    float minAxis = sqrt(minAxisSq);
    trap = exp(-minPlane * 5.0) * 0.3 + exp(-minAxis * 3.0) * 0.2 +
           exp(-minSphere * 8.0) * 0.2 + float(escIt) / float(max(maxIt, 1)) * 0.3;

    return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}

float sdfJulia4D_simple(vec3 pos, float pwr, float bail, int maxIt) {
    float px = uOrigin[0] + pos.x*uBasisX[0] + pos.y*uBasisY[0] + pos.z*uBasisZ[0];
    float py = uOrigin[1] + pos.x*uBasisX[1] + pos.y*uBasisY[1] + pos.z*uBasisZ[1];
    float pz = uOrigin[2] + pos.x*uBasisX[2] + pos.y*uBasisY[2] + pos.z*uBasisZ[2];
    float pw = uOrigin[3] + pos.x*uBasisX[3] + pos.y*uBasisY[3] + pos.z*uBasisZ[3];

    float zx = px, zy = py, zz = pz, zw = pw;
    float cx = uJuliaConstant.x;
    float cy = uJuliaConstant.y;
    float cz = uJuliaConstant.z;
    float cw = uJuliaConstant.w;

    float dr = 1.0, r = 0.0;

    // OPT-LOOP: Hoist power check outside loop
    int intPwr = int(pwr);
    bool usePower2 = (intPwr == 2);
    bool usePower3 = (intPwr == 3);
    bool usePower4 = (intPwr == 4);

    for (int i = 0; i < MAX_ITER_HQ; i++) {
        if (i >= maxIt) break;

        // OPT-M1: Cache squared components
        float zx_sq = zx * zx;
        float zy_sq = zy * zy;
        float zz_sq = zz * zz;
        float zw_sq = zw * zw;

        r = sqrt(zx_sq + zy_sq + zz_sq + zw_sq);
        if (r > bail) break;

        // OPT-C3: Use optimizedPow for derivative calculation
        float rPow, rPowMinus1;
        optimizedPow(r, pwr, rPow, rPowMinus1);
        dr = pwr * rPowMinus1 * dr;

        // OPT-LOOP: Use pre-computed power flags
        if (usePower2) {
            float newX = zx_sq - zy_sq - zz_sq - zw_sq;
            float newY = 2.0 * zx * zy;
            float newZ = 2.0 * zx * zz;
            float newW = 2.0 * zx * zw;
            zx = newX + cx;
            zy = newY + cy;
            zz = newZ + cz;
            zw = newW + cw;
        } else if (usePower3) {
            float sqX = zx_sq - zy_sq - zz_sq - zw_sq;
            float sqY = 2.0 * zx * zy;
            float sqZ = 2.0 * zx * zz;
            float sqW = 2.0 * zx * zw;
            float newX = sqX * zx - sqY * zy - sqZ * zz - sqW * zw;
            float newY = sqX * zy + sqY * zx + sqZ * zw - sqW * zz;
            float newZ = sqX * zz - sqY * zw + sqZ * zx + sqW * zy;
            float newW = sqX * zw + sqY * zz - sqZ * zy + sqW * zx;
            zx = newX + cx;
            zy = newY + cy;
            zz = newZ + cz;
            zw = newW + cw;
        } else if (usePower4) {
            float sqX = zx_sq - zy_sq - zz_sq - zw_sq;
            float sqY = 2.0 * zx * zy;
            float sqZ = 2.0 * zx * zz;
            float sqW = 2.0 * zx * zw;
            float sq2X = sqX * sqX;
            float sq2Y = sqY * sqY;
            float sq2Z = sqZ * sqZ;
            float sq2W = sqW * sqW;
            zx = sq2X - sq2Y - sq2Z - sq2W + cx;
            zy = 2.0 * sqX * sqY + cy;
            zz = 2.0 * sqX * sqZ + cz;
            zw = 2.0 * sqX * sqW + cw;
        } else {
            vec4 zVec = quatPow(vec4(zx, zy, zz, zw), pwr);
            zx = zVec.x + cx;
            zy = zVec.y + cy;
            zz = zVec.z + cz;
            zw = zVec.w + cw;
        }
    }

    return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}
`;
