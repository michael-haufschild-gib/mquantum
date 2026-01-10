/**
 * Jet Volumetric Shader - Soft Billowing Plasma
 *
 * Renders polar jets as soft, smoke-like volumetric plasma columns.
 * Inspired by NASA visualizations of astrophysical jets.
 *
 * KEY PRINCIPLES:
 * - Soft gaussian density falloff - NO hard edges
 * - Low alpha for wispy, cloud-like appearance
 * - Hot white core fading to cooler blue edges
 * - Large-scale organic turbulence
 * - Smooth gradients, NO geometric patterns
 *
 * @module rendering/shaders/postprocessing/jetVolumetric
 */

export const jetVolumetricVertexShader = /* glsl */ `
  out vec2 vUv;
  out vec3 vWorldPos;
  out vec3 vLocalPos;
  out vec3 vViewDir;
  out vec3 vNormal;
  out float vHeight;

  uniform float uTime;
  uniform float uJetNoiseAmount;

  // Simplex noise
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
    vec3 pos = position;
    float h = pos.y;
    vHeight = h;

    float t = uTime;
    float noiseAmp = uJetNoiseAmount;

    // === LARGE-SCALE BILLOWING MOTION ===
    // Use very LOW frequency noise for smooth, organic smoke-like motion

    // Primary slow serpentine wave (smoke rising)
    float wave1X = snoise(vec3(h * 1.2, t * 0.25, 0.0)) * 0.35 * noiseAmp * pow(h, 0.8);
    float wave1Z = snoise(vec3(h * 1.2, t * 0.25, 77.0)) * 0.35 * noiseAmp * pow(h, 0.8);

    // Secondary medium wave for billowing
    float wave2X = snoise(vec3(h * 2.5, t * 0.4, 33.0)) * 0.15 * noiseAmp * h;
    float wave2Z = snoise(vec3(h * 2.5, t * 0.4, 111.0)) * 0.15 * noiseAmp * h;

    pos.x += wave1X + wave2X;
    pos.z += wave1Z + wave2Z;

    // === ORGANIC THICKNESS PULSING ===
    float thickPulse = 1.0 + snoise(vec3(h * 1.5, t * 0.3, 200.0)) * 0.2 * noiseAmp;
    pos.x *= thickPulse;
    pos.z *= thickPulse;

    vLocalPos = pos;

    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPos = worldPos.xyz;
    vViewDir = normalize(cameraPosition - vWorldPos);
    vNormal = normalize(normalMatrix * normal);

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
  in float vHeight;

  layout(location = 0) out vec4 fragColor;

  uniform vec3 uJetColor;
  uniform float uJetIntensity;
  uniform float uJetHeight;
  uniform float uJetWidth;
  uniform float uJetFalloff;
  uniform float uJetNoiseAmount;
  uniform float uJetPulsation;
  uniform float uTime;

  uniform sampler2D tSceneDepth;
  uniform vec2 uResolution;
  uniform float uNear;
  uniform float uFar;
  uniform float uSoftDepthRange;
  uniform float uDepthAvailable;

  // Simplex noise
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

  // Domain-warped FBM for organic smoke turbulence
  float smokeNoise(vec3 p, float warp) {
    // Warp domain for organic look
    vec3 w = vec3(
      snoise(p * 0.7),
      snoise(p * 0.7 + vec3(31.0, 17.0, 53.0)),
      snoise(p * 0.7 + vec3(71.0, 29.0, 97.0))
    ) * warp;
    p += w;

    // Low octave FBM - we want smooth, not detailed
    float f = 0.0;
    f += 0.5 * snoise(p);
    f += 0.25 * snoise(p * 2.0);
    f += 0.125 * snoise(p * 4.0);
    return f;
  }

  float linearizeDepth(float d) {
    float z = d * 2.0 - 1.0;
    return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
  }

  float softDepthIntersection(vec3 worldPos) {
    if (uDepthAvailable < 0.5) return 1.0;
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    float sceneDepth = texture(tSceneDepth, screenUV).r;
    if (sceneDepth < 0.001 || sceneDepth > 0.999) return 1.0;
    float sceneLinear = linearizeDepth(sceneDepth);
    vec4 viewPos = viewMatrix * vec4(worldPos, 1.0);
    float fragDepth = -viewPos.z;
    return smoothstep(0.0, uSoftDepthRange, sceneLinear - fragDepth);
  }

  void main() {
    float h = vHeight;
    float t = uTime;
    float noiseAmp = uJetNoiseAmount;

    // === UV-BASED RADIAL POSITION ===
    float angle = (vUv.x - 0.5) * 2.0 * 3.14159;
    float viewFacing = cos(angle) * 0.5 + 0.5;

    // === PLASMA CORE STRUCTURE ===
    // Tight bright core, rapid falloff - plasma beam not smoke cloud
    float edgeDist = abs(vUv.x - 0.5) * 2.0;
    float coreProfile = exp(-edgeDist * edgeDist * 3.0); // Tight core

    // === FLOWING PLASMA TURBULENCE ===
    vec3 noiseP = vec3(vLocalPos.x * 2.0, h * 3.0 - t * 2.5, vLocalPos.z * 2.0);

    // Fast-moving plasma streaks along the jet
    float flowNoise = snoise(noiseP * 0.8);
    float streaks = snoise(vec3(edgeDist * 5.0, h * 8.0 - t * 4.0, flowNoise));
    streaks = streaks * 0.5 + 0.5;

    // Plasma intensity variation - bright pulses traveling up
    float plasmaWave = sin(h * 12.0 - t * 6.0) * 0.5 + 0.5;
    plasmaWave *= sin(h * 5.0 - t * 3.0 + flowNoise * 2.0) * 0.5 + 0.5;

    // === EMISSION PROFILE ===
    // Plasma GLOWS - it's emissive, not reflective
    float emission = coreProfile;
    emission *= 0.6 + streaks * 0.4 * noiseAmp;
    emission *= 0.7 + plasmaWave * 0.5 * uJetPulsation;

    // Edge dissipation with noise
    float edgeFade = 1.0 - smoothstep(0.3, 0.9, edgeDist);
    float edgeNoise = snoise(noiseP * 1.5) * 0.5 + 0.5;
    edgeFade *= mix(1.0, edgeNoise, noiseAmp * 0.5);
    emission *= edgeFade;

    // === HEIGHT FADE ===
    float baseFade = smoothstep(0.0, 0.1, h);
    float tipFade = 1.0 - smoothstep(0.7, 1.0, h);
    // Tip gets more diffuse/turbulent
    float tipTurbulence = smoothstep(0.5, 0.9, h) * snoise(noiseP * 2.0) * 0.3;
    emission *= baseFade * tipFade;
    emission = max(0.0, emission - tipTurbulence * noiseAmp);

    if (emission < 0.01) discard;

    // === COLOR: USER COLOR IS PRIMARY ===
    // The jet should BE the user's color, with slight core brightening
    vec3 baseColor = uJetColor;

    // Core gets slightly brighter/whiter, but user color dominates
    float coreBrightness = pow(coreProfile, 2.0);
    vec3 brightCore = mix(baseColor, baseColor + vec3(0.3, 0.3, 0.4), coreBrightness * 0.5);

    // Add some color variation from plasma dynamics
    float colorShift = streaks * 0.15 * noiseAmp;
    vec3 plasmaColor = mix(baseColor, brightCore, coreBrightness);
    plasmaColor += vec3(colorShift * 0.5, colorShift * 0.3, colorShift); // Slight blue shift in bright areas

    // === FINAL EMISSION ===
    // High intensity - this is GLOWING plasma
    float intensity = emission * uJetIntensity * 3.0;

    // Extra glow in core
    intensity += coreBrightness * uJetIntensity * 1.5;

    vec3 finalColor = plasmaColor * intensity;

    // HDR bloom-friendly: allow values > 1.0 for bloom to pick up
    finalColor = max(finalColor, vec3(0.0));

    // === ALPHA: TRANSPARENT BUT BRIGHT ===
    // Low alpha for transparency, high color for brightness
    // This creates the "glowing beam" look, not "thick smoke"
    float alpha = emission * 0.4;
    alpha += coreBrightness * 0.2; // Core slightly more opaque
    alpha *= softDepthIntersection(vWorldPos);
    alpha = clamp(alpha, 0.0, 0.6);

    fragColor = vec4(finalColor, alpha);
  }
`

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
    vec3 combined = sceneColor.rgb + jetColor.rgb * jetColor.a * uJetOpacity;
    fragColor = vec4(combined, sceneColor.a);
  }
`
