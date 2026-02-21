/**
 * WGSL Wigner Phase-Space Fragment Shader Entry Point
 *
 * Renders the Wigner quasi-probability distribution W(x,p) as a 2D heatmap
 * in phase space. Maps UV → (x, p) coordinates and evaluates the Wigner
 * function for the selected dimension.
 *
 * Supports two evaluation paths:
 * - Inline evaluation (useCache=false): per-pixel Laguerre/quadrature computation
 * - Cache texture sampling (useCache=true): bilinear sample from pre-computed grid
 *
 * Coordinate mapping:
 * - HO / extra dims: symmetric x-axis [-wignerXRange, +wignerXRange]
 * - Hydrogen radial (dimIdx < 3): one-sided x-axis [0, wignerXRange] since r >= 0
 *
 * @module rendering/webgpu/shaders/schroedinger/mainWigner2D
 */

/**
 * Generate the Wigner 2D fragment shader main block.
 *
 * Maps UV → phase-space (x, p), evaluates Wigner function, applies color.
 * Uses existing computeBaseColor() for user-selectable color algorithms.
 *
 * @param useCache - When true, sample W from pre-computed cache texture
 *                   instead of inline evaluation
 * @returns WGSL fragment shader code for Wigner phase-space visualization
 */
export function generateMainBlockWigner2D(useCache = false): string {
  // Wigner evaluation block: either cache texture sample or inline computation
  const wignerEvalBlock = useCache
    ? /* wgsl */ `
  // === CACHE PATH: Sample W from pre-computed 2D texture ===
  // Map physical coords to cache UV [0,1]
  // Cache grid range matches the renderer's updateGridParams() computation:
  // Hydrogen radial: [max(0, rCenter - halfExt*aspect), rCenter + halfExt*aspect]
  // HO / extra dim: [-xRange*aspect, +xRange*aspect]
  let xRangeScaled = schroedinger.wignerXRange * aspect;
  var cacheU: f32;
  if (isHydrogenRadial) {
    let rCenter = f32(schroedinger.principalN * schroedinger.principalN) * schroedinger.bohrRadius;
    let cacheXMin = max(0.0, rCenter - xRangeScaled);
    let cacheXMax = rCenter + xRangeScaled;
    cacheU = (xPhys - cacheXMin) / (cacheXMax - cacheXMin);
  } else {
    cacheU = (xPhys + xRangeScaled) / (2.0 * xRangeScaled);
  }
  let cacheV = (pPhys + schroedinger.wignerPRange) / (2.0 * schroedinger.wignerPRange);

  // Out-of-bounds: position is outside the cached region
  if (cacheU < 0.0 || cacheU > 1.0 || cacheV < 0.0 || cacheV > 1.0) {
    discard;
  }

  // Sample cache: R = signed W, G = |W|
  let cacheSample = textureSampleLevel(wignerCacheTexture, wignerCacheSampler, vec2f(cacheU, cacheV), 0.0);
  var W = cacheSample.x;
`
    : /* wgsl */ `
  // === INLINE PATH: Per-pixel Wigner evaluation ===
  let dimIdx = schroedinger.wignerDimensionIndex;
  let t = schroedinger.time * schroedinger.timeScale;
  var W = 0.0;

  if (QUANTUM_MODE_DEFAULT == QUANTUM_MODE_HYDROGEN_ND) {
    // Hydrogen family
    if (dimIdx < 3) {
      // Core radial dimension: numerical Fourier-cosine quadrature
      // xPhys >= 0 guaranteed by discard check above for hydrogen radial.
      let r = xPhys;
      let pr = pPhys;
      W = wignerHydrogenRadial(
        r, pr,
        schroedinger.principalN,
        schroedinger.azimuthalL,
        schroedinger.bohrRadius,
        schroedinger.wignerQuadPoints
      );
    } else {
      // Extra HO dimension (dimIdx >= 3): analytical single Fock state Wigner
      let extraIdx = dimIdx - 3;
      let n = getExtraDimN(schroedinger, extraIdx);
      let omega = getExtraDimOmega(schroedinger, extraIdx);
      W = wignerDiagonal(n, xPhys, pPhys, omega);
    }
  } else {
    // Harmonic oscillator: full marginal Wigner with cross terms and time evolution
    W = evaluateWignerMarginalHO(xPhys, pPhys, dimIdx, t, schroedinger);
  }
`

  return /* wgsl */ `
// ============================================
// Main Fragment Shader - Wigner Phase-Space Mode
// ============================================

/**
 * Compute the signed distance to the classical HO energy ellipse.
 * Ellipse: omega*x^2 + p^2/omega = E_cl, where E_cl = 2n + 1.
 * Returns smooth anti-aliased line opacity.
 */
fn classicalEllipseSDF(x: f32, p: f32, omega: f32, energy: f32, lineWidth: f32) -> f32 {
  // Implicit function: f(x,p) = omega*x^2 + p^2/omega - energy
  let f = omega * x * x + p * p / omega - energy;
  // Gradient magnitude for distance normalization
  let gx = 2.0 * omega * x;
  let gp = 2.0 * p / omega;
  let gradMag = sqrt(gx * gx + gp * gp);
  // Signed distance
  let dist = abs(f) / max(gradMag, 1e-8);
  // Anti-aliased line
  return 1.0 - smoothstep(0.0, lineWidth, dist);
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  // Detect hydrogen radial mode: one-sided x-axis [0, rMax] since r >= 0
  let isHydrogenRadial = (QUANTUM_MODE_DEFAULT == QUANTUM_MODE_HYDROGEN_ND)
    && (schroedinger.wignerDimensionIndex < 3);

  // Map UV to physical (x, p) coordinates with aspect correction
  // for square pixels in phase space (1 unit x = 1 unit p on screen).
  // Both modes use symmetric UV mapping centered at origin.
  // Hydrogen radial: offset by rCenter = n²a₀ so the orbital peak is at screen center.
  // HO / extra dim: centered at origin (symmetric wavefunction).
  // p is always symmetric: [-wignerPRange, +wignerPRange]
  let aspect = camera.resolution.x / camera.resolution.y;
  let centeredUV = input.uv * 2.0 - 1.0;
  var x = centeredUV.x * schroedinger.wignerXRange * aspect;
  var p = centeredUV.y * schroedinger.wignerPRange;

  // Hydrogen radial: shift origin to rCenter so orbital peak is at screen center
  if (isHydrogenRadial) {
    let rCenter = f32(schroedinger.principalN * schroedinger.principalN) * schroedinger.bohrRadius;
    x += rCenter;
  }

  // Apply camera pan/zoom (model matrix) for interactive navigation
  let panResult = (camera.modelMatrix * vec4f(x, p, 0.0, 1.0)).xyz;
  let xPhys = panResult.x;
  let pPhys = panResult.y;

  // Hydrogen radial: discard negative r (unphysical region)
  if (isHydrogenRadial && xPhys < 0.0) {
    discard;
  }

  // Evaluate Wigner function
${wignerEvalBlock}

  // Map Wigner value to color
  let absW = abs(W);
  let s = log(max(absW, 1e-10));

  // Encode W as a complex number for computeBaseColor:
  // positive W → phase=0, negative W → phase=pi
  let phase = select(0.0, PI, W < 0.0);
  let fakePos = vec3f(xPhys, pPhys, 0.0);
  var col = computeBaseColor(absW, s, phase, fakePos, schroedinger);

  // Ambient lighting
  col = col * lighting.ambientColor * lighting.ambientIntensity;

  // HDR Emission Glow
  if (schroedinger.emissionIntensity > 0.0) {
    let normalizedRho = clamp((s + 8.0) / 8.0, 0.0, 1.0);
    if (normalizedRho > schroedinger.emissionThreshold) {
      var emissionFactor = (normalizedRho - schroedinger.emissionThreshold) / (1.0 - schroedinger.emissionThreshold);
      emissionFactor = emissionFactor * emissionFactor;
      col += col * schroedinger.emissionIntensity * emissionFactor;
    }
  }

  // Alpha from Wigner magnitude (adaptive scaling for visibility)
  var alpha = clamp(absW * 8.0, 0.0, 1.0);

  // Classical trajectory overlay
  if (schroedinger.wignerClassicalOverlay != 0u) {
    // Compute pixel size in phase-space units for line width scaling
    // Both modes use symmetric mapping: x covers [-xRange*aspect, +xRange*aspect]
    let xExtent = schroedinger.wignerXRange * aspect * 2.0;
    let pixelX = xExtent / camera.resolution.x;
    let pixelP = schroedinger.wignerPRange * 2.0 / camera.resolution.y;
    let lineWidth = max(pixelX, pixelP) * 1.5;
    let lineColor = vec3f(1.0, 1.0, 1.0);
    var overlayAlpha = 0.0;

    if (QUANTUM_MODE_DEFAULT == QUANTUM_MODE_HYDROGEN_ND) {
      let dimIdx = schroedinger.wignerDimensionIndex;
      if (dimIdx < 3) {
        // Hydrogen radial: classical turning points
        let nf = f32(schroedinger.principalN);
        let lf = f32(schroedinger.azimuthalL);
        let a0 = schroedinger.bohrRadius;
        let E = -1.0 / (2.0 * nf * nf);
        let ll1 = lf * (lf + 1.0);
        if (ll1 > 0.0) {
          let disc = 1.0 + 2.0 * E * ll1;
          if (disc >= 0.0) {
            let sqrtDisc = sqrt(disc);
            let invR1 = (1.0 + sqrtDisc) / (ll1 * a0);
            let invR2 = (1.0 - sqrtDisc) / (ll1 * a0);
            let rMin = select(0.0, 1.0 / invR1, invR1 > 0.0);
            let rMax = select(100.0 * a0, 1.0 / invR2, invR2 > 0.0);
            let distMin = abs(xPhys - rMin);
            let distMax = abs(xPhys - rMax);
            let lineMin = 1.0 - smoothstep(0.0, lineWidth, distMin);
            let lineMax = 1.0 - smoothstep(0.0, lineWidth, distMax);
            overlayAlpha = max(lineMin, lineMax);
          }
        } else {
          let rMax = 2.0 * nf * nf * a0;
          let distMax = abs(xPhys - rMax);
          overlayAlpha = 1.0 - smoothstep(0.0, lineWidth, distMax);
        }
      } else {
        // Extra HO dimension: same as HO ellipse
        let extraIdx = dimIdx - 3;
        let n = getExtraDimN(schroedinger, extraIdx);
        let omega = getExtraDimOmega(schroedinger, extraIdx);
        let energy = 2.0 * f32(n) + 1.0;
        overlayAlpha = classicalEllipseSDF(xPhys, pPhys, omega, energy, lineWidth);
      }
    } else {
      // HO: draw energy ellipse for each term (weighted by |c_k|^2)
      let dimIdx = schroedinger.wignerDimensionIndex;
      let omega = getOmega(schroedinger, dimIdx);
      let tc = schroedinger.termCount;
      for (var k = 0; k < tc; k++) {
        let c = getCoeff(schroedinger, k);
        let weight = c.x * c.x + c.y * c.y;
        if (weight < 0.01) { continue; }
        let n = getQuantumNumber(schroedinger, k, dimIdx);
        let energy = 2.0 * f32(n) + 1.0;
        let ellipse = classicalEllipseSDF(xPhys, pPhys, omega, energy, lineWidth);
        overlayAlpha = max(overlayAlpha, ellipse * weight);
      }
    }

    // Blend overlay line onto the color
    let overlayStrength = clamp(overlayAlpha, 0.0, 1.0) * 0.8;
    col = mix(col, lineColor, overlayStrength);
    alpha = max(alpha, overlayStrength);
  }

  if (alpha < 0.005) {
    discard;
  }

  return vec4f(col, alpha);
}
`
}
