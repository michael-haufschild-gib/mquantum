export const sdf3dBlock = `
float sdf3D(vec3 pos, float pwr, float bail, int maxIt, out float trap) {
    float cx = uOrigin[0] + pos.x*uBasisX[0] + pos.y*uBasisY[0] + pos.z*uBasisZ[0];
    float cy = uOrigin[1] + pos.x*uBasisX[1] + pos.y*uBasisY[1] + pos.z*uBasisZ[1];
    float cz = uOrigin[2] + pos.x*uBasisX[2] + pos.y*uBasisY[2] + pos.z*uBasisZ[2];
    float zx = cx, zy = cy, zz = cz;

    float dr = 1.0;
    float r = 0.0;

    // Orbit traps
    float minPlane = 1000.0, minAxis = 1000.0, minSphere = 1000.0;
    int escIt = 0;

    // Pre-compute phase offsets outside loop (OPT: saves 2 comparisons per iteration)
    float phaseT = uPhaseEnabled ? uPhaseTheta : 0.0;
    float phaseP = uPhaseEnabled ? uPhasePhi : 0.0;

    for (int i = 0; i < MAX_ITER_HQ; i++) {
        if (i >= maxIt) break;

        // Compute r first - needed for both bailout check and distance estimation
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
        float theta = acos(clamp(zz / max(r, EPS), -1.0, 1.0));
        float phi = atan(zy, zx);

        // Power map: angles * n (with pre-computed phase shift)
        float thetaN = (theta + phaseT) * pwr;
        float phiN = (phi + phaseP) * pwr;

        // From spherical: z-axis primary reconstruction
        float cTheta = cos(thetaN), sTheta = sin(thetaN);
        float cPhi = cos(phiN), sPhi = sin(phiN);

        zz = rp * cTheta + cz;
        zx = rp * sTheta * cPhi + cx;
        zy = rp * sTheta * sPhi + cy;
        escIt = i;
    }

    trap = exp(-minPlane * 5.0) * 0.3 + exp(-minAxis * 3.0) * 0.2 +
           exp(-minSphere * 8.0) * 0.2 + float(escIt) / float(max(maxIt, 1)) * 0.3;
    return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}

float sdf3D_simple(vec3 pos, float pwr, float bail, int maxIt) {
    float cx = uOrigin[0] + pos.x*uBasisX[0] + pos.y*uBasisY[0] + pos.z*uBasisZ[0];
    float cy = uOrigin[1] + pos.x*uBasisX[1] + pos.y*uBasisY[1] + pos.z*uBasisZ[1];
    float cz = uOrigin[2] + pos.x*uBasisX[2] + pos.y*uBasisY[2] + pos.z*uBasisZ[2];
    float zx = cx, zy = cy, zz = cz;
    float dr = 1.0, r = 0.0;

    // Pre-compute phase offsets outside loop
    float phaseT = uPhaseEnabled ? uPhaseTheta : 0.0;
    float phaseP = uPhaseEnabled ? uPhasePhi : 0.0;

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

        float thetaN = (theta + phaseT) * pwr;
        float phiN = (phi + phaseP) * pwr;
        float cTheta = cos(thetaN), sTheta = sin(thetaN);
        float cPhi = cos(phiN), sPhi = sin(phiN);

        zz = rp * cTheta + cz;
        zx = rp * sTheta * cPhi + cx;
        zy = rp * sTheta * sPhi + cy;
    }
    return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}
`;
