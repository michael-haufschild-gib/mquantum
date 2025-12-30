export const sdf8dBlock = `
// ============================================
// 8D-11D: Array-based with rotated basis
// OPT-C1: inversesqrt in tail loop
// OPT-C3: Use optimizedPow for r^pwr and r^(pwr-1)
// OPT-C5: Defer orbit trap sqrt (minASq)
// OPT-M3: Cache z01_sq for r and minA calculations
// OPT-PREC: mediump for orbit traps
// ============================================

float sdf8D(vec3 pos, float pwr, float bail, int maxIt, out float trap) {
    float c[8], z[8];
    // Mandelbulb mode: both z and c start at sample point
    for(int j=0;j<8;j++) {
        c[j]=uOrigin[j]+pos.x*uBasisX[j]+pos.y*uBasisY[j]+pos.z*uBasisZ[j];
        z[j]=c[j];
    }
    // Phase shifts for angular twisting
    float phaseT = uPhaseEnabled ? uPhaseTheta : 0.0;
    float phaseP = uPhaseEnabled ? uPhasePhi : 0.0;

    float dr=1.0,r=0.0;
    // OPT-PREC: mediump sufficient for coloring data
    mediump float minP=1000.0,minASq=1000000.0,minS=1000.0;  // OPT-C5: minASq instead of minA
    int escIt=0;

    for(int i=0;i<MAX_ITER_HQ;i++){
        if(i>=maxIt)break;
        // OPT-M3: Cache z01_sq for both r and minASq calculations
        float z01_sq = z[0]*z[0]+z[1]*z[1];
        r=sqrt(z01_sq+z[2]*z[2]+z[3]*z[3]+z[4]*z[4]+z[5]*z[5]+z[6]*z[6]+z[7]*z[7]);
        if(r>bail){escIt=i;break;}
        minP=min(minP,abs(z[1]));
        minASq=min(minASq,z01_sq);  // OPT-C5: Track squared, defer sqrt
        minS=min(minS,abs(r-0.8));

        // OPT-C3: Use optimizedPow instead of two separate pow() calls
        float rp, rpMinus1;
        optimizedPow(r, pwr, rp, rpMinus1);
        dr=rpMinus1*pwr*dr+1.0;

        // 8D: 7 angles - compute tails and angles
        // OPT-C1: Use inversesqrt instead of sqrt+division
        float t[7];
        float tailSq=r*r;  // Track squared value
        for(int k=0;k<6;k++){
            float invTail=inversesqrt(max(tailSq,EPS*EPS));
            t[k]=acos(clamp(z[k]*invTail,-1.0,1.0));  // z[k]*inversesqrt = z[k]/sqrt
            tailSq=max(tailSq-z[k]*z[k],0.0);
        }
        t[6]=atan(z[7],z[6]);

        // rp already computed by optimizedPow
        // Apply phase shifts to first two angles (theta, phi)
        float s0 = sin((t[0]+phaseT)*pwr), c0 = cos((t[0]+phaseT)*pwr);
        float s1 = sin((t[1]+phaseP)*pwr), c1 = cos((t[1]+phaseP)*pwr);
        z[0]=rp*c0+c[0];
        float sp=rp*s0;
        z[1]=sp*c1+c[1];
        sp*=s1;
        for(int k=2;k<6;k++){
            z[k]=sp*cos(t[k]*pwr)+c[k];
            sp*=sin(t[k]*pwr);
        }
        z[6]=sp*cos(t[6]*pwr)+c[6];
        z[7]=sp*sin(t[6]*pwr)+c[7];
        escIt=i;
    }
    // OPT-C5: Single sqrt after loop for final trap value
    float minA=sqrt(minASq);
    trap=exp(-minP*5.0)*0.3+exp(-minA*3.0)*0.2+exp(-minS*8.0)*0.2+float(escIt)/float(max(maxIt,1))*0.3;
    return max(0.5*log(max(r,EPS))*r/max(dr,EPS),EPS);
}

float sdf8D_simple(vec3 pos, float pwr, float bail, int maxIt) {
    float c[8], z[8];
    // Mandelbulb mode: both z and c start at sample point
    for(int j=0;j<8;j++) {
        c[j]=uOrigin[j]+pos.x*uBasisX[j]+pos.y*uBasisY[j]+pos.z*uBasisZ[j];
        z[j]=c[j];
    }
    // Phase shifts for angular twisting
    float phaseT = uPhaseEnabled ? uPhaseTheta : 0.0;
    float phaseP = uPhaseEnabled ? uPhasePhi : 0.0;

    float dr=1.0,r=0.0;
    for(int i=0;i<MAX_ITER_HQ;i++){
        if(i>=maxIt)break;
        r=sqrt(z[0]*z[0]+z[1]*z[1]+z[2]*z[2]+z[3]*z[3]+z[4]*z[4]+z[5]*z[5]+z[6]*z[6]+z[7]*z[7]);
        if(r>bail)break;

        // OPT-C3: Use optimizedPow instead of two separate pow() calls
        float rp, rpMinus1;
        optimizedPow(r, pwr, rp, rpMinus1);
        dr=rpMinus1*pwr*dr+1.0;

        // OPT-C1: Use inversesqrt instead of sqrt+division in tail loop
        float t[7];
        float tailSq=r*r;
        for(int k=0;k<6;k++){
            float invTail=inversesqrt(max(tailSq,EPS*EPS));
            t[k]=acos(clamp(z[k]*invTail,-1.0,1.0));
            tailSq=max(tailSq-z[k]*z[k],0.0);
        }
        t[6]=atan(z[7],z[6]);

        // rp already computed by optimizedPow
        // Apply phase shifts to first two angles (theta, phi)
        float s0=sin((t[0]+phaseT)*pwr),c0=cos((t[0]+phaseT)*pwr);
        float s1=sin((t[1]+phaseP)*pwr),c1=cos((t[1]+phaseP)*pwr);
        z[0]=rp*c0+c[0];
        float sp=rp*s0;
        z[1]=sp*c1+c[1];
        sp*=s1;
        for(int k=2;k<6;k++){z[k]=sp*cos(t[k]*pwr)+c[k];sp*=sin(t[k]*pwr);}
        z[6]=sp*cos(t[6]*pwr)+c[6];z[7]=sp*sin(t[6]*pwr)+c[7];
    }
    return max(0.5*log(max(r,EPS))*r/max(dr,EPS),EPS);
}
`;
