export const sdf3dBlock = `
float sdf3D(vec3 pos, float pwr, float bail, int maxIt, out float trap) {
    // For 3D, we use standard spherical coordinates
    // c = uOrigin + pos.x * uBasisX + pos.y * uBasisY + pos.z * uBasisZ
    // But in 3D, this simplifies to just pos (with possible slice offset)
    // Mandelbulb mode: z starts at c (sample point)
    float cx = uOrigin[0] + pos.x*uBasisX[0] + pos.y*uBasisY[0] + pos.z*uBasisZ[0];
    float cy = uOrigin[1] + pos.x*uBasisX[1] + pos.y*uBasisY[1] + pos.z*uBasisZ[1];
    float cz = uOrigin[2] + pos.x*uBasisX[2] + pos.y*uBasisY[2] + pos.z*uBasisZ[2];
    float zx = cx, zy = cy, zz = cz;

    float dr = 1.0;
    float r = 0.0;

    // Orbit traps
    float minPlane = 1000.0, minAxis = 1000.0, minSphere = 1000.0;
    int escIt = 0;

    for (int i = 0; i < MAX_ITER_HQ; i++) {
        if (i >= maxIt) break;

        // r = |z|
        r = sqrt(zx*zx + zy*zy + zz*zz);
        if (r > bail) { escIt = i; break; }

        // Orbit traps (using z-axis primary convention)
        minPlane = min(minPlane, abs(zy));
        minAxis = min(minAxis, sqrt(zx*zx + zy*zy));  // Distance from z-axis
        minSphere = min(minSphere, abs(r - 0.8));

        // Optimized power calculation
        float rp, rpMinus1;
        optimizedPow(r, pwr, rp, rpMinus1);
        dr = rpMinus1 * pwr * dr + 1.0;

        // To spherical: z-axis primary (standard Mandelbulb)
        // theta = angle from z-axis, phi = angle in xy-plane
        float theta = acos(clamp(zz / max(r, EPS), -1.0, 1.0));  // From z-axis
        float phi = atan(zy, zx);  // In xy plane

        // Power map: angles * n (with optional phase shift)
        float thetaN = (theta + (uPhaseEnabled ? uPhaseTheta : 0.0)) * pwr;
        float phiN = (phi + (uPhaseEnabled ? uPhasePhi : 0.0)) * pwr;

        // From spherical: z-axis primary reconstruction
        float cTheta = cos(thetaN), sTheta = sin(thetaN);
        float cPhi = cos(phiN), sPhi = sin(phiN);

        zz = rp * cTheta + cz;              // z = r * cos(theta)
        zx = rp * sTheta * cPhi + cx;       // x = r * sin(theta) * cos(phi)
        zy = rp * sTheta * sPhi + cy;       // y = r * sin(theta) * sin(phi)
        escIt = i;
    }

    trap = exp(-minPlane * 5.0) * 0.3 + exp(-minAxis * 3.0) * 0.2 +
           exp(-minSphere * 8.0) * 0.2 + float(escIt) / float(max(maxIt, 1)) * 0.3;
    return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}

float sdf3D_simple(vec3 pos, float pwr, float bail, int maxIt) {
    // Mandelbulb mode: z starts at c (sample point)
    float cx = uOrigin[0] + pos.x*uBasisX[0] + pos.y*uBasisY[0] + pos.z*uBasisZ[0];
    float cy = uOrigin[1] + pos.x*uBasisX[1] + pos.y*uBasisY[1] + pos.z*uBasisZ[1];
    float cz = uOrigin[2] + pos.x*uBasisX[2] + pos.y*uBasisY[2] + pos.z*uBasisZ[2];
    float zx = cx, zy = cy, zz = cz;
    float dr = 1.0, r = 0.0;

    for (int i = 0; i < MAX_ITER_HQ; i++) {
        if (i >= maxIt) break;
        r = sqrt(zx*zx + zy*zy + zz*zz);
        if (r > bail) break;

        // Optimized power calculation
        float rp, rpMinus1;
        optimizedPow(r, pwr, rp, rpMinus1);
        dr = rpMinus1 * pwr * dr + 1.0;

        // z-axis primary (standard Mandelbulb)
        float theta = acos(clamp(zz / max(r, EPS), -1.0, 1.0));
        float phi = atan(zy, zx);

        float thetaN = (theta + (uPhaseEnabled ? uPhaseTheta : 0.0)) * pwr;
        float phiN = (phi + (uPhaseEnabled ? uPhasePhi : 0.0)) * pwr;
        float cTheta = cos(thetaN), sTheta = sin(thetaN);
        float cPhi = cos(phiN), sPhi = sin(phiN);

        zz = rp * cTheta + cz;
        zx = rp * sTheta * cPhi + cx;
        zy = rp * sTheta * sPhi + cy;
    }
    return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}
`
