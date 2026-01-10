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

  void main() {
    vUv = uv;
    vLocalPos = position;
    vJetSign = uJetSign;

    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;

    vViewDir = normalize(cameraPosition - vWorldPos);
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
  // OPTIMIZED NOISE FUNCTIONS
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

  // FBM with 4 octaves - creates wispy plasma tendrils
  float fbm(vec3 p) {
    float f = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i = 0; i < 4; i++) {
      f += amp * snoise(p * freq);
      freq *= 2.0;
      amp *= 0.5;
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
  // PLASMA JET MAIN
  // ============================================================

  void main() {
    float axialDist = abs(vLocalPos.y);
    float radialDist = length(vLocalPos.xz);
    float normalizedAxial = axialDist; // 0 at base, 1 at tip (cone is unit height)

    // Angle around jet axis for spiral effects
    float theta = atan(vLocalPos.z, vLocalPos.x);

    // ============================================================
    // PLASMA STRUCTURE - Multiple layers with different behaviors
    // ============================================================

    // === CORE: Blazing hot central beam ===
    float coreWidth = 0.08;
    float core = exp(-radialDist * radialDist / (coreWidth * coreWidth));

    // === INNER PLASMA: Bright turbulent region ===
    float innerWidth = 0.25;
    float inner = exp(-radialDist * radialDist / (innerWidth * innerWidth));

    // === OUTER ENVELOPE: Wispy dissipating edges ===
    float outerWidth = 0.6;
    float outer = exp(-radialDist * radialDist / (outerWidth * outerWidth));

    // ============================================================
    // FLOWING PLASMA NOISE - Moves along jet axis
    // ============================================================

    // Flow speed increases toward tip (relativistic acceleration)
    float flowSpeed = 2.0 + normalizedAxial * 3.0;
    float flowOffset = uTime * flowSpeed * vJetSign;

    // Large-scale plasma structure (slow-moving base turbulence)
    vec3 largeCoord = vec3(
      vLocalPos.x * 2.0,
      vLocalPos.y * 1.5 - flowOffset * 0.3,
      vLocalPos.z * 2.0
    );
    float largeTurb = fbm(largeCoord) * 0.5 + 0.5;

    // Medium-scale tendrils (faster flowing)
    vec3 medCoord = vec3(
      vLocalPos.x * 4.0 + sin(theta * 3.0) * 0.2,
      vLocalPos.y * 3.0 - flowOffset * 0.6,
      vLocalPos.z * 4.0 + cos(theta * 3.0) * 0.2
    );
    float medTurb = fbm(medCoord) * 0.5 + 0.5;

    // Fine detail (fastest, creates sparkle)
    vec3 fineCoord = vec3(
      vLocalPos.x * 10.0,
      vLocalPos.y * 8.0 - flowOffset,
      vLocalPos.z * 10.0
    );
    float fineTurb = snoise(fineCoord) * 0.5 + 0.5;

    // ============================================================
    // ENERGY HOTSPOTS - Bright knots traveling along jet
    // ============================================================

    // Multiple hotspots at different phases
    float hotspot1 = sin(axialDist * 8.0 - uTime * 4.0 * vJetSign) * 0.5 + 0.5;
    float hotspot2 = sin(axialDist * 12.0 - uTime * 6.0 * vJetSign + 2.0) * 0.5 + 0.5;
    float hotspot3 = sin(axialDist * 5.0 - uTime * 2.5 * vJetSign + 4.0) * 0.5 + 0.5;

    // Hotspots are brighter near the core
    float hotspotMask = inner * inner;
    float hotspots = (hotspot1 * hotspot2 + hotspot3 * 0.5) * hotspotMask;
    hotspots = pow(hotspots, 1.5) * 2.0;

    // ============================================================
    // SPIRAL STRUCTURE - Magnetic field lines
    // ============================================================

    float spiralFreq = 6.0;
    float spiralPhase = theta * spiralFreq + axialDist * 4.0 - uTime * 2.0 * vJetSign;
    float spiral = sin(spiralPhase) * 0.5 + 0.5;
    spiral = pow(spiral, 2.0) * inner * 0.5;

    // ============================================================
    // AXIAL FALLOFF - Energy dissipates along jet
    // ============================================================

    // Smooth falloff with noise variation
    float baseFalloff = exp(-normalizedAxial * uJetFalloff * 0.8);
    float noisyFalloff = baseFalloff * (0.7 + largeTurb * 0.3);

    // Edge fade - jet becomes more diffuse at tip
    float edgeExpansion = 1.0 + normalizedAxial * 0.5;

    // ============================================================
    // COMBINE PLASMA LAYERS
    // ============================================================

    float noiseIntensity = uJetNoiseAmount;

    // Core: mostly stable, slight turbulence
    float coreLayer = core * (0.9 + fineTurb * 0.1 * noiseIntensity);
    coreLayer *= noisyFalloff;
    coreLayer += hotspots * core * uJetPulsation;

    // Inner: turbulent plasma
    float innerLayer = inner * mix(1.0, medTurb * largeTurb, noiseIntensity * 0.7);
    innerLayer *= noisyFalloff;
    innerLayer += spiral * uJetPulsation;

    // Outer: wispy tendrils that break apart
    float wisps = pow(medTurb * fineTurb, 0.5);
    float outerLayer = outer * mix(0.3, wisps, noiseIntensity);
    outerLayer *= noisyFalloff * (0.5 + largeTurb * 0.5);

    // ============================================================
    // EDGE SOFTNESS - View-dependent transparency
    // ============================================================

    // More transparent when viewing edge-on (volumetric look)
    float edgeSoft = pow(vViewDotNormal, 0.5);
    edgeSoft = mix(0.3, 1.0, edgeSoft);

    // ============================================================
    // USER COLOR DOMINANT COLORING
    // ============================================================

    // Only the very core gets white-hot, rest uses user color
    // core² makes white region much smaller (only very center)
    float coreHeat = core * core * core; // Cubic falloff - very small white region

    // User color is the base, with bright white only at the hottest core
    vec3 userColor = uJetColor;
    vec3 brightCore = vec3(1.0, 1.0, 1.0);

    // Boost user color brightness for plasma glow effect
    vec3 boostedUserColor = userColor * 1.5 + vec3(0.1, 0.15, 0.2);

    // Mix: mostly user color, white only at extreme core
    // coreHeat is very small except right at center
    vec3 plasmaColor = mix(boostedUserColor, brightCore, coreHeat * 0.6);

    // Add subtle color variation from noise (keeps it interesting)
    vec3 colorShift = vec3(
      fineTurb * 0.05,
      medTurb * 0.08,
      largeTurb * 0.1
    );
    plasmaColor += colorShift * noiseIntensity * 0.5;

    // ============================================================
    // DEPTH INTERSECTION
    // ============================================================

    float depthSoft = softDepthIntersection(vWorldPos);

    // ============================================================
    // FINAL COMPOSITING
    // ============================================================

    // Combine all layers with different weights
    float density = coreLayer * 2.0 + innerLayer * 1.5 + outerLayer * 0.5;
    density *= edgeSoft * depthSoft;

    // Intensity scaling (keep moderate to avoid blowout)
    float intensity = uJetIntensity * (1.0 + hotspots * 0.3);

    // Final alpha - exponential for natural volumetric look
    float alpha = 1.0 - exp(-density * intensity * 0.2);
    alpha = clamp(alpha, 0.0, 1.0);

    // Subtle core brightness boost (avoid extreme values)
    float coreBrightness = 1.0 + coreHeat * 0.8;
    plasmaColor *= coreBrightness;

    // Premultiplied alpha output for additive blending
    vec3 finalColor = plasmaColor * alpha;

    // Very subtle bloom boost for core - use user color tint, not pure white
    vec3 bloomTint = mix(userColor, vec3(1.0), 0.3);
    finalColor += bloomTint * coreHeat * intensity * 0.1;
    finalColor = min(finalColor, vec3(2.5)); // Clamp to prevent extreme values

    fragColor = vec4(finalColor, alpha);
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
