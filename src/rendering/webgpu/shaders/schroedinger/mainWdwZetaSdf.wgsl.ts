/**
 * WGSL SDF block for the WDW ⊗ ζ visualization suite.
 *
 * The eleven per-mode signed-distance builders (`wzMap0`–`wzMap10`), the uniform
 * scene dispatch (`wzMap`), and the gradient normal / SDF ambient occlusion. Each
 * `wzMapN` synthesizes one mode's lit, sphere-traced 3D form from the compact
 * ζ-LUT, and — gated by `wzFourth()` — its bespoke WILD fourth-dimensional form.
 *
 * Split out of `mainWdwZetaVolume.wgsl.ts` (which kept the color + fragment-entry
 * half) to stay under the 600-line file budget. Composed BETWEEN the `wdwZetaLib`
 * block (whose LUT readers + SDF primitives it depends on, including `wzMap10`)
 * and the main fragment block (which calls `wzMap` / `wzNormal` / `wzAO`).
 *
 * Included only when `isWdwZetaVolume`.
 *
 * @module rendering/webgpu/shaders/schroedinger/mainWdwZetaSdf.wgsl
 */

/**
 * Generate the WDW ⊗ ζ per-mode SDF block (builders + dispatch + normal/AO).
 *
 * @returns WGSL source (no entry point — the fragment main lives in the sibling block).
 */
export function generateWdwZetaSdfBlock(): string {
  return /* wgsl */ `
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
fn wzMap0(p: vec3f, w: f32, t: f32) -> vec2f {
  let H = wzHeadA();
  // Ray-march the REAL completed ξ(σ+it): x → σ (seam at σ=½, x=0), z → t ∈ [0,T].
  // Height = normalized log|ξ| (baked by cxi), so the surface dips to the seam
  // exactly where ξ has a zero — and the σ↔1−σ mirror is exact because ξ(s)=ξ(1−s)
  // is what was computed, not imposed. The σ half-band (header B.x) opens the
  // window: narrow = a tight seam canyon, wide = the explosive off-line |ξ| walls.
  let band = wzHeadB().x;
  // 4D HYPER-SEAM. In 3D the σ-distance from the seam is |x| (the field is sampled
  // mirror-symmetrically about σ=½, since ξ(s)=ξ(1−s)). In 4D that distance is
  // promoted to length(x, w): the mirror plane becomes a mirror *axis*, and the
  // seam canyon a rotationally-symmetric well in the (σ, W) plane — the functional
  // equation forbidding not just a side but an orientation. At w=0, length(x,w)=|x|
  // and (by the relief's exact mirror symmetry) the height is byte-identical to 3D.
  let sr = length(vec2f(p.x, w));
  let u = 0.5 + band * clamp(sr, 0.0, 1.0);
  let v = clamp((p.z + 1.3) / 2.6, 0.0, 1.0);
  let f = wzFieldAt(u, v);
  var h = H.x * (0.72 * f.x) - 0.34;
  // ── WILD 4D: THE SEAM RELIEF ITSELF RISES INTO A ZERO-COLONNADE ──
  // Not added columns — the relief SURFACE is deformed. At every ζ-zero ordinate a
  // spire of the heightfield pulls up out of the seam (σ=½, sr→0), so the flat
  // strip mangles into a comb of spires along the critical line as the slice tilts
  // into the 4th dimension; the spires lean/twist with w. Gated by wzFourth() (at
  // dim 3 the relief is untouched), and they inherit the relief's own arg-ξ
  // domain-colouring — one continuous lit surface, no separate object, no white.
  let f4 = wzFourth();
  if (f4 > 0.001) {
    let tMax = max(H.y, 1.0);
    let seamG = exp(-sr * sr * 24.0);                 // concentrated on the seam σ=½
    for (var i = 0; i < 10; i++) {
      let tn = wzZero(i);
      if (tn > tMax) { break; }
      let vn = tn / tMax;                             // ordinate → relief v
      let twist = 1.0 + 0.3 * sin(w * 4.0 + f32(i));  // 4D lean/twist of the spire
      h += f4 * 0.7 * seamG * twist * exp(-(v - vn) * (v - vn) * 300.0);
    }
  }
  let d = wzHeight(p.y, h);
  return vec2f(d, 0.0);
}

// ── Mode 1: Möbius No-Boundary — hyperbolic dome (Poincaré disk lifted). ──
fn wzMap1(p: vec3f, w: f32, t: f32) -> vec2f {
  let H = wzHeadA();
  // 4D POINCARÉ BALL. In 3D the modular tessellation tiles the Poincaré DISK
  // (radius length(x,z)); in 4D the disk opens into a hyperbolic 3-BALL whose
  // radius is length(x,z,w). The no-boundary cap √(1−r²) and the unit clip become
  // the cap and boundary of the ball, so rotating the slice into W reveals the
  // SL(2,ℤ) tiling filling a solid hyperbolic ball. At w=0, length(x,z,w)=length(x,z)
  // and the slice is the equatorial disk — byte-identical to the 3D form.
  let r = length(vec3f(p.x, p.z, w));
  // WDW boundary condition (header B.x): Hartle–Hawking no-boundary cap √(1−r²)
  // morphed to the Vilenkin tunneling spike e^{−6r²} (amplitude piled at r=0).
  let tun = wzHeadB().x;
  let cap = sqrt(max(1.0 - r * r, 0.0));
  let spike = 1.7 * exp(-r * r * 6.0);
  let dome = H.z * mix(cap, spike, tun) - 0.35;
  var dDome = wzHeight(p.y, dome);
  dDome = max(dDome, r - 1.02); // clip to the unit disk
  // ── WILD 4D: THE DISK DOME INFLATES INTO THE HYPERBOLIC 3-BALL ──
  // Not nested shells — the SAME no-boundary surface, closed up. As wzFourth ramps,
  // the shallow Poincaré-disk dome inflates into the full hyperbolic 3-ball, its
  // boundary undulating as the slice tilts through the 4th dimension (the cusp
  // wandering with w). The SL(2,ℤ) μ-lacework albedo wraps the morphed surface —
  // one continuous lit ball, no separate object, no white. At dim 3 it is the dome.
  let f4 = wzFourth();
  let lat = acos(clamp(p.y / max(length(p), 1e-3), -1.0, 1.0));
  let undulate = 0.09 * sin(w * 2.4 + atan2(p.z, p.x) * 3.0 + lat * 4.0);
  let ball = length(p) - (0.9 + undulate * f4);
  let d = mix(dDome, ball, f4);
  return vec2f(d, 1.0);
}

// ── Mode 2: Forced Cell — Planck-cell floor + stacked xp=Eₙ hyperbola tubes. ──
fn wzMap2(p: vec3f, w: f32, t: f32) -> vec2f {
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
    // ── WILD 4D: PHASE-CELL BASKET-WEAVE ──
    // Quantizing 4D phase space forces a Planck 4-cell — two area quanta. The
    // conjugate branch x·p = −Eₙ crosses the +Eₙ family into an interlocking
    // basket; w twists the crossing so the two looms genuinely interleave in 4-space.
    let g4 = wzFourth();
    if (g4 > 0.001) {
      let cc = c * cos(w * 2.0);
      let d2b = abs(q * pp + cc) / rr;
      let tubeB = length(vec2f(d2b, p.y - yn)) - 0.02;
      if (tubeB < d) { d = tubeB; mat = WZ_EMIT_COOL; }
    }
  }
  return vec2f(d, mat);
}

// ── Mode 3: Turning Surface — Airy caustic relief of the real U(a,φ). ──
fn wzMap3(p: vec3f, w: f32, t: f32) -> vec2f {
  // Real minisuperspace relief: lift = normalized √(max U,0) baked from the
  // actual potential U(a,φ); the forbidden side U<0 sinks flat.
  let u = clamp(p.x * 0.5 + 0.5, 0.0, 1.0); // a ∈ [0, A_MAX]
  // 4D TWO-FIELD MINISUPERSPACE. The Wheeler–DeWitt potential enters through the
  // inflaton mass term ½m²φ², even in φ, so the baked turning surface U(a,φ) is
  // symmetric about φ=0. In 4D the single inflaton φ becomes a TWO-field
  // (φ₁, φ₂)=(z, w): the classically-allowed lens is now bounded by the radial
  // field magnitude length(z, w). At w=0 that is |z| and (by the potential's
  // evenness) the relief is byte-identical; rotating into W reveals the caustic
  // is a surface of revolution in the (φ, W) field plane.
  let phiR = length(vec2f(p.z, w));
  let v = clamp(0.5 + phiR / 6.0, 0.0, 1.0); // |φ| ∈ [0, PHI_MAX]
  let f = wzFieldAt(u, v);
  var lift = select(-0.15, f.x * 0.95 - 0.3, f.z >= 0.0);
  // ── WILD 4D: SWALLOWTAIL-PLEATED CAUSTIC ──
  // In 4D the Airy fold (a fold catastrophe) blooms into a swallowtail: the
  // classically-allowed lens crumples into self-folding luminous pleats along the
  // second field axis. Gated by wzFourth(); w drifts the pleats.
  let f4 = wzFourth();
  if (f4 > 0.001 && f.z >= 0.0) {
    lift += 0.24 * sin(p.x * 6.0 + w * 5.0) * sin(p.z * 5.0 - w * 3.0) * f4 * f.x;
  }
  return vec2f(wzHeight(p.y, lift), 3.0);
}

// ── Mode 4: Third-Quantized Multiverse — prime constellation, Hagedorn glow. ──
fn wzMap4(p: vec3f, w: f32, t: f32) -> vec2f {
  let H = wzHeadA();
  let count = i32(round(H.y));
  let lattice = i32(round(H.w)); // 0 spiral, 1 AdS Poincaré ball, 2 momentum shells
  let pair = H.z > 0.5;
  let linkG = wzHeadB().y;
  let occS = wzHeadB().z;
  let cf = max(1.0, f32(count));
  var d = 1e9;
  var mat = WZ_EMIT_WARM;
  let f4 = wzFourth(); // hoisted out of the node loop (it is a storage read)
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
    // ── WILD 4D: the constellation is MANGLED through the 4th axis ──
    // Not a second object — the SAME prime quanta, warped. Each prime gets a 4th
    // coordinate w4 = ln p (prime mass), and a single 4D rotation (driven by the
    // live W rotation w) folds that mass-axis into the visible x and z, so the
    // Fibonacci sphere of primes shears and reshapes through the 4th dimension as
    // ONE body — light primes pulled to the core, heavy primes flung outward.
    // 2 trig per node; at dim 3 (f4=0) the positions are untouched.
    if (f4 > 0.001) {
      let w4 = (lnp - 1.6) * 0.6;
      let a = f4 * (1.3 * w4 + w * 1.8);
      let c = cos(a);
      let s = sin(a);
      pos = vec3f(c * pos.x - s * w4, pos.y, c * pos.z - s * w4);
    }
    // fatter beads so the colored thermal core dominates the bloom halo instead of
    // washing to a small white dot.
    let rr = (0.07 + 0.22 * clamp(occ, 0.0, 2.0)) * occS;
    let pulse = 1.0 + 0.12 * sin(t * 2.0 + pr);
    let ds = length(p - pos) - rr * pulse;
    if (ds < d) { d = ds; mat = WZ_EMIT_WARM; }
  }
  return vec2f(d, mat);
}

// ── Mode 5: Frobenius Wheel — nested purity rings |α|=q^{w/2}, lifted by weight. ──
fn wzMap5(p: vec3f, w: f32, t: f32) -> vec2f {
  let H = wzHeadA();
  let q = H.x;
  let W = i32(round(H.y));
  let spindle = wzHeadB().x > 0.5;
  let spread = H.w;
  let Wf = max(f32(W), 1.0);
  var d = 1e9;
  var mat = WZ_EMIT_PHASE;
  let f4 = wzFourth(); // hoisted out of the weight loop
  // (loop index renamed to weight so the 4D-coordinate parameter w is unshadowed)
  for (var weight = 0; weight < 6; weight++) {
    if (weight > W) { break; }
    let R = pow(q, f32(weight) * 0.5) * 0.42; // |α| = q^{w/2}, the forced purity radius
    if (R > 1.4) { break; }
    // ring mode = flat gyroscope; spindle mode = tight vertical stack.
    let yw = select((f32(weight) - Wf * 0.5) * 0.34, -0.55 + f32(weight) * (1.1 / Wf), spindle);
    // ── WILD 4D: HOPF-LINKED PURITY RINGS ──
    // Not an added torus — the SAME forced purity circles |α| = q^{w/2}, but each
    // weight-ring's PLANE is tilted into the W axis by its own angle, so the nested
    // circles interlink into a Clifford/Hopf configuration as the slice tilts into
    // the 4th dimension. The in-plane radius stays length(x,z); the perpendicular
    // distance mixes y with w. At dim 3 (f4=0) the tilt is 0 → the original flat
    // gyroscope of rings. Lit (coloured by weight) — no emissive white-out.
    let tilt = f4 * (0.9 + f32(weight) * 0.8 + w);
    let dperp = cos(tilt) * (p.y - yw) - sin(tilt) * w;
    let dr = length(vec2f(length(p.xz) - R, dperp)) - select(0.03, 0.045, spindle);
    if (dr < d) { d = dr; mat = 5.0 + f32(weight) * 0.01; }
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
    // eigenvalue dots: tilt their height with the weight-1 ring's 4D tilt so they
    // stay pinned to the interlinking circle (a transform, not a free-floating dot).
    let tiltD = f4 * (1.7 + w);
    let dot = sdSphere(p - vec3f(R1 * cos(th), cos(tiltD) * y1 - sin(tiltD) * w, R1 * sin(th)), 0.05);
    if (dot < d) { d = dot; mat = WZ_EMIT_GOLD; }
  }
  return vec2f(d, mat);
}

// ── Mode 6: DeWitt Null Cone — double null cone + ζ-zero latitude rings. ──
fn wzMap6(p: vec3f, w: f32, t: f32) -> vec2f {
  let H = wzHeadA();
  let k = H.x;
  let fan = i32(round(wzHeadB().x));
  let warp = wzHeadB().y;
  // 4D NULL CONE. The DeWitt supermetric is indefinite (Lorentzian) — the cone is
  // the light-cone of superspace. In 3D the spatial radius is length(x,z); in 4D
  // a second spacelike axis joins it, radius length(x,z,W), so the double cone
  // becomes a genuine 4D light-cone whose 3-slices are nested hyperboloids.
  // Rotating into W sweeps the slice through the cone; at w=0 length(x,z,W)=length(x,z).
  let rxz = length(vec3f(p.x, p.z, w));
  // nested light-cone fan: WDW branches of growing aperture (fan == 1 → original).
  var d = 1e9;
  // 4D: each null cone rounds into a de Sitter HYPERBOLOID — a flaring throat with
  // a finite waist (r = √(k²y² + waist²)), the global structure of de Sitter space.
  // The fan of cones becomes a fan of nested hyperboloids: a 4D hourglass, not an
  // arrow. wzFourth() morphs cone → throat; at dim 3 it is the original sharp cone.
  let f4c = wzFourth();
  let waist2 = 0.03 * f4c;
  for (var c = 0; c < 6; c++) {
    if (c >= fan) { break; }
    let kc = k * (0.6 + 0.4 * f32(c + 1));
    let coneR = sqrt(kc * kc * p.y * p.y + waist2);
    let dc = abs(rxz - coneR) - 0.02;
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
fn wzMap7(p: vec3f, w: f32, t: f32) -> vec2f {
  let surf = i32(round(wzHeadA().w));
  // 4D HYPERBOLIC FUNNEL. The pseudosphere / AdS throat is a surface of revolution
  // r = R(y) about the y-axis. In 4D the revolution is about the (x,z,W) 3-space,
  // so r = length(x,z,W): the funnel becomes a 3-dimensional surface of revolution
  // (a hyperbolic "hyper-funnel") whose 3-slices the closed geodesics still wind.
  // At w=0, length(x,z,W)=length(x,z) — byte-identical to the 3D funnel.
  let r = length(vec3f(p.x, p.z, w));
  var d = (r - wzFunnelR(p.y, surf)) * 0.55;
  var mat = 7.0;
  // ── WILD 4D: THE FUNNEL CURLS INTO A HORN TORUS ──
  // Not an added knot — the SAME hyperbolic surface, its mouth curling back on
  // itself: as wzFourth ramps, the pseudosphere funnel morphs into a horn torus
  // (the unit-tangent-bundle 3-manifold closing up), and the closed geodesics ride
  // it as the spiral stripes already painted in wzAlbedo (mode 7). One lit surface,
  // no separate emissive tube. At dim 3 it is the open funnel.
  let f4 = wzFourth();
  if (f4 > 0.001) {
    let torus = sdTorus(p, 0.6, 0.34);
    d = mix(d, torus, f4);
  }
  return vec2f(d, mat);
}

// ── Mode 8: Adelic Wavefunction — Bruhat–Tits IFS forest + ψ_∞ core. ──
fn wzMap8(p: vec3f, w: f32, t: f32) -> vec2f {
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
    // ── WILD 4D: WOUND HYPER-FRACTAL ──
    // a per-iteration twist fans distinct prime-place trees apart; in 4D every fold
    // also picks up a fixed dim-4 winding (wzFourth) and a w-driven sweep, so the
    // Bruhat–Tits forest re-folds into a denser interpenetrating hyper-fractal —
    // the adelic product Π_p ψ_p over more places at once. At dim 3 the twist is
    // the original. The 4D winding compounds per iteration → a much richer coral.
    let zr = wzRot(0.15 * pcount + w * 0.6 + wzFourth() * 0.55) * z.xz;
    z = vec3f(zr.x, z.y, zr.y);
    z = z * fold - off * (fold - 1.0);
    scale *= fold;
  }
  var d = (length(z) - 0.6) / scale;
  var mat = 8.0;
  // Archimedean (real-place) factor ψ_∞ = e^{−πx²}: a Gaussian core at the centre,
  // a 4-ball in 4D (length(vec4(p,w)); at w=0 the 3D core, identical).
  if (arc > 0.001) {
    let core = length(vec4f(p, w)) - (0.09 + 0.17 * arc);
    if (core < d) { d = core; mat = WZ_EMIT_GOLD; }
  }
  return vec2f(d, mat);
}

// ── Mode 9: Ghost Sector — Li-coefficient positivity bowl (RH ⟺ λ_n ≥ 0). ──
fn wzMap9(p: vec3f, w: f32, t: f32) -> vec2f {
  // Real Li/Keiper positivity landscape: radius selects the index n, height is
  // modulated by the actual coefficient λ_n. λ_n ≥ 0 ∀n ⟺ RH (Li's criterion),
  // so under RH the bowl is smooth gold; an off-line zero drives some λ_n < 0,
  // carving a literal ghost well — the κ₋ > 0 the constraint forbids.
  let H = wzHeadA();
  let curve = wzHeadB().y;  // bowl curvature
  let kahler = wzHeadB().w; // coherent-state vacuum-mound blend
  // 4D POSITIVITY BOWL. The Weil quadratic form Q_W is a radial positivity
  // landscape; the index n into the Li coefficients λ_n is read off the radius.
  // In 4D the radius is length(x,z,W), so the bowl is a 4D paraboloid and the
  // λ_n positivity shells are 2-spheres: RH ⟺ Q_W ⪰ 0 read across a full 4-ball.
  // At w=0, length(x,z,W)=length(x,z) — byte-identical (the ghost well too).
  let r = length(vec3f(p.x, p.z, w));
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
  // ── WILD 4D: RIPPLED POSITIVITY HYPER-BOWL ──
  // Q_W becomes a 4D paraboloid; the Li-coefficient positivity contours stand as
  // concentric spherical ripples (a hyper-bowl rippled by the ζ spectrum), and the
  // ghost well — when an off-line zero is on — punches a violet 4D wormhole.
  let f4 = wzFourth();
  var d = wzHeight(p.y, h);
  if (f4 > 0.001) {
    let rr = length(p);
    h += 0.07 * sin(rr * 13.0 - w * 4.0) * f4;            // spherical positivity ripples
    d = wzHeight(p.y, h);
    if (wzHeadA().z > 0.5) {                              // off-line ghost on → wormhole
      let well = 0.18 - rr;                               // a hole bored through the bowl
      d = max(d, -(well + abs(w) * 0.3));
      if (well > 0.0) { mat = WZ_EMIT_GHOST; }
    }
  }
  return vec2f(d, mat);
}

// ── Scene dispatch (uniform branch on wzModeId). ──
// w is the 4th-axis (W) coordinate of the marched point: 0 at dimension 3 (the
// basis W-row is null), nonzero once a rotation tilts the visible slice into the
// 4th dimension. Each mode interprets w in its own bespoke way (a 4D fold, a
// duocylinder, a tesseract shell …); every term vanishes at w = 0 so the 3D
// render is byte-identical.
fn wzMap(p: vec3f, w: f32, mode: i32, t: f32) -> vec2f {
  if (mode == 0) { return wzMap0(p, w, t); }
  if (mode == 1) { return wzMap1(p, w, t); }
  if (mode == 2) { return wzMap2(p, w, t); }
  if (mode == 3) { return wzMap3(p, w, t); }
  if (mode == 4) { return wzMap4(p, w, t); }
  if (mode == 5) { return wzMap5(p, w, t); }
  if (mode == 6) { return wzMap6(p, w, t); }
  if (mode == 7) { return wzMap7(p, w, t); }
  if (mode == 8) { return wzMap8(p, w, t); }
  if (mode == 9) { return wzMap9(p, w, t); }
  return wzMap10(p, w, t);
}

// 4-tap tetrahedron gradient (cheaper than 6-tap central differences). w is held
// constant across the ε taps — at ε = 0.0017 the 4th-axis variation is
// negligible, so this is the correct surface normal of the rendered 3D slice.
fn wzNormal(p: vec3f, w: f32, mode: i32, t: f32) -> vec3f {
  let e = 0.0017;
  let k0 = vec3f(1.0, -1.0, -1.0);
  let k1 = vec3f(-1.0, -1.0, 1.0);
  let k2 = vec3f(-1.0, 1.0, -1.0);
  let k3 = vec3f(1.0, 1.0, 1.0);
  return normalize(
    k0 * wzMap(p + k0 * e, w, mode, t).x +
    k1 * wzMap(p + k1 * e, w, mode, t).x +
    k2 * wzMap(p + k2 * e, w, mode, t).x +
    k3 * wzMap(p + k3 * e, w, mode, t).x
  );
}

fn wzAO(p: vec3f, n: vec3f, w: f32, mode: i32, t: f32) -> f32 {
  var occ = 0.0;
  var sca = 1.0;
  for (var i = 0; i < 4; i++) {
    let h = 0.015 + 0.13 * f32(i) / 3.0;
    let d = wzMap(p + n * h, w, mode, t).x;
    occ += (h - d) * sca;
    sca *= 0.82;
  }
  return clamp(1.0 - 2.4 * occ, 0.0, 1.0);
}
`
}
