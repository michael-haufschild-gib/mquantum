/**
 * WGSL SDF-Based Accretion Disk
 *
 * Port of GLSL blackhole/gravity/disk-sdf.glsl to WGSL.
 * Surface intersection approach for thin accretion disk.
 *
 * @module rendering/webgpu/shaders/blackhole/disk-sdf.wgsl
 */

export const diskSdfBlock = /* wgsl */ `
// ============================================
// SDF-Based Accretion Disk
// ============================================

// Maximum Einstein ring layers (crossings to track)
const MAX_DISK_CROSSINGS: i32 = 8;

// SDF for thick disk (annulus with height).
// Returns signed distance to disk surface.
fn sdfDisk(pos3d: vec3f) -> f32 {
  let r = length(pos3d.xz);
  let h = abs(pos3d.y);

  let innerR = blackhole.diskInnerR;
  let outerR = blackhole.diskOuterR;
  let halfThick = blackhole.effectiveThickness * 0.5;

  // Clamp r to annulus range
  let clampedR = clamp(r, innerR, outerR);
  let dr = abs(r - clampedR);

  // Vertical distance to disk surface
  let dh = h - halfThick;

  // Inside the radial bounds?
  if (r >= innerR && r <= outerR) {
    // Inside radially: SDF is just vertical distance
    return dh;
  }

  // Outside radially
  if (dh <= 0.0) {
    // Below disk height, just radial distance
    return dr;
  }

  // Outside both: distance to corner
  return length(vec2f(dr, dh));
}

// Check if a position is inside the disk annulus (radial bounds only).
fn isInDiskBounds(pos3d: vec3f) -> bool {
  let r = length(pos3d.xz);
  return r >= blackhole.diskInnerR && r <= blackhole.diskOuterR;
}

// Detect plane crossing between two positions.
// Returns interpolated crossing point if crossing detected.
fn detectDiskCrossing(prevPos: vec3f, currPos: vec3f) -> vec4f {
  // Returns (crossingPos.xyz, didCross) where didCross > 0.5 means crossing detected
  let prevY = prevPos.y;
  let currY = currPos.y;

  // Check for sign change (crossing y=0 plane)
  if (prevY * currY >= 0.0) {
    return vec4f(0.0, 0.0, 0.0, 0.0);  // No crossing
  }

  // Guard against division by zero
  let deltaY = prevY - currY;
  if (abs(deltaY) < 0.0001) {
    return vec4f(0.0, 0.0, 0.0, 0.0);
  }

  // Linear interpolation to find crossing point
  var t = prevY / deltaY;
  t = clamp(t, 0.0, 1.0);

  let crossingPos = mix(prevPos, currPos, t);

  // Check if crossing is within disk radial bounds
  if (isInDiskBounds(crossingPos)) {
    return vec4f(crossingPos, 1.0);
  }

  return vec4f(0.0, 0.0, 0.0, 0.0);
}

// Compute disk surface normal.
fn computeDiskNormal(pos3d: vec3f, approachDir: vec3f) -> vec3f {
  // For very thin disks, use flat normal
  if (blackhole.effectiveThickness < 0.05) {
    return vec3f(0.0, -sign(approachDir.y), 0.0);
  }

  // For thick disks, compute SDF gradient
  let eps = 0.001;
  let d0 = sdfDisk(pos3d);
  let dx = sdfDisk(pos3d + vec3f(eps, 0.0, 0.0)) - d0;
  let dy = sdfDisk(pos3d + vec3f(0.0, eps, 0.0)) - d0;
  let dz = sdfDisk(pos3d + vec3f(0.0, 0.0, eps)) - d0;

  var normal = vec3f(dx, dy, dz);
  let len = length(normal);
  if (len < 0.0001) {
    return vec3f(0.0, -sign(approachDir.y), 0.0);
  }
  normal = normal / len;

  // Ensure normal faces the viewer
  if (dot(normal, approachDir) > 0.0) {
    normal = -normal;
  }

  return normal;
}

// Get radial gradient color for disk
fn getDiskRadialColor(radialT: f32) -> vec3f {
  // Temperature-based coloring: inner is hotter (bluer), outer is cooler (redder)
  // Approximate blackbody color
  let temp = mix(blackhole.diskTemperature * 1.5, blackhole.diskTemperature * 0.3, radialT);

  // Simplified blackbody approximation
  var color: vec3f;
  if (temp > 10000.0) {
    // Blue-white
    color = vec3f(0.8, 0.9, 1.0);
  } else if (temp > 6000.0) {
    // White-yellow
    color = vec3f(1.0, 0.95, 0.85);
  } else if (temp > 4000.0) {
    // Orange
    color = vec3f(1.0, 0.7, 0.4);
  } else {
    // Red
    color = vec3f(1.0, 0.4, 0.2);
  }

  // Mix with base color
  return mix(color, blackhole.baseColor, 0.3);
}

// Gravitational redshift factor
fn gravitationalRedshift(r: f32) -> f32 {
  let rs = blackhole.horizonRadius;
  // g = sqrt(1 - rs/r) for Schwarzschild
  let ratio = rs / max(r, rs * 1.01);
  return sqrt(max(1.0 - ratio, 0.01));
}

// Shade a disk surface hit.
fn shadeDiskHit(hitPos: vec3f, rayDir: vec3f, hitIndex: i32, time: f32) -> vec3f {
  let r = length(hitPos.xz);
  let innerR = blackhole.diskInnerR;
  let outerR = blackhole.diskOuterR;

  // Normalized radial position [0, 1]
  let radialRange = max(outerR - innerR, 0.001);
  let radialT = clamp((r - innerR) / radialRange, 0.0, 1.0);

  // Get base color
  var color = getDiskRadialColor(radialT);

  // Apply gravitational redshift
  let gRedshift = gravitationalRedshift(r);
  color *= gRedshift;

  // Subtle red shift effect
  let redShiftAmount = (1.0 - gRedshift) * 0.15;
  let redTint = vec3f(color.r * 1.2, color.g * 0.9, color.b * 0.85);
  color = mix(color, redTint, redShiftAmount);

  // Calculate angle once for swirl and noise
  let needsAngle = blackhole.swirlAmount > 0.001 || blackhole.noiseAmount > 0.001;
  var angle = 0.0;
  if (needsAngle) {
    angle = atan2(hitPos.z, hitPos.x);
  }

  // Add swirl pattern
  if (blackhole.swirlAmount > 0.001) {
    let swirlPhase = angle * 3.0 + r * 0.5 - time * 0.5;
    let swirlBright = 0.5 + 0.5 * sin(swirlPhase);
    color *= mix(0.7, 1.3, swirlBright * blackhole.swirlAmount);
  }

  // Multi-intersection gain (Einstein ring enhancement)
  let crossingGain = 1.0 + f32(hitIndex) * blackhole.multiIntersectionGain * 0.3;
  color *= crossingGain;

  // Apply intensity
  color *= blackhole.manifoldIntensity;

  return color;
}
`
