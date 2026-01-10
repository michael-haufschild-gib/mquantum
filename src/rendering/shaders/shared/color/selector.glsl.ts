export const selectorBlock = `
// ============================================
// Unified Color Algorithm Selector
// ============================================

vec3 getColorByAlgorithm(float t, vec3 normal, vec3 baseHSL, vec3 position) {
  // Use else-if chain for proper mutual exclusion on all GPU architectures
  if (uColorAlgorithm == 0) {
    // Algorithm 0: Monochromatic - same hue, varying lightness
    float distributedT = applyDistribution(t, uDistPower, uDistCycles, uDistOffset);
    float newL = 0.3 + distributedT * 0.4;
    return hsl2rgb(vec3(baseHSL.x, baseHSL.y, newL));
  } else if (uColorAlgorithm == 1) {
    // Algorithm 1: Analogous - hue varies ±30° from base
    float distributedT = applyDistribution(t, uDistPower, uDistCycles, uDistOffset);
    float hueOffset = (distributedT - 0.5) * 0.167;
    float newH = fract(baseHSL.x + hueOffset);
    return hsl2rgb(vec3(newH, baseHSL.y, baseHSL.z));
  } else if (uColorAlgorithm == 2) {
    // Algorithm 2: Cosine gradient palette
    return getCosinePaletteColor(t, uCosineA, uCosineB, uCosineC, uCosineD,
                                  uDistPower, uDistCycles, uDistOffset);
  } else if (uColorAlgorithm == 3) {
    // Algorithm 3: Normal-based coloring
    float normalT = normal.y * 0.5 + 0.5;
    return getCosinePaletteColor(normalT, uCosineA, uCosineB, uCosineC, uCosineD,
                                  uDistPower, uDistCycles, uDistOffset);
  } else if (uColorAlgorithm == 4) {
    // Algorithm 4: Distance-field coloring
    return getCosinePaletteColor(t, uCosineA, uCosineB, uCosineC, uCosineD,
                                  uDistPower, uDistCycles, uDistOffset);
  } else if (uColorAlgorithm == 5) {
    // Algorithm 5: LCH/Oklab perceptual
    float distributedT = applyDistribution(t, uDistPower, uDistCycles, uDistOffset);
    return lchColor(distributedT, uLchLightness, uLchChroma);
  } else if (uColorAlgorithm == 6) {
    // Algorithm 6: Multi-source mapping
    // Blends depth (t), orbitTrap (position-based), and normal contributions
    float totalWeight = uMultiSourceWeights.x + uMultiSourceWeights.y + uMultiSourceWeights.z;
    vec3 w = uMultiSourceWeights / max(totalWeight, 0.001);
    float normalValue = normal.y * 0.5 + 0.5;
    // Use position-based orbit trap instead of duplicating t
    float orbitTrap = clamp(length(position) / BOUND_R, 0.0, 1.0);
    float blendedT = w.x * t + w.y * orbitTrap + w.z * normalValue;
    return getCosinePaletteColor(blendedT, uCosineA, uCosineB, uCosineC, uCosineD,
                                  uDistPower, uDistCycles, uDistOffset);
  } else if (uColorAlgorithm == 7) {
    // Algorithm 7: Radial - color based on 3D distance from origin
    // Normalize by bounding radius (BOUND_R = 2.0)
    float radialT = clamp(length(position) / BOUND_R, 0.0, 1.0);
    return getCosinePaletteColor(radialT, uCosineA, uCosineB, uCosineC, uCosineD,
                                  uDistPower, uDistCycles, uDistOffset);
  } else if (uColorAlgorithm == 8) {
    // Algorithm 8: Phase (Angular)
    // Use azimuth angle in XZ plane normalized to 0-1
    float angle = atan(position.z, position.x);
    float phaseT = angle * 0.15915 + 0.5; // 1/(2*PI)
    return getCosinePaletteColor(phaseT, uCosineA, uCosineB, uCosineC, uCosineD,
                                  uDistPower, uDistCycles, uDistOffset);
  } else if (uColorAlgorithm == 9) {
    // Algorithm 9: Mixed (Phase + Distance)
    float angle = atan(position.z, position.x);
    float phaseT = angle * 0.15915 + 0.5;
    float distT = applyDistribution(t, uDistPower, uDistCycles, uDistOffset);
    // Map phase to Hue, Distance to Lightness (conceptually) via Palette
    float mixedT = mix(phaseT, distT, 0.5);
    return getCosinePaletteColor(mixedT, uCosineA, uCosineB, uCosineC, uCosineD,
                                  uDistPower, uDistCycles, uDistOffset);
  } else if (uColorAlgorithm == 10) {
    // Algorithm 10: Blackbody (Heat)
    float distT = applyDistribution(t, uDistPower, uDistCycles, uDistOffset);
    // Simple Kelvin-like gradient: Black->Red->Orange->White
    // t 0.0 -> 0,0,0
    // t 0.33 -> 1,0,0
    // t 0.66 -> 1,1,0
    // t 1.0 -> 1,1,1
    vec3 col = vec3(0.0);
    col.r = smoothstep(0.0, 0.33, distT);
    col.g = smoothstep(0.33, 0.66, distT);
    col.b = smoothstep(0.66, 1.0, distT);
    return col;
  } else if (uColorAlgorithm == 13) {
    // Algorithm 13: Dimension-based coloring (Polytopes)
    // Colors each face/edge based on which N-dimensional axis it primarily extends along.
    // Uses cosine palette for colors - fully configurable via the palette controls.
    //
    // Maps primary axis from normal direction to a t value, then uses cosine palette.
    // X-axis → t=0.0, Y-axis → t=0.33, Z-axis → t=0.67
    // Higher dimensions blend based on extra dimension depth.

    // Determine primary 3D axis from normal direction
    vec3 absNormal = abs(normal);
    float maxComp = max(max(absNormal.x, absNormal.y), absNormal.z);

    // Map primary axis to t value (evenly spaced on color wheel)
    // X=0.0, Y=0.33, Z=0.67, with higher dims continuing the sequence
    float dimT = 0.0;
    if (absNormal.y >= maxComp - 0.001) dimT = 0.333;
    else if (absNormal.z >= maxComp - 0.001) dimT = 0.667;

    // For higher dimensions (4D+), shift the t value based on extra dimension depth
    // t parameter represents contribution from dimensions 4-10
    // This creates distinct colors for W, V, U, T, S dimensions
    float extraDimInfluence = smoothstep(0.2, 0.8, t);

    // Offset dimT by extra dimension contribution (wraps around color wheel)
    // Each higher dimension gets 0.125 offset (8 distinct dimension slots)
    float highDimOffset = t * 0.5; // Maps t∈[0,1] to offset∈[0,0.5]
    dimT = fract(dimT + highDimOffset * extraDimInfluence);

    // Use cosine palette with the dimension-derived t value
    // This respects user's palette configuration (uCosineA/B/C/D)
    return getCosinePaletteColor(dimT, uCosineA, uCosineB, uCosineC, uCosineD,
                                  uDistPower, uDistCycles, uDistOffset);
  } else {
    // Fallback: cosine palette
    return getCosinePaletteColor(t, uCosineA, uCosineB, uCosineC, uCosineD,
                                  uDistPower, uDistCycles, uDistOffset);
  }
}
`;
