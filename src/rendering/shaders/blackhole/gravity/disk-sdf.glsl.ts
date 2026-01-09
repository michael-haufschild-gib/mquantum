/**
 * SDF-Based Accretion Disk
 *
 * Surface intersection approach for thin accretion disk:
 * - Detects plane crossings as ray bends around black hole
 * - Multiple crossings create Einstein ring effect
 * - Uses existing manifold coloring and Doppler shift
 *
 * This module works alongside the volumetric approach (manifold.glsl.ts),
 * providing an alternative rendering mode optimized for Einstein ring visualization.
 */

export const diskSdfBlock = /* glsl */ `
//----------------------------------------------
// SDF-BASED ACCRETION DISK
//----------------------------------------------

// Maximum Einstein ring layers (crossings to track)
const int MAX_DISK_CROSSINGS = 8;

/**
 * SDF for thick disk (annulus with height).
 * Returns signed distance to disk surface.
 *
 * The disk is an annulus in the XZ plane (y=0) with optional thickness.
 *
 * @param pos3d - 3D position
 * @returns Signed distance (negative inside disk)
 */
float sdfDisk(vec3 pos3d) {
  float r = length(pos3d.xz);
  float h = abs(pos3d.y);

  // PERF (OPT-BH-6): Use pre-computed disk radii uniforms
  float innerR = uDiskInnerR;
  float outerR = uDiskOuterR;
  // PERF (OPT-BH-13): Use pre-computed effective thickness from CPU
  float halfThick = uEffectiveThickness * 0.5;

  // Clamp r to annulus range
  float clampedR = clamp(r, innerR, outerR);
  float dr = abs(r - clampedR);

  // Vertical distance to disk surface
  float dh = h - halfThick;

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
  return length(vec2(dr, dh));
}

/**
 * Check if a position is inside the disk annulus (radial bounds only).
 *
 * @param pos3d - 3D position
 * @returns true if within radial bounds
 */
bool isInDiskBounds(vec3 pos3d) {
  float r = length(pos3d.xz);
  // PERF (OPT-BH-6): Use pre-computed disk radii uniforms
  return r >= uDiskInnerR && r <= uDiskOuterR;
}

/**
 * Detect plane crossing between two positions.
 * Returns interpolated crossing point if crossing detected.
 *
 * @param prevPos - Previous ray position
 * @param currPos - Current ray position
 * @param crossingPos - Output: interpolated crossing position
 * @returns true if crossing detected and within disk bounds
 */
bool detectDiskCrossing(vec3 prevPos, vec3 currPos, out vec3 crossingPos) {
  float prevY = prevPos.y;
  float currY = currPos.y;

  // Check for sign change (crossing y=0 plane)
  if (prevY * currY >= 0.0) {
    return false;  // No crossing
  }

  // Guard against division by zero when prevY == currY (shouldn't happen after sign check, but be safe)
  float deltaY = prevY - currY;
  if (abs(deltaY) < 0.0001) {
    return false;
  }

  // Linear interpolation to find crossing point
  float t = prevY / deltaY;
  t = clamp(t, 0.0, 1.0);  // Safety clamp

  crossingPos = mix(prevPos, currPos, t);

  // Check if crossing is within disk radial bounds
  return isInDiskBounds(crossingPos);
}

/**
 * Compute disk surface normal.
 * For thin disk, normal is +/- Y based on approach direction.
 * For thick disk, compute from SDF gradient.
 *
 * @param pos3d - Position on disk surface
 * @param approachDir - Ray direction (for determining which side)
 * @returns Surface normal
 */
vec3 computeDiskNormal(vec3 pos3d, vec3 approachDir) {
  // PERF (OPT-BH-13): Use pre-computed effective thickness from CPU
  // For very thin disks, use flat normal
  if (uEffectiveThickness < 0.05) {
    // Normal points opposite to approach direction (toward viewer)
    return vec3(0.0, -sign(approachDir.y), 0.0);
  }

  // For thick disks, compute SDF gradient
  float eps = 0.001;
  float d0 = sdfDisk(pos3d);
  float dx = sdfDisk(pos3d + vec3(eps, 0.0, 0.0)) - d0;
  float dy = sdfDisk(pos3d + vec3(0.0, eps, 0.0)) - d0;
  float dz = sdfDisk(pos3d + vec3(0.0, 0.0, eps)) - d0;

  vec3 normal = vec3(dx, dy, dz);
  float len = length(normal);
  if (len < 0.0001) {
    return vec3(0.0, -sign(approachDir.y), 0.0);
  }
  normal = normal / len;

  // Ensure normal faces the viewer
  if (dot(normal, approachDir) > 0.0) {
    normal = -normal;
  }

  return normal;
}

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
vec3 shadeDiskHit(vec3 hitPos, vec3 rayDir, int hitIndex, float time) {
  float r = length(hitPos.xz);
  // PERF (OPT-BH-6): Use pre-computed disk radii uniforms
  float innerR = uDiskInnerR;
  float outerR = uDiskOuterR;

  // Normalized radial position [0, 1] (0 = inner edge, 1 = outer edge)
  // Guard against division by zero when innerR >= outerR (invalid but possible configuration)
  float radialRange = max(outerR - innerR, 0.001);
  float radialT = clamp((r - innerR) / radialRange, 0.0, 1.0);

  // Compute normal early if needed for lighting or coloring (ALGO_NORMAL)
  vec3 normal = vec3(0.0, 1.0, 0.0);
  if (uLightingMode == 1 || uColorAlgorithm == ALGO_NORMAL) {
      normal = computeDiskNormal(hitPos, rayDir);
  }

  // Get base color from selected algorithm
  vec3 color = getAlgorithmColor(radialT, hitPos, normal);

  // Apply gravitational redshift
  // Light from closer to the horizon is redshifted (dimmer and redder)
  float gRedshift = gravitationalRedshift(r);
  color *= gRedshift; // Intensity reduction
  // PERF (OPT-BH-12): Use fast RGB red-tint instead of expensive HSL round-trip
  // Simple red shift: mix toward a red-biased version of the color
  // This avoids rgb2hsl + hsl2rgb (~20+ ALU ops) per disk crossing
  float redShiftAmount = (1.0 - gRedshift) * 0.15; // Subtle effect
  vec3 redTint = vec3(color.r * 1.2, color.g * 0.9, color.b * 0.85);
  color = mix(color, redTint, redShiftAmount);

  // PERF (OPT-BH-14): Calculate angle once for both swirl and noise
  // atan() is ~8 cycles on GPU - avoid calling twice
  bool needsAngle = uSwirlAmount > 0.001 || uNoiseAmount > 0.001;
  float angle = needsAngle ? atan(hitPos.z, hitPos.x) : 0.0;

  // Add swirl pattern
  if (uSwirlAmount > 0.001) {
    float swirlPhase = angle * 3.0 + r * 0.5 - time * 0.5;
    float swirlBright = 0.5 + 0.5 * sin(swirlPhase);
    color *= mix(0.7, 1.3, swirlBright * uSwirlAmount);
  }

  // PERF (OPT-BH-25): Use texture-based snoise instead of expensive noise3D
  // Add noise turbulence
  if (uNoiseAmount > 0.001) {
    vec3 noisePos = vec3(r * 0.3, angle * 2.0, 0.0) * uNoiseScale;
    // snoise returns [-1, 1], convert to [0, 1] for ridged calculation
    float n = snoise(noisePos + time * 0.1) * 0.5 + 0.5;
    float ridged = 1.0 - abs(2.0 * n - 1.0);
    ridged = ridged * ridged; // PERF: x² instead of pow
    color *= mix(1.0, ridged, uNoiseAmount);
  }

  // Apply lighting (FakeLit mode)
  if (uLightingMode == 1) {
    // normal is already computed above
    vec3 lightDir = normalize(uLightPositions[0] - hitPos);

    float NdotL = max(dot(normal, lightDir), 0.0);
    float diffuse = NdotL;

    vec3 viewDir = normalize(uCameraPosition - hitPos);
    vec3 halfDir = normalize(lightDir + viewDir);
    float NdotH = max(dot(normal, halfDir), 0.0);
    float specular = pow(NdotH, 32.0 * (1.0 - uRoughness + 0.1)) * uSpecular;

    float lightContrib = uAmbientTint + diffuse * (1.0 - uAmbientTint);
    color *= lightContrib;
    color += vec3(specular) * uLightColors[0];
  }

  // Apply Doppler shift (reuse existing function from doppler.glsl.ts)
  float dopplerFac = dopplerFactor(hitPos, rayDir);
  color = applyDopplerShift(color, dopplerFac);

  // Multi-intersection gain (Einstein ring enhancement)
  // Later crossings (back of disk seen through lensing) get brightness boost
  float crossingGain = 1.0 + float(hitIndex) * uMultiIntersectionGain * 0.3;
  color *= crossingGain;

  // Apply intensity
  color *= uManifoldIntensity;

  return color;
}

// Note: accumulateDiskHit is defined in main.glsl.ts where AccumulationState is available
`
