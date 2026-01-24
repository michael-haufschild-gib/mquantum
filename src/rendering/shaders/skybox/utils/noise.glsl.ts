export const noiseBlock = `
// High quality hash
float hash(vec3 p) {
  p  = fract( p*0.3183099+.1 );
  p *= 17.0;
  return fract( p.x*p.y*p.z*(p.x+p.y+p.z) );
}

float noise( in vec3 x ) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f*f*(3.0-2.0*f);
  return mix(mix(mix( hash(i+vec3(0,0,0)),
                      hash(i+vec3(1,0,0)),f.x),
                 mix( hash(i+vec3(0,1,0)),
                      hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix( hash(i+vec3(0,0,1)),
                      hash(i+vec3(1,0,1)),f.x),
                 mix( hash(i+vec3(0,1,1)),
                      hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}

// FBM (Fractal Brownian Motion)
float fbm(vec3 x, int octaves) {
    float v = 0.0;
    float a = 0.5;
    vec3 shift = vec3(100.0);
    for (int i = 0; i < 5; ++i) { // Fixed loop size for unrolling
        if(i >= octaves) break;
        v += a * noise(x);
        x = x * 2.0 + shift;
        a *= 0.5;
    }
    return v;
}
`
