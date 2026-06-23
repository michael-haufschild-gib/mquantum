/**
 * WGSL live main shader for the WDW ⊗ ζ visualization suite.
 *
 * One dedicated main block shared by all ten suite modes (branched on the
 * `wzModeId` uniform — a uniform constant for the whole draw, so the branch is
 * coherent with no warp divergence). Each mode is a genuinely different **lit,
 * sphere-traced 3D form** synthesized live from the compact ζ-LUT
 * (`@group(2) @binding(2) wdwZetaLut`): a constraint surface is ray-marched by
 * sphere tracing, shaded with a real lighting model (lambert key + fill +
 * hemisphere ambient + Fresnel rim + Blinn specular + SDF ambient occlusion),
 * and overlaid with emissive ζ structure (zero-pins, purity rings, prime
 * constellations, spiral geodesics, Airy fringes). There is no baked image —
 * the heavy ζ math lives in the tiny LUT; everything 3D is live.
 *
 * Render contract: emission gain is the shared `emissionIntensity`
 * (appearanceStore.faceEmission, Advanced ▸ "Emission & Rim"); rotation is the
 * shared turntable (the ray is built in model space via `inverseModelMatrix`);
 * relational-time animation reads `schroedinger.time`.
 *
 * Requires (sibling compose blocks): SchroedingerUniforms + BasisVectors,
 * camera uniforms + bind groups, constants, `hsl2rgb`, `intersectSphere`, and
 * the `wdwZetaLib` block (SDF/lighting/color helpers + LUT readers).
 *
 * @module rendering/webgpu/shaders/schroedinger/mainWdwZetaVolume.wgsl
 */

/**
 * Generate the WDW ⊗ ζ shared live main block.
 *
 * @returns WGSL source for the fragment entry point.
 */
export function generateMainBlockWdwZetaVolume(): string {
  return /* wgsl */ `
// ============================================
// WDW ⊗ ζ suite — live, lit, per-mode sphere-traced main
// ============================================

const WZ_STEPS: i32 = 128;
// Scale mapping a ζ-zero ordinate tₙ (~14..150) into model-space length.
const WZ_TSCALE: f32 = 0.012;

// matId convention: < 10 = lit surface (per-mode shading); >= 10 = emissive.
const WZ_EMIT_WARM: f32 = 10.0;
const WZ_EMIT_COOL: f32 = 11.0;
const WZ_EMIT_GOLD: f32 = 12.0;
const WZ_EMIT_GHOST: f32 = 13.0;
const WZ_EMIT_PHASE: f32 = 14.0;

// Heightfield SDF helper: signed distance to the surface y = h over the xz-plane,
// Lipschitz-damped so sphere tracing never oversteps the relief.
fn wzHeight(py: f32, h: f32) -> f32 { return (py - h) * 0.6; }

// ── Mode 0: Constraint Seam — ξ(s)=ξ(1−s) relief, mirror-folded about x=0,
//    notched to the seam plane at each ζ-zero ordinate. ──
fn wzMap0(p: vec3f, t: f32) -> vec2f {
  let H = wzHeadA();
  // Ray-march the REAL completed ξ(σ+it): x → σ (seam at σ=½, x=0), z → t ∈ [0,T].
  // Height = normalized log|ξ| (baked by cxi), so the surface dips to the seam
  // exactly where ξ has a zero — and the σ↔1−σ mirror is exact because ξ(s)=ξ(1−s)
  // is what was computed, not imposed. The σ half-band (header B.x) opens the
  // window: narrow = a tight seam canyon, wide = the explosive off-line |ξ| walls.
  let band = wzHeadB().x;
  let u = mix(0.5 - band, 0.5 + band, clamp(0.5 * (p.x + 1.0), 0.0, 1.0));
  let v = clamp((p.z + 1.3) / 2.6, 0.0, 1.0);
  let f = wzFieldAt(u, v);
  let h = H.x * (0.72 * f.x) - 0.34;
  return vec2f(wzHeight(p.y, h), 0.0);
}

// ── Mode 1: Möbius No-Boundary — hyperbolic dome (Poincaré disk lifted). ──
fn wzMap1(p: vec3f, t: f32) -> vec2f {
  let H = wzHeadA();
  let r = length(p.xz);
  // WDW boundary condition (header B.x): Hartle–Hawking no-boundary cap √(1−r²)
  // morphed to the Vilenkin tunneling spike e^{−6r²} (amplitude piled at r=0).
  let tun = wzHeadB().x;
  let cap = sqrt(max(1.0 - r * r, 0.0));
  let spike = 1.7 * exp(-r * r * 6.0);
  let dome = H.z * mix(cap, spike, tun) - 0.35;
  var d = wzHeight(p.y, dome);
  d = max(d, r - 1.02); // clip to the unit disk
  return vec2f(d, 1.0);
}

// ── Mode 2: Forced Cell — Planck-cell floor + stacked xp=Eₙ hyperbola tubes. ──
fn wzMap2(p: vec3f, t: f32) -> vec2f {
  let H = wzHeadA();
  let levels = i32(round(H.x));
  let dens = max(2.0, H.y);  // Planck-cell fineness
  let ex = max(0.4, H.z);    // (x,p) window extent → hyperbola spread
  let sq = H.w;              // TDSE squeeze r
  let wh = wzHeadB().x;      // 3D cell-wall height
  let floorY = -0.85;
  var d = wzHeight(p.y, floorY);
  var mat = 2.0;
  // 3D Planck-cell wall lattice — the forced 2πℏ tiling raised into chambers.
  // Cheap grid-of-walls SDF: distance to the nearest x/z wall plane, clipped to
  // the [floorY, floorY+wh] vertical band (a box intersection, no padded sdBox).
  if (wh > 0.001) {
    let T = 2.0 / dens;
    let xq = abs(p.x - T * round(p.x / T)) - 0.02;
    let zq = abs(p.z - T * round(p.z / T)) - 0.02;
    let inY = abs(p.y - (floorY + wh * 0.5)) - wh * 0.5;
    let walls = max(min(xq, zq), inY);
    if (walls < d) { d = walls; mat = 2.0; }
  }
  // Symplectic squeeze (x,p)→(x·e^{−r}, p·e^{r}): xp invariant, cell deformed.
  let q = p.x * exp(-sq);
  let pp = p.z * exp(sq);
  let rr = max(sqrt(q * q + pp * pp), 0.18);
  // glowing hyperbola arcs q·p = E_n (ζ ordinates) at stacked heights.
  for (var i = 0; i < 16; i++) {
    if (i >= levels) { break; }
    let En = wzZero(i);
    let yn = -0.7 + En * WZ_TSCALE * 0.9;
    if (yn > 1.15) { break; }
    let c = (0.12 + f32(i) * 0.045) * ex;
    let d2 = abs(q * pp - c) / rr;
    let tube = length(vec2f(d2, p.y - yn)) - 0.02;
    if (tube < d) { d = tube; mat = WZ_EMIT_GOLD; }
  }
  return vec2f(d, mat);
}

// ── Mode 3: Turning Surface — Airy caustic relief of the real U(a,φ). ──
fn wzMap3(p: vec3f, t: f32) -> vec2f {
  // Real minisuperspace relief: lift = normalized √(max U,0) baked from the
  // actual potential U(a,φ); the forbidden side U<0 sinks flat.
  let u = clamp(p.x * 0.5 + 0.5, 0.0, 1.0); // a ∈ [0, A_MAX]
  let v = clamp(p.z / 6.0 + 0.5, 0.0, 1.0); // φ ∈ [−PHI_MAX, PHI_MAX]
  let f = wzFieldAt(u, v);
  let lift = select(-0.15, f.x * 0.95 - 0.3, f.z >= 0.0);
  return vec2f(wzHeight(p.y, lift), 3.0);
}

// ── Mode 4: Third-Quantized Multiverse — prime constellation, Hagedorn glow. ──
fn wzMap4(p: vec3f, t: f32) -> vec2f {
  let H = wzHeadA();
  let count = i32(round(H.y));
  let lattice = i32(round(H.w)); // 0 spiral, 1 AdS Poincaré ball, 2 momentum shells
  let pair = H.z > 0.5;
  let linkG = wzHeadB().y;
  let occS = wzHeadB().z;
  let cf = max(1.0, f32(count));
  var d = 1e9;
  var mat = WZ_EMIT_WARM;
  for (var i = 0; i < 16; i++) {
    if (i >= count) { break; }
    let aux = wzAux(i);
    let pr = aux.x;
    let occ = aux.y;
    let lnp = aux.z; // ln p
    // Fibonacci-sphere direction (golden angle) shared by the AdS / k-shell layouts.
    let cph = 1.0 - 2.0 * (f32(i) + 0.5) / cf; // cos(polar)
    let sph = sqrt(max(0.0, 1.0 - cph * cph));
    let az = 2.39996323 * f32(i);
    let dir = vec3f(sph * cos(az), cph, sph * sin(az));
    var pos: vec3f;
    if (lattice == 1) {
      // AdS Poincaré ball: heavy primes crowd the boundary by hyperbolic radius.
      pos = dir * (tanh(0.5 * lnp) * 0.95);
    } else if (lattice == 2) {
      // Free-scalar-field momentum shells: |k| ∝ ln p, quantized into spheres.
      pos = dir * clamp(0.28 + 0.16 * floor(lnp), 0.2, 1.1);
    } else {
      // log-spiral lattice keyed by the prime
      let ang = pr * 1.07;
      let rad = 0.28 + 0.16 * lnp;
      pos = vec3f(rad * cos(ang), (lnp - 1.6) * 0.34, rad * sin(ang));
    }
    let rr = (0.04 + 0.16 * clamp(occ, 0.0, 2.0)) * occS;
    let pulse = 1.0 + 0.12 * sin(t * 2.0 + pr);
    let ds = sdSphere(p - pos, rr * pulse);
    if (ds < d) { d = ds; mat = WZ_EMIT_WARM; }
    // universe–antiuniverse link tube to the antipode −p (third-quantized pairing).
    if (pair && linkG > 0.001) {
      let link = sdCapsule(p, pos, -pos, 0.005 + 0.012 * linkG);
      if (link < d) { d = link; mat = WZ_EMIT_COOL; }
    }
  }
  return vec2f(d, mat);
}

// ── Mode 5: Frobenius Wheel — nested purity rings |α|=q^{w/2}, lifted by weight. ──
fn wzMap5(p: vec3f, t: f32) -> vec2f {
  let H = wzHeadA();
  let q = H.x;
  let W = i32(round(H.y));
  let spindle = wzHeadB().x > 0.5;
  let spread = H.w;
  let Wf = max(f32(W), 1.0);
  var d = 1e9;
  var mat = WZ_EMIT_PHASE;
  for (var w = 0; w < 6; w++) {
    if (w > W) { break; }
    let R = pow(q, f32(w) * 0.5) * 0.42; // |α| = q^{w/2}, the forced purity radius
    if (R > 1.4) { break; }
    // ring mode = flat gyroscope; spindle mode = tight vertical stack.
    let yw = select((f32(w) - Wf * 0.5) * 0.34, -0.55 + f32(w) * (1.1 / Wf), spindle);
    let dr = sdRing(p, R, yw, select(0.03, 0.045, spindle));
    if (dr < d) { d = dr; mat = 5.0 + f32(w) * 0.01; }
  }
  // central spindle rod (only in spindle form)
  if (spindle) {
    let rod = sdCapsule(p, vec3f(0.0, -0.6, 0.0), vec3f(0.0, 0.62, 0.0), 0.02);
    if (rod < d) { d = rod; mat = WZ_EMIT_GOLD; }
  }
  // genus-g eigenvalue dots pinned to the H¹ ring, jittered by Frobenius spread.
  let g = i32(round(H.z));
  let R1 = sqrt(q) * 0.42;
  let y1 = select((1.0 - Wf * 0.5) * 0.34, -0.55 + 1.1 / Wf, spindle);
  for (var j = 0; j < 8; j++) {
    if (j >= 2 * g) { break; }
    let th = (f32(j) + 0.5) * WZ_PI / max(f32(g), 1.0) + (wzHash13(f32(j) + 1.0) - 0.5) * spread;
    let dot = sdSphere(p - vec3f(R1 * cos(th), y1, R1 * sin(th)), 0.05);
    if (dot < d) { d = dot; mat = WZ_EMIT_GOLD; }
  }
  return vec2f(d, mat);
}

// ── Mode 6: DeWitt Null Cone — double null cone + ζ-zero latitude rings. ──
fn wzMap6(p: vec3f, t: f32) -> vec2f {
  let H = wzHeadA();
  let k = H.x;
  let fan = i32(round(wzHeadB().x));
  let warp = wzHeadB().y;
  let rxz = length(p.xz);
  // nested light-cone fan: WDW branches of growing aperture (fan == 1 → original).
  var d = 1e9;
  for (var c = 0; c < 6; c++) {
    if (c >= fan) { break; }
    let kc = k * (0.6 + 0.4 * f32(c + 1));
    let dc = abs(rxz - kc * abs(p.y)) - 0.02;
    if (dc < d) { d = dc; }
  }
  var mat = select(6.0, 6.5, p.y >= 0.0); // lit cool/warm branches
  // AdS/BTZ throat horizon disc at the apex (a capped cylinder of radius H.w).
  let hr = H.w * 0.55;
  if (hr > 0.001) {
    let dxz = rxz - hr;
    let dy = abs(p.y) - 0.03;
    let disc = length(max(vec2f(dxz, dy), vec2f(0.0))) + min(max(dxz, dy), 0.0);
    if (disc < d) { d = disc; mat = WZ_EMIT_PHASE; } // shimmering horizon ring
  }
  // ζ-zero latitude rings, optionally warped into standing helices.
  let rings = i32(round(H.y));
  let th = atan2(p.z, p.x);
  for (var i = 0; i < 14; i++) {
    if (i >= rings) { break; }
    let yn = -1.2 + wzZero(i) * WZ_TSCALE * 1.05;
    if (yn > 1.3) { break; }
    let R = k * abs(yn);
    let yW = yn + warp * 0.12 * sin(th * 3.0 + yn * 4.0);
    let dr = sdRing(p, R, yW, 0.018);
    if (dr < d) { d = dr; mat = select(WZ_EMIT_COOL, WZ_EMIT_WARM, yn >= 0.0); }
  }
  return vec2f(d, mat);
}

// Surface of revolution r = R(y) for the three hyperbolic surfaces:
//   0 = pseudosphere (sech), 1 = AdS catenoid throat (cosh), 2 = pair-of-pants neck.
fn wzFunnelR(y: f32, mode: i32) -> f32 {
  if (mode == 1) { return 0.33 * cosh(1.25 * y); }   // AdS catenoid throat
  if (mode == 2) { return 0.22 + 0.7 * y * y; }       // pair-of-pants neck (hyperboloid)
  return 1.0 / cosh(1.7 * (y + 0.55)) * 1.15;         // pseudosphere funnel
}

// ── Mode 7: Selberg Length Spectrum — hyperbolic surface + spiral geodesics. ──
fn wzMap7(p: vec3f, t: f32) -> vec2f {
  let surf = i32(round(wzHeadA().w));
  let r = length(p.xz);
  let d = (r - wzFunnelR(p.y, surf)) * 0.55;
  return vec2f(d, 7.0);
}

// ── Mode 8: Adelic Wavefunction — Bruhat–Tits IFS forest + ψ_∞ core. ──
fn wzMap8(p: vec3f, t: f32) -> vec2f {
  let H = wzHeadA();
  let depth = i32(round(H.x));   // tree depth → IFS iterations
  let pcount = max(1.0, H.y);    // prime places → fold orientation variety
  let spread = H.z;              // branch spread → fold offset
  let fold = max(1.4, H.w);      // fold exponent (the p-adic branching ratio)
  let arc = wzHeadB().x;         // Archimedean ψ_∞ core
  var z = p;
  var scale = 1.0;
  // fold offset widens with branch spread (the p-adic cone aperture).
  let off = vec3f(0.9, 0.9, 0.4) * (0.55 + 0.65 * spread);
  for (var i = 0; i < 6; i++) {
    if (i >= depth) { break; }
    z = abs(z);
    if (z.x < z.y) { let tmp = z.x; z.x = z.y; z.y = tmp; }
    if (z.x < z.z) { let tmp = z.x; z.x = z.z; z.z = tmp; }
    if (z.y < z.z) { let tmp = z.y; z.y = z.z; z.z = tmp; }
    // a per-iteration twist fans distinct prime-place trees apart.
    let zr = wzRot(0.15 * pcount) * z.xz;
    z = vec3f(zr.x, z.y, zr.y);
    z = z * fold - off * (fold - 1.0);
    scale *= fold;
  }
  var d = (length(z) - 0.6) / scale;
  var mat = 8.0;
  // Archimedean (real-place) factor ψ_∞ = e^{−πx²}: a Gaussian core at the centre.
  if (arc > 0.001) {
    let core = sdSphere(p, 0.09 + 0.17 * arc);
    if (core < d) { d = core; mat = WZ_EMIT_GOLD; }
  }
  return vec2f(d, mat);
}

// ── Mode 9: Ghost Sector — Li-coefficient positivity bowl (RH ⟺ λ_n ≥ 0). ──
fn wzMap9(p: vec3f, t: f32) -> vec2f {
  // Real Li/Keiper positivity landscape: radius selects the index n, height is
  // modulated by the actual coefficient λ_n. λ_n ≥ 0 ∀n ⟺ RH (Li's criterion),
  // so under RH the bowl is smooth gold; an off-line zero drives some λ_n < 0,
  // carving a literal ghost well — the κ₋ > 0 the constraint forbids.
  let H = wzHeadA();
  let curve = wzHeadB().y;  // bowl curvature
  let kahler = wzHeadB().w; // coherent-state vacuum-mound blend
  let r = length(p.xz);
  let rn = clamp(r * 0.85, 0.0, 0.999);
  let ni = i32(floor(rn * H.x));
  let lam = wzAux(ni).x; // normalized λ_n ∈ [−1,1]
  var h = curve * r * r - 0.55 - 0.12 * lam;
  // coherent-state vacuum mound (Gaussian e^{−r²}, the |α=0⟩ ground state) at the floor.
  h += kahler * 0.4 * exp(-r * r * 4.0);
  var mat = 9.0;
  if (lam < -0.015) {
    h -= 0.4 * lam; // negative λ bumps a well anomaly (the κ₋ ghost)
    mat = WZ_EMIT_GHOST;
  }
  return vec2f(wzHeight(p.y, h), mat);
}

// ── Scene dispatch (uniform branch on wzModeId). ──
fn wzMap(p: vec3f, mode: i32, t: f32) -> vec2f {
  if (mode == 0) { return wzMap0(p, t); }
  if (mode == 1) { return wzMap1(p, t); }
  if (mode == 2) { return wzMap2(p, t); }
  if (mode == 3) { return wzMap3(p, t); }
  if (mode == 4) { return wzMap4(p, t); }
  if (mode == 5) { return wzMap5(p, t); }
  if (mode == 6) { return wzMap6(p, t); }
  if (mode == 7) { return wzMap7(p, t); }
  if (mode == 8) { return wzMap8(p, t); }
  if (mode == 9) { return wzMap9(p, t); }
  return wzMap10(p, t);
}

// 4-tap tetrahedron gradient (cheaper than 6-tap central differences).
fn wzNormal(p: vec3f, mode: i32, t: f32) -> vec3f {
  let e = 0.0017;
  let k0 = vec3f(1.0, -1.0, -1.0);
  let k1 = vec3f(-1.0, -1.0, 1.0);
  let k2 = vec3f(-1.0, 1.0, -1.0);
  let k3 = vec3f(1.0, 1.0, 1.0);
  return normalize(
    k0 * wzMap(p + k0 * e, mode, t).x +
    k1 * wzMap(p + k1 * e, mode, t).x +
    k2 * wzMap(p + k2 * e, mode, t).x +
    k3 * wzMap(p + k3 * e, mode, t).x
  );
}

fn wzAO(p: vec3f, n: vec3f, mode: i32, t: f32) -> f32 {
  var occ = 0.0;
  var sca = 1.0;
  for (var i = 0; i < 4; i++) {
    let h = 0.015 + 0.13 * f32(i) / 3.0;
    let d = wzMap(p + n * h, mode, t).x;
    occ += (h - d) * sca;
    sca *= 0.82;
  }
  return clamp(1.0 - 2.4 * occ, 0.0, 1.0);
}

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
    let ignite = clamp(0.35 + Z * 0.085, 0.45, 1.5);
    return wzThermal(0.35 + 0.55 * hot) * ignite;
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
  let rd = normalize(vec3f(dot(axRow, rdM), dot(ayRow, rdM), dot(azRow, rdM)));

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
    let m = wzMap(p, mode, tt);
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

  // Shared Emission & Rim control drives emissive gain; density gain lifts it.
  let emitGain = (0.7 + 1.7 * schroedinger.emissionIntensity) * sqrt(max(0.3, schroedinger.densityGain));

  var col: vec3f;
  if (matId >= 9.99) {
    // Pure emissive structure (ζ accents): catches the bloom pass.
    col = wzEmitColor(matId, hp, mode, tt) * emitGain;
  } else {
    let n = wzNormal(hp, mode, tt);
    let ao = wzAO(hp, n, mode, tt);
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
