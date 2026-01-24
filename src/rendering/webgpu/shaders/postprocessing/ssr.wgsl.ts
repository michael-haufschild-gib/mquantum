/**
 * WGSL Screen-Space Reflections Shader
 *
 * Port of GLSL SSRShader.ts to WGSL.
 * Ray marches in screen space to find reflections.
 *
 * @module rendering/webgpu/shaders/postprocessing/ssr.wgsl
 */

export const ssrShader = /* wgsl */ `
// ============================================
// Screen-Space Reflections Shader
// ============================================

struct SSRUniforms {
  resolution: vec2f,
  intensity: f32,
  maxDistance: f32,
  thickness: f32,
  fadeStart: f32,
  fadeEnd: f32,
  maxSteps: i32,
  nearClip: f32,
  farClip: f32,
  outputMode: i32,  // 0 = composited, 1 = reflection-only
  _padding: f32,
  projMatrix: mat4x4f,
  invProjMatrix: mat4x4f,
  viewMat: mat4x4f,
}

@group(0) @binding(0) var<uniform> uniforms: SSRUniforms;
@group(0) @binding(1) var tDiffuse: texture_2d<f32>;
@group(0) @binding(2) var tNormal: texture_2d<f32>;
@group(0) @binding(3) var tDepth: texture_depth_2d;
@group(0) @binding(4) var linearSampler: sampler;

// Helper to load depth using textureLoad (required for unfilterable-float depth textures)
fn loadDepth(uv: vec2f) -> f32 {
  let depthDims = textureDimensions(tDepth);
  let depthCoord = vec2i(uv * vec2f(depthDims));
  return textureLoad(tDepth, depthCoord, 0);
}

// Helper to load depth at a specific pixel offset from a base UV
fn loadDepthOffset(uv: vec2f, offsetPixels: vec2i) -> f32 {
  let depthDims = textureDimensions(tDepth);
  let baseCoord = vec2i(uv * vec2f(depthDims));
  let offsetCoord = clamp(baseCoord + offsetPixels, vec2i(0), vec2i(depthDims) - vec2i(1));
  return textureLoad(tDepth, offsetCoord, 0);
}

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

// Convert perspective depth to view Z
fn perspectiveDepthToViewZ(depth: f32, near: f32, far: f32) -> f32 {
  // NDC to view space depth
  return near * far / (far - depth * (far - near));
}

// Get linear depth from depth buffer
fn getLinearDepth(coord: vec2f) -> f32 {
  let depth = loadDepth(coord);
  return perspectiveDepthToViewZ(depth, uniforms.nearClip, uniforms.farClip);
}

// Get view-space position from UV and depth
fn getViewPosition(uv: vec2f, depth: f32) -> vec3f {
  let clipPos = vec4f(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  var viewPos = uniforms.invProjMatrix * clipPos;
  let safeW = select(viewPos.w, 0.0001, abs(viewPos.w) < 0.0001);
  return viewPos.xyz / safeW;
}

// Reconstruct view-space normal from depth buffer
fn reconstructNormal(coord: vec2f) -> vec3f {
  let texel = 1.0 / uniforms.resolution;

  // Use textureLoad with integer pixel offsets for depth sampling
  let depthC = loadDepth(coord);
  let depthL = loadDepthOffset(coord, vec2i(-1, 0));
  let depthR = loadDepthOffset(coord, vec2i(1, 0));
  let depthB = loadDepthOffset(coord, vec2i(0, -1));
  let depthT = loadDepthOffset(coord, vec2i(0, 1));

  let posC = getViewPosition(coord, depthC);
  let posL = getViewPosition(coord - vec2f(texel.x, 0.0), depthL);
  let posR = getViewPosition(coord + vec2f(texel.x, 0.0), depthR);
  let posB = getViewPosition(coord - vec2f(0.0, texel.y), depthB);
  let posT = getViewPosition(coord + vec2f(0.0, texel.y), depthT);

  let ddx = select(posR - posC, posC - posL, abs(posR.z - posC.z) < abs(posC.z - posL.z));
  let ddy = select(posT - posC, posC - posB, abs(posT.z - posC.z) < abs(posC.z - posB.z));

  let crossProd = cross(ddy, ddx);
  let crossLen = length(crossProd);
  return select(vec3f(0.0, 0.0, 1.0), crossProd / crossLen, crossLen > 0.0001);
}

// Get normal from G-buffer
fn getNormal(coord: vec2f) -> vec3f {
  let normalData = textureSample(tNormal, linearSampler, coord);

  if (length(normalData.rgb) > 0.01) {
    let decoded = normalData.rgb * 2.0 - 1.0;
    let decodedLen = length(decoded);
    return select(vec3f(0.0, 0.0, 1.0), decoded / decodedLen, decodedLen > 0.0001);
  }

  return reconstructNormal(coord);
}

// Get reflectivity from G-buffer alpha
fn getReflectivity(coord: vec2f) -> f32 {
  let normalData = textureSample(tNormal, linearSampler, coord);
  return select(1.0, normalData.a, normalData.a > 0.0);
}

// Project view-space position to screen UV
fn projectToScreen(viewPos: vec3f) -> vec2f {
  let clipPos = uniforms.projMatrix * vec4f(viewPos, 1.0);
  let safeW = select(clipPos.w, 0.0001, abs(clipPos.w) < 0.0001);
  return (clipPos.xy / safeW) * 0.5 + 0.5;
}

// Fresnel approximation (Schlick)
fn fresnel(viewDir: vec3f, normal: vec3f, f0: f32) -> f32 {
  let cosTheta = max(dot(viewDir, normal), 0.0);
  let t = 1.0 - cosTheta;
  let t2 = t * t;
  return f0 + (1.0 - f0) * t2 * t2 * t;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let sceneColor = textureSample(tDiffuse, linearSampler, input.uv);

  // Early exit helper
  let noReflectionOutput = select(sceneColor, vec4f(0.0), uniforms.outputMode == 1);

  if (uniforms.intensity <= 0.0) {
    return noReflectionOutput;
  }

  let depth = loadDepth(input.uv);

  if (depth >= 0.9999) {
    return noReflectionOutput;
  }

  let normal = getNormal(input.uv);
  let reflectivity = getReflectivity(input.uv);

  if (reflectivity <= 0.0) {
    return noReflectionOutput;
  }

  let viewPos = getViewPosition(input.uv, depth);
  let viewDir = normalize(-viewPos);
  let reflectDir = reflect(-viewDir, normal);

  let fresnelFactor = fresnel(viewDir, normal, 0.5);

  let rayOrigin = viewPos;
  let rayDir = reflectDir;

  let safeMaxSteps = max(uniforms.maxSteps, 1);
  let stepSize = uniforms.maxDistance / f32(safeMaxSteps);

  var hitUV = vec2f(-1.0);
  var hitDist = 0.0;

  for (var i = 1; i <= 64; i++) {
    if (i > safeMaxSteps) { break; }

    let rayPos = rayOrigin + rayDir * (stepSize * f32(i));

    if (rayPos.z > -uniforms.nearClip) { break; }

    let sampleUV = projectToScreen(rayPos);

    if (sampleUV.x < 0.0 || sampleUV.x > 1.0 || sampleUV.y < 0.0 || sampleUV.y > 1.0) {
      continue;
    }

    let sampleDepth = loadDepth(sampleUV);
    let sampleViewPos = getViewPosition(sampleUV, sampleDepth);

    let depthDiff = rayPos.z - sampleViewPos.z;

    if (depthDiff > 0.0 && depthDiff < uniforms.thickness) {
      hitUV = sampleUV;
      hitDist = length(rayPos - rayOrigin);
      break;
    }
  }

  if (hitUV.x >= 0.0) {
    let reflectionColor = textureSample(tDiffuse, linearSampler, hitUV);

    let distFade = 1.0 - smoothstep(
      uniforms.fadeStart * uniforms.maxDistance,
      uniforms.fadeEnd * uniforms.maxDistance,
      hitDist
    );

    let edgeDist = abs(hitUV - 0.5) * 2.0;
    var edgeFade = 1.0 - max(edgeDist.x, edgeDist.y);
    edgeFade = smoothstep(0.0, 0.2, edgeFade);

    let reflectionStrength = uniforms.intensity * reflectivity * fresnelFactor * distFade * edgeFade;

    if (uniforms.outputMode == 1) {
      return vec4f(reflectionColor.rgb, reflectionStrength);
    } else {
      return mix(sceneColor, reflectionColor, reflectionStrength);
    }
  } else {
    if (uniforms.outputMode == 1) {
      return vec4f(0.0, 0.0, 0.0, 0.0);
    } else {
      return sceneColor;
    }
  }
}
`
