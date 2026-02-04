/**
 * WGSL Jet Volumetric Shader - Soft Billowing Plasma
 *
 * Renders polar jets as soft, smoke-like volumetric plasma columns.
 * Inspired by NASA visualizations of astrophysical jets.
 *
 * Port of GLSL postprocessing/jetVolumetric.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/postprocessing/jet-volumetric.wgsl
 */

export const jetVolumetricUniformsBlock = /* wgsl */ `
// ============================================
// Jet Volumetric Uniforms
// ============================================

struct JetVolumetricUniforms {
  jetColor: vec3f,
  jetIntensity: f32,
  jetHeight: f32,
  jetWidth: f32,
  jetFalloff: f32,
  jetNoiseAmount: f32,
  jetPulsation: f32,
  time: f32,
  resolution: vec2f,
  near: f32,
  far: f32,
  softDepthRange: f32,
  depthAvailable: f32,
  jetOpacity: f32,
  _padding: f32,
}
`

export const jetNoiseBlock = /* wgsl */ `
// ============================================
// Simplex Noise Functions
// ============================================

fn mod289_3(x: vec3f) -> vec3f {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn mod289_4(x: vec4f) -> vec4f {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn permute(x: vec4f) -> vec4f {
  return mod289_4(((x * 34.0) + 1.0) * x);
}

fn taylorInvSqrt(r: vec4f) -> vec4f {
  return 1.79284291400159 - 0.85373472095314 * r;
}

fn snoise(v: vec3f) -> f32 {
  let C = vec2f(1.0 / 6.0, 1.0 / 3.0);
  let D = vec4f(0.0, 0.5, 1.0, 2.0);

  var i = floor(v + dot(v, C.yyy));
  let x0 = v - i + dot(i, C.xxx);

  let g = step(x0.yzx, x0.xyz);
  let l = 1.0 - g;
  let i1 = min(g.xyz, l.zxy);
  let i2 = max(g.xyz, l.zxy);

  let x1 = x0 - i1 + C.xxx;
  let x2 = x0 - i2 + C.yyy;
  let x3 = x0 - D.yyy;

  i = mod289_3(i);
  let p = permute(permute(permute(
            i.z + vec4f(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4f(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4f(0.0, i1.x, i2.x, 1.0));

  let n_ = 0.142857142857;
  let ns = n_ * D.wyz - D.xzx;
  let j = p - 49.0 * floor(p * ns.z * ns.z);
  let x_ = floor(j * ns.z);
  let y_ = floor(j - 7.0 * x_);

  let x = x_ * ns.x + ns.yyyy;
  let y = y_ * ns.x + ns.yyyy;
  let h = 1.0 - abs(x) - abs(y);

  let b0 = vec4f(x.xy, y.xy);
  let b1 = vec4f(x.zw, y.zw);
  let s0 = floor(b0) * 2.0 + 1.0;
  let s1 = floor(b1) * 2.0 + 1.0;
  let sh = -step(h, vec4f(0.0));

  let a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  let a1 = b1.xzyw + s1.xzyw * sh.zzww;

  var p0 = vec3f(a0.xy, h.x);
  var p1 = vec3f(a0.zw, h.y);
  var p2 = vec3f(a1.xy, h.z);
  var p3 = vec3f(a1.zw, h.w);

  let norm = taylorInvSqrt(vec4f(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  var m = max(0.6 - vec4f(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), vec4f(0.0));
  m = m * m;
  return 42.0 * dot(m * m, vec4f(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

fn smokeNoise(p_in: vec3f, warp: f32) -> f32 {
  // Warp domain for organic look
  let w = vec3f(
    snoise(p_in * 0.7),
    snoise(p_in * 0.7 + vec3f(31.0, 17.0, 53.0)),
    snoise(p_in * 0.7 + vec3f(71.0, 29.0, 97.0))
  ) * warp;
  let p = p_in + w;

  // Low octave FBM
  var f: f32 = 0.0;
  f += 0.5 * snoise(p);
  f += 0.25 * snoise(p * 2.0);
  f += 0.125 * snoise(p * 4.0);
  return f;
}
`

export const jetVolumetricVertexShader = /* wgsl */ `
// Jet Volumetric Vertex Shader

${jetNoiseBlock}

struct CameraUniforms {
  viewMatrix: mat4x4f,
  projectionMatrix: mat4x4f,
  viewProjectionMatrix: mat4x4f,
  inverseViewMatrix: mat4x4f,
  inverseProjectionMatrix: mat4x4f,
  modelMatrix: mat4x4f,          // LOCAL → WORLD transform
  inverseModelMatrix: mat4x4f,   // WORLD → LOCAL transform
  cameraPosition: vec3f,
  cameraNear: f32,
  cameraFar: f32,
  fov: f32,
  resolution: vec2f,
  aspectRatio: f32,
  time: f32,
  deltaTime: f32,
  frameNumber: u32,
}

${jetVolumetricUniformsBlock}

struct VertexInput {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
}

struct VertexOutput {
  @builtin(position) clipPosition: vec4f,
  @location(0) uv: vec2f,
  @location(1) worldPos: vec3f,
  @location(2) localPos: vec3f,
  @location(3) viewDir: vec3f,
  @location(4) normal: vec3f,
  @location(5) height: f32,
}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(1) @binding(0) var<uniform> jet: JetVolumetricUniforms;

struct ModelUniforms {
  modelMatrix: mat4x4f,
  normalMatrix: mat3x3f,
}
@group(2) @binding(0) var<uniform> model: ModelUniforms;

@vertex
fn main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;

  output.uv = input.uv;
  var pos = input.position;
  let h = pos.y;
  output.height = h;

  let t = jet.time;
  let noiseAmp = jet.jetNoiseAmount;

  // === LARGE-SCALE BILLOWING MOTION ===
  let wave1X = snoise(vec3f(h * 1.2, t * 0.25, 0.0)) * 0.35 * noiseAmp * pow(h, 0.8);
  let wave1Z = snoise(vec3f(h * 1.2, t * 0.25, 77.0)) * 0.35 * noiseAmp * pow(h, 0.8);

  let wave2X = snoise(vec3f(h * 2.5, t * 0.4, 33.0)) * 0.15 * noiseAmp * h;
  let wave2Z = snoise(vec3f(h * 2.5, t * 0.4, 111.0)) * 0.15 * noiseAmp * h;

  pos.x += wave1X + wave2X;
  pos.z += wave1Z + wave2Z;

  // === ORGANIC THICKNESS PULSING ===
  let thickPulse = 1.0 + snoise(vec3f(h * 1.5, t * 0.3, 200.0)) * 0.2 * noiseAmp;
  pos.x *= thickPulse;
  pos.z *= thickPulse;

  output.localPos = pos;

  let worldPos = model.modelMatrix * vec4f(pos, 1.0);
  output.worldPos = worldPos.xyz;
  output.viewDir = normalize(camera.cameraPosition - output.worldPos);
  output.normal = normalize(model.normalMatrix * input.normal);

  output.clipPosition = camera.projectionMatrix * camera.viewMatrix * worldPos;

  return output;
}
`

export const jetVolumetricFragmentShader = /* wgsl */ `
// Jet Volumetric Fragment Shader

${jetNoiseBlock}
${jetVolumetricUniformsBlock}

struct CameraUniforms {
  viewMatrix: mat4x4f,
  projectionMatrix: mat4x4f,
  viewProjectionMatrix: mat4x4f,
  inverseViewMatrix: mat4x4f,
  inverseProjectionMatrix: mat4x4f,
  modelMatrix: mat4x4f,          // LOCAL → WORLD transform
  inverseModelMatrix: mat4x4f,   // WORLD → LOCAL transform
  cameraPosition: vec3f,
  cameraNear: f32,
  cameraFar: f32,
  fov: f32,
  resolution: vec2f,
  aspectRatio: f32,
  time: f32,
  deltaTime: f32,
  frameNumber: u32,
}

struct FragmentInput {
  @location(0) uv: vec2f,
  @location(1) worldPos: vec3f,
  @location(2) localPos: vec3f,
  @location(3) viewDir: vec3f,
  @location(4) normal: vec3f,
  @location(5) height: f32,
}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(1) @binding(0) var<uniform> jet: JetVolumetricUniforms;
@group(2) @binding(0) var sceneDepthTexture: texture_2d<f32>;
@group(2) @binding(1) var sceneDepthSampler: sampler;

fn linearizeDepth(d: f32, near: f32, far: f32) -> f32 {
  let z = d * 2.0 - 1.0;
  return (2.0 * near * far) / (far + near - z * (far - near));
}

fn softDepthIntersection(worldPos: vec3f, fragCoord: vec2f) -> f32 {
  if (jet.depthAvailable < 0.5) { return 1.0; }

  let screenUV = fragCoord / jet.resolution;
  // Use textureLoad for unfilterable-float depth textures
  let depthDims = textureDimensions(sceneDepthTexture);
  let depthCoord = vec2i(screenUV * vec2f(depthDims));
  let sceneDepth = textureLoad(sceneDepthTexture, depthCoord, 0).r;

  if (sceneDepth < 0.001 || sceneDepth > 0.999) { return 1.0; }

  let sceneLinear = linearizeDepth(sceneDepth, jet.near, jet.far);
  let viewPos = camera.viewMatrix * vec4f(worldPos, 1.0);
  let fragDepth = -viewPos.z;

  return smoothstep(0.0, jet.softDepthRange, sceneLinear - fragDepth);
}

@fragment
fn main(input: FragmentInput, @builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
  let h = input.height;
  let t = jet.time;
  let noiseAmp = jet.jetNoiseAmount;

  // === UV-BASED RADIAL POSITION ===
  let angle = (input.uv.x - 0.5) * 2.0 * 3.14159;
  let viewFacing = cos(angle) * 0.5 + 0.5;

  // === PLASMA CORE STRUCTURE ===
  let edgeDist = abs(input.uv.x - 0.5) * 2.0;
  let coreProfile = exp(-edgeDist * edgeDist * 3.0);

  // === FLOWING PLASMA TURBULENCE ===
  let noiseP = vec3f(input.localPos.x * 2.0, h * 3.0 - t * 2.5, input.localPos.z * 2.0);

  let flowNoise = snoise(noiseP * 0.8);
  var streaks = snoise(vec3f(edgeDist * 5.0, h * 8.0 - t * 4.0, flowNoise));
  streaks = streaks * 0.5 + 0.5;

  var plasmaWave = sin(h * 12.0 - t * 6.0) * 0.5 + 0.5;
  plasmaWave *= sin(h * 5.0 - t * 3.0 + flowNoise * 2.0) * 0.5 + 0.5;

  // === EMISSION PROFILE ===
  var emission = coreProfile;
  emission *= 0.6 + streaks * 0.4 * noiseAmp;
  emission *= 0.7 + plasmaWave * 0.5 * jet.jetPulsation;

  // Edge dissipation with noise
  var edgeFade = 1.0 - smoothstep(0.3, 0.9, edgeDist);
  let edgeNoise = snoise(noiseP * 1.5) * 0.5 + 0.5;
  edgeFade *= mix(1.0, edgeNoise, noiseAmp * 0.5);
  emission *= edgeFade;

  // === HEIGHT FADE ===
  let baseFade = smoothstep(0.0, 0.1, h);
  let tipFade = 1.0 - smoothstep(0.7, 1.0, h);
  let tipTurbulence = smoothstep(0.5, 0.9, h) * snoise(noiseP * 2.0) * 0.3;
  emission *= baseFade * tipFade;
  emission = max(0.0, emission - tipTurbulence * noiseAmp);

  if (emission < 0.01) { discard; }

  // === COLOR ===
  let baseColor = jet.jetColor;
  let coreBrightness = pow(coreProfile, 2.0);
  let brightCore = mix(baseColor, baseColor + vec3f(0.3, 0.3, 0.4), coreBrightness * 0.5);

  let colorShift = streaks * 0.15 * noiseAmp;
  var plasmaColor = mix(baseColor, brightCore, coreBrightness);
  plasmaColor += vec3f(colorShift * 0.5, colorShift * 0.3, colorShift);

  // === FINAL EMISSION ===
  var intensity = emission * jet.jetIntensity * 3.0;
  intensity += coreBrightness * jet.jetIntensity * 1.5;

  var finalColor = plasmaColor * intensity;
  finalColor = max(finalColor, vec3f(0.0));

  // === ALPHA ===
  var alpha = emission * 0.4;
  alpha += coreBrightness * 0.2;
  alpha *= softDepthIntersection(input.worldPos, fragCoord.xy);
  alpha = clamp(alpha, 0.0, 0.6);

  return vec4f(finalColor, alpha);
}
`

export const jetCompositeVertexShader = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn main(@location(0) position: vec3f, @location(1) uv: vec2f) -> VertexOutput {
  var output: VertexOutput;
  output.uv = uv;
  output.position = vec4f(position.xy, 0.0, 1.0);
  return output;
}
`

export const jetCompositeFragmentShader = /* wgsl */ `
struct JetCompositeUniforms {
  jetOpacity: f32,
  _padding: vec3f,
}

@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var sceneSampler: sampler;
@group(0) @binding(2) var jetsTexture: texture_2d<f32>;
@group(0) @binding(3) var jetsSampler: sampler;
@group(0) @binding(4) var<uniform> uniforms: JetCompositeUniforms;

@fragment
fn main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let sceneColor = textureSample(sceneTexture, sceneSampler, uv);
  let jetColor = textureSample(jetsTexture, jetsSampler, uv);
  let combined = sceneColor.rgb + jetColor.rgb * jetColor.a * uniforms.jetOpacity;
  return vec4f(combined, sceneColor.a);
}
`
