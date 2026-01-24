export const sdf8dBlock = `
// ============================================
// 8D-11D: Array-based with rotated basis
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

    float dr=1.0,r=0.0,minP=1000.0,minA=1000.0,minS=1000.0;
    int escIt=0;

    for(int i=0;i<MAX_ITER_HQ;i++){
        if(i>=maxIt)break;
        r=sqrt(z[0]*z[0]+z[1]*z[1]+z[2]*z[2]+z[3]*z[3]+z[4]*z[4]+z[5]*z[5]+z[6]*z[6]+z[7]*z[7]);
        if(r>bail){escIt=i;break;}
        minP=min(minP,abs(z[1]));minA=min(minA,sqrt(z[0]*z[0]+z[1]*z[1]));minS=min(minS,abs(r-0.8));
        dr=pow(max(r, EPS), pwr-1.0)*pwr*dr+1.0;

        // 8D: 7 angles - compute tails and angles
        float t[7];
        float tail=r;
        for(int k=0;k<6;k++){
            t[k]=acos(clamp(z[k] / max(tail, EPS),-1.0,1.0));
            tail=sqrt(max(tail*tail-z[k]*z[k],EPS));
        }
        t[6]=atan(z[7],z[6]);

        float rp=pow(max(r,EPS),pwr);
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
        dr=pow(max(r, EPS), pwr-1.0)*pwr*dr+1.0;
        float t[7];float tail=r;
        for(int k=0;k<6;k++){t[k]=acos(clamp(z[k] / max(tail, EPS),-1.0,1.0));tail=sqrt(max(tail*tail-z[k]*z[k],EPS));}
        t[6]=atan(z[7],z[6]);
        float rp=pow(max(r,EPS),pwr);
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
`
