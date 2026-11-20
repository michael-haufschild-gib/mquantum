import { frequencies } from '@/lib/physics/modularHorizon'
import {
  BALL_LIMIT,
  INNER_RADIUS,
  OUTER_RADIUS,
  REFERENCE_RADIUS,
} from '@/lib/physics/modularHorizon/exterior'

import { CAMERA_UNIFORMS_STRUCT } from '../../shared/core/uniforms.wgsl'
import { generateComputeBaseColor, generateEmissionPreBlock } from './emission.wgsl'

export const horizonUniforms = /* wgsl */ `
struct HorizonState {
  populationDecay: vec4f,
  detector: vec4f,
  chart: vec4f,
  axisU: vec3f,
  isVolume: f32,
  axisV: vec3f,
  probeRadius: f32,
  realPart: vec3f,
  cutaway: f32,
  imagPart: vec3f,
  referenceMode: f32,
  interference: vec4f,
}
@group(2) @binding(4) var<uniform> horizon: HorizonState;`

/** Use the volume bounding box in 3D and project it onto the disk axes in 2D.
 * Opposite faces retain opposite winding, so front-face culling leaves one disk. */
export const horizonVertex = /* wgsl */ `
${CAMERA_UNIFORMS_STRUCT}
${horizonUniforms}
@group(0) @binding(0) var<uniform> camera: CameraUniforms;
struct Out { @builtin(position) position: vec4f, @location(0) uv: vec3f, }
@vertex fn main(@location(0) position: vec3f) -> Out {
  let disk = sign(position.xy);
  let bulk = horizon.isVolume > 0.;
  let flat = disk.x * horizon.axisU + disk.y * horizon.axisV;
  let model = select(flat, position, bulk);
  return Out(camera.viewProjectionMatrix * camera.modelMatrix * vec4f(model, 1),
             select(vec3f(disk, 0), position, bulk));
}`

/** Compose the disk and exterior samplers with the selected color algorithm. */
export function modularHorizonBlock(algo: number) {
  return (
    generateEmissionPreBlock(algo, true) +
    generateComputeBaseColor(algo) +
    /* wgsl */ `
// The detector is an angular horocycle on the selected radius.
fn detectorMark(w: vec2f) -> f32 {
  // Cayley chart followed by the pin's PSL(2, Z) transformation.
  let denom = max(dot(vec2f(1. - w.x, w.y), vec2f(1. - w.x, w.y)), 1e-10);
  let z = vec2f(.17 - 2.6 * w.y / denom, 1.3 * (1. - dot(w, w)) / denom);
  let m = horizon.chart;
  let num = m.x * z + vec2f(m.y, 0);
  let div = m.z * z + vec2f(m.w, 0);
  let reduced = vec2f(dot(num, div), z.y) / max(dot(div, div), 1e-18);
  let dp = abs(reduced - horizon.detector.xy) / max(fwidth(reduced), vec2f(.000001));
  let arc = abs(reduced.x - horizon.detector.x) <= horizon.detector.z * .5;
  return max(1. - smoothstep(2., 3.5, length(dp)), select(0., 1. - smoothstep(.55, 1.4, dp.y), arc));
}

fn horizonBrightness(rho: f32) -> f32 {
  return pow(clamp(asinh(rho * schroedinger.densityGain * .5) / 3., 0., 1.), schroedinger.densityContrast / 1.8);
}

fn horizonColor(rho: f32, brightness: f32, re: f32, im: f32, pos: vec3f) -> vec3f {
  let phase = atan2(im, select(re, 1e-12, abs(re) + abs(im) < 1e-12));
  let base = computeBaseColor(rho, brightness * 8. - 8., phase, pos, schroedinger);
  return brightness * applyHDREmissionGlow(base, base, brightness * 8. - 8., schroedinger);
}

// A constant-r section has sphere equation |b|² + 2 b.z / sqrt(r²−1) = 1.
fn sphereInterval(b: f32, c: f32) -> vec2f {
  let d = b*b - c;
  let root = sqrt(max(0., d));
  return select(vec2f(1., -1.), vec2f(-b-root, -b+root), d >= 0.);
}
fn shellInterval(origin: vec3f, ray: vec3f, r: f32) -> vec2f {
  let offset = inverseSqrt(r*r-1.);
  return sphereInterval(dot(origin,ray) + offset*ray.z, dot(origin,origin) + 2.*offset*origin.z - 1.);
}
fn probeOnShell(origin: vec3f, ray: vec3f) -> vec3f {
  let r = horizon.probeRadius;
  let roots = shellInterval(origin,ray,r);
  for (var i = 0; i < 2; i++) {
    let b = origin + roots[i]*ray;
    let norm2 = dot(b,b);
    if (roots.x <= roots.y && roots[i] >= 0. && b.z > 0. && norm2 <= ${BALL_LIMIT ** 2}
        && (horizon.cutaway == 0. || b.x <= b.y)) {
      return vec3f(2.*b.xy / (1.+norm2+r*(1.-norm2)), 1.);
    }
  }
  return vec3f(0.);
}

fn marchExterior(position: vec3f) -> vec4f {
  let u = horizon.axisU;
  let v = horizon.axisV;
  let frame = transpose(mat3x3f(u,v,normalize(cross(u,v))*length(u))) * (1./dot(u,u));
  let origin = frame * camera.cameraPositionModel;
  let ray = normalize(frame * (position-camera.cameraPositionModel));
  let pixel = max(length(dpdx(ray)), length(dpdy(ray)));
  let hit = probeOnShell(origin,ray);
  let probeUv = hit.xy * vec2f(.5,-.5) + .5;
  let tiles = textureSample(horizonAtlas, horizonSampler, probeUv, 0).w * horizon.detector.w * hit.z;
  // Across the silhouette the neighboring fragment may have no shell coordinate.
  let mark = detectorMark(hit.xy) * hit.z * select(1., 0., fwidth(hit.z) > .5);

  let ball = sphereInterval(dot(origin,ray),dot(origin,origin)-${BALL_LIMIT ** 2});
  let outer = shellInterval(origin,ray,${OUTER_RADIUS}.);
  var near = max(0.,max(ball.x,outer.x));
  var far = min(ball.y,outer.y);
  // The outer cap lies above the horizon plane. Clip the optional meridional cut as well.
  if (ray.z > 0.) { near = max(near,-origin.z/ray.z); }
  if (ray.z < 0.) { far = min(far,-origin.z/ray.z); }
  if (horizon.cutaway > 0.) {
    let side = origin.x-origin.y;
    let slope = ray.x-ray.y;
    if (slope > 0.) { far = min(far,-side/slope); }
    if (slope < 0.) { near = max(near,-side/slope); }
    if (slope == 0. && side > 0.) { return vec4f(0.); }
  }
  if (far <= near) { return vec4f(0.); }
  let inner = shellInterval(origin,ray,${INNER_RADIUS});
  // Skip path length inside the inner cap. Sample both exterior segments when present.
  let gapStart = clamp(inner.x,near,far);
  let gap = max(0.,clamp(inner.y,near,far)-gapStart);
  let lengthInField = far-near-gap;
  if (lengthInField <= 0.) { return vec4f(0.); }
  let quality = clamp(schroedinger.sampleCount * 2, 32, 160);
  let steps = clamp(i32(ceil(lengthInField * f32(quality))), 12, quality);
  let stepSize = lengthInField / f32(steps);
  let nu = vec3f(${frequencies.join(', ')});
  let relativeNu = nu - nu[u32(horizon.referenceMode)];
  var radiance = vec3f(0.);
  var transmission = 1.;
  for (var i=0; i<steps; i++) {
    let depth = near + (f32(i)+.5)*stepSize;
    let t = depth + select(0.,gap,depth>=gapStart);
    let b = origin + ray*t;
    let norm2 = dot(b,b);
    let edge = 1.-norm2;
    // Spatial metric dr²/(r²−1) + r² h_H², with r=cosh(s).
    let a = length(vec2f(edge,2.*b.z));
    let r = a / edge;
    let denom = 1.+norm2+a;
    let disk = 2.*b.xy / denom;
    let uv = disk * vec2f(.5,-.5) + .5;
    // Filter the angular atlas over one axial step or screen pixel, whichever is wider.
    let dn = 2.*dot(b,ray);
    let dDenom = dn + (4.*b.z*ray.z-edge*dn)/a;
    let dDisk = (2.*ray.xy - disk*dDenom)/denom;
    let footprint = max(pixel*t*2./denom, length(dDisk)*stepSize);
    let lod = max(0.,log2(max(1.,footprint * .5 * f32(textureDimensions(horizonAtlas,0).x))));
    let squares = textureSampleLevel(horizonAtlas,horizonSampler,uv,1,lod).xyz;
    let products = textureSampleLevel(horizonAtlas,horizonSampler,uv,2,lod).xyz;
    // fN(w,r)/fN(w,2) for each w = −½ − iν. Common phase cancels in intensity.
    let delay = .5*log((1.-1./(r*r))/${1 - 1 / REFERENCE_RADIUS ** 2});
    let angle = -relativeNu*delay;
    let cs = cos(angle);
    let sn = sin(angle);
    let re = horizon.realPart*cs - horizon.imagPart*sn;
    let im = horizon.realPart*sn + horizon.imagPart*cs;
    let interference = 2.*(re*re.yzx + im*im.yzx);
    let gain2 = r*r/${REFERENCE_RADIUS ** 2}.*exp(-delay);
    let rho = gain2*max(0.,dot(horizon.populationDecay.xyz,squares)+dot(interference,products));
    let brightness = horizonBrightness(rho);
    let basis = textureSampleLevel(horizonAtlas,horizonSampler,uv,0,lod).xyz;
    let col = horizonColor(rho,brightness,dot(re,basis),dot(im,basis),b);
    // Beer–Lambert integration in display coordinates. Opacity is a visualization transfer.
    let opacity = 1.-exp(-8.*brightness*brightness*stepSize);
    radiance += transmission*opacity*col;
    transmission *= 1.-opacity;
    if (transmission < .005) { break; }
  }
  let alpha = (1.-transmission)*horizon.populationDecay.w;
  let annotation = max(.22*tiles,mark);
  let outAlpha = alpha + (1.-alpha)*annotation;
  let field = radiance*horizon.populationDecay.w;
  return vec4f((field*(1.-annotation)+annotation*vec3f(.36,.94,.93))/max(outAlpha,1e-6), outAlpha);
}

@fragment fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  if (horizon.isVolume>0.) { return marchExterior(input.vPosition); }
  let w = input.vPosition.xy;
  let radius = length(w);
  let pixel = max(fwidth(radius), 0.00001);
  let uv = w * vec2f(.5, -.5) + .5;
  let basisMean = textureSample(horizonAtlas, horizonSampler, uv, 0);
  let squares = textureSample(horizonAtlas, horizonSampler, uv, 1).xyz;
  let products = textureSample(horizonAtlas, horizonSampler, uv, 2).xyz;
  // The prefiltered second moments retain subpixel interference intensity.
  let rho = max(0., dot(horizon.populationDecay.xyz, squares) + dot(horizon.interference.xyz, products));
  let re = dot(horizon.realPart, basisMean.xyz);
  let im = dot(horizon.imagPart, basisMean.xyz);
  let brightness = horizonBrightness(rho);
  var col = horizonColor(rho, brightness, re, im, vec3f(w, 0)) * horizon.populationDecay.w;
  col += vec3f(.035, .08, .11) * basisMean.w * horizon.detector.w;
  col = mix(col, vec3f(.36, .94, .93), detectorMark(w));
  if (radius >= 1.) { discard; }
  return vec4f(col, smoothstep(0., pixel, 1. - radius));
}`
  )
}
