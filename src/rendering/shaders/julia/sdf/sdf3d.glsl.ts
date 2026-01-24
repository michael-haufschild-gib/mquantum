export const sdf3dBlock = `
// ============================================
// Quaternion Julia SDF - Pure 3D (w=0 slice)
// z = z^n + c where c is Julia constant (w component = 0)
// OPT-3D: Skip w component entirely for pure 3D
// OPT-C3: Use optimizedPow for derivative
// OPT-C5: Defer orbit trap sqrt (minAxisSq)
// OPT-M1: Cache squared components for r and orbit traps
// OPT-LOOP: Hoist power check outside loop
// OPT-PREC: mediump for orbit traps
// ============================================

float sdfJulia3D(vec3 pos, float pwr, float bail, int maxIt, out float trap) {
    // Map 3D position - no w component for pure 3D
    float px = uOrigin[0] + pos.x*uBasisX[0] + pos.y*uBasisY[0] + pos.z*uBasisZ[0];
    float py = uOrigin[1] + pos.x*uBasisX[1] + pos.y*uBasisY[1] + pos.z*uBasisZ[1];
    float pz = uOrigin[2] + pos.x*uBasisX[2] + pos.y*uBasisY[2] + pos.z*uBasisZ[2];

    // z starts at sample position (w=0 for pure 3D)
    float zx = px, zy = py, zz = pz;

    // c is the fixed Julia constant (only xyz, w=0)
    float cx = uJuliaConstant.x;
    float cy = uJuliaConstant.y;
    float cz = uJuliaConstant.z;

    float dr = 1.0;
    float r = 0.0;

    // Orbit traps - OPT-C5: minAxisSq instead of minAxis
    mediump float minPlane = 1000.0, minAxisSq = 1000000.0, minSphere = 1000.0;
    int escIt = 0;

    // OPT-LOOP: Hoist power check outside loop
    int intPwr = int(pwr);
    bool usePower2 = (intPwr == 2);
    bool usePower3 = (intPwr == 3);
    bool usePower4 = (intPwr == 4);

    for (int i = 0; i < MAX_ITER_HQ; i++) {
        if (i >= maxIt) break;

        // OPT-M1: Cache squared components (no zw_sq for 3D)
        float zx_sq = zx * zx;
        float zy_sq = zy * zy;
        float zz_sq = zz * zz;
        float zxy_sq = zx_sq + zy_sq;

        r = sqrt(zxy_sq + zz_sq);
        if (r > bail) { escIt = i; break; }

        // Orbit traps
        minPlane = min(minPlane, abs(zy));
        minAxisSq = min(minAxisSq, zxy_sq);
        minSphere = min(minSphere, abs(r - 0.8));

        // OPT-C3: Use optimizedPow for derivative
        float rPow, rPowMinus1;
        optimizedPow(r, pwr, rPow, rPowMinus1);
        dr = pwr * rPowMinus1 * dr;

        // Julia iteration: z = z^n + c (w=0 throughout)
        // OPT-3D: Simplified quaternion math without w component
        if (usePower2) {
            // quatSqr with w=0: simpler formula
            float newX = zx_sq - zy_sq - zz_sq;
            float newY = 2.0 * zx * zy;
            float newZ = 2.0 * zx * zz;
            zx = newX + cx;
            zy = newY + cy;
            zz = newZ + cz;
        } else if (usePower3) {
            // z^3 = z^2 * z with w=0
            float sqX = zx_sq - zy_sq - zz_sq;
            float sqY = 2.0 * zx * zy;
            float sqZ = 2.0 * zx * zz;
            // quatMul(sq, z) with w=0
            float newX = sqX * zx - sqY * zy - sqZ * zz;
            float newY = sqX * zy + sqY * zx;
            float newZ = sqX * zz + sqZ * zx;
            zx = newX + cx;
            zy = newY + cy;
            zz = newZ + cz;
        } else if (usePower4) {
            // z^4 = (z^2)^2 with w=0
            float sqX = zx_sq - zy_sq - zz_sq;
            float sqY = 2.0 * zx * zy;
            float sqZ = 2.0 * zx * zz;
            float sq2X = sqX * sqX;
            float sq2Y = sqY * sqY;
            float sq2Z = sqZ * sqZ;
            zx = sq2X - sq2Y - sq2Z + cx;
            zy = 2.0 * sqX * sqY + cy;
            zz = 2.0 * sqX * sqZ + cz;
        } else {
            // General power using quatPow (with w=0)
            vec4 zVec = quatPow(vec4(zx, zy, zz, 0.0), pwr);
            zx = zVec.x + cx;
            zy = zVec.y + cy;
            zz = zVec.z + cz;
        }

        escIt = i;
    }

    float minAxis = sqrt(minAxisSq);
    trap = exp(-minPlane * 5.0) * 0.3 + exp(-minAxis * 3.0) * 0.2 +
           exp(-minSphere * 8.0) * 0.2 + float(escIt) / float(max(maxIt, 1)) * 0.3;

    return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}

float sdfJulia3D_simple(vec3 pos, float pwr, float bail, int maxIt) {
    float px = uOrigin[0] + pos.x*uBasisX[0] + pos.y*uBasisY[0] + pos.z*uBasisZ[0];
    float py = uOrigin[1] + pos.x*uBasisX[1] + pos.y*uBasisY[1] + pos.z*uBasisZ[1];
    float pz = uOrigin[2] + pos.x*uBasisX[2] + pos.y*uBasisY[2] + pos.z*uBasisZ[2];

    float zx = px, zy = py, zz = pz;
    float cx = uJuliaConstant.x;
    float cy = uJuliaConstant.y;
    float cz = uJuliaConstant.z;

    float dr = 1.0, r = 0.0;

    int intPwr = int(pwr);
    bool usePower2 = (intPwr == 2);
    bool usePower3 = (intPwr == 3);
    bool usePower4 = (intPwr == 4);

    for (int i = 0; i < MAX_ITER_HQ; i++) {
        if (i >= maxIt) break;

        float zx_sq = zx * zx;
        float zy_sq = zy * zy;
        float zz_sq = zz * zz;

        r = sqrt(zx_sq + zy_sq + zz_sq);
        if (r > bail) break;

        float rPow, rPowMinus1;
        optimizedPow(r, pwr, rPow, rPowMinus1);
        dr = pwr * rPowMinus1 * dr;

        if (usePower2) {
            float newX = zx_sq - zy_sq - zz_sq;
            float newY = 2.0 * zx * zy;
            float newZ = 2.0 * zx * zz;
            zx = newX + cx;
            zy = newY + cy;
            zz = newZ + cz;
        } else if (usePower3) {
            float sqX = zx_sq - zy_sq - zz_sq;
            float sqY = 2.0 * zx * zy;
            float sqZ = 2.0 * zx * zz;
            float newX = sqX * zx - sqY * zy - sqZ * zz;
            float newY = sqX * zy + sqY * zx;
            float newZ = sqX * zz + sqZ * zx;
            zx = newX + cx;
            zy = newY + cy;
            zz = newZ + cz;
        } else if (usePower4) {
            float sqX = zx_sq - zy_sq - zz_sq;
            float sqY = 2.0 * zx * zy;
            float sqZ = 2.0 * zx * zz;
            float sq2X = sqX * sqX;
            float sq2Y = sqY * sqY;
            float sq2Z = sqZ * sqZ;
            zx = sq2X - sq2Y - sq2Z + cx;
            zy = 2.0 * sqX * sqY + cy;
            zz = 2.0 * sqX * sqZ + cz;
        } else {
            vec4 zVec = quatPow(vec4(zx, zy, zz, 0.0), pwr);
            zx = zVec.x + cx;
            zy = zVec.y + cy;
            zz = zVec.z + cz;
        }
    }

    return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}
`
