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
    // because we translated the geometry in the RenderPass.
    float h = pos.y; 
    
    // === SNAKING MOTION ===
    // Low frequency large displacement
    // "Snaking" increases with height (whip effect)
    float whip = pow(h, 1.2) * 0.3; // Significant displacement at tip
    float t = uTime * 2.0;
    
    // Snake along Y axis
    float snakeX = snoise(vec3(h * 2.0, t * 0.5, 0.0)) * whip;
    float snakeZ = snoise(vec3(h * 2.0, t * 0.5, 100.0)) * whip;
    
    // Apply snake
    pos.x += snakeX;
    pos.z += snakeZ;
    
    // === PULSING THICKNESS ===
    // Modulate width to make it look like blobs/packets of energy
    // High frequency noise
    float pulse = 1.0 + snoise(vec3(h * 6.0, t * 3.0, 200.0)) * 0.3 * sqrt(h);
    
    // Only affect X/Z (thickness)
    pos.x *= pulse;
    pos.z *= pulse;
    
    // Pass modified local pos to fragment shader for noise coords
    vLocalPos = pos;
    
    // Transform to world space
    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPos = worldPos.xyz;

    vViewDir = normalize(cameraPosition - vWorldPos);
    
    // Approximate normal based on displacement? 
    // For volumetric clouds, standard normals are often misleading.
    // We'll use the original normal but let's perturb it slightly for the Fresnel calculation later.
    // Actually, simple normal is fine, we do heavy lifting in frag.
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
    for (int i = 0; i < 3; i++) {
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
    // Height factor (0 at base/origin, 1 at tip)
    // Cylinder translated to [0,1] range in Y
    float h = vLocalPos.y; 
    
    // Effective radius at this height (linear interpolation from 0.05 to 1.0)
    // Note: This matches the vertex shader geometry construction
    // We use this to normalize radial distance for consistent density
    float currentRadius = mix(0.05, 1.0, h);
    
    // Radial distance from axis
    float r = length(vLocalPos.xz);
    
    // Normalized radial coord (0 at center, 1 at mesh edge)
    // We add a safety margin because vertex displacement might push vertices out
    float rNorm = r / max(currentRadius, 0.001);
    
    // === COORDINATE SETUP ===
    // Use scale-independent noise coordinates
    vec3 p = vLocalPos * vec3(uJetHeight, 1.0, uJetHeight); // Scale XZ to match world scale approx
    
    // Parallax Offset - look deep into the plasma
    vec3 viewOffset = vViewDir * 0.4;
    p += viewOffset;

    // === FLOW ANIMATION ===
    // High speed "Fire Hose" effect
    // Noise flows UP (along Y) fast
    float flowSpeed = 6.0 + h * 4.0; // Faster at tip
    float flowTime = uTime * flowSpeed;
    
    // === NOISE GENERATION ===
    
    // 1. Core Structure (Low freq, fast)
    vec3 coreP = p * 1.5;
    coreP.y -= flowTime;
    float coreNoise = fbm(coreP); // -1 to 1
    
    // 2. Fine Detail / Sparkles (High freq, very fast)
    vec3 fineP = p * 5.0;
    fineP.y -= flowTime * 1.5;
    float fineNoise = snoise(fineP);
    
    // 3. Erosion Noise (Static-ish texture for edges)
    // Moves slower to give "structure" to the beam
    vec3 erodeP = p * 2.0;
    erodeP.y -= uTime * 2.0;
    float erosion = snoise(erodeP);
    
    // === DENSITY CALCULATION ===
    
    // Base radial falloff (Soft cylinder)
    // Make it hollow-ish? No, plasma beams are usually dense cores.
    float density = 1.0 - smoothstep(0.0, 1.0, rNorm);
    density = pow(density, 0.5); // Push density out a bit
    
    // Edge Erosion:
    // If we are near the edge (rNorm > 0.5), subtract noise
    // This breaks the straight line silhouette
    float edgeMask = smoothstep(0.4, 1.0, rNorm);
    density -= edgeMask * (erosion * 0.5 + 0.5) * 1.5;
    
    // Discard if fully eroded
    if (density < 0.0) discard;
    
    // Modulate density with core noise (internal turbulence)
    density *= (coreNoise * 0.5 + 0.5) + 0.5;
    
    // Add "Hotspots" - bright knots
    float knots = smoothstep(0.6, 1.0, coreNoise);
    density += knots * 2.0 * uJetPulsation;
    
    // Add sparkles
    float sparkleVal = smoothstep(0.7, 1.0, fineNoise);
    density += sparkleVal * 1.0;
    
    // Axial Fade
    // Fade in at base (avoid hard clip with horizon)
    // Fade out at tip (dissipate)
    float fade = smoothstep(0.0, 0.1, h) * smoothstep(1.0, 0.8, h);
    density *= fade;
    
    // Overall Intensity
    float intensity = density * uJetIntensity * 3.0;
    
    // === COLOR GRADING ===
    
    // Heat map:
    // Low intensity: Dark/Transparent
    // Mid intensity: User Color
    // High intensity: Cyan/White (Energy)
    
    vec3 userColor = uJetColor;
    vec3 hotColor = vec3(0.5, 0.9, 1.0); // Electric Blue/Cyan
    vec3 coreColor = vec3(1.0, 1.0, 1.0); // White
    
    vec3 finalColor = userColor;
    
    // Mix to hot color based on intensity
    float heat = smoothstep(0.5, 2.0, intensity);
    finalColor = mix(finalColor, hotColor, heat);
    
    // Mix to white core
    float whiteHeat = smoothstep(3.0, 6.0, intensity);
    finalColor = mix(finalColor, coreColor, whiteHeat);
    
    // === ALPHA & BLENDING ===
    
    float depthSoft = softDepthIntersection(vWorldPos);
    
    // View alpha - more opaque in center/thick parts
    // But for volume, edge falloff (Fresnel) is handled by density erosion mostly
    float alpha = clamp(intensity, 0.0, 1.0);
    
    alpha *= depthSoft;
    
    // Final premultiplied alpha
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
