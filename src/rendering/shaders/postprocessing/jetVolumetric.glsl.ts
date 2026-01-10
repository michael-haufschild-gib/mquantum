/**
 * Jet Volumetric Shader
 *
 * Renders polar jets as dramatic plasma beams on cone geometry.
 * Uses layered FBM noise, temperature-based coloring, and flowing
 * energy effects for impressive visual impact without raymarching.
 *
 * Key features:
 * - Multi-octave FBM noise for plasma tendrils
 * - Temperature gradient: white-hot core → blue → user color
 * - Flowing hotspots and energy knots
 * - Wispy edge dissolution
 * - Animated energy pulses traveling along jet axis
 * - Vertex displacement for organic movement
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
    
    // Normalized height (0 at base, 1 at tip)
    // Note: Cone geometry is flipped/translated, so position.y varies.
    // In our setup: Tip at 0, Base at 1 (for top jet) or -1 (bottom).
    float h = abs(pos.y); 
    
    // Displacement Intensity - increases with height (whip effect)
    float whip = pow(h, 1.5) * 0.15;
    
    // Time factor for animation
    float t = uTime * 2.0;
    
    // Displacement Calculation
    // Twist and wobble
    float displacementX = snoise(vec3(pos.y * 3.0, t * 0.5, 0.0)) * whip;
    float displacementZ = snoise(vec3(pos.y * 3.0, t * 0.5, 100.0)) * whip;
    
    // Apply displacement to local position
    pos.x += displacementX;
    pos.z += displacementZ;
    
    // Also modulate width slightly for pulsing
    float pulse = 1.0 + snoise(vec3(pos.y * 5.0, t, 200.0)) * 0.1 * h;
    pos.x *= pulse;
    pos.z *= pulse;

    vLocalPos = pos;
    
    // Standard transforms
    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPos = worldPos.xyz;

    vViewDir = normalize(cameraPosition - vWorldPos);
    
    // Recalculate normal for displacement?
    // Accurate analytical normal is hard with noise. 
    // We'll use the original normal but perturbed by the noise gradient ideally.
    // For now, simple normal matrix is "okay" but might look flat if displacement is large.
    // We can just use the original normal, the fragment shader noise will do the heavy lifting.
    vNormal = normalize(normalMatrix * normal);

    // Pre-compute view·normal for edge effects
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

  // ============================================================
  // NOISE & FBM
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

  // Domain Warping FBM for liquid/plasma look
  float fbm(vec3 p) {
    float f = 0.0;
    float w = 0.5;
    float freq = 1.0;
    for (int i = 0; i < 4; i++) {
      f += w * snoise(p * freq);
      p += vec3(0.12); // shift
      freq *= 2.0;
      w *= 0.5;
    }
    return f;
  }

  // Ridged noise for electricity/energy arcs
  float ridgedNoise(vec3 p) {
    float n = snoise(p);
    return 1.0 - abs(n);
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
    // Coordinate Setup
    // We want the noise to stick to the jet volume but flow.
    // vLocalPos.y is the axial distance (0 to Height).
    // vLocalPos.xz is the cross section.

    float h = abs(vLocalPos.y); // Height factor (0 to 1)
    
    // Distance from axis (radius) in local space
    float rLocal = length(vLocalPos.xz);
    
    // SCALED COORDINATES FOR ISOTROPIC NOISE
    // Scale local coords by the actual world dimensions to prevent stretching
    // Real dimensions: Y = uJetHeight, X/Z = uJetHeight * uJetWidth
    float aspect = uJetWidth; // radius / height ratio? No, width is a multiplier.
    // In JetsRenderPass: radius = height * width.
    // So X_world = X_local * height * width.
    // Y_world = Y_local * height.
    
    vec3 noiseScale = vec3(uJetHeight * uJetWidth, uJetHeight, uJetHeight * uJetWidth);
    
    // We can tune the frequency globally here
    // Use abs(y) to ensure symmetric outward flow for both jets
    vec3 p = vec3(vLocalPos.x, abs(vLocalPos.y), vLocalPos.z) * noiseScale * 0.2;
    
    // FLOW ANIMATION
    // Faster at the center, faster at the tip (acceleration).
    // Normalized height flow
    float flowSpeed = 5.0 + h * 10.0; 
    float timeOffset = uTime * flowSpeed;
    
    // PARALLAX OFFSET for Volumetric Illusion
    // Offset the noise sampling coordinate based on View Direction and Depth.
    // We simulate looking "into" the volume.
    vec3 viewOffset = vViewDir * 0.5; 
    
    // === LAYER 1: THE CORE (High Energy, Fast) ===
    vec3 coreCoord = p * vec3(1.0, 0.5, 1.0); // Slightly stretched along axis for speed look
    coreCoord.y -= timeOffset * 0.2; // Fast flow
    // Add twist
    coreCoord.x += sin(coreCoord.y * 2.0 + uTime) * 0.2;
    
    // Ridged noise for "electric" look
    float coreNoise = ridgedNoise(coreCoord + viewOffset); 
    coreNoise = pow(max(0.0, coreNoise), 3.0); // Sharpen
    
    // === LAYER 2: THE TURBULENCE (Volume, Billowing) ===
    vec3 turbCoord = p * 0.8;
    turbCoord.y -= timeOffset * 0.1;
    // Domain warp for liquid feel
    vec3 q = turbCoord;
    float f = fbm(q);
    vec3 r_vec = vec3(fbm(q + vec3(5.2, 1.3, 2.8)), fbm(q + vec3(1.3, 9.2, 0.3)), fbm(q + vec3(9.2, 2.8, 5.2)));
    float turb = fbm(q + 4.0 * r_vec);
    
    // === LAYER 3: SPARKS / PARTICLES (High Freq) ===
    vec3 sparkCoord = p * 4.0;
    sparkCoord.y -= timeOffset * 0.3;
    float sparks = snoise(sparkCoord);
    sparks = smoothstep(0.6, 1.0, sparks); // Only bright specks
    
    // ============================================================
    // COMPOSITING DENSITY
    // ============================================================
    
    // Radial Falloff 
    // rLocal goes from 0 to 1 (edge of cone).
    // We want a dense core and soft edges.
    
    float radialDensity = exp(-rLocal * rLocal * 20.0); // Tight Gaussian core
    float outerDensity = exp(-rLocal * rLocal * 4.0);   // Wider glow
    
    // Modulate density with noise
    float coreDensity = radialDensity * coreNoise * 2.5;
    float turbDensity = outerDensity * turb * 1.5;
    float sparkDensity = outerDensity * sparks * 0.8;
    
    float totalDensity = coreDensity + turbDensity + sparkDensity;
    
    // Axial Fade (Fade out at tip)
    // h is 0..1
    float dissipation = smoothstep(1.0, 0.85, h); 
    
    totalDensity *= dissipation;
    
    // Intensity Scaling
    float intensity = totalDensity * uJetIntensity;
    
    // ============================================================
    // COLOR GRADING
    // ============================================================
    
    vec3 baseColor = uJetColor;
    vec3 hotColor = mix(baseColor, vec3(1.0), 0.6); // Whitened version
    vec3 energyColor = vec3(0.4, 0.9, 1.0); // Electric Blue/Cyan for core
    
    vec3 finalColor = mix(baseColor, hotColor, smoothstep(0.2, 0.8, turb));
    finalColor = mix(finalColor, energyColor, smoothstep(0.5, 1.0, coreNoise));
    
    // Add "Heat" - white core
    finalColor += vec3(1.0) * smoothstep(3.0, 8.0, intensity);
    
    // Pulse Effect (Global)
    float pulse = 1.0 + sin(uTime * 3.0) * 0.15 * uJetPulsation;
    finalColor *= pulse;
    
    // ============================================================
    // ALPHA & BLENDING
    // ============================================================
    
    // Soft depth intersection
    float depthSoft = softDepthIntersection(vWorldPos);
    
    // Fresnel / View Alpha
    // Opaque in center, transparent at edges
    float viewAlpha = smoothstep(0.0, 0.8, vViewDotNormal);
    
    float alpha = clamp(intensity * viewAlpha, 0.0, 1.0);
    alpha *= depthSoft;
    
    // Additive blending premult
    fragColor = vec4(finalColor * intensity, alpha);
  }
`

/**
 * Simple vertex shader for fullscreen jet composite quad.
 */
export const jetCompositeVertexShader = /* glsl */ `
  out vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

/**
 * Fragment shader that composites jet buffer over scene with additive blending.
 */
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

    // Additive blending for emissive jets
    vec3 combined = sceneColor.rgb + jetColor.rgb * uJetOpacity;

    // Preserve scene alpha
    fragColor = vec4(combined, sceneColor.a);
  }
`