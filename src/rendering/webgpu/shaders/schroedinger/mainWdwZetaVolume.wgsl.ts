/**
 * WGSL live main shader for the WDW ⊗ ζ visualization suite.
 *
 * The fragment entry point shared by all eleven suite modes (branched on the
 * `wzModeId` uniform — a uniform constant for the whole draw, so the branch is
 * coherent), plus the per-mode lit-surface albedo, emissive colour, and additive
 * surface emission. Each mode is a genuinely different lit, sphere-traced 3D form
 * synthesized live from the compact ζ-LUT; in 4D (`wzFourth()`) it grows a bespoke
 * WILD fourth-dimensional structure. The per-mode signed-distance builders
 * (`wzMap0`–`wzMap10`), the scene dispatch, and the gradient normal / AO live in
 * the sibling `mainWdwZetaSdf` block (composed just before this one, to keep both
 * files under the 600-line budget).
 *
 * Render contract: emission gain is the shared `emissionIntensity`
 * (appearanceStore.faceEmission, Advanced ▸ "Emission & Rim"); rotation is the
 * shared N-D slice basis B = [basisX basisY basisZ]; the 4th basis row supplies
 * the W coordinate that drives the 4D forms; relational-time animation reads
 * `schroedinger.time`.
 *
 * Requires (sibling compose blocks): SchroedingerUniforms + BasisVectors, camera
 * uniforms + bind groups, constants, `hsl2rgb`, `intersectSphere`, the `wdwZetaLib`
 * block (SDF prims / lighting / colour helpers + LUT readers), and the
 * `mainWdwZetaSdf` block (`wzMap` / `wzNormal` / `wzAO`).
 *
 * @module rendering/webgpu/shaders/schroedinger/mainWdwZetaVolume.wgsl
 */

/**
 * Generate the WDW ⊗ ζ shared fragment main block (colour + entry point).
 *
 * @returns WGSL source for the fragment entry point.
 */
export function generateMainBlockWdwZetaVolume(): string {
  return /* wgsl */ `
// ============================================
// WDW ⊗ ζ suite — colour + fragment entry (SDF builders are in mainWdwZetaSdf)
// ============================================

// ── Per-mode lit-surface albedo (matId < 10). Folds in the color algorithm. ──
fn wzAlbedo(mode: i32, p: vec3f, n: vec3f, t: f32, matId: f32) -> vec3f {
  let algo = schroedinger.colorAlgorithm;
  // a generic scalar for the density ramps
  let s = clamp(0.5 + 0.5 * n.y, 0.0, 1.0);
  // Shared ramps + 4 shared measure algorithms + 9 lit mode-specific algorithms.
  let pre = wzColorAlgo(algo, p, matId, s);
  if (pre.w > 0.5) { return pre.xyz; }
  // MIXED / PHASE — per-mode native coloring
  if (mode == 0) {
    // 4D vortex-pillar columns: a per-zero hue baked into matId (2.0 + i·0.1).
    if (matId > 1.5) {
      let idx = (matId - 2.0) * 10.0;
      return hsl2rgb(fract(0.02 + idx * 0.13), 0.85, 0.54);
    }
    let band = wzHeadB().x;
    let u = mix(0.5 - band, 0.5 + band, clamp(0.5 * (p.x + 1.0), 0.0, 1.0));
    let v = clamp((p.z + 1.3) / 2.6, 0.0, 1.0);
    let f = wzFieldAt(u, v);
    if (wzHeadB().z > 0.5) {
      // Domain coloring of the REAL ξ: hue = arg ξ (winds ±2π around each zero —
      // the signature of a complex zero), moderate lightness so the phase reads.
      return hsl2rgb(fract(f.y / WZ_TAU + 0.5), 0.85, 0.16 + 0.24 * f.x);
    }
    // Height-luminance ramp (a cool indigo→cyan nebula by |ξ|) when phase-portrait off.
    return wzNebula(0.2 + 0.7 * f.x);
  }
  if (mode == 1) {
    // Hyperbolic modular mandala on the Poincaré disk: cells compress toward the
    // boundary (hyperbolic metric), coloured by the Möbius value μ(n) so the
    // squarefree μ = 0 cells open a dark lacework. Bright cell edges trace the
    // SL(2,ℤ) tessellation.
    let curv = wzHeadA().w;          // hyperbolic curvature → ring density
    let cutoff = max(8.0, wzHeadA().y); // Möbius cutoff N → lacework fineness
    let r = clamp(length(p.xz), 0.0, 0.985);
    let hb = 0.5 * log((1.0 + r) / (1.0 - r)); // hyperbolic radius (→∞ at rim)
    let th = atan2(p.z, p.x);
    let ringF = hb * (1.5 + 2.5 * curv);
    let ri = min(floor(ringF), 5.0);
    let secCount = 6.0 * pow(2.0, ri); // cells double each hyperbolic ring
    let sf = th / WZ_TAU * secCount + 0.5;
    let idx = (i32(ri) * 17 + i32(floor(sf))) % i32(cutoff);
    let mu = wzAux(abs(idx) % 48).x; // μ(n) ∈ {−1,0,+1}
    let voids = abs(mu);             // 0 → dark squarefree void
    let edge = smoothstep(0.0, 0.14, min(fract(ringF), 1.0 - fract(ringF))) *
               smoothstep(0.0, 0.14, min(fract(sf), 1.0 - fract(sf)));
    // no-boundary amplitude tinted by the real Möbius partial sum M (header B.y)
    let M = clamp(wzHeadB().y, -1.0, 1.0);
    let base = mix(vec3f(0.16, 0.24, 0.55), wzViridis(0.3 + 0.5 * fract(hb * 0.5)), 0.45 + 0.3 * M);
    let cell = base * (0.14 + 0.86 * voids);
    return cell * (0.5 + 0.5 * edge) + vec3f(0.5, 0.7, 1.0) * edge * 0.35;
  }
  if (mode == 2) { return vec3f(0.20, 0.24, 0.32); } // Planck floor steel
  if (mode == 3) {
    // Airy fringes from the REAL WKB action S = ∫√U (baked field .y); forbidden
    // side U<0 (.z<0) is dark; the caustic ridge U≈0 (.w) blazes white.
    let uu = clamp(p.x * 0.5 + 0.5, 0.0, 1.0);
    let vv = clamp(p.z / 6.0 + 0.5, 0.0, 1.0);
    let f = wzFieldAt(uu, vv);
    if (f.z < 0.0) { return vec3f(0.10, 0.07, 0.20); }
    let k = wzHeadA().z;
    let fringe = 0.5 + 0.5 * cos(k * f.y * 2.2);
    var col = mix(hsl2rgb(fract(0.62 + 0.34 * fringe), 0.82, 0.55), vec3f(1.0, 0.95, 0.8), f.w);
    // Free-scalar-field vacuum foam: Σ_{k∈primes} cos(k·a)/√(k²+m²) on the allowed lens.
    let vg = wzHeadB().y;
    if (vg > 0.001) {
      let mm = wzHeadA().x;
      var primes = array<f32, 6>(2.0, 3.0, 5.0, 7.0, 11.0, 13.0);
      var vac = 0.0;
      for (var ki = 0; ki < 6; ki++) {
        let kk = primes[ki];
        vac += cos(kk * (p.x * 2.4 + p.z * 0.6)) / sqrt(kk * kk + mm * mm);
      }
      let foam = 0.5 + 0.5 * sin(vac * 7.0);
      col = mix(col, col * 1.3 + vec3f(0.12, 0.16, 0.22), foam * vg);
    }
    return col;
  }
  if (mode == 6) {
    // warm expanding branch / cool contracting branch
    let warm = matId > 6.2;
    let tint = wzHeadA().z;
    return select(mix(vec3f(0.3, 0.45, 0.7), vec3f(0.2, 0.3, 0.6), tint),
                  mix(vec3f(0.7, 0.4, 0.25), vec3f(0.7, 0.3, 0.2), tint), warm);
  }
  if (mode == 7) {
    // hyperbolic shell + spiral geodesic stripes (the length spectrum)
    let th = atan2(p.z, p.x);
    let nb = wzHeadB().x;        // geodesic count actually written
    let wg = wzHeadB().y;        // geodesic winding gain
    let op = wzHeadA().z;        // surface opacity → shell brightness
    let stripe = 0.5 + 0.5 * cos(th * 3.0 + p.y * 9.0 * wg * (1.0 + 0.1 * nb));
    let glow = smoothstep(0.78, 0.99, stripe);
    let shell = mix(vec3f(0.05, 0.07, 0.10), vec3f(0.18, 0.24, 0.32), op);
    return mix(shell, wzViridis(0.4 + 0.5 * stripe), glow);
  }
  if (mode == 8) {
    let radial = clamp(length(p) * 0.9, 0.0, 1.0);
    return wzGold(0.3 + 0.6 * radial) * 0.8;
  }
  if (mode == 5) {
    // purity rings coloured by cohomological weight (matId = 5.0 + w·0.01)
    let w = (matId - 5.0) * 100.0;
    let baseCol = wzViridis(0.12 + 0.2 * w);
    // ζ-zero-density tint: fold a Riemann ordinate into the ring's colour.
    let zt = wzHeadB().y;
    let zz = fract(wzZero(i32(w) * 3) * 0.08);
    return mix(baseCol, wzThermal(0.3 + 0.5 * zz), zt * 0.6);
  }
  if (mode == 9) {
    return wzGold(clamp(0.5 + 0.5 * n.y, 0.0, 1.0));
  }
  if (mode == 10) {
    // Cyclotomic spire: prime-order rings (Spec ℤ points) blaze gold; composite
    // rings take a cool tint by the primitive-root density φ(n)/n (aux.z).
    let N = max(2.0, wzHeadA().x);
    let ni = clamp(round(clamp((p.y + 1.0) / 2.0, 0.0, 1.0) * (N - 1.0)), 0.0, N - 1.0);
    let aux = wzAux(i32(ni)); // (φ(n), isPrime, φ(n)/n, n)
    if (aux.y > 0.5) {
      return mix(vec3f(0.78, 0.6, 0.32), vec3f(1.0, 0.86, 0.5), wzHeadA().w); // gold prime ring
    }
    return mix(vec3f(0.16, 0.20, 0.44), wzViridis(0.32 + 0.5 * aux.z), 0.55);
  }
  return vec3f(0.5);
}

// ── Emissive color for emitter matIds (>= 10) + bright-accent modes. ──
fn wzEmitColor(matId: f32, p: vec3f, mode: i32, t: f32) -> vec3f {
  if (matId >= WZ_EMIT_PHASE - 0.5 && matId < WZ_EMIT_PHASE + 0.5) {
    let th = atan2(p.z, p.x);
    return hsl2rgb(fract(th / WZ_TAU + 1.0), 0.85, 0.58);
  }
  if (matId >= WZ_EMIT_GHOST - 0.5) { return vec3f(0.6, 0.28, 0.92); }  // violet ghost
  if (matId >= WZ_EMIT_GOLD - 0.5) { return vec3f(0.85, 0.66, 0.34); }  // gold (sub-unity → glows, not clips)
  if (matId >= WZ_EMIT_COOL - 0.5) { return vec3f(0.36, 0.58, 0.86); }  // cool ring
  // WZ_EMIT_WARM
  if (mode == 4) {
    // Prime quanta: low primes (inner radius) blaze hottest — the Hagedorn
    // ignition. Brightness scales with the REAL partition Z(β)=ζ(β) (header B),
    // which diverges as β → 1⁺.
    let rr = length(p);
    let hot = clamp(1.0 - (rr - 0.26) / 0.42, 0.0, 1.0);
    if (schroedinger.colorAlgorithm == 37) {
      // Bose Occupation Heat (mode-specific): inner low-prime nodes (high n_p)
      // blaze as a white-hot condensate; outer high-prime nodes (suppressed
      // occupation) fade to deep blue. Radius is the faithful ln(p) proxy.
      return mix(vec3f(0.10, 0.20, 0.62), vec3f(1.0, 0.96, 0.86), pow(hot, 0.7)) * (0.6 + 0.6 * hot);
    }
    let Z = wzHeadB().x; // truncated ζ(β)
    let ignite = clamp(0.35 + Z * 0.085, 0.45, 1.1);
    // lower thermal input + sub-unity scale keeps the hot inner primes a saturated
    // orange/red rather than clipping to a white core (the bloom still glows).
    return wzThermal(0.24 + 0.4 * hot) * ignite * 0.6;
  }
  return vec3f(0.85, 0.55, 0.3);
}

// Additive emissive for lit surfaces (glowing ζ structure painted on the form).
fn wzSurfaceEmissive(mode: i32, p: vec3f, t: f32) -> vec3f {
  if (mode == 0) {
    // A warm-gold band blazes where the REAL |ξ| → 0 on the seam (σ=½, x≈0): an
    // actual non-trivial zero. Off-seam dips (the injected ghost quartet) glow
    // red — a zero where RH says none can be.
    let band = wzHeadB().x;
    let u = mix(0.5 - band, 0.5 + band, clamp(0.5 * (p.x + 1.0), 0.0, 1.0));
    let v = clamp((p.z + 1.3) / 2.6, 0.0, 1.0);
    let f = wzFieldAt(u, v);
    let isZero = smoothstep(0.10, 0.0, f.x); // |ξ| ≈ 0 (a genuine zero)
    let onSeam = exp(-p.x * p.x * 16.0);
    let offSeam = 1.0 - onSeam;
    var e = vec3f(1.0, 0.85, 0.5) * isZero * onSeam * 0.6
          + vec3f(0.95, 0.12, 0.18) * isZero * offSeam * 0.9;
    // TDSE Talbot carpet (|ψ|² baked in field .z): cyan→violet revival fringes
    // climbing the strip, gated by the carpet gain (header B.y).
    let carpet = f.z;
    e += mix(vec3f(0.2, 0.5, 0.95), vec3f(0.78, 0.36, 0.96), carpet)
       * smoothstep(0.45, 0.96, carpet) * wzHeadB().y * 0.85;
    return e;
  }
  if (mode == 9) {
    // Ghost Sector: luminous iso-positivity contour rings on the golden bowl.
    let r = length(p.xz);
    let c = abs(fract(r * 5.0 - t * 0.05) - 0.5) * 2.0;
    return vec3f(1.0, 0.8, 0.4) * smoothstep(0.85, 1.0, c) * (0.1 + 0.7 * wzHeadB().z);
  }
  if (mode == 2) {
    // Forced Cell: a glowing Planck-cell grid on the floor + wall-top rims.
    let dens = max(2.0, wzHeadA().y);
    let wh = wzHeadB().x;
    let floorY = -0.85;
    let f = dens * 0.5;
    if (p.y < floorY + 0.05) {
      let g = abs(fract(p.x * f) - 0.5) * abs(fract(p.z * f) - 0.5);
      return vec3f(0.3, 0.55, 0.8) * smoothstep(0.18, 0.25, g) * 0.5;
    }
    // luminous top rim of the cell walls
    if (wh > 0.001 && p.y > floorY + wh - 0.07) {
      return vec3f(0.35, 0.62, 0.92) * 0.55;
    }
  }
  return vec3f(0.0);
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  // Ray in model space.
  let roM = camera.cameraPositionModel;
  let worldRayDir = normalize(input.vPosition - camera.cameraPosition);
  let rdM = normalize((camera.inverseModelMatrix * vec4f(worldRayDir, 0.0)).xyz);

  // Rotate the ray into the animated N-D slice frame: the rotation-plane
  // animation (and the turntable) live in the orthonormal basis triad
  // B = [basisX basisY basisZ], so sampling/tracing in q = B·p + o makes the
  // whole sphere-traced form turn with the rotation panel — exactly as the
  // riemannZeta/hilbertPolya analytic modes do. (For 3D the origin offset is 0
  // and B is a pure rotation, so distances — hence sphere tracing — are preserved.)
  let axRow = vec3f(getBasisComponent(basis.basisX, 0), getBasisComponent(basis.basisY, 0), getBasisComponent(basis.basisZ, 0));
  let ayRow = vec3f(getBasisComponent(basis.basisX, 1), getBasisComponent(basis.basisY, 1), getBasisComponent(basis.basisZ, 1));
  let azRow = vec3f(getBasisComponent(basis.basisX, 2), getBasisComponent(basis.basisY, 2), getBasisComponent(basis.basisZ, 2));
  let o3 = vec3f(getBasisComponent(basis.origin, 0), getBasisComponent(basis.origin, 1), getBasisComponent(basis.origin, 2));
  let ro = vec3f(dot(axRow, roM), dot(ayRow, roM), dot(azRow, roM)) + o3;
  let rd3u = vec3f(dot(axRow, rdM), dot(ayRow, rdM), dot(azRow, rdM));
  let len3 = max(length(rd3u), 1e-5);
  let rd = rd3u / len3;

  // 4th-axis (W) projection — row 3 of the N-D slice basis. At dimension 3 the
  // basisX/Y/Z 4th components are identically 0, so roW = rdW = 0 and the visible
  // slice is the w = 0 hyperplane: every w-gated 4D term vanishes and the render
  // is byte-identical to the original 3D form. At dimension ≥ 4, rotating into an
  // XW / YW / ZW plane lifts these components, sweeping the marched slice through
  // the 4th dimension to reveal the locked 4D constraint object. rdW is divided
  // by len3 so w advances per unit of 3D arc length (the march parameter).
  let awRow = vec3f(getBasisComponent(basis.basisX, 3), getBasisComponent(basis.basisY, 3), getBasisComponent(basis.basisZ, 3));
  let roW = dot(awRow, roM) + getBasisComponent(basis.origin, 3);
  let rdW = dot(awRow, rdM) / len3;

  let boundR = schroedinger.boundingRadius;
  let tS = intersectSphere(ro, rd, boundR);
  if (tS.y < 0.0) { discard; }

  let mode = i32(round(schroedinger.wzModeId));
  let tt = schroedinger.time;
  let jitter = wzHash21(input.clipPosition.xy);

  // Sphere-trace the constraint surface.
  var tCur = max(0.0, tS.x) + jitter * 0.01;
  var hit = false;
  var hp = vec3f(0.0);
  var matId = 0.0;
  for (var i = 0; i < WZ_STEPS; i++) {
    let p = ro + rd * tCur;
    let w = roW + rdW * tCur;
    let m = wzMap(p, w, mode, tt);
    if (m.x < 0.0009 * tCur + 0.0006) {
      hit = true;
      hp = p;
      matId = m.y;
      break;
    }
    tCur += max(m.x, 0.004);
    if (tCur > tS.y) { break; }
  }

  if (!hit) { discard; }

  // 4th-axis coordinate at the hit point (for the normal/AO of the 4D slice).
  let wHit = roW + rdW * tCur;

  // Shared Emission & Rim control drives emissive gain; density gain lifts it.
  let emitGain = (0.7 + 1.7 * schroedinger.emissionIntensity) * sqrt(max(0.3, schroedinger.densityGain));

  var col: vec3f;
  if (matId >= 9.99) {
    // Pure emissive structure (ζ accents): catches the bloom pass.
    col = wzEmitColor(matId, hp, mode, tt) * emitGain;
  } else {
    let n = wzNormal(hp, wHit, mode, tt);
    let ao = wzAO(hp, n, wHit, mode, tt);
    let albedo = wzAlbedo(mode, hp, n, tt, matId);
    // Flat reliefs (seam ξ, modular dome, Airy fold, positivity bowl) are matte —
    // a glossy specular would flare a white sheet across the aligned surface. The
    // 𝔽₁ spire (mode 10) is matte too: its thin curved ring-tubes are grazing
    // almost everywhere, so a glossy spec would blow every ring to white.
    let matte = mode == 0 || mode == 1 || mode == 3 || mode == 9 || mode == 10;
    let rough = select(0.45, 0.9, matte);
    col = wzShade(hp, n, rd, albedo, ao, rough);
    // glowing ζ structure painted on the lit form (seam-zero bands, contours…)
    col += wzSurfaceEmissive(mode, hp, tt) * (0.6 + schroedinger.emissionIntensity);
    // gentle emissive lift so lit surfaces still feed the bloom at high emission
    col *= 0.7 + 0.6 * schroedinger.emissionIntensity;
  }

  // distance fog toward the far sphere for depth.
  let depth = clamp((tCur - max(0.0, tS.x)) / (2.0 * boundR), 0.0, 1.0);
  col *= 1.0 - 0.25 * depth;
  // mild HDR lift on the brightest pixels for the bloom pass.
  let lum = max(col.r, max(col.g, col.b));
  col *= 1.0 + 0.25 * lum * lum;

  return vec4f(col, 1.0);
}
`
}
