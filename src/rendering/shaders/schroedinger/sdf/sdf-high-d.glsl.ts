export const sdfHighDBlock = `
// 9D-11D use array-based approach with rotated basis
float sdfHighD(vec3 pos, int D, float pwr, float bail, int maxIt, out float trap) {
    float c[11],z[11];
    // Mandelbulb mode: both z and c start at sample point
    for(int j=0;j<11;j++) {
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

        // Compute r - unrolled for speed
        r=z[0]*z[0]+z[1]*z[1]+z[2]*z[2]+z[3]*z[3]+z[4]*z[4];
        r+=z[5]*z[5]+z[6]*z[6]+z[7]*z[7]+z[8]*z[8]+z[9]*z[9]+z[10]*z[10];
        r=sqrt(r);

        if(r>bail){escIt=i;break;}
        minP=min(minP,abs(z[1]));minA=min(minA,sqrt(z[0]*z[0]+z[1]*z[1]));minS=min(minS,abs(r-0.8));
        dr=pow(max(r, EPS), pwr-1.0)*pwr*dr+1.0;

        // Compute angles
        float t[10];
        float tail2=r*r;
        for(int k=0;k<D-2;k++){
            float tail=sqrt(max(tail2,EPS));
            t[k]=acos(clamp(z[k] / max(tail, EPS),-1.0,1.0));
            tail2-=z[k]*z[k];
        }
        t[D-2]=atan(z[D-1],z[D-2]);

        // Power map and reconstruct with phase shifts on first two angles
        float rp=pow(max(r,EPS),pwr);
        float s0=sin((t[0]+phaseT)*pwr),c0=cos((t[0]+phaseT)*pwr);
        float s1=sin((t[1]+phaseP)*pwr),c1=cos((t[1]+phaseP)*pwr);
        z[0]=rp*c0+c[0];
        float sp=rp*s0;
        z[1]=sp*c1+c[1];
        sp*=s1;
        for(int k=2;k<D-2;k++){
            sp*=sin(t[k-1]*pwr);
            z[k]=sp*cos(t[k]*pwr)+c[k];
        }
        sp*=sin(t[D-3]*pwr);
        z[D-2]=sp*cos(t[D-2]*pwr)+c[D-2];
        z[D-1]=sp*sin(t[D-2]*pwr)+c[D-1];
        // Zero out unused dimensions
        for(int k=D;k<11;k++)z[k]=0.0;
        escIt=i;
    }
    trap=exp(-minP*5.0)*0.3+exp(-minA*3.0)*0.2+exp(-minS*8.0)*0.2+float(escIt)/float(max(maxIt,1))*0.3;
    return max(0.5*log(max(r,EPS))*r/max(dr,EPS),EPS);
}

float sdfHighD_simple(vec3 pos, int D, float pwr, float bail, int maxIt) {
    float c[11],z[11];
    // Mandelbulb mode: both z and c start at sample point
    for(int j=0;j<11;j++) {
        c[j]=uOrigin[j]+pos.x*uBasisX[j]+pos.y*uBasisY[j]+pos.z*uBasisZ[j];
        z[j]=c[j];
    }
    // Phase shifts for angular twisting
    float phaseT = uPhaseEnabled ? uPhaseTheta : 0.0;
    float phaseP = uPhaseEnabled ? uPhasePhi : 0.0;

    float dr=1.0,r=0.0;

    for(int i=0;i<MAX_ITER_HQ;i++){
        if(i>=maxIt)break;
        r=z[0]*z[0]+z[1]*z[1]+z[2]*z[2]+z[3]*z[3]+z[4]*z[4];
        r+=z[5]*z[5]+z[6]*z[6]+z[7]*z[7]+z[8]*z[8]+z[9]*z[9]+z[10]*z[10];
        r=sqrt(r);
        if(r>bail)break;
        dr=pow(max(r, EPS), pwr-1.0)*pwr*dr+1.0;

        float t[10];float tail2=r*r;
        for(int k=0;k<D-2;k++){float tail=sqrt(max(tail2,EPS));t[k]=acos(clamp(z[k] / max(tail, EPS),-1.0,1.0));tail2-=z[k]*z[k];}
        t[D-2]=atan(z[D-1],z[D-2]);

        float rp=pow(max(r,EPS),pwr);
        // Apply phase shifts to first two angles (theta, phi)
        float s0=sin((t[0]+phaseT)*pwr),c0=cos((t[0]+phaseT)*pwr);
        float s1=sin((t[1]+phaseP)*pwr),c1=cos((t[1]+phaseP)*pwr);
        z[0]=rp*c0+c[0];
        float sp=rp*s0;
        z[1]=sp*c1+c[1];
        sp*=s1;
        for(int k=2;k<D-2;k++){sp*=sin(t[k-1]*pwr);z[k]=sp*cos(t[k]*pwr)+c[k];}
        sp*=sin(t[D-3]*pwr);
        z[D-2]=sp*cos(t[D-2]*pwr)+c[D-2];
        z[D-1]=sp*sin(t[D-2]*pwr)+c[D-1];
        for(int k=D;k<11;k++)z[k]=0.0;
    }
    return max(0.5*log(max(r,EPS))*r/max(dr,EPS),EPS);
}
`
