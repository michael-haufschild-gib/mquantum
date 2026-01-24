/**
 * WGSL Environment Composite Shader
 *
 * Port of GLSL environmentComposite.glsl to WGSL.
 * Composites the lensed environment layer behind the main object layer.
 *
 * @module rendering/webgpu/shaders/postprocessing/environment-composite.wgsl
 */

export const environmentCompositeShader = /* wgsl */ `
// ============================================
// Environment Composite Shader
// ============================================

struct Uniforms {
  near: f32,
  far: f32,
  shellEnabled: u32,
  shellGlowStrength: f32,
  shellGlowColor: vec3f,
  _padding: f32,
  resolution: vec2f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var tLensedEnvironment: texture_2d<f32>;
@group(0) @binding(2) var tMainObject: texture_2d<f32>;
@group(0) @binding(3) var tMainObjectDepth: texture_depth_2d;
@group(0) @binding(4) var linearSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  // Fullscreen triangle
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

// Check if depth value represents the far plane
fn isAtFarPlane(depth: f32) -> bool {
  return depth >= 0.9999;
}

// Check if a pixel is part of the event horizon
fn isHorizonPixel(uv: vec2f) -> bool {
  let color = textureSample(tMainObject, linearSampler, uv);
  let depth = textureSample(tMainObjectDepth, linearSampler, uv);

  // Horizon = far plane + high alpha
  return depth >= 0.999 && color.a > 0.9;
}

// Detect the visual boundary of the event horizon
fn detectHorizonEdge(uv: vec2f) -> f32 {
  let texelSize = 1.0 / uniforms.resolution;

  // Check if current pixel is horizon
  let centerIsHorizon = isHorizonPixel(uv);

  // Only glow OUTSIDE the horizon
  if (centerIsHorizon) {
    return 0.0;
  }

  // Check neighbors for horizon pixels
  var horizonCount = 0.0;

  // Sample in a small radius
  for (var x = -2.0; x <= 2.0; x += 1.0) {
    for (var y = -2.0; y <= 2.0; y += 1.0) {
      if (x == 0.0 && y == 0.0) { continue; }
      let sampleUv = uv + vec2f(x, y) * texelSize;
      if (isHorizonPixel(sampleUv)) {
        let dist = length(vec2f(x, y));
        horizonCount += 1.0 / (dist + 0.5);
      }
    }
  }

  return smoothstep(0.0, 3.0, horizonCount);
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  // Sample both layers
  let envColor = textureSample(tLensedEnvironment, linearSampler, input.uv);
  let objColor = textureSample(tMainObject, linearSampler, input.uv);
  let objDepth = textureSample(tMainObjectDepth, linearSampler, input.uv);

  var finalColor: vec3f;
  var finalAlpha: f32;

  if (isAtFarPlane(objDepth) && objColor.a < 0.01) {
    // No object at this pixel - show environment
    finalColor = envColor.rgb;
    finalAlpha = envColor.a;
  } else {
    // Object exists - blend based on alpha
    finalColor = objColor.rgb * objColor.a + envColor.rgb * (1.0 - objColor.a);
    finalAlpha = max(envColor.a, objColor.a);
  }

  // Photon shell glow
  if (uniforms.shellEnabled != 0u && uniforms.shellGlowStrength > 0.0) {
    let edge = detectHorizonEdge(input.uv);
    let shellGlow = uniforms.shellGlowColor * edge * uniforms.shellGlowStrength;
    finalColor += shellGlow;
  }

  return vec4f(finalColor, finalAlpha);
}
`
