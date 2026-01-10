/**
 * Jet Volumetric Shader
 *
 * Renders polar jets as dramatic plasma beams on cylinder geometry.
 * Uses layered FBM noise, temperature-based coloring, and flowing
 * energy effects for impressive visual impact without raymarching.
 *
 * Key features:
 * - Cylinder geometry with heavy vertex displacement for "snaking" look
 * - Multi-octave FBM noise for plasma tendrils
 * - Edge erosion for ragged, non-geometric silhouette
 * - Temperature gradient: white-hot core → blue → user color
 * - Flowing hotspots and energy knots
 * - Animated energy pulses traveling along jet axis
 *
 * @module rendering/shaders/postprocessing/jetVolumetric
 */

export const jetVolumetricVertexShader = /* glsl */ `
  out vec2 vUv;
  out vec3 vWorldPos;
  out vec3 vLocalPos;
  out vec3 vViewDir;
  out vec3 vNormal;
  out float vJetSign;
  out float vViewDotNormal;

  uniform float uJetSign;
  uniform float uTime;
  uniform float uJetWidth;
  uniform float uJetNoiseAmount; // Controls snaking intensity

  // 3D Simplex Noise for vertex displacement
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main() {
    vUv = uv;
    vJetSign = uJetSign;

    // Base position
    vec3 pos = position;
    
    // Normalized height: position.y goes from 0.0 (base) to 1.0 (tip)
    float h = pos.y; 
    
    // === SNAKING MOTION ===
    // "Snaking" increases with height (whip effect)
    // Modulate amplitude by uJetNoiseAmount
    float noiseAmp = max(0.0, uJetNoiseAmount);
    
    // REDUCED AMPLITUDE, HIGHER FREQUENCY
    // Was: pow(h, 1.2) * 0.3
    // Now: Smaller amplitude to avoid "party hat" wobbling off-axis too much
    float whip = pow(h, 1.5) * 0.15 * noiseAmp; 
    float t = uTime * 1.5; // Slightly slower main wave
    
    // Snake along Y axis - HIGHER FREQUENCY
    // Was: h * 2.0 (1 wave). Now: h * 8.0 (4 waves)
    float snakeX = snoise(vec3(h * 8.0, t * 0.5, 0.0)) * whip;
    float snakeZ = snoise(vec3(h * 8.0, t * 0.5, 100.0)) * whip;
    
    // Apply snake
    pos.x += snakeX;
    pos.z += snakeZ;
    
    // === PULSING THICKNESS ===
    // Modulate width to make it look like blobs/packets of energy
    // High frequency noise
    // Was: h * 6.0. Now: h * 15.0 for smaller packets
    float pulse = 1.0 + snoise(vec3(h * 15.0, t * 2.0, 200.0)) * 0.2 * sqrt(h) * (0.5 + 0.5 * noiseAmp);
    
    // Only affect X/Z (thickness)
    pos.x *= pulse;
    pos.z *= pulse;
    
    // Pass modified local pos to fragment shader for noise coords
    vLocalPos = pos;
    
    // Transform to world space
    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPos = worldPos.xyz;

    vViewDir = normalize(cameraPosition - vWorldPos);
    
    // Simple normal
    vNormal = normalize(normalMatrix * normal);

    vViewDotNormal = abs(dot(vViewDir, vNormal));

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`

export const jetVolumetricFragmentShader = /* glsl */ `
  precision highp float;

  in vec2 vUv;
  in vec3 vWorldPos;
  in vec3 vLocalPos;
  in vec3 vViewDir;
  in vec3 vNormal;
  in float vJetSign;
  in float vViewDotNormal;

  layout(location = 0) out vec4 fragColor;

  uniform vec3 uJetColor;
  uniform float uJetIntensity;
  uniform float uJetHeight;
  uniform float uJetWidth;
  uniform float uJetFalloff; // Controls axial fade length
  uniform float uJetNoiseAmount; // Controls erosion and turbulence
  uniform float uJetPulsation;
  uniform float uTime;

  uniform sampler2D tSceneDepth;
  uniform vec2 uResolution;
  uniform float uNear;
  uniform float uFar;
  uniform float uSoftDepthRange;
  uniform float uDepthAvailable;

  // ============================================================
  // NOISE FUNCTIONS
  // ============================================================

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  // FBM for erosion and volume
  float fbm(vec3 p) {
    float f = 0.0;
    float w = 0.5;
    float freq = 1.0;
    for (int i = 0; i < 4; i++) { // Increased octaves for detail
      f += w * snoise(p * freq);
      p += vec3(12.3);
      freq *= 2.0;
      w *= 0.5;
    }
    return f;
  }

  // ============================================================
  // DEPTH UTILITIES
  // ============================================================

  float linearizeDepth(float depth) {
    float z = depth * 2.0 - 1.0;
    return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
  }

  float softDepthIntersection(vec3 worldPos) {
    if (uDepthAvailable < 0.5) return 1.0;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    float sceneDepth = texture(tSceneDepth, screenUV).r;
    if (sceneDepth < 0.001 || sceneDepth > 0.999) return 1.0;
    float sceneLinearDepth = linearizeDepth(sceneDepth);
    vec4 viewPos = viewMatrix * vec4(worldPos, 1.0);
    float fragmentDepth = -viewPos.z;
    float depthDiff = sceneLinearDepth - fragmentDepth;
    return smoothstep(0.0, uSoftDepthRange, depthDiff);
  }

  // ============================================================
  // MAIN
  // ============================================================

  void main() {
    float h = vLocalPos.y; 
    
    // Effective radius matching vertex shader
    float currentRadius = mix(0.05, 1.0, h);
    
    // Radial distance from axis
    float r = length(vLocalPos.xz);
    float rNorm = r / max(currentRadius, 0.001);
    
    // === COORDINATE SETUP ===
    // FIX: Scale noise coordinates by WORLD DIMENSIONS to avoid stretching
    // Scale XZ by width, Y by height
    // We multiply by a frequency factor (e.g. 2.0) to get base density
    vec3 worldScale = vec3(uJetHeight * uJetWidth, uJetHeight, uJetHeight * uJetWidth);
    vec3 p = vLocalPos * worldScale * 0.5; 
    
    // Parallax Offset - look deep into the plasma
    vec3 viewOffset = vViewDir * 0.5;
    p += viewOffset;

    // Flow speed - High speed "Fire Hose" effect
    float flowSpeed = 4.0 + h * 6.0;
    float flowTime = uTime * flowSpeed;
    
    // === NOISE GENERATION ===
    
    // 1. Core Structure (Medium freq)
    // Scale up for detail
    vec3 coreP = p * 2.0; 
    coreP.y -= flowTime;
    float coreNoise = fbm(coreP); // -1 to 1
    
    // 2. Fine Detail / Sparkles (Very High freq)
    vec3 fineP = p * 8.0;
    fineP.y -= flowTime * 1.5;
    float fineNoise = snoise(fineP);
    
    // 3. Erosion Noise (Structural)
    vec3 erodeP = p * 3.0;
    erodeP.y -= uTime * 3.0;
    float erosion = snoise(erodeP);
    
    // === DENSITY CALCULATION ===
    
    // Base radial falloff - Softer core
    float density = 1.0 - smoothstep(0.0, 1.2, rNorm); // 1.2 extends slightly past geo
    density = pow(density, 0.8); // Less aggressive falloff than 0.5
    
    // Edge Erosion
    float noiseAmp = clamp(uJetNoiseAmount, 0.0, 1.0);
    // Erode mainly the outer shell
    float edgeMask = smoothstep(0.3, 1.0, rNorm);
    
    // Erosion intensity
    density -= edgeMask * (erosion * 0.5 + 0.5) * 1.8 * noiseAmp;
    
    if (density < 0.0) discard;
    
    // Internal turbulence
    float coreInfluence = (coreNoise * 0.5 + 0.5);
    // Mix solid density with turbulent density based on noise amp
    density *= mix(1.0, coreInfluence, noiseAmp * 0.8);
    
    // Hotspots/Knots - Smaller and more frequent
    float knots = smoothstep(0.7, 1.0, coreNoise);
    density += knots * 1.5 * uJetPulsation;
    
    // Sparkles
    float sparkleVal = smoothstep(0.6, 1.0, fineNoise);
    density += sparkleVal * 0.8;
    
    // Axial Fade
    float baseFade = smoothstep(0.0, 0.05, h);
    float fadePoint = 1.0 / max(uJetFalloff * 0.5, 0.1); 
    float tipFade = smoothstep(fadePoint, fadePoint * 0.7, h); // Smoother fade
    
    density *= baseFade * tipFade;
    
    // Intensity
    float intensity = density * uJetIntensity * 3.0;
    
    // === COLOR GRADING ===
    
    vec3 userColor = uJetColor;
    // Cooler/Hotter colors
    vec3 energyColor = vec3(0.4, 0.8, 1.0); // Cyan/Electric
    vec3 coreColor = vec3(1.0, 1.0, 1.0);
    
    vec3 finalColor = userColor;
    
    // Smooth transition to energy color
    float energyMix = smoothstep(0.8, 3.0, intensity);
    finalColor = mix(finalColor, energyColor, energyMix);
    
    // Core white hot
    float coreMix = smoothstep(4.0, 8.0, intensity);
    finalColor = mix(finalColor, coreColor, coreMix);
    
    // === ALPHA & BLENDING ===
    
    float depthSoft = softDepthIntersection(vWorldPos);
    
    // Reduce opacity for wispy look
    float alpha = clamp(intensity * 0.8, 0.0, 1.0);
    alpha *= depthSoft;
    
    fragColor = vec4(finalColor * intensity, alpha);
  }

export const jetCompositeVertexShader = /* glsl */ `
  out vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

export const jetCompositeFragmentShader = /* glsl */ `
  precision highp float;

  in vec2 vUv;
  layout(location = 0) out vec4 fragColor;

  uniform sampler2D tScene;
  uniform sampler2D tJets;
  uniform float uJetOpacity;

  void main() {
    vec4 sceneColor = texture(tScene, vUv);
    vec4 jetColor = texture(tJets, vUv);

    vec3 combined = sceneColor.rgb + jetColor.rgb * uJetOpacity;
    fragColor = vec4(combined, sceneColor.a);
  }
`