export const sdf4dBlock = `
// ============================================
// 4D Hyperbulb - FULLY UNROLLED with rotated basis
// ============================================

float sdf4D(vec3 pos, float pwr, float bail, int maxIt, out float trap) {
    // c = uOrigin + pos.x * uBasisX + pos.y * uBasisY + pos.z * uBasisZ
    // Mandelbulb mode: z starts at c (sample point)
    float cx = uOrigin[0] + pos.x*uBasisX[0] + pos.y*uBasisY[0] + pos.z*uBasisZ[0];
    float cy = uOrigin[1] + pos.x*uBasisX[1] + pos.y*uBasisY[1] + pos.z*uBasisZ[1];
    float cz = uOrigin[2] + pos.x*uBasisX[2] + pos.y*uBasisY[2] + pos.z*uBasisZ[2];
    float cw = uOrigin[3] + pos.x*uBasisX[3] + pos.y*uBasisY[3] + pos.z*uBasisZ[3];
    float zx = cx, zy = cy, zz = cz, zw = cw;

    float dr = 1.0;
    float r = 0.0;

    // Orbit traps
    float minPlane = 1000.0, minAxis = 1000.0, minSphere = 1000.0;
    int escIt = 0;

    for (int i = 0; i < MAX_ITER_HQ; i++) {
        if (i >= maxIt) break;

        // r = |z|
        r = sqrt(zx*zx + zy*zy + zz*zz + zw*zw);
        if (r > bail) { escIt = i; break; }

        // Orbit traps (using z-axis primary convention)
        minPlane = min(minPlane, abs(zy));
        minAxis = min(minAxis, sqrt(zx*zx + zy*zy));  // Distance from z-axis
        minSphere = min(minSphere, abs(r - 0.8));

        // Optimized power calculation
        float rp, rpMinus1;
        optimizedPow(r, pwr, rp, rpMinus1);
        dr = rpMinus1 * pwr * dr + 1.0;

        // To hyperspherical: z-axis primary (like Mandelbulb)
        // 4D: (z, x, y, w) -> (x1, x2, x3, x4) hyperspherical
        float theta = acos(clamp(zz / max(r, EPS), -1.0, 1.0));  // From z-axis (like Mandelbulb)
        float rxyw = sqrt(zx*zx + zy*zy + zw*zw);
        float phi = rxyw > EPS ? acos(clamp(zx / max(rxyw, EPS), -1.0, 1.0)) : 0.0;  // From x in xyw
        float psi = atan(zw, zy);  // In yw plane

        // Power map: angles * n (with optional phase shift)
        float thetaN = (theta + (uPhaseEnabled ? uPhaseTheta : 0.0)) * pwr;
        float phiN = (phi + (uPhaseEnabled ? uPhasePhi : 0.0)) * pwr;
        float psiN = psi * pwr;

        // From hyperspherical: z-axis primary reconstruction
        float cTheta = cos(thetaN), sTheta = sin(thetaN);
        float cPhi = cos(phiN), sPhi = sin(phiN);
        float cPsi = cos(psiN), sPsi = sin(psiN);

        float rSinTheta = rp * sTheta;
        float rSinThetaSinPhi = rSinTheta * sPhi;
        zz = rp * cTheta + cz;              // z = r * cos(theta)
        zx = rSinTheta * cPhi + cx;         // x = r * sin(theta) * cos(phi)
        zy = rSinThetaSinPhi * cPsi + cy;   // y = r * sin(theta) * sin(phi) * cos(psi)
        zw = rSinThetaSinPhi * sPsi + cw;   // w = r * sin(theta) * sin(phi) * sin(psi)
        escIt = i;
    }

    trap = exp(-minPlane * 5.0) * 0.3 + exp(-minAxis * 3.0) * 0.2 +
           exp(-minSphere * 8.0) * 0.2 + float(escIt) / float(max(maxIt, 1)) * 0.3;
    return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}

float sdf4D_simple(vec3 pos, float pwr, float bail, int maxIt) {
    // Mandelbulb mode: z starts at c (sample point)
    float cx = uOrigin[0] + pos.x*uBasisX[0] + pos.y*uBasisY[0] + pos.z*uBasisZ[0];
    float cy = uOrigin[1] + pos.x*uBasisX[1] + pos.y*uBasisY[1] + pos.z*uBasisZ[1];
    float cz = uOrigin[2] + pos.x*uBasisX[2] + pos.y*uBasisY[2] + pos.z*uBasisZ[2];
    float cw = uOrigin[3] + pos.x*uBasisX[3] + pos.y*uBasisY[3] + pos.z*uBasisZ[3];
    float zx = cx, zy = cy, zz = cz, zw = cw;
    float dr = 1.0, r = 0.0;

    for (int i = 0; i < MAX_ITER_HQ; i++) {
        if (i >= maxIt) break;
        r = sqrt(zx*zx + zy*zy + zz*zz + zw*zw);
        if (r > bail) break;

        // Optimized power calculation
        float rp, rpMinus1;
        optimizedPow(r, pwr, rp, rpMinus1);
        dr = rpMinus1 * pwr * dr + 1.0;

        // z-axis primary (like Mandelbulb)
        float theta = acos(clamp(zz / max(r, EPS), -1.0, 1.0));
        float rxyw = sqrt(zx*zx + zy*zy + zw*zw);
        float phi = rxyw > EPS ? acos(clamp(zx / max(rxyw, EPS), -1.0, 1.0)) : 0.0;
        float psi = atan(zw, zy);

        float thetaN = (theta + (uPhaseEnabled ? uPhaseTheta : 0.0)) * pwr;
        float phiN = (phi + (uPhaseEnabled ? uPhasePhi : 0.0)) * pwr;
        float cTheta = cos(thetaN), sTheta = sin(thetaN);
        float cPhi = cos(phiN), sPhi = sin(phiN);
        float cPsi = cos(psi * pwr), sPsi = sin(psi * pwr);

        float rSinThetaSinPhi = rp * sTheta * sPhi;
        zz = rp * cTheta + cz;
        zx = rp * sTheta * cPhi + cx;
        zy = rSinThetaSinPhi * cPsi + cy;
        zw = rSinThetaSinPhi * sPsi + cw;
    }
    return max(0.5 * log(max(r, EPS)) * r / max(dr, EPS), EPS);
}
`
