/**
 * WGSL SMAA Shader
 *
 * Subpixel Morphological Anti-Aliasing (SMAA) implementation.
 * A three-pass technique: edge detection, blending weight calculation, and neighborhood blending.
 *
 * Based on the original SMAA paper by Jimenez et al. (2012)
 * "SMAA: Enhanced Subpixel Morphological Antialiasing"
 *
 * Uses textureSampleLevel instead of textureSample to avoid WGSL uniform control flow
 * restrictions in conditional branches and iterative search loops.
 *
 * @module rendering/webgpu/shaders/postprocessing/smaa.wgsl
 */

export const smaaEdgeDetectionShader = /* wgsl */ `
// ============================================
// SMAA Edge Detection Pass
// ============================================
// Detects edges using luminance-based color differences.
// Outputs a 2-channel texture with horizontal and vertical edge flags.

struct SMAAUniforms {
  resolution: vec2f,
  threshold: f32,      // Edge detection threshold (default: 0.1)
  _padding: f32,
}

@group(0) @binding(0) var<uniform> uniforms: SMAAUniforms;
@group(0) @binding(1) var tInput: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) offset0: vec4f,  // Left, top offsets
  @location(2) offset1: vec4f,  // Right, bottom offsets
  @location(3) offset2: vec4f,  // Second left/top pixel for diagonal detection
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

  let texelSize = 1.0 / uniforms.resolution;

  // Precompute offsets for edge detection
  output.offset0 = vec4f(
    output.uv.x - texelSize.x,  // left
    output.uv.y,
    output.uv.x,
    output.uv.y - texelSize.y   // top (remember: Y is flipped)
  );
  output.offset1 = vec4f(
    output.uv.x + texelSize.x,  // right
    output.uv.y,
    output.uv.x,
    output.uv.y + texelSize.y   // bottom
  );
  output.offset2 = vec4f(
    output.uv.x - 2.0 * texelSize.x,  // second left
    output.uv.y,
    output.uv.x,
    output.uv.y - 2.0 * texelSize.y   // second top
  );

  return output;
}

fn luminance(color: vec3f) -> f32 {
  return dot(color, vec3f(0.2126, 0.7152, 0.0722));
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let threshold = uniforms.threshold;

  // Sample luminance at current position and all neighbors upfront
  // Uses textureSampleLevel to allow calling from any control flow
  let L = luminance(textureSampleLevel(tInput, linearSampler, input.uv, 0.0).rgb);
  let Lleft = luminance(textureSampleLevel(tInput, linearSampler, input.offset0.xy, 0.0).rgb);
  let Ltop = luminance(textureSampleLevel(tInput, linearSampler, input.offset0.zw, 0.0).rgb);
  let Lright = luminance(textureSampleLevel(tInput, linearSampler, input.offset1.xy, 0.0).rgb);
  let Lbottom = luminance(textureSampleLevel(tInput, linearSampler, input.offset1.zw, 0.0).rgb);
  let Lleftleft = luminance(textureSampleLevel(tInput, linearSampler, input.offset2.xy, 0.0).rgb);
  let Ltoptop = luminance(textureSampleLevel(tInput, linearSampler, input.offset2.zw, 0.0).rgb);

  // Calculate deltas
  var delta = vec4f(
    abs(L - Lleft),
    abs(L - Ltop),
    0.0, 0.0
  );

  // Detect edges
  var edges = step(vec2f(threshold), delta.xy);

  // Discard if no edges detected
  if (dot(edges, vec2f(1.0)) == 0.0) {
    discard;
  }

  // Calculate right and bottom deltas for local contrast adaptation
  delta = vec4f(delta.xy, abs(L - Lright), abs(L - Lbottom));

  // Calculate maximum delta for local contrast adaptation
  var maxDelta = max(delta.xy, delta.zw);

  // Use already-sampled second neighbors
  delta = vec4f(delta.x, delta.y, abs(Lleft - Lleftleft), abs(Ltop - Ltoptop));
  maxDelta = max(maxDelta, delta.zw);

  // Local contrast adaptation
  let finalDelta = max(maxDelta.x, maxDelta.y);
  edges *= step(vec2f(finalDelta * 0.5), delta.xy);

  return vec4f(edges, 0.0, 1.0);
}
`

export const smaaBlendingWeightShader = /* wgsl */ `
// ============================================
// SMAA Blending Weight Calculation Pass
// ============================================
// Calculates blending weights for detected edges.
// Uses pattern recognition to determine the correct blending factors.
//
// Uses textureSampleLevel instead of textureSample to satisfy WGSL
// uniform control flow requirements in iterative search loops.

struct SMAAUniforms {
  resolution: vec2f,
  threshold: f32,
  maxSearchSteps: f32,
}

@group(0) @binding(0) var<uniform> uniforms: SMAAUniforms;
@group(0) @binding(1) var tEdges: texture_2d<f32>;
@group(0) @binding(2) var tInput: texture_2d<f32>;
@group(0) @binding(3) var linearSampler: sampler;
@group(0) @binding(4) var pointSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) pixcoord: vec2f,
  @location(2) offset0: vec4f,
  @location(3) offset1: vec4f,
  @location(4) offset2: vec4f,
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
  output.pixcoord = output.uv * uniforms.resolution;

  let texelSize = 1.0 / uniforms.resolution;

  // Offsets for the searches
  output.offset0 = vec4f(
    output.uv.xy + texelSize * vec2f(-0.25, -0.125),
    output.uv.xy + texelSize * vec2f(1.25, -0.125)
  );
  output.offset1 = vec4f(
    output.uv.xy + texelSize * vec2f(-0.125, -0.25),
    output.uv.xy + texelSize * vec2f(-0.125, 1.25)
  );
  output.offset2 = vec4f(
    output.uv.xy + texelSize * vec2f(-2.0, 0.0),
    output.uv.xy + texelSize * vec2f(0.0, -2.0)
  );

  return output;
}

// Search for the end of horizontal/vertical edge
// Uses textureSampleLevel to avoid WGSL uniform control flow restrictions
fn searchXLeft(texcoord: vec2f, end: f32) -> f32 {
  let texelSize = 1.0 / uniforms.resolution;
  var coord = texcoord;
  let maxSteps = clamp(i32(uniforms.maxSearchSteps), 1, 32);

  for (var i = 0; i < maxSteps; i++) {
    if (coord.x <= end) { break; }
    let e = textureSampleLevel(tEdges, linearSampler, coord, 0.0).rg;
    if (e.g < 0.8281) { break; }  // Found a discontinuity
    coord.x -= 2.0 * texelSize.x;
  }

  // Return the offset, accounting for the extra step
  return (texcoord.x - coord.x) / texelSize.x;
}

fn searchXRight(texcoord: vec2f, end: f32) -> f32 {
  let texelSize = 1.0 / uniforms.resolution;
  var coord = texcoord;
  let maxSteps = clamp(i32(uniforms.maxSearchSteps), 1, 32);

  for (var i = 0; i < maxSteps; i++) {
    if (coord.x >= end) { break; }
    let e = textureSampleLevel(tEdges, linearSampler, coord, 0.0).rg;
    if (e.g < 0.8281) { break; }
    coord.x += 2.0 * texelSize.x;
  }

  return (coord.x - texcoord.x) / texelSize.x;
}

fn searchYUp(texcoord: vec2f, end: f32) -> f32 {
  let texelSize = 1.0 / uniforms.resolution;
  var coord = texcoord;
  let maxSteps = clamp(i32(uniforms.maxSearchSteps), 1, 32);

  for (var i = 0; i < maxSteps; i++) {
    if (coord.y <= end) { break; }
    let e = textureSampleLevel(tEdges, linearSampler, coord, 0.0).rg;
    if (e.r < 0.8281) { break; }
    coord.y -= 2.0 * texelSize.y;
  }

  return (texcoord.y - coord.y) / texelSize.y;
}

fn searchYDown(texcoord: vec2f, end: f32) -> f32 {
  let texelSize = 1.0 / uniforms.resolution;
  var coord = texcoord;
  let maxSteps = clamp(i32(uniforms.maxSearchSteps), 1, 32);

  for (var i = 0; i < maxSteps; i++) {
    if (coord.y >= end) { break; }
    let e = textureSampleLevel(tEdges, linearSampler, coord, 0.0).rg;
    if (e.r < 0.8281) { break; }
    coord.y += 2.0 * texelSize.y;
  }

  return (coord.y - texcoord.y) / texelSize.y;
}

// Approximate area calculation for crossing edges
fn area(dist: vec2f, e1: f32, e2: f32) -> vec2f {
  // Simplified area calculation without lookup texture
  // Uses a smooth approximation based on distance
  var offset: vec2f;

  if (e1 > e2) {
    let d = dist.x;
    let area_factor = saturate(1.0 - abs(d) / 16.0);
    offset = vec2f(area_factor * 0.5, 0.0);
  } else if (e2 > e1) {
    let d = dist.y;
    let area_factor = saturate(1.0 - abs(d) / 16.0);
    offset = vec2f(0.0, area_factor * 0.5);
  } else {
    // Equal edges - blend based on distance ratio
    let ratio = dist.x / (dist.x + dist.y + 0.0001);
    offset = vec2f(ratio, 1.0 - ratio) * 0.5;
  }

  return offset;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  var weights = vec4f(0.0);
  let texelSize = 1.0 / uniforms.resolution;

  // Get edges at current pixel (textureSampleLevel for uniform control flow safety)
  let e = textureSampleLevel(tEdges, pointSampler, input.uv, 0.0).rg;

  // Process horizontal edges (edge.r)
  if (e.r > 0.0) {
    // Search left and right
    let d = vec2f(
      searchXLeft(input.offset0.xy, 0.0),
      searchXRight(input.offset0.zw, 1.0)
    );

    // Fetch crossing edges (textureSampleLevel for non-uniform branch)
    let e1 = textureSampleLevel(tEdges, linearSampler, input.uv - vec2f((d.x + 0.5) * texelSize.x, 0.0), 0.0).g;
    let e2 = textureSampleLevel(tEdges, linearSampler, input.uv + vec2f((d.y + 0.5) * texelSize.x, 0.0), 0.0).g;

    // Calculate area
    weights.r = area(abs(d), e1, e2).x;
    weights.g = area(abs(d), e1, e2).y;
  }

  // Process vertical edges (edge.g)
  if (e.g > 0.0) {
    // Search up and down
    let d = vec2f(
      searchYUp(input.offset1.xy, 0.0),
      searchYDown(input.offset1.zw, 1.0)
    );

    // Fetch crossing edges (textureSampleLevel for non-uniform branch)
    let e1 = textureSampleLevel(tEdges, linearSampler, input.uv - vec2f(0.0, (d.x + 0.5) * texelSize.y), 0.0).r;
    let e2 = textureSampleLevel(tEdges, linearSampler, input.uv + vec2f(0.0, (d.y + 0.5) * texelSize.y), 0.0).r;

    // Calculate area
    weights.b = area(abs(d), e1, e2).x;
    weights.a = area(abs(d), e1, e2).y;
  }

  return weights;
}
`

export const smaaNeighborhoodBlendingShader = /* wgsl */ `
// ============================================
// SMAA Neighborhood Blending Pass
// ============================================
// Applies the final anti-aliasing blend using the calculated weights.
//
// All texture samples use textureSampleLevel to avoid WGSL uniform control flow
// restrictions with early returns and data-dependent branching.

struct SMAAUniforms {
  resolution: vec2f,
  _padding: vec2f,
}

@group(0) @binding(0) var<uniform> uniforms: SMAAUniforms;
@group(0) @binding(1) var tInput: texture_2d<f32>;
@group(0) @binding(2) var tBlendWeights: texture_2d<f32>;
@group(0) @binding(3) var linearSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) offset: vec4f,
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

  let texelSize = 1.0 / uniforms.resolution;

  // Offsets for fetching neighboring blend weights
  output.offset = vec4f(
    output.uv.x + texelSize.x,
    output.uv.y,
    output.uv.x,
    output.uv.y + texelSize.y
  );

  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let texelSize = 1.0 / uniforms.resolution;

  // Fetch the blending weights for this pixel and neighbors
  // All samples done upfront using textureSampleLevel for uniform control flow safety
  var a = vec4f(
    textureSampleLevel(tBlendWeights, linearSampler, input.offset.xy, 0.0).a,  // Right
    textureSampleLevel(tBlendWeights, linearSampler, input.offset.zw, 0.0).g,  // Bottom
    textureSampleLevel(tBlendWeights, linearSampler, input.uv, 0.0).zw         // Current (ba)
  );

  // Sample the center color unconditionally
  let colorCenter = textureSampleLevel(tInput, linearSampler, input.uv, 0.0);

  // Is there any blending weight with a value greater than 0.0?
  let totalWeight = dot(a, vec4f(1.0));
  if (totalWeight < 1e-5) {
    // No blending needed, return original color
    return colorCenter;
  }

  // Calculate the blending direction
  var blendFactor = vec2f(0.0);
  var offset = vec2f(0.0);

  let isHorizontalDominant = max(a.x, a.z) > max(a.y, a.w);

  if (isHorizontalDominant) {
    // Horizontal direction dominates
    blendFactor = vec2f(a.x, a.z);
    offset.x = select(-texelSize.x, texelSize.x, blendFactor.y > blendFactor.x);
    offset.x *= abs(blendFactor.y - blendFactor.x) / (blendFactor.x + blendFactor.y);
  } else {
    // Vertical direction dominates
    blendFactor = vec2f(a.y, a.w);
    offset.y = select(-texelSize.y, texelSize.y, blendFactor.y > blendFactor.x);
    offset.y *= abs(blendFactor.y - blendFactor.x) / (blendFactor.x + blendFactor.y);
  }

  // Fetch the offset neighbor color (textureSampleLevel for uniform control flow)
  let colorNeighbor = textureSampleLevel(tInput, linearSampler, input.uv + offset, 0.0);

  let maxWeight = max(max(a.x, a.y), max(a.z, a.w));
  let result = mix(colorCenter.rgb, colorNeighbor.rgb, maxWeight);

  return vec4f(result, 1.0);
}
`

// Export all shaders with entry point names for use by the pass
export const smaaShaders = {
  edgeDetection: smaaEdgeDetectionShader,
  blendingWeight: smaaBlendingWeightShader,
  neighborhoodBlending: smaaNeighborhoodBlendingShader,
}
