/**
 * Paper Texture WGSL Shader
 *
 * Fragment shader for paper texture overlay effect.
 * Extracted from PaperTexturePass.ts for file-size management.
 *
 * @module rendering/webgpu/passes/paperTextureShader.wgsl
 */

/**
 * WGSL Paper Texture Fragment Shader
 */
export const PAPER_TEXTURE_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec2f,
  time: f32,
  pixelRatio: f32,
  colorFront: vec4f,
  colorBack: vec4f,
  contrast: f32,
  roughness: f32,
  fiber: f32,
  fiberSize: f32,
  crumples: f32,
  crumpleSize: f32,
  folds: f32,
  foldCount: f32,
  drops: f32,
  fade: f32,
  seed: f32,
  quality: f32,
  intensity: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var tDiffuse: texture_2d<f32>;
@group(0) @binding(3) var tNoiseTexture: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

// ============================================================================
// Constants
// ============================================================================

const PI: f32 = 3.14159265358979323846;
const TWO_PI: f32 = 6.28318530718;

// ============================================================================
// Utility Functions
// ============================================================================

fn rotate2d(uv: vec2f, th: f32) -> vec2f {
  let c = cos(th);
  let s = sin(th);
  return vec2f(c * uv.x + s * uv.y, -s * uv.x + c * uv.y);
}

fn getUvFrame(uv: vec2f) -> f32 {
  let aax = 2.0 * fwidth(uv.x);
  let aay = 2.0 * fwidth(uv.y);

  let left = smoothstep(0.0, aax, uv.x);
  let right = 1.0 - smoothstep(1.0 - aax, 1.0, uv.x);
  let bottom = smoothstep(0.0, aay, uv.y);
  let top = 1.0 - smoothstep(1.0 - aay, 1.0, uv.y);

  return left * right * bottom * top;
}

// Texture-based random using R channel
fn randomR(p: vec2f) -> f32 {
  let uv = floor(p) / 100.0 + 0.5;
  return textureSample(tNoiseTexture, texSampler, fract(uv)).r;
}

// Texture-based random using G and B channels
fn randomGB(p: vec2f) -> vec2f {
  let uv = floor(p) / 50.0 + 0.5;
  return textureSample(tNoiseTexture, texSampler, fract(uv)).gb;
}

// Texture-based random using G channel
fn randomG(p: vec2f) -> f32 {
  let uv = floor(p) / 50.0 + 0.5;
  return textureSample(tNoiseTexture, texSampler, fract(uv)).g;
}

// ============================================================================
// Value Noise
// ============================================================================

fn valueNoise(st: vec2f) -> f32 {
  let i = floor(st);
  let f = fract(st);

  let a = randomR(i);
  let b = randomR(i + vec2f(1.0, 0.0));
  let c = randomR(i + vec2f(0.0, 1.0));
  let d = randomR(i + vec2f(1.0, 1.0));

  let u = f * f * (3.0 - 2.0 * f);
  let x1 = mix(a, b, u.x);
  let x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}

fn fbm(n: vec2f, octaves: i32) -> f32 {
  var total = 0.0;
  var amplitude = 0.4;
  var pos = n;
  for (var i = 0; i < 4; i++) {
    if (i >= octaves) { break; }
    total += valueNoise(pos) * amplitude;
    pos *= 1.99;
    amplitude *= 0.65;
  }
  return total;
}

// ============================================================================
// Roughness Noise (screen-space)
// ============================================================================

fn roughnessNoise(p: vec2f, octaves: i32) -> f32 {
  var pos = p * 0.1;
  var o = 0.0;
  for (var i = 0; i < 4; i++) {
    if (i >= octaves) { break; }
    let w = vec4f(floor(pos.x), floor(pos.y), ceil(pos.x), ceil(pos.y));
    let f = fract(pos);
    o += mix(
      mix(randomG(w.xy), randomG(vec2f(w.x, w.w)), f.y),
      mix(randomG(w.zy), randomG(w.zw), f.y),
      f.x
    );
    // 0.2 / exp(y) ≡ 0.2 * exp(-y) — replace divide with multiply (GPU div is ~3x slower)
    o += 0.2 * exp(-2.0 * abs(sin(0.2 * pos.x + 0.5 * pos.y)));
    pos *= 2.1;
  }
  return o / 3.0;
}

// ============================================================================
// Fiber Noise (FBM-based)
// ============================================================================

fn fiberRandom(p: vec2f) -> f32 {
  let uv = floor(p) / 100.0;
  return textureSample(tNoiseTexture, texSampler, fract(uv)).b;
}

fn fiberValueNoise(st: vec2f) -> f32 {
  let i = floor(st);
  let f = fract(st);

  let a = fiberRandom(i);
  let b = fiberRandom(i + vec2f(1.0, 0.0));
  let c = fiberRandom(i + vec2f(0.0, 1.0));
  let d = fiberRandom(i + vec2f(1.0, 1.0));

  let u = f * f * (3.0 - 2.0 * f);
  let x1 = mix(a, b, u.x);
  let x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}

fn fiberNoiseFbm(n: vec2f, seedOffset: vec2f, octaves: i32) -> f32 {
  var total = 0.0;
  var amplitude = 1.0;
  var pos = n;
  for (var i = 0; i < 4; i++) {
    if (i >= octaves) { break; }
    pos = rotate2d(pos, 0.7);
    total += fiberValueNoise(pos + seedOffset) * amplitude;
    pos *= 2.0;
    amplitude *= 0.6;
  }
  return total;
}

fn fiberNoise(uv: vec2f, seedOffset: vec2f, octaves: i32) -> f32 {
  let epsilon = 0.001;
  let n1 = fiberNoiseFbm(uv + vec2f(epsilon, 0.0), seedOffset, octaves);
  let n2 = fiberNoiseFbm(uv - vec2f(epsilon, 0.0), seedOffset, octaves);
  let n3 = fiberNoiseFbm(uv + vec2f(0.0, epsilon), seedOffset, octaves);
  let n4 = fiberNoiseFbm(uv - vec2f(0.0, epsilon), seedOffset, octaves);
  return length(vec2f(n1 - n2, n3 - n4)) / (2.0 * epsilon);
}

// ============================================================================
// Crumple Pattern
// ============================================================================

// crumpledNoise specialized by exponent to avoid pow(x, 16.0) and pow(x, 2.0).
// pow(x, 16) compiles to exp2(16*log2(x)) = 1 log + 1 mul + 1 exp; 4 squarings is strictly cheaper.
// pow(x, 2)  compiles similarly; 1 multiply is strictly cheaper.
// Per pixel with crumples enabled: crumplesShape runs twice (finite-diff) → saves ~36 pow() calls.
fn crumpledNoise16(t: vec2f) -> f32 {
  let p = floor(t);
  var wsum = 0.0;
  var cl = 0.0;

  for (var y = -1; y < 2; y++) {
    for (var x = -1; x < 2; x++) {
      let b = vec2f(f32(x), f32(y));
      let q = b + p;
      let q2 = q - floor(q / 8.0) * 8.0;
      let c = q + randomGB(q2);
      let r = c - t;
      let sx = smoothstep(0.0, 1.0, 1.0 - abs(r.x));
      let sy = smoothstep(0.0, 1.0, 1.0 - abs(r.y));
      // x^16 via 4 squarings
      let sx2 = sx * sx;
      let sx4 = sx2 * sx2;
      let sx8 = sx4 * sx4;
      let sx16 = sx8 * sx8;
      let sy2 = sy * sy;
      let sy4 = sy2 * sy2;
      let sy8 = sy4 * sy4;
      let sy16 = sy8 * sy8;
      let w = sx16 * sy16;
      cl += (0.5 + 0.5 * sin((q2.x + q2.y * 5.0) * 8.0)) * w;
      wsum += w;
    }
  }
  let result = select(0.0, cl / wsum, wsum != 0.0);
  return sqrt(result) * 2.0;
}

fn crumpledNoise2(t: vec2f) -> f32 {
  let p = floor(t);
  var wsum = 0.0;
  var cl = 0.0;

  for (var y = -1; y < 2; y++) {
    for (var x = -1; x < 2; x++) {
      let b = vec2f(f32(x), f32(y));
      let q = b + p;
      let q2 = q - floor(q / 8.0) * 8.0;
      let c = q + randomGB(q2);
      let r = c - t;
      let sx = smoothstep(0.0, 1.0, 1.0 - abs(r.x));
      let sy = smoothstep(0.0, 1.0, 1.0 - abs(r.y));
      let w = (sx * sx) * (sy * sy);
      cl += (0.5 + 0.5 * sin((q2.x + q2.y * 5.0) * 8.0)) * w;
      wsum += w;
    }
  }
  let result = select(0.0, cl / wsum, wsum != 0.0);
  return sqrt(result) * 2.0;
}

fn crumplesShape(uv: vec2f) -> f32 {
  return crumpledNoise16(uv * 0.25) * crumpledNoise2(uv * 0.5);
}

// ============================================================================
// Folds Pattern
// ============================================================================

fn folds(uv: vec2f, foldCount: f32, seed: f32) -> vec2f {
  var pp = vec3f(0.0);
  var l = 9.0;
  let maxFolds = i32(foldCount);

  for (var i = 0; i < 15; i++) {
    if (i >= maxFolds) { break; }
    let rand = randomGB(vec2f(f32(i), f32(i) * seed));
    let an = rand.x * TWO_PI;
    let p = vec2f(cos(an), sin(an)) * rand.y;
    let dist = distance(uv, p);
    l = min(l, dist);

    if (l == dist) {
      pp = vec3f(uv.x - p.x, uv.y - p.y, dist);
    }
  }
  return mix(pp.xy, vec2f(0.0), pow(pp.z, 0.25));
}

// ============================================================================
// Drops Pattern
// ============================================================================

fn drops(uv: vec2f, seed: f32) -> f32 {
  let iDropsUV = floor(uv);
  let fDropsUV = fract(uv);
  var dropsMinDist = 1.0;

  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      let neighbor = vec2f(f32(i), f32(j));
      let offset = randomGB(iDropsUV + neighbor);
      let offsetAnim = 0.5 + 0.5 * sin(10.0 * seed + TWO_PI * offset);
      let pos = neighbor + offsetAnim - fDropsUV;
      let dist = length(pos);
      dropsMinDist = min(dropsMinDist, dropsMinDist * dist);
    }
  }
  return 1.0 - smoothstep(0.05, 0.09, pow(dropsMinDist, 0.5));
}

// ============================================================================
// Main
// ============================================================================

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.uv;

  // Sample input texture
  let inputColor = textureSample(tDiffuse, texSampler, uv);

  // Early exit if effect is disabled
  if (uniforms.intensity < 0.001) {
    return inputColor;
  }

  // Pattern UV (centered, aspect-corrected)
  let aspect = uniforms.resolution.x / uniforms.resolution.y;
  let patternUV = (uv - 0.5) * 5.0 * vec2f(aspect, 1.0);

  // Screen-space UV for roughness
  let fragCoord = input.position.xy;
  let roughnessUv = 1.5 * (fragCoord - 0.5 * uniforms.resolution) / uniforms.pixelRatio;

  // Initialize normal accumulator
  var normal = vec2f(0.0);
  var normalImage = vec2f(0.0);

  // Quality-based octave counts
  // Low (0): 2 octaves, Medium (1): 3 octaves, High (2): 4 octaves
  let roughnessOctaves = select(select(2, 3, uniforms.quality >= 1.0), 4, uniforms.quality >= 2.0);
  let fiberOctaves = select(select(2, 3, uniforms.quality >= 1.0), 4, uniforms.quality >= 2.0);
  let fbmOctaves = select(2, 3, uniforms.quality >= 0.5);

  // ========== Roughness (skip if disabled) ==========
  var roughness = 0.0;
  if (uniforms.roughness > 0.001) {
    roughness = roughnessNoise(roughnessUv + vec2f(1.0, 0.0), roughnessOctaves) -
                roughnessNoise(roughnessUv - vec2f(1.0, 0.0), roughnessOctaves);
  }

  // ========== Fiber (skip if disabled) ==========
  var fiber = 0.0;
  if (uniforms.fiber > 0.001) {
    let fiberUV = 2.0 / max(0.1, uniforms.fiberSize) * patternUV;
    fiber = fiberNoise(fiberUV, vec2f(0.0), fiberOctaves);
    fiber = 0.5 * uniforms.fiber * (fiber - 1.0);
  }

  // ========== Crumples (medium+ quality) ==========
  var crumples = 0.0;
  if (uniforms.quality >= 1.0 && uniforms.crumples > 0.001) {
    let crumplesUV = fract(patternUV * 0.02 / max(0.1, uniforms.crumpleSize) - uniforms.seed) * 32.0;
    crumples = uniforms.crumples * (crumplesShape(crumplesUV + vec2f(0.05, 0.0)) -
                                     crumplesShape(crumplesUV));
  }

  // ========== Folds (medium+ quality) ==========
  var w = vec2f(0.0);
  var w2 = vec2f(0.0);
  if (uniforms.quality >= 1.0 && uniforms.folds > 0.001) {
    var foldsUV = patternUV * 0.12;
    foldsUV = rotate2d(foldsUV, 4.0 * uniforms.seed);
    w = folds(foldsUV, uniforms.foldCount, uniforms.seed);
    foldsUV = rotate2d(foldsUV + 0.007 * cos(uniforms.seed), 0.01 * sin(uniforms.seed));
    w2 = folds(foldsUV, uniforms.foldCount, uniforms.seed);
  }

  // ========== Drops (high quality only) ==========
  var dropsVal = 0.0;
  if (uniforms.quality >= 2.0 && uniforms.drops > 0.001) {
    dropsVal = uniforms.drops * drops(patternUV * 2.0, uniforms.seed);
  }

  // ========== Fade mask ==========
  var fadeVal = 0.0;
  if (uniforms.fade > 0.001) {
    fadeVal = uniforms.fade * fbm(0.17 * patternUV + 10.0 * uniforms.seed, fbmOctaves);
    fadeVal = clamp(8.0 * fadeVal * fadeVal * fadeVal, 0.0, 1.0);

    // Apply fade to all effects
    w = mix(w, vec2f(0.0), fadeVal);
    w2 = mix(w2, vec2f(0.0), fadeVal);
    crumples = mix(crumples, 0.0, fadeVal);
    dropsVal = mix(dropsVal, 0.0, fadeVal);
    fiber *= mix(1.0, 0.5, fadeVal);
    roughness *= mix(1.0, 0.5, fadeVal);
  }

  // ========== Accumulate normals ==========
  normal += uniforms.folds * min(5.0 * uniforms.contrast, 1.0) * 4.0 * max(vec2f(0.0), w + w2);
  normalImage += uniforms.folds * 2.0 * w;

  normal += crumples;
  normalImage += 1.5 * crumples;

  normal += 3.0 * dropsVal;
  normalImage += 0.2 * dropsVal;

  normal += uniforms.roughness * 1.5 * roughness;
  normal += fiber;

  normalImage += uniforms.roughness * 0.75 * roughness;
  normalImage += 0.2 * fiber;

  // ========== Lighting calculation ==========
  // Precomputed normalize(vec3f(1,2,1)) = (1,2,1) / sqrt(6). Saves 1 normalize/pixel.
  const lightDirN = vec3f(0.40824829, 0.81649658, 0.40824829);
  let res = dot(
    normalize(vec3f(normal, 9.5 - 9.0 * pow(uniforms.contrast, 0.1))),
    lightDirN
  );

  // ========== Color blending ==========
  let fgColor = uniforms.colorFront.rgb * uniforms.colorFront.a;
  let fgOpacity = uniforms.colorFront.a;
  let bgColor = uniforms.colorBack.rgb * uniforms.colorBack.a;
  let bgOpacity = uniforms.colorBack.a;

  // Image displacement + frame mask preserve edge behavior from the source implementation.
  let imageUV = uv + 0.02 * normalImage;
  var frame = getUvFrame(imageUV);
  let imageSampleUV = clamp(imageUV, vec2f(0.0), vec2f(1.0));
  var imageColor = textureSample(tDiffuse, texSampler, imageSampleUV);
  let relief = 0.6 * pow(uniforms.contrast, 0.4) * (res - 0.7);
  imageColor = vec4f(imageColor.rgb + relief, imageColor.a);

  frame *= imageColor.a;

  // Paper texture color
  var paperColor = fgColor * res;
  var paperOpacity = fgOpacity * res;

  paperColor += bgColor * (1.0 - paperOpacity);
  paperOpacity += bgOpacity * (1.0 - paperOpacity);
  paperOpacity = mix(paperOpacity, 1.0, frame);

  // Apply drops darkening
  paperColor -= 0.007 * dropsVal;

  // Blend paper with displaced image using frame mask
  paperColor = mix(paperColor, imageColor.rgb, frame);

  // Global intensity control for runtime tuning
  let finalColor = mix(inputColor.rgb, paperColor, uniforms.intensity);
  let finalAlpha = mix(inputColor.a, paperOpacity, uniforms.intensity);

  return vec4f(finalColor, finalAlpha);
}
`
