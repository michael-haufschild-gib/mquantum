/**
 * WGSL SDF-Based Accretion Disk
 *
 * Port of GLSL blackhole/gravity/disk-sdf.glsl to WGSL.
 * Surface intersection approach for thin accretion disk.
 *
 * Features:
 * - SDF-based disk geometry with thickness support
 * - Einstein ring detection (multiple plane crossings)
 * - Color algorithm selector integration
 * - Lighting mode support (emissive-only or fakeLit)
 * - Gravitational redshift integration
 * - Doppler shift integration
 * - Swirl and noise turbulence
 *
 * @module rendering/webgpu/shaders/blackhole/disk-sdf.wgsl
 */

export const diskSdfBlock = /* wgsl */ `
// ============================================
// SDF-Based Accretion Disk
// ============================================

// Maximum Einstein ring layers (crossings to track)
const MAX_DISK_CROSSINGS: i32 = 8;

// Color algorithm constant for normal-based coloring check
const DISK_ALGO_NORMAL: i32 = 3;

// Fast hash-based noise for disk turbulence
// Returns [-1, 1] range
fn diskSnoise(v: vec3f) -> f32 {
  let p = fract(v * 0.1031);
  let p2 = p + dot(p, p.zyx + 31.32);
  let n = fract((p2.x + p2.y) * p2.z);
  return n * 2.0 - 1.0;
}

// ============================================
// Disk SDF Functions
// ============================================

/**
 * SDF for thick disk (annulus with height).
 * Returns signed distance to disk surface.
 *
 * The disk is an annulus in the XZ plane (y=0) with optional thickness.
 */
fn sdfDisk(pos3d: vec3f) -> f32 {
  let r = length(pos3d.xz);
  let h = abs(pos3d.y);

  // Use pre-computed disk radii uniforms
  let innerR = blackhole.diskInnerR;
  let outerR = blackhole.diskOuterR;
  // Use pre-computed effective thickness from CPU
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

/**
 * Check if a position is inside the disk annulus (radial bounds only).
 */
fn isInDiskBounds(pos3d: vec3f) -> bool {
  let r = length(pos3d.xz);
  return r >= blackhole.diskInnerR && r <= blackhole.diskOuterR;
}

// ============================================
// Crossing Detection
// ============================================

/**
 * Detect plane crossing between two positions.
 * Returns vec4(crossingPos.xyz, didCross) where didCross > 0.5 means crossing detected.
 */
fn detectDiskCrossing(prevPos: vec3f, currPos: vec3f) -> vec4f {
  let prevY = prevPos.y;
  let currY = currPos.y;

  // Check for sign change (crossing y=0 plane)
  if (prevY * currY >= 0.0) {
    return vec4f(0.0, 0.0, 0.0, 0.0);  // No crossing
  }

  // Guard against division by zero when prevY == currY
  let deltaY = prevY - currY;
  if (abs(deltaY) < 0.0001) {
    return vec4f(0.0, 0.0, 0.0, 0.0);
  }

  // Linear interpolation to find crossing point
  var t = prevY / deltaY;
  t = clamp(t, 0.0, 1.0);  // Safety clamp

  let crossingPos = mix(prevPos, currPos, t);

  // Check if crossing is within disk radial bounds
  if (isInDiskBounds(crossingPos)) {
    return vec4f(crossingPos, 1.0);
  }

  return vec4f(0.0, 0.0, 0.0, 0.0);
}

// ============================================
// Surface Normal
// ============================================

/**
 * Compute disk surface normal.
 * For thin disk, normal is +/- Y based on approach direction.
 * For thick disk, compute from SDF gradient.
 */
fn computeDiskNormal(pos3d: vec3f, approachDir: vec3f) -> vec3f {
  // For very thin disks, use flat normal
  if (blackhole.effectiveThickness < 0.05) {
    // Normal points opposite to approach direction (toward viewer)
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

// ============================================
// Disk Shading
// ============================================

/**
 * Shade a disk surface hit.
 * Applies temperature gradient, noise, swirl, Doppler shift, and lighting.
 *
 * @param hitPos - Surface hit position
 * @param rayDir - Incoming ray direction
 * @param hitIndex - Which crossing this is (0 = first, higher = Einstein ring layers)
 * @param time - Animation time
 * @returns Shaded color contribution
 */
fn shadeDiskHit(hitPos: vec3f, rayDir: vec3f, hitIndex: i32, time: f32) -> vec3f {
  let r = length(hitPos.xz);
  let innerR = blackhole.diskInnerR;
  let outerR = blackhole.diskOuterR;

  // Normalized radial position [0, 1] (0 = inner edge, 1 = outer edge)
  // Guard against division by zero when innerR >= outerR
  let radialRange = max(outerR - innerR, 0.001);
  let radialT = clamp((r - innerR) / radialRange, 0.0, 1.0);

  // Compute normal early if needed for lighting or coloring (ALGO_NORMAL)
  var normal = vec3f(0.0, 1.0, 0.0);
  if (blackhole.lightingMode == 1 || blackhole.colorAlgorithm == DISK_ALGO_NORMAL) {
    normal = computeDiskNormal(hitPos, rayDir);
  }

  // Get base color from selected algorithm
  // Uses getAlgorithmColor from colors.wgsl (must be included before this module)
  var color = getAlgorithmColor(radialT, hitPos, normal, blackhole);

  // Apply gravitational redshift
  // Light from closer to the horizon is redshifted (dimmer and redder)
  // Uses gravitationalRedshift from doppler.wgsl
  let gRedshift = gravitationalRedshift(r);
  color *= gRedshift; // Intensity reduction

  // Simple red shift: mix toward a red-biased version of the color
  // This avoids expensive HSL round-trip per disk crossing
  let redShiftAmount = (1.0 - gRedshift) * 0.15; // Subtle effect
  let redTint = vec3f(color.x * 1.2, color.y * 0.9, color.z * 0.85);
  color = mix(color, redTint, redShiftAmount);

  // Calculate angle once for both swirl and noise
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

  // Add noise turbulence
  if (blackhole.noiseAmount > 0.001) {
    let noisePos = vec3f(r * 0.3, angle * 2.0, 0.0) * blackhole.noiseScale;
    // diskSnoise returns [-1, 1], convert to [0, 1] for ridged calculation
    let n = diskSnoise(noisePos + time * 0.1) * 0.5 + 0.5;
    let ridged = 1.0 - abs(2.0 * n - 1.0);
    let ridgedSq = ridged * ridged; // More contrast (x^2 instead of pow)
    color *= mix(1.0, ridgedSq, blackhole.noiseAmount);
  }

  // Apply lighting (FakeLit mode)
  if (blackhole.lightingMode == 1) {
    // normal is already computed above
    // Access first light from lighting uniform buffer
    let lightPos = lighting.lights[0].position.xyz;
    let lightColor = lighting.lights[0].color.rgb;
    let lightDir = normalize(lightPos - hitPos);

    let NdotL = max(dot(normal, lightDir), 0.0);
    let diffuse = NdotL;

    let viewDir = normalize(camera.cameraPosition - hitPos);
    let halfDir = normalize(lightDir + viewDir);
    let NdotH = max(dot(normal, halfDir), 0.0);
    // Blinn-Phong specular with roughness-based shininess
    let shininess = 32.0 * (1.0 - blackhole.roughness + 0.1);
    let specular = pow(NdotH, shininess) * blackhole.specular;

    let lightContrib = blackhole.ambientTint + diffuse * (1.0 - blackhole.ambientTint);
    color *= lightContrib;
    color += vec3f(specular) * lightColor;
  }

  // Apply Doppler shift (reuse existing function from doppler.wgsl)
  let dopplerFac = dopplerFactor(hitPos, rayDir);
  color = applyDopplerShift(color, dopplerFac);

  // Multi-intersection gain (Einstein ring enhancement)
  // Later crossings (back of disk seen through lensing) get brightness boost
  let crossingGain = 1.0 + f32(hitIndex) * blackhole.multiIntersectionGain * 0.3;
  color *= crossingGain;

  // Apply intensity
  color *= blackhole.manifoldIntensity;

  return color;
}
`
