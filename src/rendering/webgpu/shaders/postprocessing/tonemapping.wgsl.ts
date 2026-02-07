/**
 * WGSL Tonemapping Shader
 *
 * Various tonemapping operators for HDR to LDR conversion.
 *
 * @module rendering/webgpu/shaders/postprocessing/tonemapping.wgsl
 */

export const tonemappingShader = /* wgsl */ `
// ============================================
// Tonemapping Shader
// ============================================

struct TonemapUniforms {
  exposure: f32,
  gamma: f32,
  mode: i32,  // 0=Linear, 1=Reinhard, 2=ACES, 3=Filmic, 4=Cineon, 5=AgX, 6=Neutral
  _padding: f32,
}

@group(0) @binding(0) var<uniform> uniforms: TonemapUniforms;
@group(0) @binding(1) var tInput: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var pos = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0)
  );
  var uvs = array<vec2f, 3>(
    vec2f(0.0, 1.0),
    vec2f(2.0, 1.0),
    vec2f(0.0, -1.0)
  );

  var output: VertexOutput;
  output.position = vec4f(pos[vertexIndex], 0.0, 1.0);
  output.uv = uvs[vertexIndex];
  return output;
}

// Simple Reinhard tonemapping
fn reinhardTonemap(color: vec3f) -> vec3f {
  return color / (color + vec3f(1.0));
}

// Extended Reinhard with white point
fn reinhardExtended(color: vec3f, whitePoint: f32) -> vec3f {
  let Lw = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  let Ld = Lw * (1.0 + Lw / (whitePoint * whitePoint)) / (1.0 + Lw);
  return color * (Ld / max(Lw, 0.0001));
}

// ACES Filmic Tonemapping
fn ACESFilm(color: vec3f) -> vec3f {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((color * (a * color + b)) / (color * (c * color + d) + e), vec3f(0.0), vec3f(1.0));
}

// Uncharted 2 Filmic Tonemapping
fn uncharted2Tonemap(x: vec3f) -> vec3f {
  let A = 0.15;  // Shoulder Strength
  let B = 0.50;  // Linear Strength
  let C = 0.10;  // Linear Angle
  let D = 0.20;  // Toe Strength
  let E = 0.02;  // Toe Numerator
  let F = 0.30;  // Toe Denominator
  return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
}

fn filmic(color: vec3f) -> vec3f {
  let W = 11.2;  // Linear White Point
  let curr = uncharted2Tonemap(color * 2.0);
  let whiteScale = vec3f(1.0) / uncharted2Tonemap(vec3f(W));
  return curr * whiteScale;
}

// Optimized Cineon tonemapping (Jim Hejl / Richard Burgess-Dawson)
// Matches Three.js OptimizedCineonToneMapping but without the built-in pow(2.2)
// gamma since our pipeline applies gamma separately via ToScreenPass sRGB output.
// Source: http://filmicgames.com/archives/75
fn cineonTonemap(color: vec3f) -> vec3f {
  let c = max(vec3f(0.0), color - 0.004);
  return (c * (6.2 * c + 0.5)) / (c * (6.2 * c + 1.7) + 0.06);
}

// PERF: Precomputed AgX matrix chains to reduce per-pixel matrix multiplies.
// AGX_INPUT_MATRIX = AgXInsetMatrix * LINEAR_SRGB_TO_LINEAR_REC2020
// Eliminates one matrix multiply in the AgX input path.
const AGX_INPUT_MATRIX = mat3x3f(
  vec3f(0.544812080052427, 0.140419345364893, 0.0888171375033576),
  vec3f(0.373797443602626, 0.754107783354027, 0.178859755365441),
  vec3f(0.0813809642208939, 0.105396747082020, 0.732315427189341)
);
// Output matrices cannot be combined (pow(2.2) separates them)
const AGX_OUTSET_MATRIX = mat3x3f(
  vec3f( 1.1271005818144368, -0.1413297634984383, -0.14132976349843826),
  vec3f(-0.11060664309660323,  1.157823702216272, -0.11060664309660294),
  vec3f(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405)
);
const LINEAR_REC2020_TO_LINEAR_SRGB = mat3x3f(
  vec3f( 1.6605, -0.1246, -0.0182),
  vec3f(-0.5876,  1.1329, -0.1006),
  vec3f(-0.0728, -0.0083,  1.1187)
);

// AgX contrast approximation polynomial
// PERF: Horner form reduces multiplies from ~12 to 6 per component
fn agxDefaultContrastApprox(x: vec3f) -> vec3f {
  return (((((15.5 * x - 40.14) * x + 31.96) * x - 6.868) * x + 0.4298) * x + 0.1191) * x - 0.00232;
}

// AgX Tonemapping (matches Three.js AgXToneMapping)
// Attempt to match the appearance of the look-dev AgX tonemapper.
// Uses Rec2020 color space for better hue preservation.
fn agxTonemap(color: vec3f) -> vec3f {
  let AgxMinEv = -12.47393;
  let AgxMaxEv = 4.026069;

  // PERF: Use precomputed AGX_INPUT_MATRIX = AgXInsetMatrix * LINEAR_SRGB_TO_LINEAR_REC2020
  // Eliminates one matrix multiply per pixel
  var c = AGX_INPUT_MATRIX * color;

  c = max(c, vec3f(1e-10));
  c = log2(c);
  c = (c - AgxMinEv) / (AgxMaxEv - AgxMinEv);
  c = clamp(c, vec3f(0.0), vec3f(1.0));

  c = agxDefaultContrastApprox(c);

  c = AGX_OUTSET_MATRIX * c;
  // pow(2.2) is integral to AgX algorithm (converts from AgX internal space to linear)
  c = pow(max(vec3f(0.0), c), vec3f(2.2));
  c = LINEAR_REC2020_TO_LINEAR_SRGB * c;

  return clamp(c, vec3f(0.0), vec3f(1.0));
}

// Neutral Tonemapping (Khronos PBR Neutral)
// https://modelviewer.dev/examples/tone-mapping
// Designed for physically-based rendering with minimal hue shift.
fn neutralTonemap(color: vec3f) -> vec3f {
  let StartCompression = 0.8 - 0.04;
  let Desaturation = 0.15;

  var c = color;

  let x = min(c.r, min(c.g, c.b));
  // PERF: Branchless offset selection
  let offset = select(0.04, x - 6.25 * x * x, x < 0.08);
  c -= offset;

  let peak = max(c.r, max(c.g, c.b));
  if (peak < StartCompression) {
    return c;
  }

  let d = 1.0 - StartCompression;
  let denominator = peak + d - StartCompression;
  let newPeak = 1.0 - d * d / max(denominator, 0.0001);
  let safePeak = max(peak, 0.0001);
  c *= newPeak / safePeak;

  let g = 1.0 - 1.0 / (Desaturation * (peak - newPeak) + 1.0);
  return mix(c, vec3f(newPeak), g);
}

// Gamma correction
fn gammaCorrect(color: vec3f, gamma: f32) -> vec3f {
  return pow(color, vec3f(1.0 / gamma));
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f {
  var color = textureSample(tInput, linearSampler, input.uv).rgb;

  // Apply exposure
  color *= uniforms.exposure;

  // Apply tonemapping based on mode
  var tonemapped: vec3f;
  switch (uniforms.mode) {
    case 0: {
      // Linear (no tonemapping)
      tonemapped = clamp(color, vec3f(0.0), vec3f(1.0));
    }
    case 1: {
      // Reinhard
      tonemapped = reinhardTonemap(color);
    }
    case 2: {
      // ACES Filmic
      tonemapped = ACESFilm(color);
    }
    case 3: {
      // Filmic (Uncharted 2)
      tonemapped = filmic(color);
    }
    case 4: {
      // Cineon (Optimized filmic, matches Three.js CineonToneMapping)
      tonemapped = cineonTonemap(color);
    }
    case 5: {
      // AgX (matches Three.js AgXToneMapping)
      tonemapped = agxTonemap(color);
    }
    case 6: {
      // Neutral (Khronos PBR Neutral, matches Three.js NeutralToneMapping)
      tonemapped = neutralTonemap(color);
    }
    default: {
      tonemapped = ACESFilm(color);
    }
  }

  // Apply gamma correction
  let result = gammaCorrect(tonemapped, uniforms.gamma);

  return vec4f(result, 1.0);
}
`
