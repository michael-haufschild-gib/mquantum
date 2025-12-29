export const sdf11dBlock = `
// ============================================
// 11D Hyperbulb - FULLY UNROLLED
// OPT-C1: inversesqrt in tail calculations
// OPT-C3: Use optimizedPow for r^pwr and r^(pwr-1)
// OPT-C5: Defer orbit trap sqrt (minASq)
// ============================================

float sdf11D(vec3 pos, float pwr, float bail, int maxIt, out float trap) {
    // 11D initialization
    float coord0=uOrigin[0]+pos.x*uBasisX[0]+pos.y*uBasisY[0]+pos.z*uBasisZ[0];
    float coord1=uOrigin[1]+pos.x*uBasisX[1]+pos.y*uBasisY[1]+pos.z*uBasisZ[1];
    float coord2=uOrigin[2]+pos.x*uBasisX[2]+pos.y*uBasisY[2]+pos.z*uBasisZ[2];
    float coord3=uOrigin[3]+pos.x*uBasisX[3]+pos.y*uBasisY[3]+pos.z*uBasisZ[3];
    float coord4=uOrigin[4]+pos.x*uBasisX[4]+pos.y*uBasisY[4]+pos.z*uBasisZ[4];
    float coord5=uOrigin[5]+pos.x*uBasisX[5]+pos.y*uBasisY[5]+pos.z*uBasisZ[5];
    float coord6=uOrigin[6]+pos.x*uBasisX[6]+pos.y*uBasisY[6]+pos.z*uBasisZ[6];
    float coord7=uOrigin[7]+pos.x*uBasisX[7]+pos.y*uBasisY[7]+pos.z*uBasisZ[7];
    float coord8=uOrigin[8]+pos.x*uBasisX[8]+pos.y*uBasisY[8]+pos.z*uBasisZ[8];
    float coord9=uOrigin[9]+pos.x*uBasisX[9]+pos.y*uBasisY[9]+pos.z*uBasisZ[9];
    float coord10=uOrigin[10]+pos.x*uBasisX[10]+pos.y*uBasisY[10]+pos.z*uBasisZ[10];
    float z0=coord0, z1=coord1, z2=coord2, z3=coord3, z4=coord4, z5=coord5, z6=coord6, z7=coord7, z8=coord8, z9=coord9, z10=coord10;

    float dr=1.0, r=0.0, minP=1000.0, minASq=1000000.0, minS=1000.0;  // OPT-C5: minASq
    int escIt=0;
    float phaseT = uPhaseEnabled ? uPhaseTheta : 0.0;
    float phaseP = uPhaseEnabled ? uPhasePhi : 0.0;

    for(int i=0;i<MAX_ITER_HQ;i++){
        if(i>=maxIt)break;
        float z01_sq = z0*z0+z1*z1;  // Cache for minASq
        r=sqrt(z01_sq+z2*z2+z3*z3+z4*z4+z5*z5+z6*z6+z7*z7+z8*z8+z9*z9+z10*z10);
        if(r>bail){escIt=i;break;}
        minP=min(minP,abs(z1));
        minASq=min(minASq,z01_sq);  // OPT-C5: Track squared
        minS=min(minS,abs(r-0.8));

        // OPT-C3: Use optimizedPow
        float rp, rpMinus1;
        optimizedPow(r, pwr, rp, rpMinus1);
        dr=rpMinus1*pwr*dr+1.0;

        // 11D: 10 angles - OPT-C1: Use inversesqrt instead of sqrt+division
        float tailSq = r*r;
        float invTail = inversesqrt(max(tailSq, EPS*EPS));
        float t0 = acos(clamp(z0 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z0*z0, 0.0);
        invTail = inversesqrt(max(tailSq, EPS*EPS));
        float t1 = acos(clamp(z1 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z1*z1, 0.0);
        invTail = inversesqrt(max(tailSq, EPS*EPS));
        float t2 = acos(clamp(z2 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z2*z2, 0.0);
        invTail = inversesqrt(max(tailSq, EPS*EPS));
        float t3 = acos(clamp(z3 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z3*z3, 0.0);
        invTail = inversesqrt(max(tailSq, EPS*EPS));
        float t4 = acos(clamp(z4 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z4*z4, 0.0);
        invTail = inversesqrt(max(tailSq, EPS*EPS));
        float t5 = acos(clamp(z5 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z5*z5, 0.0);
        invTail = inversesqrt(max(tailSq, EPS*EPS));
        float t6 = acos(clamp(z6 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z6*z6, 0.0);
        invTail = inversesqrt(max(tailSq, EPS*EPS));
        float t7 = acos(clamp(z7 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z7*z7, 0.0);
        invTail = inversesqrt(max(tailSq, EPS*EPS));
        float t8 = acos(clamp(z8 * invTail, -1.0, 1.0));
        float t9 = atan(z10, z9);

        // rp already computed by optimizedPow
        float s0=sin((t0+phaseT)*pwr),c0=cos((t0+phaseT)*pwr);
        float s1=sin((t1+phaseP)*pwr),c1=cos((t1+phaseP)*pwr);

        z0 = rp * c0 + coord0;
        float sp = rp * s0;
        z1 = sp * c1 + coord1;
        sp *= s1;
        z2 = sp * cos(t2*pwr) + coord2; sp *= sin(t2*pwr);
        z3 = sp * cos(t3*pwr) + coord3; sp *= sin(t3*pwr);
        z4 = sp * cos(t4*pwr) + coord4; sp *= sin(t4*pwr);
        z5 = sp * cos(t5*pwr) + coord5; sp *= sin(t5*pwr);
        z6 = sp * cos(t6*pwr) + coord6; sp *= sin(t6*pwr);
        z7 = sp * cos(t7*pwr) + coord7; sp *= sin(t7*pwr);
        z8 = sp * cos(t8*pwr) + coord8; sp *= sin(t8*pwr);
        z9 = sp * cos(t9*pwr) + coord9;
        z10 = sp * sin(t9*pwr) + coord10;

        escIt=i;
    }
    // OPT-C5: Single sqrt after loop
    float minA = sqrt(minASq);
    trap=exp(-minP*5.0)*0.3+exp(-minA*3.0)*0.2+exp(-minS*8.0)*0.2+float(escIt)/float(max(maxIt,1))*0.3;
    return max(0.5*log(max(r,EPS))*r/max(dr,EPS),EPS);
}

float sdf11D_simple(vec3 pos, float pwr, float bail, int maxIt) {
    float coord0=uOrigin[0]+pos.x*uBasisX[0]+pos.y*uBasisY[0]+pos.z*uBasisZ[0];
    float coord1=uOrigin[1]+pos.x*uBasisX[1]+pos.y*uBasisY[1]+pos.z*uBasisZ[1];
    float coord2=uOrigin[2]+pos.x*uBasisX[2]+pos.y*uBasisY[2]+pos.z*uBasisZ[2];
    float coord3=uOrigin[3]+pos.x*uBasisX[3]+pos.y*uBasisY[3]+pos.z*uBasisZ[3];
    float coord4=uOrigin[4]+pos.x*uBasisX[4]+pos.y*uBasisY[4]+pos.z*uBasisZ[4];
    float coord5=uOrigin[5]+pos.x*uBasisX[5]+pos.y*uBasisY[5]+pos.z*uBasisZ[5];
    float coord6=uOrigin[6]+pos.x*uBasisX[6]+pos.y*uBasisY[6]+pos.z*uBasisZ[6];
    float coord7=uOrigin[7]+pos.x*uBasisX[7]+pos.y*uBasisY[7]+pos.z*uBasisZ[7];
    float coord8=uOrigin[8]+pos.x*uBasisX[8]+pos.y*uBasisY[8]+pos.z*uBasisZ[8];
    float coord9=uOrigin[9]+pos.x*uBasisX[9]+pos.y*uBasisY[9]+pos.z*uBasisZ[9];
    float coord10=uOrigin[10]+pos.x*uBasisX[10]+pos.y*uBasisY[10]+pos.z*uBasisZ[10];
    float z0=coord0, z1=coord1, z2=coord2, z3=coord3, z4=coord4, z5=coord5, z6=coord6, z7=coord7, z8=coord8, z9=coord9, z10=coord10;

    float dr=1.0, r=0.0;
    float phaseT = uPhaseEnabled ? uPhaseTheta : 0.0;
    float phaseP = uPhaseEnabled ? uPhasePhi : 0.0;

    for(int i=0;i<MAX_ITER_HQ;i++){
        if(i>=maxIt)break;
        r=sqrt(z0*z0+z1*z1+z2*z2+z3*z3+z4*z4+z5*z5+z6*z6+z7*z7+z8*z8+z9*z9+z10*z10);
        if(r>bail)break;

        // OPT-C3: Use optimizedPow
        float rp, rpMinus1;
        optimizedPow(r, pwr, rp, rpMinus1);
        dr=rpMinus1*pwr*dr+1.0;

        // OPT-C1: Use inversesqrt instead of sqrt+division
        float tailSq = r*r;
        float invTail = inversesqrt(max(tailSq, EPS*EPS));
        float t0 = acos(clamp(z0 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z0*z0, 0.0);
        invTail = inversesqrt(max(tailSq, EPS*EPS));
        float t1 = acos(clamp(z1 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z1*z1, 0.0);
        invTail = inversesqrt(max(tailSq, EPS*EPS));
        float t2 = acos(clamp(z2 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z2*z2, 0.0);
        invTail = inversesqrt(max(tailSq, EPS*EPS));
        float t3 = acos(clamp(z3 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z3*z3, 0.0);
        invTail = inversesqrt(max(tailSq, EPS*EPS));
        float t4 = acos(clamp(z4 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z4*z4, 0.0);
        invTail = inversesqrt(max(tailSq, EPS*EPS));
        float t5 = acos(clamp(z5 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z5*z5, 0.0);
        invTail = inversesqrt(max(tailSq, EPS*EPS));
        float t6 = acos(clamp(z6 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z6*z6, 0.0);
        invTail = inversesqrt(max(tailSq, EPS*EPS));
        float t7 = acos(clamp(z7 * invTail, -1.0, 1.0)); tailSq = max(tailSq - z7*z7, 0.0);
        invTail = inversesqrt(max(tailSq, EPS*EPS));
        float t8 = acos(clamp(z8 * invTail, -1.0, 1.0));
        float t9 = atan(z10, z9);

        // rp already computed by optimizedPow
        float s0=sin((t0+phaseT)*pwr),c0=cos((t0+phaseT)*pwr);
        float s1=sin((t1+phaseP)*pwr),c1=cos((t1+phaseP)*pwr);

        z0 = rp * c0 + coord0;
        float sp = rp * s0;
        z1 = sp * c1 + coord1;
        sp *= s1;
        z2 = sp * cos(t2*pwr) + coord2; sp *= sin(t2*pwr);
        z3 = sp * cos(t3*pwr) + coord3; sp *= sin(t3*pwr);
        z4 = sp * cos(t4*pwr) + coord4; sp *= sin(t4*pwr);
        z5 = sp * cos(t5*pwr) + coord5; sp *= sin(t5*pwr);
        z6 = sp * cos(t6*pwr) + coord6; sp *= sin(t6*pwr);
        z7 = sp * cos(t7*pwr) + coord7; sp *= sin(t7*pwr);
        z8 = sp * cos(t8*pwr) + coord8; sp *= sin(t8*pwr);
        z9 = sp * cos(t9*pwr) + coord9;
        z10 = sp * sin(t9*pwr) + coord10;
    }
    return max(0.5*log(max(r,EPS))*r/max(dr,EPS),EPS);
}
`;